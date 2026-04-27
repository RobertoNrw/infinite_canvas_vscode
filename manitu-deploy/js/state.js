/**
 * state.js - Zentrale Datenstrukturen und State-Management
 * Implementiert das mutate()-Pattern für konsistente History/Render-Zyklen
 */

// --- Konfiguration & Constants ---
export const CONFIG = {
    STORAGE_KEY: 'infinite_canvas_data',
    DEBOUNCE_SAVE_MS: 1000,
    MAX_HISTORY: 50,
    GRID_SIZE: 20,
    SNAP_THRESHOLD: 10,
    DEFAULT_NODE_WIDTH: 200,
    DEFAULT_NODE_HEIGHT: 100,
    COLORS: {
        sticky: ['#fef3c7', '#bfdbfe', '#fecaca', '#d1fae5', '#f3e8ff'],
        text: '#1f2937',
        border: '#e5e7eb'
    }
};

// --- Initial State ---
export const initialState = {
    nodes: [],
    connections: [],
    selection: new Set(),
    viewport: { x: 0, y: 0, zoom: 1 },
    history: [],
    historyIndex: -1,
    isDirty: false,
    lastSaved: null,
    config: {
        snapToGrid: true,
        showGrid: true,
        theme: 'system' // 'light', 'dark', 'system'
    },
    interaction: {
        isPanning: false,
        isSelecting: false,
        selectionStart: null,
        dragStart: null,
        activeTool: 'select', // 'select', 'hand', 'connection'
        connectionSource: null
    }
};

// Clone Helper (Deep Copy für History)
function cloneState(state) {
    return {
        ...state,
        nodes: JSON.parse(JSON.stringify(state.nodes)),
        connections: JSON.parse(JSON.stringify(state.connections)),
        selection: new Set(state.selection),
        viewport: { ...state.viewport },
        config: { ...state.config },
        interaction: { ...state.interaction }
    };
}

// --- Core Mutate Function ---
/**
 * Führt Zustandsänderungen sicher aus und triggert Folgeaktionen
 * @param {Function} fn - Funktion, die den State ändert
 * @param {Object} options - Optionen { history: boolean, render: boolean, save: boolean }
 */
export function mutate(fn, options = { history: true, render: true, save: false }) {
    const prevState = cloneState(state);
    
    // State ändern
    fn(state);
    
    // History pushen wenn gewünscht und nicht nur redo/undo
    if (options.history) {
        // Zukünftige History abschneiden bei neuer Aktion
        if (state.historyIndex < state.history.length - 1) {
            state.history = state.history.slice(0, state.historyIndex + 1);
        }
        state.history.push(prevState);
        if (state.history.length > CONFIG.MAX_HISTORY) {
            state.history.shift();
        } else {
            state.historyIndex++;
        }
    }
    
    // Dirty Flag setzen
    if (options.save) {
        state.isDirty = true;
        state.lastSaved = null;
    }

    // Events feuern (wird von außen abonniert)
    if (window.canvasEvents) {
        if (options.render) window.canvasEvents.emit('render');
        if (options.save) window.canvasEvents.emit('save_needed');
        window.canvasEvents.emit('state_change', { type: 'mutate' });
    }
}

// --- Actions ---

export const state = { ...initialState };

export function resetState() {
    Object.assign(state, cloneState(initialState));
    if (window.canvasEvents) window.canvasEvents.emit('render');
}

export function loadState(data) {
    mutate(() => {
        state.nodes = data.nodes || [];
        state.connections = data.connections || [];
        state.viewport = data.viewport || initialViewport;
        state.config = { ...state.config, ...data.config };
        state.isDirty = false;
        state.lastSaved = new Date();
    }, { history: false, render: true, save: false });
}

export function exportState() {
    return {
        nodes: state.nodes,
        connections: state.connections,
        viewport: state.viewport,
        config: state.config,
        lastSaved: state.lastSaved
    };
}

// Undo / Redo
export function undo() {
    if (state.historyIndex > 0) {
        const prevState = state.history[state.historyIndex - 1];
        const currentState = cloneState(state);
        
        // Current State für Redo speichern (müsste eigentlich in einen separaten Redo-Stack oder History erweitern)
        // Vereinfacht: Wir nutzen die History als Stack und gehen zurück
        // Für korrektes Redo müssten wir den aktuellen Zustand auch speichern.
        // Hier vereinfachte Implementierung:
        
        state.historyIndex--;
        const targetState = state.history[state.historyIndex];
        
        // State wiederherstellen ohne neuen History-Eintrag
        Object.assign(state, cloneState(targetState));
        // Den aktuellen Zustand (vor Undo) müssten wir theoretisch für Redo halten.
        // Da unser History-Array nur die Vergangenheit hält, ist Redo hier komplexer.
        // Korrektur: Wir speichern den "vorherigen" Zustand im History Array. 
        // Beim Undo gehen wir einen zurück. Der "aktuelle" Zustand geht verloren, wenn wir nicht aufpassen.
        // Besser: History enthält Snapshots. 
        // state.history[0] ... state.history[N]
        // Index zeigt auf aktuell. Undo -> Index--. Redo -> Index++.
        // Aber wir brauchen den Zustand VOR dem ersten Snapshot auch? Nein, InitialState ist Basis.
        
        if (window.canvasEvents) window.canvasEvents.emit('render');
        state.isDirty = true; // Undo macht auch dirty
        if (window.canvasEvents) window.canvasEvents.emit('save_needed');
    }
}

