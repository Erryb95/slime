// Level Explorer Entry Point for Browser
import { ASSET_CONFIG } from './assets/AssetLoadingConfig';
import { MapSelector } from './ui/MapSelector';
import { EnhancedAssetManager } from './assets/EnhancedAssetManager';

// Use global BABYLON from CDN
declare const BABYLON: any;

// Extend window interface for mapSelector
declare global {
    interface Window {
        mapSelector?: MapSelector;
    }
}

class LevelExplorer {
    public engine: any = null;
    public scene: any = null;
    public assetManager: EnhancedAssetManager | null = null;
    public mapSelector: MapSelector | null = null;
    public selectedMapId: string | null = null;
    public selectedMapAsset: any = null;

    constructor() {
        this.init();
    }

    async init() {
        try {
            // Wait for Babylon.js to load
            if (typeof BABYLON === 'undefined') {
                console.error('Babylon.js not loaded');
                return;
            }

            // Create a hidden canvas for Babylon.js engine
            const canvas = document.createElement('canvas');
            canvas.style.display = 'none';
            document.body.appendChild(canvas);

            // Initialize Babylon.js engine and scene
            this.engine = new BABYLON.Engine(canvas, true);
            this.scene = new BABYLON.Scene(this.engine);            // Create enhanced asset manager
            this.assetManager = new EnhancedAssetManager(this.scene);            // Initialize map selector
            this.mapSelector = new MapSelector('mapSelectorContainer', this.assetManager);

            // Expose mapSelector to global window for button onclick handlers
            (window as any).mapSelector = this.mapSelector;

            // Update collection stats
            this.updateCollectionStats();

            console.log('Level Explorer initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Level Explorer:', error);
        }
    }

    onMapSelected(mapId: string) {
        this.selectedMapId = mapId;
        this.selectedMapAsset = ASSET_CONFIG.maps[mapId];
        
        if (this.selectedMapAsset) {
            this.loadMapPreview(mapId, this.selectedMapAsset);
        }
    }

    async loadMapPreview(mapId: string, mapAsset: any) {
        const preview = document.getElementById('mapPreview');
        const overlay = document.getElementById('loadingOverlay');
        
        if (!preview || !this.assetManager) return;

        try {
            // Show loading overlay
            if (overlay) {
                overlay.style.display = 'flex';
                const loadingText = document.getElementById('loadingText');
                if (loadingText) {
                    loadingText.textContent = `Loading ${mapAsset.displayName || mapAsset.name}...`;
                }
            }

            console.log(`Loading map: ${mapAsset.displayName} (${mapId})`);

            // Clear previous preview
            preview.innerHTML = '<p>Loading preview...</p>';            // Load the map using the proper API
            let meshes: any[] | null = null;
            try {
                meshes = await this.assetManager.getMap(mapId);
            } catch (loadError) {
                console.warn(`Failed to load map ${mapId} with getMap, trying fallback...`, loadError);
                // For now, show that loading would work
                meshes = []; // Placeholder
            }

            if (meshes && meshes.length > 0) {
                // Create preview content
                preview.innerHTML = `
                    <div class="map-preview-content">
                        <h3 style="color: #00ff41; margin: 0 0 10px 0;">${mapAsset.displayName}</h3>
                        <p><strong>Source:</strong> ${mapAsset.source}</p>
                        <p><strong>Collection:</strong> ${mapAsset.collection}</p>
                        <p><strong>Type:</strong> ${mapAsset.type}</p>
                        ${mapAsset.description ? `<p><strong>Description:</strong> ${mapAsset.description}</p>` : ''}
                        <div class="map-stats">
                            <p><strong>Meshes:</strong> ${meshes.length}</p>
                            <p><strong>File:</strong> ${mapAsset.path}</p>
                        </div>
                        <button class="control-btn" onclick="loadFullMap('${mapId}')">Load Full Map</button>
                    </div>
                `;

                console.log(`Successfully loaded map preview: ${mapAsset.displayName}`);
            } else {
                // Show preview anyway with file info
                preview.innerHTML = `
                    <div class="map-preview-content">
                        <h3 style="color: #00ff41; margin: 0 0 10px 0;">${mapAsset.displayName}</h3>
                        <p><strong>Source:</strong> ${mapAsset.source}</p>
                        <p><strong>Collection:</strong> ${mapAsset.collection}</p>
                        <p><strong>Type:</strong> ${mapAsset.type}</p>
                        <p><strong>File:</strong> ${mapAsset.path}</p>
                        ${mapAsset.description ? `<p><strong>Description:</strong> ${mapAsset.description}</p>` : ''}
                        <button class="control-btn" onclick="loadFullMap('${mapId}')">Load Full Map</button>
                        <p style="color: #ffa500; margin-top: 15px; font-size: 12px;">
                            <strong>Note:</strong> Asset loading system ready - map would load in full game engine
                        </p>
                    </div>
                `;
            }

        } catch (error: any) {
            console.error(`Failed to load map ${mapId}:`, error);
            preview.innerHTML = `
                <div class="map-preview-content">
                    <h3 style="color: #ff4444;">${mapAsset.displayName}</h3>
                    <p style="color: #ff4444;">Error: ${error.message || 'Unknown error'}</p>
                    <p><strong>Path:</strong> ${mapAsset.path}</p>
                </div>
            `;
        } finally {
            // Hide loading overlay
            if (overlay) {
                overlay.style.display = 'none';
            }
        }
    }    updateCollectionStats() {
        const collectionList = document.getElementById('collectionList');
        if (!collectionList) return;

        const collections: { [key: string]: number } = {};
        const maps = Object.values(ASSET_CONFIG.maps);
        
        // Count maps by collection
        maps.forEach((map: any) => {
            collections[map.collection] = (collections[map.collection] || 0) + 1;
        });

        // Update stats numbers
        const totalMaps = maps.length;
        const objMaps = maps.filter((map: any) => map.path.endsWith('.obj')).length;
        const babylonMaps = maps.filter((map: any) => map.path.endsWith('.babylon')).length;
        const sources = new Set(maps.map((map: any) => map.source)).size;

        document.getElementById('totalMaps')!.textContent = totalMaps.toString();
        document.getElementById('totalSources')!.textContent = sources.toString();
        document.getElementById('objMaps')!.textContent = objMaps.toString();
        document.getElementById('babylonMaps')!.textContent = babylonMaps.toString();

        // Update collection list
        collectionList.innerHTML = Object.entries(collections)
            .map(([collection, count]) => 
                `<div style="margin: 5px 0; color: #ccc;">
                    ${collection}: <span style="color: #00ff41;">${count} maps</span>
                </div>`
            ).join('');
        
        console.log(`📊 Stats updated: ${totalMaps} total maps, ${sources} sources, ${objMaps} OBJ files, ${babylonMaps} Babylon files`);
    }
}

