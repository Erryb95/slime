# SLIME FPS 🎮

A high-performance browser-based competitive FPS game built with modern web technologies, targeting native-class frame rates (240 Hz) and professional-grade server tick rates (128 Hz).

## 🚀 Features

### Client Performance

- **240 Hz Rendering**: WebGPU-powered graphics with Babylon.js
- **Sub-millisecond Input**: Native pointer lock and high-frequency input polling
- **Physics Simulation**: Rapier (Rust → WASM) with SIMD and multi-threading
- **OffscreenCanvas**: Worker-based rendering for consistent performance

### Server Architecture

- **128 Hz Tick Rate**: Authoritative server simulation matching Valorant/CS2
- **WebTransport**: QUIC-based low-latency networking
- **Binary Messaging**: FlatBuffers for efficient serialization
- **Scalable Multiplayer**: Colyseus framework with room-based matchmaking

### Development Experience

- **Hot Reload**: Lightning-fast Vite builds with instant updates
- **Full Stack Debugging**: VS Code launch configs for client and server
- **Asset Pipeline**: Automated pulling from open-source repositories
- **Performance Monitoring**: Real-time FPS, tick rate, and latency metrics

## 🏗️ Architecture

```
┌─────────────────┐    WebTransport     ┌─────────────────┐
│   Client        │    (QUIC/UDP)       │   Server        │
│                 │◄─────────────────────┤                 │
│ WebGPU Babylon  │    Binary Messages   │ Colyseus 128Hz  │
│ Rapier Physics  │    @ 32-240Hz        │ Auth Simulation │
│ 240Hz Rendering │                      │ State Sync      │
└─────────────────┘                      └─────────────────┘
```

## 📁 Project Structure

```
SLIME/
├── client/                 # TypeScript WebGPU client
│   ├── src/
│   │   ├── client/         # Game client & networking
│   │   ├── input/          # Input handling
│   │   ├── physics/        # Rapier integration
│   │   ├── rendering/      # Babylon.js systems
│   │   └── ui/             # User interface
│   ├── index.html
│   ├── vite.config.ts      # WebGPU + WASM config
│   └── package.json
├── server/                 # Node.js Colyseus server
│   ├── src/
│   │   ├── rooms/          # Game room logic
│   │   ├── schemas/        # State schemas
│   │   └── systems/        # Game systems
│   ├── server.ts
│   └── package.json
├── tools/
│   └── pullAssets.js       # Asset automation
├── .vscode/
│   ├── tasks.json          # Build & run tasks
│   ├── launch.json         # Debug configs
│   └── settings.json       # Workspace settings
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ (for ES modules and top-level await)
- **Modern Browser** with WebGPU support (Chrome 113+, Edge 113+)
- **VS Code** (recommended for optimal development experience)

### 1. Install Dependencies

```bash
# Install all dependencies (client + server)
npm run install:all

# Or individually:
cd client && npm install
cd ../server && npm install
```

### 2. Start Development Servers

```bash
# Option A: Use VS Code Task (Recommended)
Ctrl+Shift+P → "Tasks: Run Task" → "Start Full Stack"

# Option B: Manual startup
# Terminal 1 - Server (128Hz)
cd server && npm run dev

# Terminal 2 - Client (Vite HMR)
cd client && npm run dev
```

### 3. Open Game

- **Client**: http://localhost:3000
- **Server Monitor**: http://localhost:2567/colyseus
- **Playground**: http://localhost:2567/playground

## 🎮 Controls

| Key           | Action               |
| ------------- | -------------------- |
| `W A S D`     | Movement             |
| `Mouse`       | Look around          |
| `Left Click`  | Fire weapon          |
| `Right Click` | Aim/Secondary        |
| `Space`       | Jump                 |
| `Shift`       | Crouch/Walk          |
| `R`           | Reload               |
| `F`           | Toggle fullscreen    |
| `Esc`         | Release pointer lock |

## 🔧 Development

### VS Code Tasks

- **Install All Dependencies**: Install client + server npm packages
- **Start Full Stack**: Launch both client and server in parallel
- **Client: Dev Server**: Start Vite dev server with hot reload
- **Server: Dev Server**: Start Colyseus server with auto-restart
- **Assets: Pull**: Download open-source game assets

### Debugging

- **Launch Full Stack**: Debug both client (Chrome) and server (Node.js)
- **Launch Client**: Attach debugger to Chrome with WebGPU enabled
- **Launch Server**: Debug Node.js with TypeScript source maps

### Asset Pipeline

```bash
# Pull assets from open repositories
npm run assets:pull