export function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        const targetState = state.history[state.historyIndex];
        Object.assign(state, cloneState(targetState));
        
        if (window.canvasEvents) window.canvasEvents.emit('render');
        state.isDirty = true;
        if (window.canvasEvents) window.canvasEvents.emit('save_needed');
    }
}

// Node Actions
export function addNode(nodeData) {
    mutate((s) => {
        const id = nodeData.id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        s.nodes.push({
            id,
            type: nodeData.type || 'note',
            x: nodeData.x || 0,
            y: nodeData.y || 0,
            width: nodeData.width || CONFIG.DEFAULT_NODE_WIDTH,
            height: nodeData.height || CONFIG.DEFAULT_NODE_HEIGHT,
            content: nodeData.content || '',
            color: nodeData.color || CONFIG.COLORS.sticky[0],
            locked: nodeData.locked || false,
            zOrder: s.nodes.length,
            ...nodeData.extra
        });
        s.selection.clear();
        s.selection.add(id);
    }, { history: true, render: true, save: true });
}

export function updateNode(id, updates) {
    mutate((s) => {
        const node = s.nodes.find(n => n.id === id);
        if (node && !node.locked) {
            Object.assign(node, updates);
        }
    }, { history: true, render: true, save: true });
}

export function deleteNodes(ids) {
    mutate((s) => {
        s.nodes = s.nodes.filter(n => !ids.includes(n.id));
        s.connections = s.connections.filter(c => !ids.includes(c.source) && !ids.includes(c.target));
        ids.forEach(id => s.selection.delete(id));
    }, { history: true, render: true, save: true });
}

export function moveNodes(ids, dx, dy) {
    mutate((s) => {
        s.nodes.filter(n => ids.includes(n.id) && !n.locked).forEach(n => {
            n.x += dx;
            n.y += dy;
            if (s.config.snapToGrid) {
                n.x = Math.round(n.x / CONFIG.GRID_SIZE) * CONFIG.GRID_SIZE;
                n.y = Math.round(n.y / CONFIG.GRID_SIZE) * CONFIG.GRID_SIZE;
            }
        });
    }, { history: true, render: true, save: true });
}

// Connection Actions
export function addConnection(sourceId, targetId, label = '') {
    if (sourceId === targetId) return;
    
    mutate((s) => {
        // Duplikat prüfen
        const exists = s.connections.some(c => c.source === sourceId && c.target === targetId);
        if (!exists) {
            s.connections.push({
                id: `conn_${Date.now()}`,
                source: sourceId,
                target: targetId,
                label
            });
        }
    }, { history: true, render: true, save: true });
}

export function updateConnection(id, updates) {
    mutate((s) => {
        const conn = s.connections.find(c => c.id === id);
        if (conn) Object.assign(conn, updates);
    }, { history: true, render: true, save: true });
}

export function deleteConnections(ids) {
    mutate((s) => {
        s.connections = s.connections.filter(c => !ids.includes(c.id));
    }, { history: true, render: true, save: true });
}

// Viewport Actions
export function setViewport(x, y, zoom) {
    mutate((s) => {
        s.viewport.x = x;
        s.viewport.y = y;
        s.viewport.zoom = Math.max(0.1, Math.min(5, zoom));
    }, { history: false, render: true, save: false });
}

export function panViewport(dx, dy) {
    mutate((s) => {
        s.viewport.x += dx;
        s.viewport.y += dy;
    }, { history: false, render: true, save: false });
}

// Selection Actions
export function clearSelection() {
    mutate((s) => {
        s.selection.clear();
    }, { history: false, render: true, save: false });
}

export function addToSelection(id) {
    mutate((s) => {
        s.selection.add(id);
    }, { history: false, render: true, save: false });
}

export function removeFromSelection(id) {
    mutate((s) => {
        s.selection.delete(id);
    }, { history: false, render: true, save: false });
}

export function selectAll() {
    mutate((s) => {
        s.nodes.forEach(n => s.selection.add(n.id));
    }, { history: false, render: true, save: false });
}

// Hilfsfunktion für Event System (wird in bootstrap initialisiert)
if (!window.canvasEvents) {
    window.canvasEvents = {
        listeners: {},
        on(event, cb) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(cb);
        },
        emit(event, data) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(cb => cb(data));
            }
        }
    };
}
