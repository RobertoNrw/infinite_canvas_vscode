/**
 * rendering.js - Canvas Rendering Engine
 * Verantwortlich für das Zeichnen aller Elemente auf dem Canvas
 */

import { state, CONFIG } from './state.js';

let canvas, ctx;
let renderCache = null;
let needsFullRender = true;

// Initialisierung
export function initRendering(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
    
    // Event Listener für Render-Triggers
    if (window.canvasEvents) {
        window.canvasEvents.on('render', () => requestAnimationFrame(render));
    }
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    
    ctx.scale(dpr, dpr);
    needsFullRender = true;
    requestAnimationFrame(render);
}

// Export resizeCanvas für externen Zugriff (z.B. von bootstrap.js)
export { resizeCanvas as resizeCV };

// Haupt-Render-Funktion
export function render() {
    if (!ctx || !canvas) return;
    
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    
    // Clear Canvas
    ctx.clearRect(0, 0, width, height);
    
    // Background
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary') || '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Grid zeichnen
    if (state.config.showGrid) {
        drawGrid(width, height);
    }
    
    // Viewport Transform anwenden
    ctx.save();
    ctx.translate(state.viewport.x, state.viewport.y);
    ctx.scale(state.viewport.zoom, state.viewport.zoom);
    
    // Connections zuerst (hinter Nodes)
    state.connections.forEach(conn => drawConnection(conn));
    
    // Nodes zeichnen
    // Nach zOrder sortieren
    const sortedNodes = [...state.nodes].sort((a, b) => a.zOrder - b.zOrder);
    sortedNodes.forEach(node => {
        if (isVisible(node)) {
            drawNode(node);
        }
    });
    
    // Selection Box
    if (state.interaction.isSelecting && state.interaction.selectionStart) {
        drawSelectionBox();
    }
    
    // Connection Preview (wenn Verbindung gezogen wird)
    if (state.interaction.connectionSource) {
        drawConnectionPreview();
    }
    
    ctx.restore();
    
    // Minimap rendern falls vorhanden
    if (window.renderMinimap) {
        window.renderMinimap();
    }
}

// Grid zeichnen
function drawGrid(width, height) {
    const gridSize = CONFIG.GRID_SIZE * state.viewport.zoom;
    const offsetX = state.viewport.x % gridSize;
    const offsetY = state.viewport.y % gridSize;
    
    ctx.beginPath();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-color') || '#e5e7eb';
    ctx.lineWidth = 1;
    
    // Vertikale Linien
    for (let x = offsetX; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    
    // Horizontale Linien
    for (let y = offsetY; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    
    ctx.stroke();
}

// Node zeichnen
function drawNode(node) {
    const { x, y, width, height, type, content, color, locked } = node;
    const isSelected = state.selection.has(node.id);
    
    ctx.save();
    
    // Schatten
    if (!locked) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
    }
    
    // Hintergrund basierend auf Typ
    switch (type) {
        case 'sticky':
            drawStickyNote(x, y, width, height, color);
            break;
        case 'note':
            drawNote(x, y, width, height);
            break;
        case 'checklist':
            drawChecklist(x, y, width, height, content);
            break;
        case 'table':
            drawTable(x, y, width, height, content);
            break;
        case 'link':
            drawLink(x, y, width, height, content);
            break;
        case 'group':
            drawGroup(x, y, width, height);
            break;
        default:
            drawDefault(x, y, width, height, color);
    }
    
    // Auswahl-Rahmen
    if (isSelected) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
        
        // Resize Handles
        drawResizeHandles(x, y, width, height);
    }
    
    // Lock Indicator
    if (locked) {
        drawLockIcon(x + width - 20, y + 5);
    }
    
    ctx.restore();
}

function drawStickyNote(x, y, width, height, color) {
    ctx.fillStyle = color || CONFIG.COLORS.sticky[0];
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
    
    // Klebeband-Effekt oben
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(x + width / 2 - 20, y - 5, 40, 10);
}

function drawNote(x, y, width, height) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = CONFIG.COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 4);
    ctx.fill();
    ctx.stroke();
    
    // Text rendern
    drawTextContent(x + 12, y + 12, width - 24, height - 24);
}

function drawChecklist(x, y, width, height, content) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = CONFIG.COLORS.border;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 4);
    ctx.fill();
    ctx.stroke();
    
    // Checklist Items parsen und rendern
    const items = content ? content.split('\n') : [];
    let itemY = y + 12;
    items.forEach((item, idx) => {
        const isChecked = item.startsWith('[x]') || item.startsWith('[X]');
        const text = item.replace(/^\[[xX]\]\s*/, '');
        
        // Checkbox
        ctx.beginPath();
        ctx.arc(x + 16, itemY + 4, 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#6b7280';
        ctx.stroke();
        
        if (isChecked) {
            ctx.beginPath();
            ctx.moveTo(x + 12, itemY + 4);
            ctx.lineTo(x + 16, itemY + 8);
            ctx.lineTo(x + 20, itemY + 2);
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        // Text
        ctx.fillStyle = isChecked ? '#9ca3af' : '#1f2937';
        ctx.font = '14px Inter, sans-serif';
        ctx.fillText(text, x + 30, itemY + 9);
        
        itemY += 24;
    });
}

function drawTable(x, y, width, height, content) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = CONFIG.COLORS.border;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 4);
    ctx.fill();
    ctx.stroke();
    
    // Tabelle parsen (einfaches CSV-Format)
    ctx.fillStyle = '#1f2937';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText('📊 Tabelle', x + 12, y + 24);
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(content ? content.substring(0, 50) + '...' : 'Leer', x + 12, y + 44);
}

