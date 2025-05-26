import { GameState } from '../schemas/GameState.js'
import { Projectile } from '../schemas/Projectile.js'

export class GameLogic {
  private gameState: GameState
  private spawnPoints = [
    { x: 0, y: 2, z: 0 },
    { x: 10, y: 2, z: 10 },
    { x: -10, y: 2, z: 10 },
    { x: 10, y: 2, z: -10 },
    { x: -10, y: 2, z: -10 },
    { x: 0, y: 2, z: 15 },
    { x: 0, y: 2, z: -15 },
    { x: 15, y: 2, z: 0 },
    { x: -15, y: 2, z: 0 }
  ]

  constructor(gameState: GameState) {
    this.gameState = gameState
  }

  update(deltaTime: number) {
    // Update game time
    this.gameState.gameTime += deltaTime * 1000 // Convert to milliseconds
    
    // Update projectiles
    this.updateProjectiles(deltaTime)
    
    // Check win conditions
    this.checkWinConditions()
    
    // Update player states
    this.updatePlayers(deltaTime)
  }
  private updateProjectiles(deltaTime: number) {
    const currentTime = Date.now()
    
    for (let i = this.gameState.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.gameState.projectiles[i]
      
      if (!projectile) continue // Guard against undefined projectiles
      
      // Check if projectile has expired
      if (currentTime - projectile.createdAt > projectile.lifeTime) {
        this.gameState.projectiles.deleteAt(i)
        continue
      }
      
      // Update projectile position
      projectile.position.x += projectile.velocity.x * deltaTime
      projectile.position.y += projectile.velocity.y * deltaTime
      projectile.position.z += projectile.velocity.z * deltaTime
      
      // Check for collisions with players
      this.checkProjectileCollisions(projectile, i)
    }
  }

  private checkProjectileCollisions(projectile: Projectile, index: number) {
    if (!projectile.isActive) return
    
    this.gameState.players.forEach((player, playerId) => {
      if (playerId === projectile.ownerId || !player.isAlive) return
      
      // Simple distance-based collision detection
      const dx = player.position.x - projectile.position.x
      const dy = player.position.y - projectile.position.y
      const dz = player.position.z - projectile.position.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      
      if (distance < 1.0) { // Hit radius
        // Apply damage
        this.damagePlayer(playerId, projectile.damage, projectile.ownerId)
        
        // Remove projectile
        projectile.isActive = false
        this.gameState.projectiles.deleteAt(index)
        
        // Add hit event
        this.gameState.events.push(`player_hit:${playerId}:${projectile.ownerId}:${projectile.damage}`)
      }
    })
  }

  private updatePlayers(deltaTime: number) {
    this.gameState.players.forEach((player, playerId) => {
      // Handle respawn
      if (!player.isAlive && player.respawnTime > 0) {
        player.respawnTime -= deltaTime * 1000
        if (player.respawnTime <= 0) {
          this.respawnPlayer(playerId)
        }
      }
      
      // Update reload state
      if (player.isReloading) {
        // Simple reload timer (would be more sophisticated in real game)
        // This is just a placeholder
      }
    })
  }

  private checkWinConditions() {
    if (this.gameState.gameEnded) return
    
    // Check score limit
    this.gameState.players.forEach((player) => {
      if (player.score >= this.gameState.maxScore) {
        this.endGame(player.id)
        return
      }
    })
    
    // Check time limit
    if (this.gameState.gameTime >= this.gameState.roundDuration) {
      this.endGameByTime()
    }
  }

  handlePlayerAction(playerId: string, action: any) {
    const player = this.gameState.players.get(playerId)
    if (!player || !player.isAlive) return
    
    switch (action.type) {
      case 'fire':
        this.handlePlayerFire(playerId, action.data)
        break
      case 'reload':
        this.handlePlayerReload(playerId)
        break
      case 'jump':
        this.handlePlayerJump(playerId)
        break
    }
  }

