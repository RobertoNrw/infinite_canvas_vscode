/**
 * editors.js - Unified Editor System
 * Inline-Text, Checklist, Table, Link, Connection-Label Editoren
 */

import { state, updateNode, updateConnection } from './state.js';

let activeEditor = null;
let editorOverlay = null;

// Initialisierung
export function initEditors() {
    createEditorOverlay();
}

function createEditorOverlay() {
    // Overlay Container für alle Editoren
    editorOverlay = document.createElement('div');
    editorOverlay.id = 'editor-overlay';
    editorOverlay.className = 'editor-overlay';
    document.body.appendChild(editorOverlay);
}

// Generic Editor Opener
export function openEditor(config) {
    closeAllEditors();
    
    const { type, node, connection, position, content, onSave, onCancel } = config;
    
    let editorElement;
    
    switch (type) {
        case 'inline':
            editorElement = createInlineEditor(node, position, content, onSave);
            break;
        case 'checklist':
            editorElement = createChecklistEditor(node, content, onSave);
            break;
        case 'table':
            editorElement = createTableEditor(node, content, onSave);
            break;
        case 'link':
            editorElement = createLinkEditor(node, content, onSave);
            break;
        case 'connection-label':
            editorElement = createConnectionLabelEditor(connection, content, onSave);
            break;
        default:
            console.warn('Unknown editor type:', type);
            return;
    }
    
    if (editorElement) {
        editorOverlay.appendChild(editorElement);
        activeEditor = editorElement;
        
        // Auto Focus
        const input = editorElement.querySelector('input, textarea');
        if (input) {
            setTimeout(() => input.focus(), 10);
        }
    }
}

export function closeAllEditors() {
    if (activeEditor) {
        activeEditor.remove();
        activeEditor = null;
    }
    editorOverlay.innerHTML = '';
}

