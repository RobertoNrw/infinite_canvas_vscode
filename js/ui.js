/**
 * ui.js - UI Components & Controls
 * Toolbar, Statusbar, Context Menu, Spotlight, Toasts
 */

import { state, CONFIG, clearSelection, selectAll, undo, redo } from './state.js';

// Toolbar Initialisierung
export function initToolbar() {
    setupToolbarButtons();
    setupToolSwitching();
}

function setupToolbarButtons() {
    // Undo/Redo
    const undoBtn = document.querySelector('#toolbar [data-action="undo"]');
    const redoBtn = document.querySelector('#toolbar [data-action="redo"]');
    
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            if (window.doUndo) window.doUndo();
        });
    }
    
    if (redoBtn) {
        redoBtn.addEventListener('click', () => {
            if (window.doRedo) window.doRedo();
        });
    }
    
    // Delete
    const deleteBtn = document.querySelector('#toolbar [data-action="delete"]');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (window.deleteSelected) window.deleteSelected();
        });
    }
    
    // Zoom Controls
    const zoomInBtn = document.querySelector('#toolbar [data-action="zoom-in"]');
    const zoomOutBtn = document.querySelector('#toolbar [data-action="zoom-out"]');
    const fitBtn = document.querySelector('#toolbar [data-action="fit"]');
    
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            if (window.zoomTo) window.zoomTo(state.viewport.zoom * 1.2);
        });
    }
    
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            if (window.zoomTo) window.zoomTo(state.viewport.zoom / 1.2);
        });
    }
    
    if (fitBtn) {
        fitBtn.addEventListener('click', () => {
            if (window.fitToScreen) window.fitToScreen();
        });
    }
    
    // Tools
    const selectToolBtn = document.querySelector('#toolbar [data-tool="select"]');
    const handToolBtn = document.querySelector('#toolbar [data-tool="hand"]');
    const connectionToolBtn = document.querySelector('#toolbar [data-tool="connection"]');
    
    if (selectToolBtn) {
        selectToolBtn.addEventListener('click', () => setTool('select'));
    }
    
    if (handToolBtn) {
        handToolBtn.addEventListener('click', () => setTool('hand'));
    }
    
    if (connectionToolBtn) {
        connectionToolBtn.addEventListener('click', () => setTool('connection'));
    }
    
    // Add Node Buttons
    const addNoteBtn = document.querySelector('#toolbar [data-node-type="note"]');
    const addStickyBtn = document.querySelector('#toolbar [data-node-type="sticky"]');
    const addChecklistBtn = document.querySelector('#toolbar [data-node-type="checklist"]');
    
    if (addNoteBtn) {
        addNoteBtn.addEventListener('click', () => addNodeAtCenter('note'));
    }
    
    if (addStickyBtn) {
        addStickyBtn.addEventListener('click', () => addNodeAtCenter('sticky'));
    }
    
    if (addChecklistBtn) {
        addChecklistBtn.addEventListener('click', () => addNodeAtCenter('checklist'));
    }
}

function setupToolSwitching() {
    const toolButtons = document.querySelectorAll('#toolbar [data-tool]');
    toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toolButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function setTool(tool) {
    state.interaction.activeTool = tool;
    
    // UI Update
    document.querySelectorAll('#toolbar [data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    
    // Cursor Update
    const canvas = document.querySelector('#canvas');
    if (canvas) {
        canvas.style.cursor = tool === 'hand' ? 'grab' : 'default';
    }
}

function addNodeAtCenter(type) {
    const canvas = document.querySelector('#canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const centerX = (rect.width / 2 - state.viewport.x) / state.viewport.zoom;
    const centerY = (rect.height / 2 - state.viewport.y) / state.viewport.zoom;
    
    if (window.addNode) {
        window.addNode({
            type,
            x: centerX - CONFIG.DEFAULT_NODE_WIDTH / 2,
            y: centerY - CONFIG.DEFAULT_NODE_HEIGHT / 2
        });
    }
}

// Statusbar
export function initStatusbar() {
    updateStatusbar();
    
    if (window.canvasEvents) {
        window.canvasEvents.on('state_change', updateStatusbar);
    }
}

function updateStatusbar() {
    const statusbar = document.querySelector('#statusbar');
    if (!statusbar) return;
    
    const nodeCount = state.nodes.length;
    const selectionCount = state.selection.size;
    const zoomLevel = Math.round(state.viewport.zoom * 100);
    const isDirty = state.isDirty ? '●' : '';
    
    statusbar.innerHTML = `
        <span class="status-item">Nodes: ${nodeCount}</span>
        <span class="status-item">Ausgewählt: ${selectionCount}</span>
        <span class="status-item">Zoom: ${zoomLevel}%</span>
        <span class="status-item">${isDirty}</span>
    `;
}

// Context Menu
export function showContextMenu(position) {
    const menu = document.querySelector('#context-menu');
    if (!menu) return;
    
    menu.style.left = `${position.x}px`;
    menu.style.top = `${position.y}px`;
    menu.classList.add('visible');
    
    // Event Listener für Outside Click
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.classList.remove('visible');
            document.removeEventListener('click', closeMenu);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 100);
}

// Spotlight (Cmd+K)
export function initSpotlight() {
    const spotlight = document.querySelector('#spotlight');
    const input = spotlight?.querySelector('input');
    
    if (!spotlight || !input) return;
    
    // Keyboard Shortcut
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            toggleSpotlight();
        }
    });
    
    // Input Handler
    input.addEventListener('input', (e) => {
        handleSpotlightSearch(e.target.value);
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            executeSpotlightSelection();
        }
        if (e.key === 'Escape') {
            closeSpotlight();
        }
    });
}