  private handlePlayerFire(playerId: string, fireData: any) {
    const player = this.gameState.players.get(playerId)
    if (!player || player.ammo <= 0 || player.isReloading) return
    
    // Consume ammo
    player.ammo--
    player.isFiring = true
    
    // Create projectile
    const projectile = new Projectile()
    projectile.id = `${playerId}_${Date.now()}_${Math.random()}`
    projectile.ownerId = playerId
    projectile.weaponType = player.currentWeapon
    projectile.createdAt = Date.now()
    
    // Set projectile position to player position
    projectile.position.x = player.position.x
    projectile.position.y = player.position.y + 1.5 // Eye level
    projectile.position.z = player.position.z
    
    // Set projectile direction based on player rotation and fire data
    const direction = fireData.direction || { x: 0, y: 0, z: 1 }
    projectile.direction.x = direction.x
    projectile.direction.y = direction.y
    projectile.direction.z = direction.z
    
    // Set velocity
    projectile.velocity.x = direction.x * projectile.speed
    projectile.velocity.y = direction.y * projectile.speed
    projectile.velocity.z = direction.z * projectile.speed
    
    // Add to game state
    this.gameState.projectiles.push(projectile)
    
    // Add fire event
    this.gameState.events.push(`player_fire:${playerId}:${projectile.id}`)
    
    // Reset firing state
    setTimeout(() => {
      if (this.gameState.players.has(playerId)) {
        this.gameState.players.get(playerId)!.isFiring = false
      }
    }, 100) // Fire animation duration
  }

  private handlePlayerReload(playerId: string) {
    const player = this.gameState.players.get(playerId)
    if (!player || player.isReloading || player.ammo >= 30) return
    
    player.isReloading = true
    
    // Simulate reload time
    setTimeout(() => {
      if (this.gameState.players.has(playerId)) {
        const p = this.gameState.players.get(playerId)!
        const ammoNeeded = 30 - p.ammo
        const ammoToReload = Math.min(ammoNeeded, p.reserveAmmo)
        
        p.ammo += ammoToReload
        p.reserveAmmo -= ammoToReload
        p.isReloading = false
        
        this.gameState.events.push(`player_reload:${playerId}`)
      }
    }, 2000) // 2 second reload time
  }

  private handlePlayerJump(playerId: string) {
    const player = this.gameState.players.get(playerId)
    if (!player || player.isJumping) return
    
    player.isJumping = true
    player.velocity.y = 10 // Jump velocity
    
    // Reset jump state
    setTimeout(() => {
      if (this.gameState.players.has(playerId)) {
        this.gameState.players.get(playerId)!.isJumping = false
      }
    }, 1000) // 1 second jump duration
  }

  private damagePlayer(playerId: string, damage: number, attackerId: string) {
    const player = this.gameState.players.get(playerId)
    const attacker = this.gameState.players.get(attackerId)
    
    if (!player || !player.isAlive) return
    
    player.health -= damage
    
    if (player.health <= 0) {
      player.health = 0
      player.isAlive = false
      player.deaths++
      player.respawnTime = 5000 // 5 second respawn
      player.lastDeathTime = Date.now()
      
      // Award kill to attacker
      if (attacker && attackerId !== playerId) {
        attacker.kills++
        attacker.score++
        this.gameState.totalKills++
      }
      
      // Add death event
      this.gameState.events.push(`player_death:${playerId}:${attackerId}`)
    }
  }

  private respawnPlayer(playerId: string) {
    const player = this.gameState.players.get(playerId)
    if (!player) return
    
    // Reset player state
    player.health = player.maxHealth
    player.isAlive = true
    player.respawnTime = 0
    player.ammo = 30
    player.reserveAmmo = 90
    player.isReloading = false
    
    // Set spawn position
    const spawnPoint = this.getSpawnPoint()
    player.position.x = spawnPoint.x
    player.position.y = spawnPoint.y
    player.position.z = spawnPoint.z
    
    // Add respawn event
    this.gameState.events.push(`player_respawn:${playerId}`)
  }

  getSpawnPoint() {
    return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)]
  }

  private endGame(winnerId: string) {
    this.gameState.gameEnded = true
    this.gameState.events.push(`game_end:${winnerId}`)
  }

  private endGameByTime() {
    // Find player with highest score
    let topPlayer = ''
    let topScore = -1
    
    this.gameState.players.forEach((player, playerId) => {
      if (player.score > topScore) {
        topScore = player.score
        topPlayer = playerId
      }
    })
    
    this.endGame(topPlayer)
  }

  dispose() {
    // Clean up any resources
  }
}
