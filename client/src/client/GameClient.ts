import { Scene } from '@babylonjs/core/scene'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Client } from 'colyseus.js'
import { PhysicsManager } from '../physics/PhysicsManager'
import { MapManager } from '../maps/MapManager'
import { WeaponManager } from '../weapons/WeaponManager'
import { InputManager3D } from '../input/InputManager'
import { UIManager } from '../ui/UIManager'
import { AudioManager } from '../audio/AudioManager'
import { VisualEffectsManager } from '../effects/VisualEffectsManager'
import { PlayerManager } from '../player/PlayerManager'
import { EnhancedAssetManager } from '../assets/EnhancedAssetManager'

export class GameClient {  private scene: Scene
  private assetManager!: EnhancedAssetManager  // Add EnhancedAssetManager
  private physicsManager!: PhysicsManager
  private mapManager!: MapManager
  private weaponManager!: WeaponManager
  private inputManager!: InputManager3D
  private uiManager!: UIManager
  private audioManager!: AudioManager
  private visualEffectsManager!: VisualEffectsManager
  private playerManager!: PlayerManager  // Add PlayerManager
  private colyseusClient!: Client
  private room: any
  private lastFrameTime: number = 0
  private lastNetworkUpdate: number = 0

  constructor(scene: Scene) {
    this.scene = scene
  }
  async initialize() {
    // Get canvas for input manager
    const canvas = this.scene.getEngine().getRenderingCanvas() as HTMLCanvasElement    
    
    // Initialize asset manager first (required for other managers)
    this.assetManager = new EnhancedAssetManager(this.scene)
    
    // Initialize input manager first
    this.inputManager = new InputManager3D(canvas)
      // Initialize UI manager
    this.uiManager = new UIManager()
    this.uiManager.createWeaponHUD()
    this.uiManager.setupThirdPersonUI(true) // Enable third-person UI
    
    // Initialize PlayerManager - This replaces the first-person camera setup
    this.playerManager = new PlayerManager(this.scene, this.assetManager)
    await this.playerManager.initialize()
    this.playerManager.setInputManager(this.inputManager)
    
    // Initialize physics
    this.physicsManager = new PhysicsManager(this.scene)
    await this.physicsManager.initialize()
    
    // Initialize map manager and load default map
    this.mapManager = new MapManager(this.scene)
    await this.mapManager.loadMap('training') // Start with training map

    // Initialize audio manager
    this.audioManager = new AudioManager(this.scene)
    await this.audioManager.initialize()

    // Initialize visual effects manager
    this.visualEffectsManager = new VisualEffectsManager(this.scene)
    await this.visualEffectsManager.initialize()    // Initialize weapon manager
    this.weaponManager = new WeaponManager(this.scene, this.assetManager)
    this.weaponManager.setAudioManager(this.audioManager)
    this.weaponManager.setVisualEffectsManager(this.visualEffectsManager)
    
    // Set PlayerManager to use WeaponManager
    this.playerManager.setWeaponManager(this.weaponManager)
    
    // Set up weapon firing callbacks
    this.inputManager.setWeaponFireCallbacks(
      () => this.handlePrimaryFire(),
      () => this.handleSecondaryFire()
    )
    
    // Set up weapon control callbacks
    this.inputManager.setWeaponControlCallbacks(
      () => this.handleReload(),
      (slot) => this.handleWeaponSwitch(slot)
    )
      // Initialize with ak47 (our main weapon from Unity FPS Sample)
    await this.weaponManager.switchWeapon('ak47')
    
    // Position player at spawn point
    const spawnPoint = this.mapManager.getRandomSpawnPoint()
    this.playerManager.getPlayerPosition().copyFrom(spawnPoint)

    // Initialize multiplayer connection
    await this.initializeMultiplayer()
    
    // Start the game loop
    this.scene.registerBeforeRender(() => this.update())
  }
    // Getter methods for accessing managers
  getAssetManager(): EnhancedAssetManager {
    return this.assetManager;
  }

  getMapManager(): MapManager {
    return this.mapManager;
  }

  getPlayerManager(): PlayerManager {
    return this.playerManager;
  }

  getWeaponManager(): WeaponManager {
    return this.weaponManager;
  }

  getPhysicsManager(): PhysicsManager {
    return this.physicsManager;
  }

  getInputManager(): InputManager3D {
    return this.inputManager;
  }

  getUIManager(): UIManager {
    return this.uiManager;
  }

  getAudioManager(): AudioManager {
    return this.audioManager;
  }

