const { Server, Room } = require('colyseus')
const { WebSocketTransport } = require('@colyseus/ws-transport')
const { createServer } = require('http')
const express = require('express')
const cors = require('cors')
const { monitor } = require('@colyseus/monitor')
const { playground } = require('@colyseus/playground')

// Simple Game Room without schema (for stability)
class GameRoom extends Room {
  maxClients = 8
  onCreate(options) {
    console.log('🎮 GameRoom created with options:', options)
      // Don't use setState - just store data directly for now
    this.players = {}
    this.gameTime = 0
    this.gameStarted = false
    
    this.setSimulationInterval((deltaTime) => {
      // 128Hz server tick
      this.gameTime += deltaTime
    }, 1000 / 128)
    
    this.onMessage('input', (client, message) => {
      console.log('📥 Input from', client.sessionId, message)
      // Handle player input
      this.broadcast('playerUpdate', {
        playerId: client.sessionId,
        ...message
      }, { except: client })
    })
    
    this.onMessage('test', (client, message) => {
      console.log('📨 Test message from', client.sessionId, message)
      // Send test response back to client
      client.send('testResponse', {
        message: 'Server received your test message!',
        timestamp: Date.now(),
        originalMessage: message
      })
    })

    this.onMessage('*', (client, type, message) => {
      console.log(`📨 Message [${type}] from ${client.sessionId}:`, message)
    })
  }

  onJoin(client, options) {
    console.log('✅ Player joined:', client.sessionId, options)
    
    // Initialize player if not exists
    if (!this.players[client.sessionId]) {
      this.players[client.sessionId] = {
        id: client.sessionId,
        name: options.playerName || options.name || `Player${Object.keys(this.players).length + 1}`,
        x: Math.random() * 20 - 10,
        y: 1,
        z: Math.random() * 20 - 10,
        health: 100,
        score: 0
      }
    }

    // Send welcome message to the joining client
    client.send('welcome', {
      message: 'Welcome to SLIME FPS!',
      playerId: client.sessionId,
      gameState: {
        players: this.players,
        gameTime: this.gameTime,
        gameStarted: this.gameStarted
      }
    })

    // Broadcast to other players
    this.broadcast('playerJoined', {
      playerId: client.sessionId,
      player: this.players[client.sessionId]
    }, { except: client })
      console.log(`Player count: ${this.clients.length}`)
  }
  
  onLeave(client, consented) {
    console.log('❌ Player left:', client.sessionId, consented ? 'consented' : 'unexpected')
    
    delete this.players[client.sessionId]
    
    this.broadcast('playerLeft', {
      playerId: client.sessionId
    })
  }

  onDispose() {
    console.log('🗑️ GameRoom disposed')
  }
}

// Express app
const app = express()
app.use(cors())
app.use(express.json())

// Create HTTP server
const server = createServer(app)

// Create Colyseus server with WebSocketTransport
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: server,
    pingInterval: 1000,
    pingMaxRetries: 3
  })
})

// Register room
gameServer.define('game', GameRoom)

// Development tools - Add Colyseus Monitor and Playground
if (process.env.NODE_ENV !== 'production') {
  // Colyseus monitor
  app.use('/colyseus', monitor())
  
  // Playground for testing
  app.use('/playground', playground)
  
  console.log('🎮 Colyseus Playground will be available at: http://localhost:' + (process.env.PORT || 2567) + '/playground')
  console.log('📊 Colyseus Monitor will be available at: http://localhost:' + (process.env.PORT || 2567) + '/colyseus')
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    rooms: gameServer.transport ? Object.keys(gameServer.transport.rooms || {}).length : 0,
    version: '1.0.0'
  })
})

// API endpoint to list rooms
app.get('/api/rooms', (req, res) => {
  const rooms = gameServer.transport && gameServer.transport.rooms ? 
    Object.values(gameServer.transport.rooms).map(room => ({
      roomId: room.roomId,
      name: room.roomName,
      clients: room.clients.length,
      maxClients: room.maxClients,
      metadata: room.metadata
    })) : []
  
  res.json(rooms)
})

// Error handling
server.on('error', (error) => {
  console.error('❌ Server error:', error)
})

gameServer.onShutdown(() => {
  console.log('🛑 Server shutting down...')
})

// Start server
const port = process.env.PORT || 2567
server.listen(port, () => {
  console.log('🚀 SLIME FPS Server started!')
  console.log(`🌐 Server listening on http://localhost:${port}`)
  console.log('🎯 Target tickrate: 128Hz')
  console.log('💪 WebSocket ready for connections')
})
