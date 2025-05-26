// SLIME FPS - Game Spawner System
// Handles spawning and launching the full game environment from the level explorer

import { Engine, WebGPUEngine } from '@babylonjs/core/Engines'
import { Scene } from '@babylonjs/core/scene'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import { GameClient } from '../client/GameClient'
import { ASSET_CONFIG } from '../assets/AssetLoadingConfig';
import type { MapAsset } from '../assets/AssetLoadingConfig'

export interface GameLaunchOptions {
  mapId: string;
  mapAsset: MapAsset;
  gameMode?: 'singleplayer' | 'multiplayer';
  playerCount?: number;
  timeLimit?: number; // in minutes
  scoreLimit?: number;
}

export class GameSpawner {
  private engine: Engine | WebGPUEngine | null = null;
  private scene: Scene | null = null;
  private gameClient: GameClient | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private isGameRunning: boolean = false;
  private currentOptions: GameLaunchOptions | null = null;

  constructor() {
    this.setupCanvas();
  }

  /**
   * Create or get the game canvas
   */
  private setupCanvas(): void {
    // Look for existing render canvas
    let canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    
    if (!canvas) {
      // Create new canvas for the game
      canvas = document.createElement('canvas');
      canvas.id = 'gameCanvas';
      canvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1000;
        background: #000;
        display: none;
      `;
      document.body.appendChild(canvas);
    }
    
    this.canvas = canvas;
  }

  /**
   * Launch the full game with the selected map
   */  async launchGame(options: GameLaunchOptions): Promise<void> {
    console.log(`[GameSpawner] launchGame called with options:`, options);
    
    if (this.isGameRunning) {
      console.warn('[GameSpawner] Game is already running');
      return;
    }

    // Special handling for Ultimate FPS Demo levels
    if (options.mapId === 'ultimate_fps_demo' || options.mapId === 'ultimate_fps_demo_enhanced') {
      console.log(`🚀 [GameSpawner] Launching Ultimate FPS Demo: ${options.mapId}`);
      
      // Determine which HTML file to open based on the map ID
      let demoUrl = '';
      if (options.mapId === 'ultimate_fps_demo') {
        demoUrl = 'ultimate-fps-demo-fixed.html';
      } else if (options.mapId === 'ultimate_fps_demo_enhanced') {
        demoUrl = 'ultimate-fps-demo-enhanced.html';
      }
      
      console.log(`🎮 [GameSpawner] Redirecting to: ${demoUrl}`);
      
      // Open the demo level directly
      window.location.href = demoUrl;
      return;
    }

    try {
      console.log(`🚀 [GameSpawner] Launching SLIME FPS with map: ${options.mapAsset.displayName}`);
      
      this.currentOptions = options;
      console.log('✅ [GameSpawner] Options stored');
      
      // Show loading screen
      console.log('📺 [GameSpawner] Showing loading screen...');
      this.showLoadingScreen(`Loading ${options.mapAsset.displayName}...`);
      
      // Initialize Babylon.js engine
      console.log('🎮 [GameSpawner] Initializing engine...');
      await this.initializeEngine();
      console.log('✅ [GameSpawner] Engine initialized');
      
      // Initialize game client with all systems
      console.log('🎯 [GameSpawner] Initializing game client...');
      await this.initializeGameClient();
      console.log('✅ [GameSpawner] Game client initialized');
      
      // Load the selected map
      console.log('🗺️ [GameSpawner] Loading game map...');
      await this.loadGameMap();
      console.log('✅ [GameSpawner] Map loaded');
      
      // Setup game session
      console.log('⚙️ [GameSpawner] Setting up game session...');
      this.setupGameSession();
      console.log('✅ [GameSpawner] Game session setup complete');
      
      // Hide level explorer and show game
      console.log('🎬 [GameSpawner] Transitioning to game...');
      this.transitionToGame();
      console.log('✅ [GameSpawner] Transition complete');
      
      // Start game loop
      console.log('🔄 [GameSpawner] Starting game loop...');
      this.startGameLoop();
      console.log('✅ [GameSpawner] Game loop started');
      
      this.isGameRunning = true;
      console.log('✅ [GameSpawner] Game launched successfully!');
      
    } catch (error) {
      console.error('❌ [GameSpawner] Failed to launch game:', error);
      this.handleLaunchError(error);
      throw error; // Re-throw so MapSelector can handle it
    }
  }

  /**
   * Initialize Babylon.js engine with performance optimizations
   */
  private async initializeEngine(): Promise<void> {
    if (!this.canvas) {
      throw new Error('Canvas not available');
    }

    // Try WebGPU first for maximum performance
    const webGPUSupported = await WebGPUEngine.IsSupportedAsync;
    
    if (webGPUSupported) {
      console.log('🎮 Using WebGPU for maximum performance');
      this.engine = new WebGPUEngine(this.canvas, {
        powerPreference: 'high-performance',
        antialias: false, // Disable for max FPS
        adaptToDeviceRatio: false
      });
      await (this.engine as WebGPUEngine).initAsync();
    } else {
      console.log('🎮 Using WebGL (WebGPU not supported)');
      this.engine = new Engine(this.canvas, true, {
        powerPreference: 'high-performance',
        antialias: false,
        adaptToDeviceRatio: false
      });
    }    // Create scene with performance settings
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.02, 0.02, 0.05, 1.0); // Dark blue background
    
    console.log('✅ Babylon.js engine and scene initialized successfully');
  }

  /**
   * Initialize the complete game client system
   */
  private async initializeGameClient(): Promise<void> {
    if (!this.scene) {
      throw new Error('Scene not initialized');
    }

    console.log('🎯 Initializing game systems...');
    
    // Create game client with all managers
    this.gameClient = new GameClient(this.scene);
    await this.gameClient.initialize();
    
    console.log('✅ Game systems initialized');
  }
  /**
   * Load the selected map into the game
   */
  private async loadGameMap(): Promise<void> {
    if (!this.gameClient || !this.currentOptions) {
      throw new Error('Game client or options not available');
    }

    console.log(`🗺️ Loading map: ${this.currentOptions.mapAsset.displayName} (ID: ${this.currentOptions.mapId})`);
    
    // Map the selected mapId to MapManager map names
    const mapName = this.getMapManagerName(this.currentOptions.mapId);
    console.log(`🎯 Mapped mapId '${this.currentOptions.mapId}' to MapManager map '${mapName}'`);
    
    // Use the game client's asset manager to load the map assets first
    const assetManager = this.gameClient.getAssetManager();
    if (assetManager) {
      await assetManager.loadMap(this.currentOptions.mapId, this.currentOptions.mapAsset);
      console.log('✅ Map assets loaded through AssetManager');
    }

    // Use the map manager to set up the game environment with the correct map
    const mapManager = this.gameClient.getMapManager();
    if (mapManager) {
      console.log(`🌍 Loading map '${mapName}' in MapManager...`);
      const success = await mapManager.loadMap(mapName);
      if (success) {
        console.log(`✅ Map '${mapName}' loaded successfully in MapManager`);
      } else {
        console.warn(`⚠️ Failed to load map '${mapName}' in MapManager, using default`);
      }
    }
  }

  /**
   * Map mapId from MapSelector to MapManager map names
   */
  private getMapManagerName(mapId: string): string {
    // Map specific mapIds to MapManager maps based on categories or specific names
    const mapIdLower = mapId.toLowerCase();
    
    // Arena/Combat maps
    if (mapIdLower.includes('arena') || mapIdLower.includes('combat') || mapIdLower.includes('duel')) {
      return 'arena';
    }
    
    // Training/Tutorial maps
    if (mapIdLower.includes('training') || mapIdLower.includes('tutorial') || mapIdLower.includes('test')) {
      return 'training';
    }
    
    // Check by actual mapId
    switch (mapId) {
      case 'training_babylon':
      case 'training':
        return 'training';
      case 'firstLevel_babylon':
      case 'arena':
        return 'arena';
      default:
        // For Unity FPS Sample and other maps, prefer arena for more interesting gameplay
        console.log(`🎲 Unknown mapId '${mapId}', defaulting to 'arena' for better gameplay`);
        return 'arena';
    }
  }

  /**
   * Setup game session parameters
   */
  private setupGameSession(): void {
    if (!this.currentOptions || !this.gameClient) return;

    console.log('⚙️ Setting up game session...');
    
    const options = this.currentOptions;
    
    // Setup game mode
    if (options.gameMode === 'singleplayer') {
      console.log('🎯 Configuring singleplayer mode');
      // Add AI bots, setup training scenarios, etc.
    } else {
      console.log('🌐 Configuring multiplayer mode');
      // Connect to server, setup networking, etc.
    }

    // Setup spawn points
    this.setupPlayerSpawn();
  }

  /**
   * Setup player spawn location
   */
  private setupPlayerSpawn(): void {
    if (!this.scene || !this.currentOptions) return;

    // Get spawn points from map asset
    const spawnPoints = this.currentOptions.mapAsset.spawnPoints || [
      { x: 0, y: 2, z: 0 } // Default spawn
    ];

    // Use first spawn point
    const spawnPoint = spawnPoints[0];
    const spawnPosition = new Vector3(spawnPoint.x, spawnPoint.y, spawnPoint.z);

    console.log(`👤 Spawning player at: ${spawnPosition.toString()}`);

    // Position player at spawn point
    const playerManager = this.gameClient?.getPlayerManager();
    if (playerManager) {
      playerManager.setPosition(spawnPosition);
    }
  }  /**
   * Transition from level explorer to game
   */
  private transitionToGame(): void {
    // Hide level explorer interface
    const levelExplorer = document.getElementById('app');
    if (levelExplorer) {
      levelExplorer.style.display = 'none';
    }

    // Show game canvas
    if (this.canvas) {
      this.canvas.style.display = 'block';
      this.canvas.focus();
      
      // Show click instruction
      this.showClickInstruction();
      
      // Add click listener to enable pointer lock on first click
      const enablePointerLock = () => {
        this.canvas?.requestPointerLock();
        this.canvas?.removeEventListener('click', enablePointerLock);
        this.hideLoadingScreen(); // Hide instruction after click
      };
      this.canvas.addEventListener('click', enablePointerLock);
      
      // Also add key listener to enable pointer lock and hide instructions
      const enablePointerLockOnKey = (event: KeyboardEvent) => {
        this.canvas?.requestPointerLock();
        document.removeEventListener('keydown', enablePointerLockOnKey);
        this.hideLoadingScreen(); // Hide instruction after any key press
      };
      document.addEventListener('keydown', enablePointerLockOnKey);
      
      console.log('🎮 Canvas ready - click or press any key to enable mouse lock');
    }
  }
  /**
   * Show click instruction overlay
   */
  private showClickInstruction(): void {
    const loadingScreen = document.getElementById('gameLoadingScreen');
    if (loadingScreen) {
      loadingScreen.innerHTML = `
        <div style="text-align: center; color: white;">
          <h2>🎮 Game Ready!</h2>
          <p style="font-size: 18px; margin: 20px 0;">Click anywhere or press any key to start playing</p>
          <p style="font-size: 14px; opacity: 0.7;">
            • Use WASD to move<br>
            • Move mouse to look around<br>
            • Press ESC to exit game
          </p>
        </div>
      `;
      loadingScreen.style.display = 'flex';
    }
  }
  /**
   * Start the game render loop
   */
  private startGameLoop(): void {
    if (!this.engine) return;

    console.log('🔄 Starting game loop...');
    
    this.engine.runRenderLoop(() => {
      if (this.scene && this.gameClient) {
        // Update game client (handles all subsystems)
        this.gameClient.update();
        
        // Render scene
        this.scene.render();
      }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      this.engine?.resize();
    });

    // Handle ESC key to exit game
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.exitGame();
        document.removeEventListener('keydown', handleEscKey);
      }
    };
    document.addEventListener('keydown', handleEscKey);
  }

  /**
   * Exit the game and return to level explorer
   */
  exitGame(): void {
    if (!this.isGameRunning) return;

    console.log('🚪 Exiting game...');

    // Stop render loop
    this.engine?.stopRenderLoop();

    // Show level explorer
    const levelExplorer = document.getElementById('app');
    if (levelExplorer) {
      levelExplorer.style.display = 'block';
    }

    // Hide game canvas
    if (this.canvas) {
      this.canvas.style.display = 'none';
    }

    // Release pointer lock
    document.exitPointerLock();

    // Dispose game resources
    this.gameClient?.dispose?.();
    this.scene?.dispose();
    this.engine?.dispose();

    // Reset state
    this.isGameRunning = false;
    this.currentOptions = null;
    this.gameClient = null;
    this.scene = null;
    this.engine = null;

    console.log('✅ Returned to level explorer');
  }

  /**
   * Show loading screen
   */
  private showLoadingScreen(message: string): void {
    let loadingScreen = document.getElementById('gameLoadingScreen');
    
    if (!loadingScreen) {
      loadingScreen = document.createElement('div');
      loadingScreen.id = 'gameLoadingScreen';
      loadingScreen.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        color: #00ff41;
        font-family: 'Courier New', monospace;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        font-size: 18px;
      `;
      document.body.appendChild(loadingScreen);
    }

    loadingScreen.innerHTML = `
      <div style="text-align: center;">
        <h2 style="color: #00ff41; margin-bottom: 20px;">SLIME FPS</h2>
        <div style="margin-bottom: 20px;">
          <div class="loading-spinner"></div>
        </div>
        <p>${message}</p>
        <p style="font-size: 12px; color: #888; margin-top: 20px;">
          Press ESC to return to level explorer
        </p>
      </div>
      <style>
        .loading-spinner {
          border: 2px solid #333;
          border-top: 2px solid #00ff41;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;

    loadingScreen.style.display = 'flex';

    // Add ESC key handler
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.exitGame();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  /**
   * Hide loading screen
   */
  private hideLoadingScreen(): void {
    const loadingScreen = document.getElementById('gameLoadingScreen');
    if (loadingScreen) {
      loadingScreen.style.display = 'none';
    }
  }

  /**
   * Handle launch errors
   */
  private handleLaunchError(error: any): void {
    console.error('Game launch failed:', error);
    
    // Show error message
    const errorMessage = `
      <div style="text-align: center; color: #ff4444;">
        <h2>Failed to Launch Game</h2>
        <p>${error.message || 'Unknown error occurred'}</p>
        <button onclick="this.parentElement.parentElement.style.display='none'" 
                style="margin-top: 20px; padding: 10px 20px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Close
        </button>
      </div>
    `;

    const loadingScreen = document.getElementById('gameLoadingScreen');
    if (loadingScreen) {
      loadingScreen.innerHTML = errorMessage;
    }

    // Reset state
    this.isGameRunning = false;
    this.currentOptions = null;
  }

  /**
   * Get current game status
   */
  isRunning(): boolean {
    return this.isGameRunning;
  }

  /**
   * Get current game options
   */
  getCurrentOptions(): GameLaunchOptions | null {
    return this.currentOptions;
  }
}
