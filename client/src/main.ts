import { Engine } from '@babylonjs/core/Engines/engine'
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine'
import { Scene } from '@babylonjs/core/scene'
import { GameClient } from './client/GameClient'

// Enable SIMD and threading support
import('@dimforge/rapier3d-compat').then((_RAPIER) => {
  console.log('Rapier physics loaded with SIMD support')
})

class SlimeGame {
  private engine!: Engine | WebGPUEngine
  private scene!: Scene
  private canvas: HTMLCanvasElement
  private gameClient!: GameClient
  private lastTime = 0
  private frameCount = 0
  private fps = 0

  constructor() {
    this.canvas = document.getElementById('renderCanvas') as HTMLCanvasElement
    this.init()
  }

  async init() {
    // Try WebGPU first, fallback to WebGL
    const webGPUSupported = await WebGPUEngine.IsSupportedAsync
    
    if (webGPUSupported) {
      console.log('Using WebGPU renderer for maximum performance')
      this.engine = new WebGPUEngine(this.canvas, {
        powerPreference: 'high-performance',
        antialias: false, // Disable for max FPS
        adaptToDeviceRatio: false
      })
      await (this.engine as WebGPUEngine).initAsync()
    } else {
      console.log('WebGPU not supported, falling back to WebGL')
      this.engine = new Engine(this.canvas, true, {
        powerPreference: 'high-performance',
        antialias: false,
        adaptToDeviceRatio: false
      })
    }

    // Create scene
    this.scene = new Scene(this.engine)
    
    // Initialize game client (handles all managers internally)
    this.gameClient = new GameClient(this.scene)
    await this.gameClient.initialize()

    // Start render loop
    this.startRenderLoop()

    console.log('SLIME FPS Game initialized successfully!')
  }

  private startRenderLoop() {
    this.engine.runRenderLoop(() => {
      const currentTime = performance.now()
      const deltaTime = currentTime - this.lastTime
      this.lastTime = currentTime

      // Update FPS counter
      this.frameCount++
      if (this.frameCount % 60 === 0) { // Update every 60 frames
        this.fps = Math.round(1000 / deltaTime)
        // Update FPS display through GameClient's UI manager
        const fpsElement = document.getElementById('fps')
        if (fpsElement) {
          fpsElement.textContent = `FPS: ${this.fps}`
          // Color code FPS for performance monitoring
          if (this.fps >= 144) {
            fpsElement.style.color = '#00ff00' // Green for high FPS
          } else if (this.fps >= 60) {
            fpsElement.style.color = '#ffff00' // Yellow for medium FPS
          } else {
            fpsElement.style.color = '#ff0000' // Red for low FPS
          }
        }
      }

      // Update game systems
      // Note: GameClient handles its own update loop via scene.registerBeforeRender

      // Render scene
      this.scene.render()
    })

    // Handle window resize
    window.addEventListener('resize', () => {
      this.engine.resize()
    })
  }
}

// Start the game
new SlimeGame()
