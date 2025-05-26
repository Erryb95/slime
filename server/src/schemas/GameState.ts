import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';
import { Player } from './Player';
import { Projectile } from './Projectile';

export class GameState extends Schema {
  @type("string") gameMode: string = 'deathmatch';
  @type("string") mapName: string = 'default';
  @type("number") gameTime: number = 0;
  @type("number") maxScore: number = 30;
  @type("boolean") gameStarted: boolean = false;
  @type("boolean") gameEnded: boolean = false;
  
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([Projectile]) projectiles = new ArraySchema<Projectile>();
  @type(["string"]) events = new ArraySchema<string>();
  
  // Game statistics
  @type("number") totalKills: number = 0;
  @type("number") roundNumber: number = 1;
  @type("number") roundStartTime: number = 0;
  @type("number") roundDuration: number = 300000; // 5 minutes in ms
}
