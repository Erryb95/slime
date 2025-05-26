<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# SLIME FPS - GitHub Copilot Instructions

## Project Overview

This is a browser-based competitive FPS game built for native-class performance targeting 240Hz client rendering and 128Hz server tick rates. The architecture prioritizes performance and low latency for competitive gaming.

## Technology Stack

### Client (TypeScript + WebGPU)

- **Rendering**: Babylon.js with WebGPU backend for maximum performance
- **Physics**: Rapier physics engine (Rust → WASM) with SIMD and multi-threading
- **Build**: Vite for fast TypeScript compilation and hot reload
- **Target Performance**: 240 FPS rendering, <1ms input latency

### Server (Node.js + Colyseus)

- **Framework**: Colyseus for authoritative multiplayer
- **Transport**: WebTransport (QUIC) for low-latency networking
- **Tick Rate**: 128Hz simulation loop for competitive accuracy
- **Messaging**: Binary protocols (FlatBuffers) for efficiency

## Code Style & Patterns

### Performance First

- Always consider frame time impact in client code
- Use object pooling for frequently created/destroyed objects
- Prefer `requestAnimationFrame` over `setInterval` for rendering
- Minimize garbage collection with pre-allocated arrays

### Type Safety

- Use strict TypeScript configuration
- Prefer interfaces over types for extensibility
- Always type function parameters and return values
- Use branded types for IDs and measurements

### Game Systems Architecture

- Implement Entity-Component-System (ECS) patterns where appropriate
- Separate game logic from rendering logic
- Use message passing between systems to reduce coupling
- Implement fixed timestep physics simulation

### Networking Patterns

- Use client-side prediction with server reconciliation
- Implement lag compensation for hit detection
- Prefer delta compression for state updates
- Use binary serialization for performance-critical messages

## File Organization

```
client/src/
  ├── client/          # Game client and networking
  ├── input/           # Input handling and controls
  ├── physics/         # Physics integration and collision
  ├── rendering/       # Babylon.js rendering systems
  └── ui/             # User interface and HUD

server/src/
  ├── rooms/          # Colyseus room definitions
  ├── schemas/        # Shared state schemas
  └── systems/        # Game logic systems
```

## Performance Guidelines

### Client Rendering

- Target 4ms frame budget (240 FPS)
- Use GPU profiling to identify bottlenecks
- Implement level-of-detail (LOD) for distant objects
- Batch draw calls and minimize state changes

### Server Simulation

- Maintain exactly 128Hz tick rate (7.8ms per tick)
- Use high-resolution timers for precise scheduling
- Implement spatial partitioning for collision detection
- Profile memory allocations in hot paths

### Network Optimization

- Send input updates at full framerate (240Hz)
- Send state updates at reduced rate (32-64Hz)
- Use unreliable delivery for position updates
- Implement packet prioritization

## Security Considerations

- Validate all client input on server
- Implement anti-cheat detection
- Use server-authoritative physics
- Rate limit client messages

## Testing Strategies

- Unit test game logic systems
- Integration test client-server communication
- Load test with simulated players
- Profile performance under stress

## Development Workflow

- Use hot reload for rapid iteration
- Implement debug visualizations for physics
- Add performance metrics to HUD
- Use browser dev tools for WebGPU debugging

When generating code for this project, prioritize performance, type safety, and competitive gaming requirements. Always consider the impact on frame rate and network latency.
