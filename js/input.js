/**
 * input.js - Canvas Input Handler
 * Verarbeitet alle Maus-, Tastatur- und Touch-Events
 */

import { state, CONFIG, mutate, addNode, deleteNodes, moveNodes, setViewport, clearSelection, addToSelection } from './state.js';

let canvas;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let lastMousePos = { x: 0, y: 0 };

export function initInput(canvasElement) {
    canvas = canvasElement;
    
    // Event Listeners registrieren
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('dblclick', handleDoubleClick);
    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('keyup', handleKeyUp);
    
    // Prevent Context Menu auf Canvas
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e);
    });
}

// Coordinate Helpers
function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left - state.viewport.x) / state.viewport.zoom,
        y: (e.clientY - rect.top - state.viewport.y) / state.viewport.zoom
    };
}

function getScreenCoords(e) {
    return {
        x: e.clientX,
        y: e.clientY
    };
}

// Pointer Events
function handlePointerDown(e) {
    if (e.button !== 0 && e.button !== 1) return; // Nur Linke und Middle
    
    const coords = getCanvasCoords(e);
    const screenCoords = getScreenCoords(e);
    
    isDragging = true;
    dragStart = { ...coords };
    lastMousePos = { ...screenCoords };
    
    // Middle Mouse oder Space+Click -> Pan
    if (e.button === 1 || state.interaction.activeTool === 'hand' || e.shiftKey) {
        state.interaction.isPanning = true;
        canvas.setPointerCapture(e.pointerId);
        return;
    }
    
    // Node Selection
    const clickedNode = findNodeAt(coords.x, coords.y);
    
    if (clickedNode) {
        if (!state.selection.has(clickedNode.id)) {
            if (e.ctrlKey || e.metaKey) {
                addToSelection(clickedNode.id);
            } else {
                clearSelection();
                addToSelection(clickedNode.id);
            }
        }
        
        // Drag Start für Node
        state.interaction.dragStart = { ...coords };
    } else {
        // Click auf leere Fläche
        if (!e.ctrlKey && !e.metaKey) {
            clearSelection();
        }
        
        // Selection Box Start
        state.interaction.isSelecting = true;
        state.interaction.selectionStart = { ...coords };
    }
    
    canvas.setPointerCapture(e.pointerId);
}

function handlePointerMove(e) {
    if (!isDragging) return;
    
    const coords = getCanvasCoords(e);
    const screenCoords = getScreenCoords(e);
    
    const dx = screenCoords.x - lastMousePos.x;
    const dy = screenCoords.y - lastMousePos.y;
    
    lastMousePos = { ...screenCoords };
    
    // Panning
    if (state.interaction.isPanning) {
        setViewport(state.viewport.x + dx, state.viewport.y + dy, state.viewport.zoom);
        return;
    }
    
    // Node Dragging
    if (state.selection.size > 0 && state.interaction.dragStart) {
        const moveDx = coords.x - state.interaction.dragStart.x;
        const moveDy = coords.y - state.interaction.dragStart.y;
        
        // Live Preview könnte hier implementiert werden
        // Für jetzt nur beim Drop bewegen (Performance)
    }
    
    // Selection Box
    if (state.interaction.isSelecting) {
        state.interaction.dragStart = { ...coords };
        // Render wird automatisch durch Event getriggert
    }
    
    // Connection Drawing
    if (state.interaction.connectionSource) {
        state.interaction.dragStart = { ...coords };
    }
}

