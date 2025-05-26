console.log('Starting SLIME server...')

const { Server, Room } = require('colyseus')
const express = require('express')
const cors = require('cors')
const http = require('http')

console.log('Loaded dependencies successfully')

// Simple game room without complex schemas for now
class SimpleGameRoom extends Room {
  onCreate(options) {
    console.log('🎮 Simple game room created with options:', options)
    this.maxClients = 16
    this.setState({ players: {}, gameStarted: false })
    console.log('Room state initialized')
  }
  
  onJoin(client, options) {
    console.log(`🔗 Player ${client.sessionId} joined with options:`, options)
    console.log(`Current player count: ${this.clients.length}`)
    
    // Add player to state
    this.state.players[client.sessionId] = {
      id: client.sessionId,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }
    }
    
    // Notify all clients
    this.broadcast('playerJoined', { 
      playerId: client.sessionId, 
      playerCount: this.clients.length,
      players: this.state.players
    })
    
    // Send welcome message to new player
    client.send('welcome', { 
      message: 'Welcome to SLIME FPS!', 
      playerId: client.sessionId,
      gameState: this.state
    })
  }

  onMessage(client, type, message) {
    console.log(`📨 Message from ${client.sessionId}:`, type, JSON.stringify(message))
    
    switch(type) {
      case 'playerUpdate':
        // Update player position
        if (this.state.players[client.sessionId]) {
          this.state.players[client.sessionId].position = message.position
          this.state.players[client.sessionId].rotation = message.rotation
        }
        // Broadcast to other players
        this.broadcast('playerUpdate', { playerId: client.sessionId, ...message }, { except: client })
        break
      case 'test':
        console.log('Test message received:', message)
        client.send('testResponse', { message: 'Server received your test message!', timestamp: Date.now() })
        break
      default:
        // Echo other messages to all clients
        this.broadcast(type, { from: client.sessionId, ...message }, { except: client })
    }
  }

  onLeave(client, consented) {
    console.log(`🔌 Player ${client.sessionId} left (consented: ${consented})`)
    
    // Remove player from state
    delete this.state.players[client.sessionId]
    
    // Notify remaining clients
    this.broadcast('playerLeft', { 
      playerId: client.sessionId, 
      playerCount: this.clients.length,
      players: this.state.players
    })
  }

  onDispose() {
    console.log('🗑️ Simple game room disposed')
  }
}

const app = express()
const server = http.createServer(app)

// Enable CORS
app.use(cors())
app.use(express.json())

// Create Colyseus server
const gameServer = new Server({
  server: server,
})

// Add connection monitoring
gameServer.onShutdown(() => {
  console.log('🔄 Game server shutting down...')
})

// Define room
gameServer.define('game', SimpleGameRoom)

console.log('Game room "game" defined successfully')

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  })
})

const port = process.env.PORT || 2567

console.log(`Attempting to start server on port ${port}...`)

try {
  gameServer.listen(port)
  console.log(`🚀 SLIME Game Server running on port ${port}`)
  console.log(`📊 Health check: http://localhost:${port}/health`)
  console.log(`🎮 Game room available: ws://localhost:${port}/game`)
} catch (error) {
  console.error('Failed to start server:', error)
  process.exit(1)
}

// Add error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
