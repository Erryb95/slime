import { Schema, type } from '@colyseus/schema'
import { Vector3Schema } from './Player.js'

export class Projectile extends Schema {
  @type("string") id: string = ''
  @type("string") ownerId: string = ''
  @type("string") weaponType: string = ''
  @type("number") damage: number = 25
  @type("number") speed: number = 100
  @type("number") lifeTime: number = 3000 // 3 seconds
  @type("number") createdAt: number = 0
  
  @type(Vector3Schema) position = new Vector3Schema()
  @type(Vector3Schema) direction = new Vector3Schema()
  @type(Vector3Schema) velocity = new Vector3Schema()
  
  @type("boolean") isActive: boolean = true
  @type("boolean") hasCollided: boolean = false
}