// Inline Text Editor
function createInlineEditor(node, position, content, onSave) {
    const editor = document.createElement('div');
    editor.className = 'editor inline-editor';
    editor.style.left = `${position.x}px`;
    editor.style.top = `${position.y}px`;
    editor.style.width = `${node.width}px`;
    editor.style.minHeight = `${node.height}px`;
    
    const textarea = document.createElement('textarea');
    textarea.value = content || node.content || '';
    textarea.placeholder = 'Text eingeben...';
    textarea.className = 'editor-textarea';
    
    // Auto-Resize
    textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    });
    
    // Save on Ctrl+Enter or Blur
    const save = () => {
        const newContent = textarea.value;
        if (newContent !== node.content) {
            onSave(newContent);
        }
        closeAllEditors();
    };
    
    textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            save();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            closeAllEditors();
        }
    });
    
    textarea.addEventListener('blur', () => {
        // Verzögert schließen damit Click-Events noch wirken können
        setTimeout(() => {
            if (activeEditor === editor) {
                save();
            }
        }, 200);
    });
    
    editor.appendChild(textarea);
    
    // Initiale Größe anpassen
    setTimeout(() => {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.max(textarea.scrollHeight, node.height)}px`;
    }, 10);
    
    return editor;
}

// Checklist Editor
function createChecklistEditor(node, content, onSave) {
    const editor = document.createElement('div');
    editor.className = 'editor checklist-editor';
    editor.style.left = `${node.x}px`;
    editor.style.top = `${node.y}px`;
    editor.style.width = `${node.width}px`;
    
    const header = document.createElement('div');
    header.className = 'editor-header';
    header.textContent = 'Checkliste bearbeiten';
    
    const textarea = document.createElement('textarea');
    textarea.value = content || node.content || '';
    textarea.placeholder = '- [ ] Aufgabe 1\n- [x] Erledigt\n- [ ] Aufgabe 2';
    textarea.className = 'editor-textarea';
    textarea.rows = 8;
    
    const help = document.createElement('div');
    help.className = 'editor-help';
    help.innerHTML = `
        <small>Format: "- [ ] Text" für offen, "- [x] Text" für erledigt</small>
    `;
    
    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'editor-buttons';
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Speichern';
    saveBtn.className = 'btn btn-primary';
    saveBtn.addEventListener('click', () => {
        onSave(textarea.value);
        closeAllEditors();
    });
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Abbrechen';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.addEventListener('click', closeAllEditors);
    
    buttonGroup.appendChild(saveBtn);
    buttonGroup.appendChild(cancelBtn);
    
    editor.appendChild(header);
    editor.appendChild(textarea);
    editor.appendChild(help);
    editor.appendChild(buttonGroup);
    
    return editor;
}

// Table Editor
function createTableEditor(node, content, onSave) {
    const editor = document.createElement('div');
    editor.className = 'editor table-editor';
    editor.style.left = `${node.x}px`;
    editor.style.top = `${node.y}px`;
    editor.style.width = `${Math.max(node.width, 400)}px`;
    
    const header = document.createElement('div');
    header.className = 'editor-header';
    header.textContent = 'Tabelle bearbeiten';
    
    const textarea = document.createElement('textarea');
    textarea.value = content || node.content || '';
    textarea.placeholder = 'Spalte1,Spalte2,Spalte3\nWert1,Wert2,Wert3\nWert4,Wert5,Wert6';
    textarea.className = 'editor-textarea';
    textarea.rows = 10;
    
    const help = document.createElement('div');
    help.className = 'editor-help';
    help.innerHTML = `<small>CSV-Format: Komma-getrennte Werte, jede Zeile eine neue Reihe</small>`;
    
    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'editor-buttons';
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Speichern';
    saveBtn.className = 'btn btn-primary';
    saveBtn.addEventListener('click', () => {
        onSave(textarea.value);
        closeAllEditors();
    });
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Abbrechen';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.addEventListener('click', closeAllEditors);
    
    buttonGroup.appendChild(saveBtn);
    buttonGroup.appendChild(cancelBtn);
    
    editor.appendChild(header);
    editor.appendChild(textarea);
    editor.appendChild(help);
    editor.appendChild(buttonGroup);
    
    return editor;
}

// Link Editor
function createLinkEditor(node, content, onSave) {
    const editor = document.createElement('div');
    editor.className = 'editor link-editor';
    editor.style.left = `${node.x}px`;
    editor.style.top = `${node.y}px`;
    editor.style.width = `${node.width}px`;
    
    const header = document.createElement('div');
    header.className = 'editor-header';
    header.textContent = 'Link bearbeiten';
    
    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.value = content || node.content || '';
    urlInput.placeholder = 'https://example.com';
    urlInput.className = 'editor-input';
    
    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'editor-buttons';
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Speichern';
    saveBtn.className = 'btn btn-primary';
    saveBtn.addEventListener('click', () => {
        onSave(urlInput.value);
        closeAllEditors();
    });
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Abbrechen';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.addEventListener('click', closeAllEditors);
    
    buttonGroup.appendChild(saveBtn);
    buttonGroup.appendChild(cancelBtn);
    
    editor.appendChild(header);
    editor.appendChild(urlInput);
    editor.appendChild(buttonGroup);
    
    return editor;
}

// Connection Label Editor
function createConnectionLabelEditor(connection, content, onSave) {
    const editor = document.createElement('div');
    editor.className = 'editor connection-label-editor';
    
    // Position in der Mitte der Connection
    const sourceNode = state.nodes.find(n => n.id === connection.source);
    const targetNode = state.nodes.find(n => n.id === connection.target);
    
    if (!sourceNode || !targetNode) return null;
    
    const midX = (sourceNode.x + targetNode.x + sourceNode.width / 2 + targetNode.width / 2) / 2;
    const midY = (sourceNode.y + targetNode.y) / 2;
    
    editor.style.left = `${midX - 100}px`;
    editor.style.top = `${midY - 30}px`;
    editor.style.width = '200px';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = content || connection.label || '';
    input.placeholder = 'Label...';
    input.className = 'editor-input';
    
    const save = () => {
        onSave(input.value);
        closeAllEditors();
    };
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            save();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            closeAllEditors();
        }
    });
    
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (activeEditor === editor) {
                save();
            }
        }, 200);
    });
    
    editor.appendChild(input);
    
    return editor;
}

// Helper: Open Inline Editor für Node
export function openInlineEditorForNode(node) {
    const position = {
        x: node.x,
        y: node.y
    };
    
    openEditor({
        type: 'inline',
        node,
        position,
        content: node.content,
        onSave: (content) => {
            updateNode(node.id, { content });
        }
    });
}

// Helper: Open Connection Label Editor
export function openConnectionLabelEditorForConnection(connection) {
    openEditor({
        type: 'connection-label',
        connection,
        content: connection.label,
        onSave: (label) => {
            updateConnection(connection.id, { label });
        }
    });
}