  getVisualEffectsManager(): VisualEffectsManager {
    return this.visualEffectsManager;
  }
  /**
   * Update method for external game loop control
   */
  update(): void {
    // Calculate delta time (in seconds)
    const currentTime = performance.now()
    const deltaTime = (currentTime - this.lastFrameTime) / 1000
    this.lastFrameTime = currentTime

    // Update all managers that have update methods
    this.inputManager.update(deltaTime)
    this.playerManager.update(deltaTime)
    this.weaponManager.update(deltaTime)
    this.physicsManager.update(deltaTime)

    // Send network updates (throttled)
    if (this.room && currentTime - this.lastNetworkUpdate > 16) { // ~60Hz network updates
      this.sendPlayerUpdate()
      this.lastNetworkUpdate = currentTime
    }
  }
    private async initializeMultiplayer() {
    try {
      // Connect to Colyseus server (defaulting to localhost for development)
      this.colyseusClient = new Client('ws://localhost:2567')
      
      // Join or create a game room with player info
      this.room = await this.colyseusClient.joinOrCreate('game', {
        playerName: `Player_${Date.now().toString().slice(-6)}`,
        clientVersion: '1.0.0',
        timestamp: Date.now()
      })
      
      console.log('Connected to multiplayer server!')
      
      // Set up room event handlers first (before sending messages)
      this.room.onMessage('welcome', (message: any) => {
        console.log('Welcome message received:', message)
      })
      
      this.room.onMessage('testResponse', (message: any) => {
        console.log('Test response received:', message)
      })
        this.room.onMessage('*', (type: string, message: any) => {
        this.handleServerMessage(type, message)
      })

      this.room.onStateChange((state: any) => {
        // Handle state changes
        console.log('Game state updated:', Object.keys(state).length, 'properties')
      })

      this.room.onLeave(() => {
        console.log('Disconnected from server')
        this.room = null
        this.colyseusClient = null as any
      })

      this.room.onError((error: any) => {
        console.error('Room error:', error)
      })
      
      // Send initial test message after handlers are set up
      setTimeout(() => {
        if (this.room) {
          this.room.send('test', { 
            message: 'Hello from SLIME FPS client!', 
            timestamp: Date.now(),
            playerName: 'SLIME_Player'
          })
        }
      }, 100)

    } catch (error) {
      console.warn('Could not connect to multiplayer server:', error)
      console.log('Running in offline mode')
    }
  }

  private handleServerMessage(type: string, message: any) {
    switch (type) {
      case 'playerUpdate':
        // Handle player position updates
        break
      case 'gameState':
        // Handle full game state updates
        break
      default:
        console.log('Unknown message type:', type, message)
    }
  }
    private handlePrimaryFire() {
    if (!this.weaponManager.canFire()) return
    
    // Get firing position and direction from the player's camera
    const playerCamera = this.playerManager.getCamera();
    const origin = playerCamera.position.clone()
    const direction = playerCamera.getDirection(Vector3.Forward())
    
    // Play the shoot animation on the player model
    this.playerManager.playAnimation('shoot');
    
    // Fire weapon
    this.weaponManager.fire(origin, direction, (hit) => {
      // Handle hit - could add damage, effects, etc.
      console.log('Hit target at:', hit.pickedPoint)
    })
  }
    private handleSecondaryFire() {
    // For third-person mode, this could trigger aiming mode
    // where the camera zooms in closer to the player
    const camera = this.playerManager.getCamera();
    
    // Zoom in for aiming
    camera.radius = 3; // Move camera closer for aiming
    camera.alpha = -Math.PI / 2; // Adjust horizontal angle
    camera.beta = Math.PI / 4; // Adjust vertical angle
    
    console.log('Secondary fire - aiming')
  }

  private handleReload() {
    if (this.weaponManager.getCurrentWeapon()) {
      this.weaponManager.reload()
      console.log('Reloading weapon...')
    }
  }
  
  private handleWeaponSwitch(slot: number) {
    const weaponNames = ['pistol', 'rifle', 'sniper', 'shotgun']
    const weaponName = weaponNames[slot - 1]
    
    if (weaponName) {
      this.weaponManager.switchWeapon(weaponName).then((success) => {
        if (success) {
          this.uiManager.showWeaponSwitchIndicator(weaponName.toUpperCase())
          console.log(`Switched to ${weaponName}`)
        }
      })
    }
  }
    private sendPlayerUpdate() {
    const playerData = {
      position: this.playerManager.getPlayerPosition(),
      rotation: this.playerManager.getPlayerRotation(),
      timestamp: performance.now()
    }
    
    this.room?.send('playerUpdate', playerData)
  }
  
  dispose() {
    if (this.room) {
      this.room.leave()
    }
    if (this.physicsManager) {
      this.physicsManager.dispose()
    }
    if (this.weaponManager) {
      this.weaponManager.dispose()
    }
    if (this.audioManager) {
      this.audioManager.dispose()
    }
    if (this.visualEffectsManager) {
      this.visualEffectsManager.dispose()
    }
    if (this.mapManager) {
      this.mapManager.dispose()
    }
  }
}
