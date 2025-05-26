const { Server } = require('colyseus')
const { Room } = require('colyseus')
const express = require('express')
const http = require('http')

class TestRoom extends Room {
  onCreate() {
    console.log('Test room created')
  }

  onJoin(client: any) {
    console.log('Client joined:', client.sessionId)
  }

  onLeave(client: any) {
    console.log('Client left:', client.sessionId)
  }
}

const app = express()
const server = http.createServer(app)
const gameServer = new Server({
  server: server,
})

gameServer.define('test', TestRoom)

const port = 2567
gameServer.listen(port)
console.log(`🚀 Test server listening on port ${port}`)
