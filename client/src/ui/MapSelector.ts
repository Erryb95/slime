// SLIME FPS - Main Menu & Map Selection System
// Provides a main menu interface with map browsing and game launching capabilities

import { ASSET_CONFIG } from '../assets/AssetLoadingConfig';
import type { MapAsset } from '../assets/AssetLoadingConfig';
import { EnhancedAssetManager } from '../assets/EnhancedAssetManager';
import { GameSpawner } from '../core/GameSpawner';
import type { GameLaunchOptions } from '../core/GameSpawner';
import { SettingsMenu } from './SettingsMenu';

export interface MapCollection {
  name: string;
  maps: Array<{
    id: string;
    asset: MapAsset;
  }>;
}

export class MapSelector {
  private container: HTMLElement;
  private currentCategory: string = 'all';
  private currentSource: string = 'all';
  private gameSpawner: GameSpawner;
  private settingsMenu: SettingsMenu;

  constructor(containerId: string, _assetManager: EnhancedAssetManager) {
    this.container = document.getElementById(containerId) || document.body;
    this.gameSpawner = new GameSpawner();
    this.settingsMenu = new SettingsMenu();
    this.createUI();
  }
  private createUI(): void {
    this.container.innerHTML = `
      <div class="map-selector">
        <div class="main-menu-header">
          <h1>🟢 SLIME FPS</h1>
          <p class="subtitle">Competitive Browser-Based FPS</p>
          <div class="main-menu-buttons">
            <button class="menu-btn quick-play-btn">⚡ Quick Play</button>
            <button class="menu-btn settings-btn">⚙️ Settings</button>
            <button class="menu-btn exit-btn">🚪 Exit</button>
          </div>
        </div>
        
        <div class="map-selector-header">
          <h2>🗺️ Select Map</h2>
          <div class="map-filters">            <select id="categoryFilter" class="filter-select">
              <option value="all">All Categories</option>
              <option value="arena">Arena</option>
              <option value="city">City</option>
              <option value="industrial">Industrial</option>
              <option value="outdoor">Outdoor</option>
              <option value="retro">Retro</option>
              <option value="demo">Demo</option>
            </select><select id="sourceFilter" class="filter-select">
              <option value="all">All Sources</option>
              <option value="unity">Unity FPS Sample</option>
              <option value="kenney">KenneyNL</option>
              <option value="dahoom">TheDahoom</option>
              <option value="miziziziz">Retro 3D</option>
              <option value="anarch">Anarch</option>
              <option value="custom">Classic FPS Maps</option>
              <option value="ultimate">Ultimate FPS Demo</option>
            </select>
          </div>
        </div>
        
        <div class="map-collections">
          <div id="mapGrid" class="map-grid">
            <!-- Maps will be populated here -->
          </div>
        </div>
        
        <div class="map-preview">
          <div id="mapPreview" class="map-preview-content">
            <p>Select a map to see preview</p>
          </div>
        </div>
      </div>
    `;

    this.addStyles();
    this.bindEvents();
    this.populateMaps();
  }
  private addStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .map-selector {
        background: rgba(20, 20, 30, 0.95);
        color: #ffffff;
        padding: 20px;
        border-radius: 8px;
        max-height: 80vh;
        overflow-y: auto;
        font-family: 'Courier New', monospace;
      }

      .main-menu-header {
        text-align: center;
        margin-bottom: 30px;
        padding-bottom: 20px;
        border-bottom: 2px solid #00ff41;
      }

      .main-menu-header h1 {
        margin: 0 0 10px 0;
        color: #00ff41;
        font-size: 48px;
        text-shadow: 0 0 10px #00ff41;
        font-weight: bold;
      }

      .subtitle {
        margin: 0 0 20px 0;
        color: #888;
        font-size: 16px;
        font-style: italic;
      }

      .main-menu-buttons {
        display: flex;
        gap: 15px;
        justify-content: center;
        flex-wrap: wrap;
      }

      .menu-btn {
        background: #333;
        border: 2px solid #00ff41;
        color: #00ff41;
        padding: 12px 24px;
        border-radius: 6px;
        font-family: 'Courier New', monospace;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s ease;
        min-width: 140px;
      }

      .menu-btn:hover {
        background: #00ff41;
        color: #000;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 255, 65, 0.3);
      }

      .quick-play-btn {
        background: #00ff41;
        color: #000;
      }

      .quick-play-btn:hover {
        background: #00cc33;
        transform: translateY(-2px) scale(1.05);
      }

      .map-selector-header {
        margin-bottom: 20px;
        border-bottom: 2px solid #00ff41;
        padding-bottom: 15px;
      }

      .map-selector-header h2 {
        margin: 0 0 10px 0;
        color: #00ff41;
        font-size: 24px;
        text-align: center;
      }

