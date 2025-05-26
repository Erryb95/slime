import { Schema, type } from '@colyseus/schema'

export class Vector3Schema extends Schema {
  @type("number") x: number = 0
  @type("number") y: number = 0
  @type("number") z: number = 0
}

export class Player extends Schema {
  @type("string") id: string = ''
  @type("string") name: string = ''
  @type("number") health: number = 100
  @type("number") maxHealth: number = 100
  @type("number") score: number = 0
  @type("number") kills: number = 0
  @type("number") deaths: number = 0
  @type("boolean") isAlive: boolean = true
  @type("boolean") isReady: boolean = false
  @type("number") lastUpdate: number = 0
  @type("number") ping: number = 0
  
  @type(Vector3Schema) position = new Vector3Schema()
  @type(Vector3Schema) rotation = new Vector3Schema()
  @type(Vector3Schema) velocity = new Vector3Schema()
  
  // Weapon data
  @type("string") currentWeapon: string = 'rifle'
  @type("number") ammo: number = 30
  @type("number") reserveAmmo: number = 90
  @type("boolean") isReloading: boolean = false
  @type("boolean") isFiring: boolean = false
  
  // Player state
  @type("boolean") isMoving: boolean = false
  @type("boolean") isJumping: boolean = false
  @type("boolean") isCrouching: boolean = false
  @type("boolean") isAiming: boolean = false
  
  // Team (for team-based modes)
  @type("string") team: string = 'none'
  
  // Respawn data
  @type("number") respawnTime: number = 0
  @type("number") lastDeathTime: number = 0
}