function handlePointerUp(e) {
    if (!isDragging) return;
    
    const coords = getCanvasCoords(e);
    
    // Panning Ende
    if (state.interaction.isPanning) {
        state.interaction.isPanning = false;
    }
    
    // Node Drop
    if (state.selection.size > 0 && state.interaction.dragStart) {
        const dx = coords.x - state.interaction.dragStart.x;
        const dy = coords.y - state.interaction.dragStart.y;
        
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            const selectedIds = Array.from(state.selection);
            moveNodes(selectedIds, dx, dy);
        }
    }
    
    // Selection Box Ende
    if (state.interaction.isSelecting) {
        state.interaction.isSelecting = false;
        selectNodesInBox(state.interaction.selectionStart, coords);
        state.interaction.selectionStart = null;
    }
    
    // Connection Ende
    if (state.interaction.connectionSource) {
        const targetNode = findNodeAt(coords.x, coords.y);
        if (targetNode && targetNode.id !== state.interaction.connectionSource) {
            // Connection erstellen
            // Wird in separater Funktion behandelt
        }
        state.interaction.connectionSource = null;
    }
    
    state.interaction.dragStart = null;
    isDragging = false;
    canvas.releasePointerCapture(e.pointerId);
}

// Wheel Zoom
function handleWheel(e) {
    e.preventDefault();
    
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newZoom = Math.max(0.1, Math.min(5, state.viewport.zoom * (1 + delta)));
    
    // Zoom towards mouse position
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomFactor = newZoom / state.viewport.zoom;
    
    const newX = mouseX - (mouseX - state.viewport.x) * zoomFactor;
    const newY = mouseY - (mouseY - state.viewport.y) * zoomFactor;
    
    setViewport(newX, newY, newZoom);
}

// Double Click
function handleDoubleClick(e) {
    const coords = getCanvasCoords(e);
    const node = findNodeAt(coords.x, coords.y);
    
    if (node) {
        // Inline Editor öffnen
        if (window.openInlineEditor) {
            window.openInlineEditor(node);
        }
    } else {
        // Neue Node erstellen
        addNode({
            type: 'note',
            x: coords.x - CONFIG.DEFAULT_NODE_WIDTH / 2,
            y: coords.y - CONFIG.DEFAULT_NODE_HEIGHT / 2,
            content: ''
        });
    }
}

// Keyboard Shortcuts
function handleKeyDown(e) {
    // Prevent Default für bestimmte Keys
    if (['Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
        }
    }
    
    switch (e.key) {
        case 'Delete':
        case 'Backspace':
            if (state.selection.size > 0 && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                deleteNodes(Array.from(state.selection));
            }
            break;
            
        case 'a':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                // Select All
                const allIds = state.nodes.map(n => n.id);
                allIds.forEach(id => addToSelection(id));
            }
            break;
            
        case 'z':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                if (e.shiftKey) {
                    // Redo
                    if (window.doRedo) window.doRedo();
                } else {
                    // Undo
                    if (window.doUndo) window.doUndo();
                }
            }
            break;
            
        case ' ':
            if (!state.interaction.isPanning) {
                state.interaction.lastTool = state.interaction.activeTool;
                state.interaction.activeTool = 'hand';
                canvas.style.cursor = 'grab';
            }
            break;
            
        case 'Escape':
            clearSelection();
            state.interaction.connectionSource = null;
            if (window.closeAllEditors) window.closeAllEditors();
            break;
    }
}

function handleKeyUp(e) {
    if (e.key === ' ') {
        state.interaction.activeTool = state.interaction.lastTool || 'select';
        canvas.style.cursor = 'default';
    }
}

// Helper Functions
function findNodeAt(x, y) {
    // Rückwärts iterieren für z-Order (oberste zuerst)
    for (let i = state.nodes.length - 1; i >= 0; i--) {
        const node = state.nodes[i];
        if (
            x >= node.x &&
            x <= node.x + node.width &&
            y >= node.y &&
            y <= node.y + node.height
        ) {
            return node;
        }
    }
    return null;
}

function selectNodesInBox(start, end) {
    const x1 = Math.min(start.x, end.x);
    const y1 = Math.min(start.y, end.y);
    const x2 = Math.max(start.x, end.x);
    const y2 = Math.max(start.y, end.y);
    
    state.nodes.forEach(node => {
        if (
            node.x < x2 &&
            node.x + node.width > x1 &&
            node.y < y2 &&
            node.y + node.height > y1
        ) {
            addToSelection(node.id);
        }
    });
}

function showContextMenu(e) {
    if (window.showContextMenu) {
        window.showContextMenu({ x: e.clientX, y: e.clientY });
    }
}
