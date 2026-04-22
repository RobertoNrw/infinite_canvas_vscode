// Spatial Hash Grid for efficient node lookups
// Reduces O(n) lookups to O(1) average case

export class SpatialHashGrid {
    constructor(cellSize = 100) {
        this.cellSize = cellSize;
        this.grid = new Map();
        this.nodeToCells = new Map(); // Track which cells each node occupies
    }

    /**
     * Clear the grid and rebuild from nodes array
     */
    rebuild(nodes) {
        this.grid.clear();
        this.nodeToCells.clear();
        
        for (const node of nodes) {
            this.insert(node);
        }
    }

    /**
     * Insert a single node into the grid
     */
    insert(node) {
        const cells = this._getCellsForNode(node);
        const cellKeys = [];

        for (const cellKey of cells) {
            if (!this.grid.has(cellKey)) {
                this.grid.set(cellKey, []);
            }
            this.grid.get(cellKey).push(node);
            cellKeys.push(cellKey);
        }

        this.nodeToCells.set(node.id, cellKeys);
    }

    /**
     * Remove a single node from the grid
     */
    remove(node) {
        const cellKeys = this.nodeToCells.get(node.id);
        if (!cellKeys) return;

        for (const cellKey of cellKeys) {
            const cell = this.grid.get(cellKey);
            if (cell) {
                const index = cell.indexOf(node);
                if (index > -1) {
                    cell.splice(index, 1);
                }
                // Clean up empty cells
                if (cell.length === 0) {
                    this.grid.delete(cellKey);
                }
            }
        }

        this.nodeToCells.delete(node.id);
    }

    /**
     * Update a node's position in the grid
     */
    update(node) {
        this.remove(node);
        this.insert(node);
    }

    /**
     * Query nodes at a specific point
     */
    queryPoint(x, y) {
        const cellKey = this._getCellKey(x, y);
        const cell = this.grid.get(cellKey);
        
        if (!cell) return [];

        // Filter to exact hits (grid gives candidates, we verify)
        return cell.filter(node => 
            x >= node.x && x <= node.x + node.width &&
            y >= node.y && y <= node.y + node.height
        );
    }

    /**
     * Query nodes in a rectangular area
     */
    queryRect(x, y, width, height) {
        const minX = x;
        const maxX = x + width;
        const minY = y;
        const maxY = y + height;

        const startCellX = Math.floor(minX / this.cellSize);
        const endCellX = Math.floor(maxX / this.cellSize);
        const startCellY = Math.floor(minY / this.cellSize);
        const endCellY = Math.floor(maxY / this.cellSize);

        const results = new Set();

        for (let cellX = startCellX; cellX <= endCellX; cellX++) {
            for (let cellY = startCellY; cellY <= endCellY; cellY++) {
                const cellKey = this._getCellKeyFromCoords(cellX, cellY);
                const cell = this.grid.get(cellKey);
                
                if (cell) {
                    for (const node of cell) {
                        // Check intersection
                        if (!(node.x > maxX || 
                              node.x + node.width < minX || 
                              node.y > maxY || 
                              node.y + node.height < minY)) {
                            results.add(node);
                        }
                    }
                }
            }
        }

        return Array.from(results);
    }

    /**
     * Get all nodes near a point (for hover detection with tolerance)
     */
    queryNear(x, y, tolerance = 10) {
        const results = [];
        const startCellX = Math.floor((x - tolerance) / this.cellSize);
        const endCellX = Math.floor((x + tolerance) / this.cellSize);
        const startCellY = Math.floor((y - tolerance) / this.cellSize);
        const endCellY = Math.floor((y + tolerance) / this.cellSize);

        const seen = new Set();

        for (let cellX = startCellX; cellX <= endCellX; cellX++) {
            for (let cellY = startCellY; cellY <= endCellY; cellY++) {
                const cellKey = this._getCellKeyFromCoords(cellX, cellY);
                const cell = this.grid.get(cellKey);
                
                if (cell) {
                    for (const node of cell) {
                        if (seen.has(node.id)) continue;
                        seen.add(node.id);

                        // Check if within tolerance
                        const closestX = Math.max(node.x, Math.min(x, node.x + node.width));
                        const closestY = Math.max(node.y, Math.min(y, node.y + node.height));
                        const distanceX = x - closestX;
                        const distanceY = y - closestY;
                        const distanceSquared = distanceX * distanceX + distanceY * distanceY;

                        if (distanceSquared <= tolerance * tolerance) {
                            results.push(node);
                        }
                    }
                }
            }
        }

        return results;
    }

    /**
     * Clear all data
     */
    clear() {
        this.grid.clear();
        this.nodeToCells.clear();
    }

    /**
     * Get statistics for debugging
     */
    getStats() {
        const cellCounts = Array.from(this.grid.values()).map(c => c.length);
        return {
            totalCells: this.grid.size,
            totalNodes: cellCounts.reduce((a, b) => a + b, 0),
            avgNodesPerCell: cellCounts.length > 0 
                ? (cellCounts.reduce((a, b) => a + b, 0) / cellCounts.length).toFixed(2)
                : 0,
            maxNodesInCell: Math.max(0, ...cellCounts)
        };
    }

    // Private helpers
    _getCellKey(x, y) {
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        return `${cellX},${cellY}`;
    }

    _getCellKeyFromCoords(cellX, cellY) {
        return `${cellX},${cellY}`;
    }

    _getCellsForNode(node) {
        const startCellX = Math.floor(node.x / this.cellSize);
        const endCellX = Math.floor((node.x + node.width) / this.cellSize);
        const startCellY = Math.floor(node.y / this.cellSize);
        const endCellY = Math.floor((node.y + node.height) / this.cellSize);

        const cells = [];
        for (let cellX = startCellX; cellX <= endCellX; cellX++) {
            for (let cellY = startCellY; cellY <= endCellY; cellY++) {
                cells.push(this._getCellKeyFromCoords(cellX, cellY));
            }
        }

        return cells;
    }
}