function drawLink(x, y, width, height, content) {
    ctx.fillStyle = '#eff6ff';
    ctx.strokeStyle = '#3b82f6';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 4);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#1f2937';
    ctx.font = '14px Inter, sans-serif';
    const linkText = content || 'Link';
    ctx.fillText('🔗 ' + linkText, x + 12, y + 30);
}

function drawGroup(x, y, width, height) {
    ctx.fillStyle = 'rgba(249, 250, 251, 0.5)';
    ctx.strokeStyle = '#d1d5db';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawDefault(x, y, width, height, color) {
    ctx.fillStyle = color || '#ffffff';
    ctx.strokeStyle = CONFIG.COLORS.border;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 4);
    ctx.fill();
    ctx.stroke();
}

function drawTextContent(x, y, width, height) {
    // Placeholder für Markdown-Rendering
    ctx.fillStyle = '#1f2937';
    ctx.font = '14px Inter, sans-serif';
    ctx.textBaseline = 'top';
    
    // Einfache Text-Wrapping Logik
    const lineHeight = 20;
    const maxWidth = width;
    let currentY = y;
    
    // Hier könnte echtes Markdown-Parsing hin
    ctx.fillText('Textinhalt...', x, currentY);
}

function drawResizeHandles(x, y, width, height) {
    ctx.fillStyle = '#3b82f6';
    const handleSize = 8;
    
    // Ecken
    const handles = [
        { x: x - 4, y: y - 4 },
        { x: x + width - 4, y: y - 4 },
        { x: x - 4, y: y + height - 4 },
        { x: x + width - 4, y: y + height - 4 }
    ];
    
    handles.forEach(h => {
        ctx.fillRect(h.x, h.y, handleSize, handleSize);
    });
}

function drawLockIcon(x, y) {
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.arc(x + 6, y + 6, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Arial';
    ctx.fillText('🔒', x + 2, y + 10);
}

// Connection zeichnen
function drawConnection(conn) {
    const sourceNode = state.nodes.find(n => n.id === conn.source);
    const targetNode = state.nodes.find(n => n.id === conn.target);
    
    if (!sourceNode || !targetNode) return;
    
    const startX = sourceNode.x + sourceNode.width / 2;
    const startY = sourceNode.y + sourceNode.height;
    const endX = targetNode.x + targetNode.width / 2;
    const endY = targetNode.y;
    
    // Bézier-Kurve
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(
        startX, startY + 50,
        endX, endY - 50,
        endX, endY
    );
    
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Pfeilspitze
    drawArrowhead(endX, endY, Math.atan2(endY - (endY - 50), endX - endX));
    
    // Label
    if (conn.label) {
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(midX - 20, midY - 10, 40, 20);
        ctx.strokeStyle = '#d1d5db';
        ctx.strokeRect(midX - 20, midY - 10, 40, 20);
        
        ctx.fillStyle = '#1f2937';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(conn.label, midX, midY);
    }
}

function drawArrowhead(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle - Math.PI / 2);
    
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, -10);
    ctx.closePath();
    
    ctx.fillStyle = '#9ca3af';
    ctx.fill();
    
    ctx.restore();
}

function drawSelectionBox() {
    const start = state.interaction.selectionStart;
    const current = state.interaction.dragStart || start;
    
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);
}

function drawConnectionPreview() {
    const sourceNode = state.nodes.find(n => n.id === state.interaction.connectionSource);
    if (!sourceNode || !state.interaction.dragStart) return;
    
    const startX = sourceNode.x + sourceNode.width / 2;
    const startY = sourceNode.y + sourceNode.height;
    const endX = state.interaction.dragStart.x;
    const endY = state.interaction.dragStart.y;
    
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(
        startX, startY + 50,
        endX, endY - 50,
        endX, endY
    );
    
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
}

function isVisible(node) {
    // Simple Culling - nur sichtbare Nodes rendern
    const margin = 100;
    const viewLeft = -state.viewport.x / state.viewport.zoom - margin;
    const viewRight = (canvas.width / state.viewport.zoom - state.viewport.x / state.viewport.zoom) + margin;
    const viewTop = -state.viewport.y / state.viewport.zoom - margin;
    const viewBottom = (canvas.height / state.viewport.zoom - state.viewport.y / state.viewport.zoom) + margin;
    
    return (
        node.x + node.width > viewLeft &&
        node.x < viewRight &&
        node.y + node.height > viewTop &&
        node.y < viewBottom
    );
}