function toggleSpotlight() {
    const spotlight = document.querySelector('#spotlight');
    const input = spotlight?.querySelector('input');
    
    if (spotlight.classList.contains('visible')) {
        closeSpotlight();
    } else {
        openSpotlight();
    }
}

function openSpotlight() {
    const spotlight = document.querySelector('#spotlight');
    const input = spotlight?.querySelector('input');
    
    if (spotlight && input) {
        spotlight.classList.add('visible');
        input.value = '';
        input.focus();
        handleSpotlightSearch('');
    }
}

function closeSpotlight() {
    const spotlight = document.querySelector('#spotlight');
    if (spotlight) {
        spotlight.classList.remove('visible');
    }
}

function handleSpotlightSearch(query) {
    const results = document.querySelector('#spotlight-results');
    if (!results) return;
    
    // Commands filtern
    const commands = [
        { id: 'new-note', label: 'Neue Notiz', icon: '📝' },
        { id: 'new-sticky', label: 'Neuer Sticky', icon: '🟨' },
        { id: 'new-checklist', label: 'Neue Checkliste', icon: '✅' },
        { id: 'select-all', label: 'Alle auswählen', icon: '🎯' },
        { id: 'clear-selection', label: 'Auswahl aufheben', icon: '❌' },
        { id: 'fit-screen', label: 'An Bildschirm anpassen', icon: '🔍' },
        { id: 'toggle-grid', label: 'Grid umschalten', icon: '⊞' },
        { id: 'toggle-snap', label: 'Snap umschalten', icon: '🧲' }
    ];
    
    const filtered = commands.filter(cmd => 
        cmd.label.toLowerCase().includes(query.toLowerCase())
    );
    
    results.innerHTML = filtered.map(cmd => `
        <div class="spotlight-item" data-command="${cmd.id}">
            <span class="icon">${cmd.icon}</span>
            <span class="label">${cmd.label}</span>
        </div>
    `).join('');
    
    // Click Handler
    results.querySelectorAll('.spotlight-item').forEach(item => {
        item.addEventListener('click', () => {
            executeCommand(item.dataset.command);
            closeSpotlight();
        });
    });
}

function executeSpotlightSelection() {
    const firstItem = document.querySelector('#spotlight-results .spotlight-item');
    if (firstItem) {
        executeCommand(firstItem.dataset.command);
        closeSpotlight();
    }
}

function executeCommand(commandId) {
    switch (commandId) {
        case 'new-note':
            addNodeAtCenter('note');
            break;
        case 'new-sticky':
            addNodeAtCenter('sticky');
            break;
        case 'new-checklist':
            addNodeAtCenter('checklist');
            break;
        case 'select-all':
            selectAll();
            break;
        case 'clear-selection':
            clearSelection();
            break;
        case 'fit-screen':
            if (window.fitToScreen) window.fitToScreen();
            break;
        case 'toggle-grid':
            state.config.showGrid = !state.config.showGrid;
            if (window.canvasEvents) window.canvasEvents.emit('render');
            break;
        case 'toggle-snap':
            state.config.snapToGrid = !state.config.snapToGrid;
            break;
    }
}

// Toast Notifications
export function showToast(message, type = 'info') {
    const container = document.querySelector('#toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto Remove
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Save Indicator
export function updateSaveIndicator(isSaving, lastSaved) {
    const indicator = document.querySelector('#save-indicator');
    if (!indicator) return;
    
    if (isSaving) {
        indicator.textContent = 'Speichern...';
        indicator.classList.add('saving');
    } else if (lastSaved) {
        const time = new Date(lastSaved).toLocaleTimeString();
        indicator.textContent = `Gespeichert: ${time}`;
        indicator.classList.remove('saving');
    } else {
        indicator.textContent = 'Nicht gespeichert';
        indicator.classList.remove('saving');
    }
}