# Assets saved to:
# client/public/assets/kenney/        # Kenney.nl assets
# client/public/assets/opengameart/   # OpenGameArt.org assets
# client/public/assets/manifest.json  # Asset index
```

## ⚡ Performance Targets

### Client Rendering

- **Target FPS**: 240 Hz (4.16ms frame budget)
- **Input Latency**: <1ms pointer lock to render
- **Physics Rate**: 128 Hz simulation step
- **Memory**: <200MB heap usage

### Server Simulation

- **Tick Rate**: 128 Hz (7.8ms per tick)
- **State Sync**: 32-64 Hz to clients
- **Input Processing**: 240 Hz from clients
- **Latency**: <50ms regional, <150ms global

### Network Protocol

- **Input Messages**: 240 Hz unreliable UDP
- **State Updates**: 32 Hz reliable delivery
- **Event Messages**: Reliable ordered delivery
- **Bandwidth**: <100 KB/s per player

## 🛠️ Technology Stack

### Client Stack

| Component      | Technology     | Purpose                 |
| -------------- | -------------- | ----------------------- |
| **Engine**     | Babylon.js 7.x | WebGPU rendering        |
| **Physics**    | Rapier 0.14    | WASM physics simulation |
| **Language**   | TypeScript 5.x | Type-safe development   |
| **Bundler**    | Vite 6.x       | Fast build & HMR        |
| **Networking** | Colyseus.js    | Client multiplayer SDK  |

### Server Stack

| Component         | Technology     | Purpose                   |
| ----------------- | -------------- | ------------------------- |
| **Framework**     | Colyseus 0.15  | Authoritative multiplayer |
| **Runtime**       | Node.js 18+    | ES modules & performance  |
| **Language**      | TypeScript 5.x | Shared types with client  |
| **Transport**     | WebTransport   | QUIC low-latency protocol |
| **Serialization** | FlatBuffers    | Binary message format     |

## 🎯 Roadmap

### Phase 1: Core FPS (Current)

- [x] WebGPU rendering setup
- [x] High-frequency input handling
- [x] Rapier physics integration
- [x] Colyseus multiplayer foundation
- [x] 128Hz server tick rate
- [ ] Weapon systems & ballistics
- [ ] Player health & damage
- [ ] Respawn mechanics

### Phase 2: Competitive Features

- [ ] Anti-cheat foundation
- [ ] Spectator mode
- [ ] Match replay system
- [ ] Performance profiling tools
- [ ] Regional server deployment
- [ ] Ranked matchmaking

### Phase 3: Polish & Optimization

- [ ] Advanced graphics options
- [ ] Audio system integration
- [ ] Map editor tools
- [ ] Tournament mode
- [ ] Streaming integration
- [ ] Mobile companion app

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** changes (`git commit -m 'Add amazing feature'`)
4. **Push** to branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines

- Maintain 240 FPS client performance
- Keep server tick rate at 128 Hz
- Write tests for game logic
- Use TypeScript strict mode
- Follow established architecture patterns

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Babylon.js Team** - Outstanding WebGPU support
- **Dimforge** - Rapier physics engine
- **Colyseus** - Multiplayer framework
- **Kenney** - Open game assets
- **OpenGameArt** - Community assets

---

**Built with ❤️ for competitive FPS gaming**

_Targeting the performance standards of modern esports titles in a web browser._
