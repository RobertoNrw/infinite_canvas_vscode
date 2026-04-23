/**
 * bootstrap.js - Application Bootstrap & Initialization
 * Initialisiert alle Module und verbindet sie miteinander
 */

import { initRendering, render } from './rendering.js';
import { initInput } from './input.js';
import { initToolbar, initStatusbar, initSpotlight, showContextMenu } from './ui.js';
import { initEditors, openInlineEditorForNode, openConnectionLabelEditorForConnection } from './editors.js';
import { initBackend, loadFromStorage, saveToStorage, exportToFile, importFromFile, getCanvasId, initUnloadWarning } from './backend.js';
import { state, CONFIG, mutate, undo, redo, addNode, updateNode, deleteNodes, moveNodes, setViewport, clearSelection, addToSelection, selectAll, exportState, loadState } from './state.js';

// Globale Funktionen für UI-Handler verfügbar machen
function exposeGlobalAPI() {
    // State Actions
    window.addNode = (data) => addNode(data);
    window.updateNode = (id, updates) => updateNode(id, updates);
    window.deleteSelected = () => {
        if (state.selection.size > 0) {
            deleteNodes(Array.from(state.selection));
        }
    };
    window.moveNodes = (ids, dx, dy) => moveNodes(ids, dx, dy);
    window.setViewport = (x, y, zoom) => setViewport(x, y, zoom);
    window.clearSelection = () => clearSelection();
    window.addToSelection = (id) => addToSelection(id);
    window.selectAll = () => selectAll();
    
    // Undo/Redo
    window.doUndo = () => undo();
    window.doRedo = () => redo();
    
    // Zoom
    window.zoomTo = (zoom) => {
        setViewport(state.viewport.x, state.viewport.y, zoom);
    };
    
    window.fitToScreen = () => {
        if (state.nodes.length === 0) return;
        
        // Bounding Box aller Nodes berechnen
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        state.nodes.forEach(node => {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + node.width);
            maxY = Math.max(maxY, node.y + node.height);
        });
        
        const canvas = document.querySelector('#canvas');
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const padding = 50;
        
        const zoomX = (rect.width - padding * 2) / contentWidth;
        const zoomY = (rect.height - padding * 2) / contentHeight;
        const zoom = Math.min(zoomX, zoomY, 1);
        
        const newX = (rect.width / 2) - ((minX + contentWidth / 2) * zoom);
        const newY = (rect.height / 2) - ((minY + contentHeight / 2) * zoom);
        
        setViewport(newX, newY, zoom);
    };
    
    // Editors
    window.openInlineEditor = (node) => openInlineEditorForNode(node);
    window.closeAllEditors = () => {
        if (window.editorsCloseAll) window.editorsCloseAll();
    };
    
    // Context Menu
    window.showContextMenu = (position) => showContextMenu(position);
    
    // Backend
    window.exportToFile = () => exportToFile();
    window.importFromFile = (file) => importFromFile(file);
    
    // Editor Close Helper
    window.editorsCloseAll = () => {
        import('./editors.js').then(({ closeAllEditors }) => closeAllEditors());
    };
}

// Main Initialization
export async function init() {
    console.log('🚀 Initializing Infinite Canvas...');
    
    try {
        // Canvas Element holen
        const canvas = document.querySelector('#canvas');
        if (!canvas) {
            throw new Error('Canvas element not found');
        }
        
        // Modules initialisieren
        console.log('📦 Loading modules...');
        
        // 1. Rendering
        initRendering(canvas);
        
        // 2. Input Handling
        initInput(canvas);
        
        // 3. UI Components
        initToolbar();
        initStatusbar();
        initSpotlight();
        
        // 4. Editors
        initEditors();
        
        // 5. Backend
        initBackend();
        initUnloadWarning();
        
        // 6. Global API exponieren
        exposeGlobalAPI();
        
        // 7. Daten laden
        console.log('💾 Loading saved data...');
        const hasData = loadFromStorage();
        
        if (!hasData) {
            // Demo Content wenn keine gespeicherten Daten
            console.log('✨ Creating demo content...');
            createDemoContent();
        }
        
        // 8. Initiales Render
        render();
        
        console.log('✅ Initialization complete!');
        
        // Event Listener für Window Resize
        window.addEventListener('resize', () => {
            setTimeout(() => render(), 100);
        });
        
    } catch (error) {
        console.error('❌ Initialization failed:', error);
        showError(error.message);
    }
}

// Demo Content erstellen
function createDemoContent() {
    addNode({
        type: 'sticky',
        x: 100,
        y: 100,
        content: 'Willkommen! 👋',
        color: CONFIG.COLORS.sticky[0]
    });
    
    addNode({
        type: 'note',
        x: 350,
        y: 150,
        content: 'Doppelklicke auf eine leere Stelle, um eine neue Notiz zu erstellen.'
    });
    
    addNode({
        type: 'checklist',
        x: 100,
        y: 250,
        content: '- [x] Canvas laden\n- [ ] Notizen erstellen\n- [ ] Verbindungen ziehen\n- [ ] Speichern'
    });
}

// Fehleranzeige
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <h2>⚠️ Fehler beim Starten</h2>
        <p>${message}</p>
        <button onclick="location.reload()">Neu laden</button>
    `;
    errorDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #fee2e2;
        border: 2px solid #ef4444;
        padding: 2rem;
        border-radius: 8px;
        z-index: 9999;
        max-width: 500px;
    `;
    document.body.appendChild(errorDiv);
}

// Auto-start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