      .map-filters {
        display: flex;
        gap: 15px;
        justify-content: center;
      }

      .filter-select {
        background: rgba(0, 0, 0, 0.8);
        border: 1px solid #00ff41;
        color: #00ff41;
        padding: 8px 12px;
        border-radius: 4px;
        font-family: 'Courier New', monospace;
      }

      .filter-select:hover {
        background: rgba(0, 255, 65, 0.1);
      }

      .map-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
      }

      .map-card {
        background: rgba(0, 0, 0, 0.8);
        border: 1px solid #333;
        border-radius: 6px;
        padding: 15px;
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
      }

      .map-card:hover {
        border-color: #00ff41;
        background: rgba(0, 255, 65, 0.1);
        transform: translateY(-2px);
      }

      .map-card.selected {
        border-color: #00ff41;
        background: rgba(0, 255, 65, 0.2);
      }

      .map-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }

      .map-title {
        font-size: 14px;
        font-weight: bold;
        color: #ffffff;
        margin: 0;
      }

      .map-source {
        font-size: 10px;
        color: #00ff41;
        background: rgba(0, 255, 65, 0.2);
        padding: 2px 6px;
        border-radius: 3px;
      }

      .map-category {
        font-size: 12px;
        color: #888;
        margin-bottom: 8px;
      }

      .map-info {
        font-size: 11px;
        color: #aaa;
      }

      .map-preview-content {
        background: rgba(0, 0, 0, 0.8);
        border: 1px solid #333;
        border-radius: 6px;
        padding: 15px;
        text-align: center;
      }

      .map-preview h3 {
        color: #00ff41;
        margin: 0 0 10px 0;
      }

      .map-preview-info {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        text-align: left;
      }

      .info-item {
        background: rgba(255, 255, 255, 0.05);
        padding: 8px;
        border-radius: 4px;
      }

      .info-label {
        font-size: 10px;
        color: #888;
        margin-bottom: 4px;
      }

      .info-value {
        font-size: 12px;
        color: #fff;
      }      .load-map-btn {
        background: #00ff41;
        color: #000;
        border: none;
        padding: 12px 24px;
        border-radius: 4px;
        font-family: 'Courier New', monospace;
        font-weight: bold;
        cursor: pointer;
        margin-top: 15px;
        width: 100%;
        transition: all 0.3s ease;
      }

      .load-map-btn:hover {
        background: #00cc33;
        transform: scale(1.02);
      }

      .load-map-btn:disabled {
        background: #666;
        color: #999;
        cursor: not-allowed;
        transform: none;
      }

      .collection-header {
        color: #00ff41;
        font-size: 16px;
        font-weight: bold;
        margin: 20px 0 10px 0;
        padding-bottom: 5px;
        border-bottom: 1px solid #333;
      }
    `;
    document.head.appendChild(style);
  }
  private bindEvents(): void {
    // Map filter events
    const categoryFilter = document.getElementById('categoryFilter') as HTMLSelectElement;
    const sourceFilter = document.getElementById('sourceFilter') as HTMLSelectElement;

    categoryFilter?.addEventListener('change', () => {
      this.currentCategory = categoryFilter.value;
      this.populateMaps();
    });

    sourceFilter?.addEventListener('change', () => {
      this.currentSource = sourceFilter.value;
      this.populateMaps();
    });

    // Main menu button events
    const quickPlayBtn = this.container.querySelector('.quick-play-btn') as HTMLButtonElement;
    const settingsBtn = this.container.querySelector('.settings-btn') as HTMLButtonElement;
    const exitBtn = this.container.querySelector('.exit-btn') as HTMLButtonElement;

    quickPlayBtn?.addEventListener('click', () => {
      this.handleQuickPlay();
    });

    settingsBtn?.addEventListener('click', () => {
      this.handleSettings();
    });

    exitBtn?.addEventListener('click', () => {
      this.handleExit();
    });
  }

  private populateMaps(): void {
    const mapGrid = document.getElementById('mapGrid');
    if (!mapGrid) return;

    const maps = this.getFilteredMaps();
    const collections = this.groupMapsBySource(maps);

    mapGrid.innerHTML = '';

    collections.forEach(collection => {
      if (collection.maps.length === 0) return;

      // Add collection header
      const header = document.createElement('div');
      header.className = 'collection-header';
      header.textContent = collection.name;
      mapGrid.appendChild(header);

      // Add maps from this collection
      collection.maps.forEach(({ id, asset }) => {
        const mapCard = this.createMapCard(id, asset);
        mapGrid.appendChild(mapCard);
      });
    });
  }

  private getFilteredMaps(): Array<{ id: string; asset: MapAsset }> {
    const allMaps = Object.entries(ASSET_CONFIG.maps);
    
    return allMaps
      .filter(([_, asset]) => {
        if (this.currentCategory !== 'all' && asset.category !== this.currentCategory) {
          return false;
        }
        if (this.currentSource !== 'all' && asset.source !== this.currentSource) {
          return false;
        }
        return true;
      })
      .map(([id, asset]) => ({ id, asset }));
  }

  private groupMapsBySource(maps: Array<{ id: string; asset: MapAsset }>): MapCollection[] {
    const collections: { [key: string]: MapCollection } = {};

    maps.forEach(map => {
      const sourceName = this.getSourceDisplayName(map.asset.source);
      
      if (!collections[sourceName]) {
        collections[sourceName] = {
          name: sourceName,
          maps: []
        };
      }
      
      collections[sourceName].maps.push(map);
    });

    return Object.values(collections).sort((a, b) => a.name.localeCompare(b.name));
  }

  private getSourceDisplayName(source: string): string {    const sourceNames: { [key: string]: string } = {
      'unity': 'Unity FPS Sample',
      'kenney': 'KenneyNL Starter Kit',
      'dahoom': 'TheDahoom Template',
      'miziziziz': 'Retro 3D Collection',
      'anarch': 'Anarch Public Domain',
      'custom': 'Classic FPS Maps (Calinou)',
      'ultimate': 'Ultimate FPS Demo'
    };
    return sourceNames[source] || source;
  }

  private createMapCard(mapId: string, asset: MapAsset): HTMLElement {
    const card = document.createElement('div');
    card.className = 'map-card';
    card.dataset.mapId = mapId;

    const fileFormat = asset.path.split('.').pop()?.toUpperCase() || 'UNKNOWN';
    const categoryIcon = this.getCategoryIcon(asset.category);

    card.innerHTML = `
      <div class="map-card-header">
        <h3 class="map-title">${asset.displayName}</h3>
        <span class="map-source">${asset.source.toUpperCase()}</span>
      </div>
      <div class="map-category">${categoryIcon} ${asset.category.toUpperCase()}</div>
      <div class="map-info">
        Format: ${fileFormat}<br>
        Path: ${asset.path.split('/').pop()}
      </div>
    `;

    card.addEventListener('click', () => {
      this.selectMap(mapId, asset);
    });

    return card;
  }
  private getCategoryIcon(category: string): string {
    const icons: { [key: string]: string } = {
      'arena': '⚔️',
      'city': '🏢',
      'industrial': '🏭',
      'outdoor': '🌄',
      'retro': '🕹️',
      'demo': '🎮'
    };
    return icons[category] || '🗺️';
  }

  private selectMap(mapId: string, asset: MapAsset): void {
    // Remove previous selection
    this.container.querySelectorAll('.map-card.selected').forEach(card => {
      card.classList.remove('selected');
    });

    // Select current card
    const selectedCard = this.container.querySelector(`[data-map-id="${mapId}"]`);
    selectedCard?.classList.add('selected');

    // Update preview
    this.updateMapPreview(mapId, asset);
  }

  private updateMapPreview(mapId: string, asset: MapAsset): void {
    const preview = document.getElementById('mapPreview');
    if (!preview) return;

    const textureCount = Object.keys(asset.textures || {}).length;
    const spawnCount = asset.spawnPoints?.length || 0;

    preview.innerHTML = `
      <h3>${asset.displayName}</h3>
      <div class="map-preview-info">
        <div class="info-item">
          <div class="info-label">Source</div>
          <div class="info-value">${this.getSourceDisplayName(asset.source)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Category</div>
          <div class="info-value">${asset.category}</div>
        </div>
        <div class="info-item">
          <div class="info-label">File Format</div>
          <div class="info-value">${asset.path.split('.').pop()?.toUpperCase()}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Textures</div>
          <div class="info-value">${textureCount} files</div>
        </div>
        <div class="info-item">
          <div class="info-label">Spawn Points</div>
          <div class="info-value">${spawnCount} locations</div>
        </div>
        <div class="info-item">
          <div class="info-label">Path</div>
          <div class="info-value">${asset.path}</div>
        </div>      </div>      <button class="load-map-btn" data-map-id="${mapId}">
        Play Map
      </button>
    `;
      // Add event listener to the button instead of using onclick
    setTimeout(() => {
      const button = preview.querySelector('.load-map-btn') as HTMLButtonElement;
      if (button) {
        console.log(`[MapSelector] Found button for map: ${mapId}, adding click listener`);
        button.addEventListener('click', (e) => {
          console.log(`[MapSelector] Button CLICKED for map: ${mapId}`);
          e.preventDefault();
          e.stopPropagation();
          this.playSelectedMap(mapId).catch(error => {
            console.error('[MapSelector] Error in playSelectedMap:', error);
          });
        });
        
        // Also add a test onclick to verify the button is working
        button.onclick = (e) => {
          console.log(`[MapSelector] Button onclick triggered for map: ${mapId}`);
          e.preventDefault();
          e.stopPropagation();
          return false;
        };
      } else {
        console.error(`[MapSelector] Could not find button for map: ${mapId}`);
      }
    }, 100);
  }  public async playSelectedMap(mapId: string): Promise<void> {
    console.log(`[MapSelector] playSelectedMap called with mapId: ${mapId}`);
    
    const asset = ASSET_CONFIG.maps[mapId];
    if (!asset) {
      console.error(`[MapSelector] No asset found for mapId: ${mapId}`);
      return;
    }

    console.log(`[MapSelector] Starting game with map: ${asset.displayName}`);

    // Update button to show launching state
    const preview = document.getElementById('mapPreview');
    const playBtn = preview?.querySelector('.load-map-btn') as HTMLButtonElement;
    if (playBtn) {
      playBtn.disabled = true;
      playBtn.textContent = 'Launching Game...';
      playBtn.style.background = '#ffaa00';
    } else {
      console.warn('[MapSelector] Could not find play button to update');
    }

    try {      // Create launch options
      const launchOptions: GameLaunchOptions = {
        mapId: mapId,
        mapAsset: asset,
        gameMode: 'singleplayer', // Default to singleplayer
        playerCount: 1,
        timeLimit: 15, // 15 minute matches
        scoreLimit: 25
      };

      console.log('[MapSelector] Launching game with options:', launchOptions);
      
      // Launch the game
      await this.gameSpawner.launchGame(launchOptions);

      // Game should be running now, button will be handled by GameSpawner

    } catch (error) {
      console.error(`[MapSelector] Failed to launch game with map ${asset.displayName}:`, error);
      
      // Show error state
      if (playBtn) {
        playBtn.disabled = false;
        playBtn.textContent = 'Launch Failed ✗';
        playBtn.style.background = '#cc3300';
        
        setTimeout(() => {
          playBtn.textContent = 'Play Map';
          playBtn.style.background = '#00ff41';
        }, 3000);
      }
    }
  }
  public show(): void {
    this.container.style.display = 'block';
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  public getMapCount(): number {
    return Object.keys(ASSET_CONFIG.maps).length;
  }

  public getMapsByCategory(category: string): Array<{ id: string; asset: MapAsset }> {
    return Object.entries(ASSET_CONFIG.maps)
      .filter(([_, asset]) => asset.category === category)
      .map(([id, asset]) => ({ id, asset }));
  }

  public getMapsBySource(source: string): Array<{ id: string; asset: MapAsset }> {
    return Object.entries(ASSET_CONFIG.maps)
      .filter(([_, asset]) => asset.source === source)
      .map(([id, asset]) => ({ id, asset }));
  }

  // Main menu handler methods
  private handleQuickPlay(): void {
    console.log('[MapSelector] Quick Play clicked - selecting random map');
    
    // Get all available maps
    const maps = this.getFilteredMaps();
    if (maps.length === 0) {
      console.error('[MapSelector] No maps available for Quick Play');
      return;
    }

    // Select a random map
    const randomIndex = Math.floor(Math.random() * maps.length);
    const { id: mapId, asset } = maps[randomIndex];
    
    console.log(`[MapSelector] Quick Play selected map: ${asset.displayName} (${mapId})`);
    
    // Visually select the map
    this.selectMap(mapId, asset);
    
    // Scroll to the selected map card
    const mapCard = this.container.querySelector(`[data-map-id="${mapId}"]`);
    if (mapCard) {
      mapCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Launch the game immediately
    this.playSelectedMap(mapId).catch(error => {
      console.error('[MapSelector] Quick Play failed:', error);
    });
  }

  private handleSettings(): void {
    console.log('[MapSelector] Settings clicked - opening settings menu');
    
    // Show the settings menu
    this.settingsMenu.show();
  }

  private handleExit(): void {
    console.log('[MapSelector] Exit clicked');
    
    // For web browsers, we can't truly exit the application
    // Instead, show a confirmation and optionally redirect
    const confirmExit = window.confirm(
      'Are you sure you want to exit SLIME FPS?\n\n' +
      'This will close the game and return you to your browser.'
    );
    
    if (confirmExit) {
      // Try to close the window (might be blocked by browser)
      try {
        window.close();
      } catch (error) {
        // If window.close() fails, redirect to a blank page or about:blank
        window.location.href = 'about:blank';
      }
    }
  }
}

// Make MapSelector globally accessible for button clicks
declare global {
  interface Window {
    mapSelector?: MapSelector;
  }
}