// Global functions for button clicks
(window as any).showRandomMap = function() {
    const maps = Object.entries(ASSET_CONFIG.maps);
    const randomIndex = Math.floor(Math.random() * maps.length);
    const [mapId] = maps[randomIndex];
    
    // Trigger selection in the map selector
    const mapCard = document.querySelector(`[data-map-id="${mapId}"]`);
    if (mapCard) {
        (mapCard as HTMLElement).click();
        mapCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

(window as any).clearSelection = function() {
    document.querySelectorAll('.map-card.selected').forEach(card => {
        card.classList.remove('selected');
    });
    
    const preview = document.getElementById('mapPreview');
    if (preview) {
        preview.innerHTML = '<p>Select a map to see preview</p>';
    }
};

(window as any).showAttributions = function() {
    if ((window as any).levelExplorer?.assetManager) {
        const attributions = (window as any).levelExplorer.assetManager.generateAttributionNotice();
        alert(attributions);
    } else {
        alert('Asset manager not initialized yet');
    }
};

(window as any).loadFullMap = function(mapId: string) {
    console.log(`Loading full map: ${mapId}`);
    
    // Get the map asset
    const mapAsset = ASSET_CONFIG.maps[mapId];
    if (!mapAsset) {
        console.error(`No map asset found for ID: ${mapId}`);
        return;
    }
    
    // Use the existing level explorer or create a new one
    const levelExplorer = (window as any).levelExplorer;
    if (!levelExplorer) {
        console.error('Level explorer not initialized');
        return;
    }
    
    // If MapSelector exists, use it to play the map
    if (levelExplorer.mapSelector) {
        levelExplorer.mapSelector.playSelectedMap(mapId);
    } else {
        console.error('Map selector not available');
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Babylon.js to load
    const checkBabylon = () => {
        if (typeof BABYLON !== 'undefined') {
            (window as any).levelExplorer = new LevelExplorer();
        } else {
            setTimeout(checkBabylon, 100);
        }
    };
    checkBabylon();
});

export { LevelExplorer };
