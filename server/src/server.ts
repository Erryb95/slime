import { Server } from 'colyseus'
import { createServer } from 'http'
import express from 'express'
import cors from 'cors'
import { monitor } from '@colyseus/monitor'
import { playground } from '@colyseus/playground'
import net from 'net'

import { GameRoom } from './rooms/GameRoom'

const port = process.env.PORT ? parseInt(process.env.PORT) : 2567

// Check if port is already in use
async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(port, () => {
      server.once('close', () => resolve(true))
      server.close()
    })
    server.on('error', () => resolve(false))
  })
}

// Kill existing process on port (Windows specific)
async function killProcessOnPort(port: number): Promise<void> {
  try {
    const { exec } = require('child_process')
    const command = `netstat -ano | findstr :${port}`
    
    exec(command, (error: any, stdout: string) => {
      if (stdout) {
        const lines = stdout.split('\n')
        const listening = lines.find(line => line.includes('LISTENING'))
        if (listening) {
          const parts = listening.trim().split(/\s+/)
          const pid = parts[parts.length - 1]
          if (pid && pid !== '0') {
            console.log(`🔄 Killing existing process ${pid} on port ${port}`)
            exec(`taskkill /PID ${pid} /F`, (killError: any) => {
              if (killError) {
                console.warn(`⚠️  Could not kill process ${pid}:`, killError.message)
              } else {
                console.log(`✅ Successfully killed process ${pid}`)
              }
            })
          }
        }
      }
    })
  } catch (error) {
    console.warn('⚠️  Could not check for existing processes:', error)
  }
}
const app = express()

// Enable CORS for all origins (configure for production)
app.use(cors())
app.use(express.json())

// Create HTTP server
const httpServer = createServer(app)

// Initialize Colyseus server
const gameServer = new Server({
  server: httpServer,
  pingInterval: 1000 / 128, // 128Hz server tick rate
  pingMaxRetries: 3
})

// Register game rooms
gameServer.define('game', GameRoom, {
  maxClients: 16, // 16 players per match
  allowReconnection: true,
  allowReconnectionTime: 30 // 30 seconds to reconnect
})

// Development tools
if (process.env.NODE_ENV !== 'production') {
  // Colyseus monitor
  app.use('/colyseus', monitor())
  
  // Playground for testing
  app.use('/playground', playground)
  
  console.log('🎮 Colyseus Playground: http://localhost:' + port + '/playground')
  console.log('📊 Colyseus Monitor: http://localhost:' + port + '/colyseus')
}

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    rooms: 0 // Simplified for now
  })
})

// API endpoints
app.get('/api/rooms', async (_req, res) => {
  try {
    // Simplified room listing - will implement proper listing later
    res.json([])
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rooms' })
  }
})

// Start server with port checking
async function startServer() {
  console.log(`🔍 Checking if port ${port} is available...`)
  
  const isAvailable = await checkPortAvailable(port)
  if (!isAvailable) {
    console.log(`⚠️  Port ${port} is already in use, attempting to free it...`)
    await killProcessOnPort(port)
    
    // Wait a moment for the process to be killed
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Check again
    const isNowAvailable = await checkPortAvailable(port)
    if (!isNowAvailable) {
      console.error(`❌ Port ${port} is still in use. Please manually kill the process or use a different port.`)
      process.exit(1)
    }
  }
  
  // Create process ID file to track running instances
  const fs = require('fs')
  const path = require('path')
  const pidFile = path.join(__dirname, '..', '.server.pid')
  fs.writeFileSync(pidFile, process.pid.toString())
  
  console.log(`📝 Server PID ${process.pid} written to ${pidFile}`)
  
  gameServer.listen(port)

  console.log('🚀 SLIME FPS Server started!')
  console.log('🎯 Target tickrate: 128Hz')
  console.log('📡 WebSocket server: ws://localhost:' + port)
  console.log('🌐 HTTP server: http://localhost:' + port)
}

// Start the server
startServer().catch(error => {
  console.error('❌ Failed to start server:', error)
  process.exit(1)
})

// Performance monitoring
let tickCount = 0
let lastTickTime = Date.now()

setInterval(() => {
  const now = Date.now()
  const deltaTime = now - lastTickTime
  const actualTickRate = 1000 / deltaTime
  
  tickCount++
  
  if (tickCount % 128 === 0) { // Log every second
    console.log(`🔄 Server tick rate: ${actualTickRate.toFixed(1)}Hz`)
    console.log(`💾 Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`)
  }
  
  lastTickTime = now
}, 1000 / 128) // 128Hz monitoring

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Graceful shutdown...')
  cleanupAndExit()
})

process.on('SIGINT', () => {
  console.log('🛑 Graceful shutdown...')
  cleanupAndExit()
})

// Cleanup function
function cleanupAndExit() {
  try {
    // Remove PID file
    const fs = require('fs')
    const path = require('path')
    const pidFile = path.join(__dirname, '..', '.server.pid')
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile)
      console.log('🗑️  Removed PID file')
    }
    
    gameServer.gracefullyShutdown(true)
  } catch (error) {
    console.error('❌ Error during cleanup:', error)
    process.exit(1)
  }
}
