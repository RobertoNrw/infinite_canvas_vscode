// Render Cache for optimized canvas rendering
// Caches static elements to avoid re-rendering every frame

export class RenderCache {
    constructor() {
        // Offscreen canvas for caching the grid background
        this.gridCache = null;
        this.gridCacheKey = null; // Store cache parameters
        
        // Node rendering cache (for complex markdown content)
        this.nodeCache = new Map();
        
        // Connection cache
        this.connectionCache = null;
        
        // Viewport tracking
        this.lastViewport = {
            offsetX: 0,
            offsetY: 0,
            scale: 1,
            width: 0,
            height: 0
        };
        
        // Cache validity flags
        this.isGridValid = false;
        this.areConnectionsValid = false;
        
        // Configuration
        this.maxNodeCacheSize = 100; // LRU cache size limit
    }

    /**
     * Initialize or resize offscreen canvases
     */
    initialize(width, height) {
        // Create grid cache canvas
        if (!this.gridCache) {
            this.gridCache = document.createElement('canvas');
        }
        
        this.gridCache.width = width;
        this.gridCache.height = height;
        
        // Create connection cache canvas
        if (!this.connectionCache) {
            this.connectionCache = document.createElement('canvas');
        }
        
        this.connectionCache.width = width;
        this.connectionCache.height = height;
    }

    /**
     * Check if viewport has changed significantly
     */
    viewportHasChanged(offsetX, offsetY, scale, width, height) {
        const threshold = 0.5; // pixels
        
        return Math.abs(this.lastViewport.offsetX - offsetX) > threshold ||
               Math.abs(this.lastViewport.offsetY - offsetY) > threshold ||
               Math.abs(this.lastViewport.scale - scale) > 0.01 ||
               this.lastViewport.width !== width ||
               this.lastViewport.height !== height;
    }

    /**
     * Update viewport tracking
     */
    updateViewport(offsetX, offsetY, scale, width, height) {
        this.lastViewport = {
            offsetX,
            offsetY,
            scale,
            width,
            height
        };
    }

    /**
     * Render and cache the grid background
     */
    renderGrid(ctx, canvasState, canvas, drawFunction) {
        const cacheKey = `${canvasState.scale.toFixed(2)}_${canvas.width}_${canvas.height}`;
        
        // Check if we need to re-render the grid
        if (this.isGridValid && this.gridCacheKey === cacheKey) {
            // Use cached version
            ctx.drawImage(this.gridCache, 0, 0);
            return;
        }
        
        // Render to offscreen canvas
        const gridCtx = this.gridCache.getContext('2d');
        gridCtx.clearRect(0, 0, this.gridCache.width, this.gridCache.height);
        
        // Save and apply transforms
        gridCtx.save();
        gridCtx.translate(canvasState.offsetX, canvasState.offsetY);
        gridCtx.scale(canvasState.scale, canvasState.scale);
        
        // Draw grid
        drawFunction(gridCtx, canvasState, canvas);
        
        gridCtx.restore();
        
        // Draw to main canvas
        ctx.drawImage(this.gridCache, 0, 0);
        
        // Update cache state
        this.gridCacheKey = cacheKey;
        this.isGridValid = true;
    }

    /**
     * Invalidate grid cache (call when scale or size changes)
     */
    invalidateGrid() {
        this.isGridValid = false;
        this.gridCacheKey = null;
    }

    /**
     * Get cached node rendering or render and cache it
     */
    renderNode(ctx, node, drawFunction, forceRefresh = false) {
        const cacheKey = `${node.id}_${node.text?.substring(0, 50) || ''}_${node.width}_${node.height}_${node.scrollY || 0}`;
        
        // Check cache first
        if (!forceRefresh && this.nodeCache.has(cacheKey)) {
            const cached = this.nodeCache.get(cacheKey);
            ctx.drawImage(cached.canvas, node.x, node.y);
            return cached;
        }
        
        // Create offscreen canvas for this node
        const nodeCanvas = document.createElement('canvas');
        nodeCanvas.width = node.width;
        nodeCanvas.height = node.height;
        const nodeCtx = nodeCanvas.getContext('2d');
        
        // Draw node to offscreen canvas
        drawFunction(nodeCtx, node, 0, 0);
        
        // Draw to main canvas
        ctx.drawImage(nodeCanvas, node.x, node.y);
        
        // Cache the result (LRU eviction)
        if (this.nodeCache.size >= this.maxNodeCacheSize) {
            // Remove oldest entry
            const firstKey = this.nodeCache.keys().next().value;
            this.nodeCache.delete(firstKey);
        }
        
        this.nodeCache.set(cacheKey, {
            canvas: nodeCanvas,
            timestamp: Date.now()
        });
        
        return { canvas: nodeCanvas, isNew: true };
    }

    /**
     * Invalidate specific node from cache
     */
    invalidateNode(nodeId) {
        // Remove all cached versions of this node
        for (const key of this.nodeCache.keys()) {
            if (key.startsWith(`${nodeId}_`)) {
                this.nodeCache.delete(key);
            }
        }
    }

    /**
     * Clear all node caches
     */
    clearNodeCache() {
        this.nodeCache.clear();
    }

    /**
     * Render connections to cache
     */
    renderConnections(ctx, canvasState, connections, drawFunction) {
        const connCtx = this.connectionCache.getContext('2d');
        connCtx.clearRect(0, 0, this.connectionCache.width, this.connectionCache.height);
        
        // Save and apply transforms
        connCtx.save();
        connCtx.translate(canvasState.offsetX, canvasState.offsetY);
        connCtx.scale(canvasState.scale, canvasState.scale);
        
        // Draw all connections
        connections.forEach(connection => {
            const isSelected = canvasState.selectedConnection && 
                             canvasState.selectedConnection.id === connection.id;
            drawFunction(connCtx, connection, canvasState.nodes, isSelected);
        });
        
        connCtx.restore();
        
        // Draw to main canvas
        ctx.drawImage(this.connectionCache, 0, 0);
        
        this.areConnectionsValid = true;
    }

    /**
     * Invalidate connection cache
     */
    invalidateConnections() {
        this.areConnectionsValid = false;
    }

    /**
     * Clear all caches
     */
    clear() {
        this.isGridValid = false;
        this.areConnectionsValid = false;
        this.gridCacheKey = null;
        this.clearNodeCache();
        
        if (this.connectionCache) {
            const ctx = this.connectionCache.getContext('2d');
            ctx.clearRect(0, 0, this.connectionCache.width, this.connectionCache.height);
        }
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.clear();
        this.gridCache = null;
        this.connectionCache = null;
        this.nodeCache.clear();
    }
}
