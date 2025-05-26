import { Room, type Client } from 'colyseus'
import { GameState } from '../schemas/GameState'
import { Player } from '../schemas/Player'
import { GameLogic } from '../systems/GameLogic'
import { PhysicsSystem } from '../systems/PhysicsSystem'

export interface JoinOptions {
  playerName?: string
  region?: string
}

export class GameRoom extends Room<GameState> {
  private gameLogic!: GameLogic
  private physicsSystem!: PhysicsSystem
  private simulationInterval?: NodeJS.Timeout
  private lastUpdateTime = 0
  private targetTickRate = 128 // 128Hz server simulation
  private tickInterval = 1000 / this.targetTickRate

  async onCreate(options: any) {
    console.log('🎮 GameRoom created with options:', options)
    
    // Initialize game state
    this.setState(new GameState())
    
    // Initialize game systems
    this.gameLogic = new GameLogic(this.state)
    this.physicsSystem = new PhysicsSystem()
    
    // Set maximum number of clients
    this.maxClients = options.maxClients || 16
    
    // Set up message handlers
    this.setupMessageHandlers()
    
    // Start high-frequency simulation loop
    this.startSimulationLoop()
    
    console.log(`✅ GameRoom initialized with ${this.targetTickRate}Hz tick rate`)
  }

  private setupMessageHandlers() {
    // Player input updates (high frequency)
    this.onMessage('playerUpdate', (client, data) => {
      const player = this.state.players.get(client.sessionId)
      if (player) {
        // Update player position and rotation
        player.position.x = data.position.x
        player.position.y = data.position.y
        player.position.z = data.position.z
        
        player.rotation.x = data.rotation.x
        player.rotation.y = data.rotation.y
        player.rotation.z = data.rotation.z
        
        player.lastUpdate = data.timestamp || this.clock.currentTime
      }
    })

    // Player actions (shooting, etc.)
    this.onMessage('playerAction', (client, data) => {
      this.gameLogic.handlePlayerAction(client.sessionId, data)
    })    // Chat messages
    this.onMessage('chatMessage', (client, data) => {
      this.broadcast('chatMessage', {
        playerId: client.sessionId,
        playerName: this.state.players.get(client.sessionId)?.name || 'Unknown',
        message: data.message,
        timestamp: this.clock.currentTime
      })
    })

    // Admin commands for development
    this.onMessage('admin', (client, data) => {
      if (process.env.NODE_ENV === 'production') return
      
      switch (data.command) {
        case 'teleport':
          const player = this.state.players.get(client.sessionId)
          if (player && data.position) {
            player.position.x = data.position.x
            player.position.y = data.position.y
            player.position.z = data.position.z
          }
          break
        case 'setHealth':
          const targetPlayer = this.state.players.get(data.playerId || client.sessionId)
          if (targetPlayer && typeof data.health === 'number') {
            targetPlayer.health = Math.max(0, Math.min(100, data.health))
          }
          break
      }
    })
  }

  private startSimulationLoop() {
    this.lastUpdateTime = Date.now()
    
    this.simulationInterval = setInterval(() => {
      const now = Date.now()
      const deltaTime = (now - this.lastUpdateTime) / 1000 // Convert to seconds
      this.lastUpdateTime = now
      
      // Update game systems
      this.gameLogic.update(deltaTime)
      this.physicsSystem.update(deltaTime)
      
      // Broadcast game state to clients (at lower frequency)
      if (this.clock.currentTime % 4 === 0) { // Every 4th tick = 32Hz
        this.broadcastGameState()
      }
      
    }, this.tickInterval)
  }

  private broadcastGameState() {
    // Only send essential data to reduce bandwidth
    const gameStateUpdate = {
      timestamp: this.clock.currentTime,
      players: this.getPlayersSnapshot(),
      projectiles: this.state.projectiles,
      events: this.state.events
    }
    
    this.broadcast('gameState', gameStateUpdate)
    
    // Clear events after broadcasting
    this.state.events.clear()
  }

  private getPlayersSnapshot() {
    const snapshot: any = {}
    this.state.players.forEach((player, sessionId) => {
      snapshot[sessionId] = {
        id: player.id,
        name: player.name,
        position: player.position,
        rotation: player.rotation,
        health: player.health,
        score: player.score,
        lastUpdate: player.lastUpdate
      }
    })
    return snapshot
  }

  async onJoin(client: Client, options: JoinOptions) {
    console.log(`🔗 Player ${client.sessionId} joined room`)
    
    // Create new player
    const player = new Player()
    player.id = client.sessionId
    player.name = options.playerName || `Player_${client.sessionId.substr(0, 6)}`
    player.health = 100
    player.score = 0
    
    // Set spawn position
    const spawnPoint = this.gameLogic.getSpawnPoint()
    player.position.x = spawnPoint.x
    player.position.y = spawnPoint.y
    player.position.z = spawnPoint.z
    
    // Add player to game state
    this.state.players.set(client.sessionId, player)
    
    // Send welcome message
    client.send('playerJoined', {
      playerId: client.sessionId,
      playerData: player,
      gameMode: this.state.gameMode,
      mapName: this.state.mapName
    })
    
    // Notify other players
    this.broadcast('playerConnected', {
      playerId: client.sessionId,
      playerName: player.name
    }, { except: client })
    
    console.log(`✅ Player ${player.name} (${client.sessionId}) spawned`)
  }

  async onLeave(client: Client, consented: boolean) {
    console.log(`🔌 Player ${client.sessionId} left room (consented: ${consented})`)
    
    const player = this.state.players.get(client.sessionId)
    
    if (player) {
      // Notify other players
      this.broadcast('playerDisconnected', {
        playerId: client.sessionId,
        playerName: player.name
      })
      
      // Remove player from game state
      this.state.players.delete(client.sessionId)
    }
      // Clean up if room is empty
    if (this.clients.length === 0) {
      console.log('📭 Room is empty, scheduling disposal...')
      // Room will be automatically disposed
    }
  }

  onDispose() {
    console.log('🗑️ GameRoom disposed')
    
    // Clean up simulation loop
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval)
    }
    
    // Clean up game systems
    this.gameLogic?.dispose()
    this.physicsSystem?.dispose()
  }
}
