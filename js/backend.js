/**
 * backend.js - Backend Communication & Persistence
 * Save/Load Logic, API Calls, Storage Management
 */

import { state, CONFIG, loadState, exportState } from './state.js';
import { showToast, updateSaveIndicator } from './ui.js';

let saveDebounceTimer = null;
let isSaving = false;

// Initialisierung
export function initBackend() {
    // Auto-Save Listener
    if (window.canvasEvents) {
        window.canvasEvents.on('save_needed', () => {
            triggerAutoSave();
        });
    }
}

// Trigger Auto-Save mit Debounce
function triggerAutoSave() {
    if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
    }
    
    saveDebounceTimer = setTimeout(() => {
        saveToStorage();
    }, CONFIG.DEBOUNCE_SAVE_MS);
}

// Save to LocalStorage (Fallback)
export function saveToStorage() {
    if (isSaving) return;
    
    try {
        isSaving = true;
        updateSaveIndicator(true, null);
        
        const data = exportState();
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
        
        state.isDirty = false;
        state.lastSaved = new Date();
        
        updateSaveIndicator(false, state.lastSaved);
        showToast('Canvas gespeichert', 'success');
        
        isSaving = false;
    } catch (error) {
        console.error('Save failed:', error);
        showToast('Speichern fehlgeschlagen', 'error');
        updateSaveIndicator(false, null);
        isSaving = false;
    }
}

// Load from LocalStorage
export function loadFromStorage() {
    try {
        const savedData = localStorage.getItem(CONFIG.STORAGE_KEY);
        
        if (savedData) {
            const data = JSON.parse(savedData);
            loadState(data);
            showToast('Canvas geladen', 'success');
            return true;
        }
    } catch (error) {
        console.error('Load failed:', error);
        showToast('Laden fehlgeschlagen', 'error');
    }
    
    return false;
}

// Save to Backend (API)
export async function saveToBackend(canvasId, data) {
    if (isSaving) return false;
    
    try {
        isSaving = true;
        updateSaveIndicator(true, null);
        
        const response = await fetch(`/api/canvas/${canvasId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nodes: data.nodes,
                connections: data.connections,
                viewport: data.viewport,
                config: data.config
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        state.isDirty = false;
        state.lastSaved = new Date();
        
        updateSaveIndicator(false, state.lastSaved);
        showToast('Canvas erfolgreich gespeichert', 'success');
        
        isSaving = false;
        return true;
    } catch (error) {
        console.error('Backend save failed:', error);
        showToast('Speichern fehlgeschlagen: ' + error.message, 'error');
        updateSaveIndicator(false, null);
        isSaving = false;
        return false;
    }
}

// Load from Backend (API)
export async function loadFromBackend(canvasId) {
    try {
        const response = await fetch(`/api/canvas/${canvasId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        loadState({
            nodes: data.nodes || [],
            connections: data.connections || [],
            viewport: data.viewport || { x: 0, y: 0, zoom: 1 },
            config: data.config || {}
        });
        
        showToast('Canvas geladen', 'success');
        return true;
    } catch (error) {
        console.error('Backend load failed:', error);
        showToast('Laden fehlgeschlagen: ' + error.message, 'error');
        return false;
    }
}

// Export as JSON File
export function exportToFile(filename = 'canvas-export.json') {
    const data = exportState();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Export gestartet', 'success');
}

// Import from JSON File
export function importFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                if (!data.nodes || !Array.isArray(data.nodes)) {
                    throw new Error('Ungültiges Format: Keine Nodes gefunden');
                }
                
                loadState({
                    nodes: data.nodes,
                    connections: data.connections || [],
                    viewport: data.viewport || { x: 0, y: 0, zoom: 1 },
                    config: data.config || {}
                });
                
                showToast('Import erfolgreich', 'success');
                resolve(true);
            } catch (error) {
                console.error('Import failed:', error);
                showToast('Import fehlgeschlagen: ' + error.message, 'error');
                reject(error);
            }
        };
        
        reader.onerror = () => {
            showToast('Datei konnte nicht gelesen werden', 'error');
            reject(new Error('File read error'));
        };
        
        reader.readAsText(file);
    });
}

// Get Canvas ID from URL or generate new
export function getCanvasId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id') || `canvas_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Clear All Data
export function clearAllData() {
    if (confirm('Möchtest du wirklich das gesamte Canvas löschen? Dies kann nicht rückgängig gemacht werden.')) {
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        location.reload();
    }
}

// Check for Unsaved Changes
export function hasUnsavedChanges() {
    return state.isDirty;
}

// Warn on Page Close with Unsaved Changes
export function initUnloadWarning() {
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges()) {
            e.preventDefault();
            e.returnValue = '';
            return '';
        }
    });
}
