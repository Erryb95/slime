// Advanced Movement Controller for SLIME FPS
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { PlayerManager } from '../PlayerManager';
import { InputManager3D } from '../../input/InputManager';
import { PhysicsImpostor } from '@babylonjs/core/Physics/physicsImpostor';
import { Ray } from '@babylonjs/core/Culling/ray';

// Movement configuration
export const MOVEMENT_CONFIG = {
  // Basic movement
  walkSpeed: 5,
  runSpeed: 10,
  crouchSpeed: 2.5,
  jumpForce: 8,
  
  // Advanced movement
  dashForce: 20,
  dashCooldown: 1000, // ms
  wallJumpForce: 10,
  wallRunSpeed: 7,
  wallRunDuration: 1200, // ms
  wallRunCooldown: 500, // ms
  slideSpeed: 15,
  slideDuration: 800, // ms
  slideForce: 12,
  slideCooldown: 1000, // ms
  
  // Time manipulation
  timeSlowFactor: 0.3, // 30% of normal time
  timeSlowDuration: 3000, // ms
  timeSlowCooldown: 10000, // ms
  
  // Double jump
  doubleJumpForce: 7,
  maxJumps: 2,
  
  // Air control
  airControlFactor: 0.7,
  
  // Grappling hook
  grappleRange: 50,
  grapplePullSpeed: 20,
  grappleCooldown: 2000 // ms
};

export class MovementController {
  private _scene: Scene;
  private _player: PlayerManager;
  private _input: InputManager3D;
  private _playerMesh: AbstractMesh | null = null;
  
  // Movement state
  private _isGrounded: boolean = true;
  private _isWallRunning: boolean = false;
  private _isSliding: boolean = false;
  private _isDashing: boolean = false;
  private _isGrappling: boolean = false;
  private _jumpCount: number = 0;
  private _wallRunTimer: number = 0;
  private _slideTimer: number = 0;
  private _dashCooldown: number = 0;
  private _wallRunCooldown: number = 0;
  private _slideCooldown: number = 0;
  private _grappleCooldown: number = 0;
  
  // Wall detection
  private _wallNormal: Vector3 = Vector3.Zero();
  
  constructor(scene: Scene, player: PlayerManager, input: InputManager3D) {
    this._scene = scene;
    this._player = player;
    this._input = input;
    this._playerMesh = this._player.playerMesh;
  }
  
  public update(deltaTime: number): void {
    if (!this._playerMesh) return;
    
    // Check grounded state
    this._checkGrounded();
    
    // Update timers and cooldowns
    this._updateTimers(deltaTime);
  }
  
  private _checkGrounded(): void {
    if (!this._playerMesh) return;
    
    // Simple ground check with raycast
    const playerPos = this._playerMesh.position;
    const groundRay = new Ray(playerPos, Vector3.Down(), 1.1);
    const hit = this._scene.pickWithRay(groundRay);
    
    const wasGrounded = this._isGrounded;
    this._isGrounded = hit ? hit.hit : false;
    
    // Reset jump count when landing
    if (!wasGrounded && this._isGrounded) {
      this._jumpCount = 0;
    }
  }
  
  private _checkWallContact(): boolean {
    if (!this._playerMesh) return false;
    
    // Check for wall contact using rays
    const playerPos = this._playerMesh.position;
    const rayDirections = [
      new Vector3(1, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, -1)
    ];
    
    for (const dir of rayDirections) {
      const ray = new Ray(playerPos, dir, 1.5);
      const hit = this._scene.pickWithRay(ray);
      
      if (hit && hit.hit && hit.pickedMesh && hit.pickedMesh !== this._playerMesh) {
        const normal = hit.getNormal(true);
        if (normal) {
          this._wallNormal = normal;
          return true;
        }
      }
    }
    
    return false;
  }
  
  private _updateTimers(deltaTime: number): void {
    // Update timers
    if (this._isWallRunning) {
      this._wallRunTimer -= deltaTime;
      if (this._wallRunTimer <= 0) {
        this._endWallRun();
      }
    }
    
    if (this._isSliding) {
      this._slideTimer -= deltaTime;
      if (this._slideTimer <= 0) {
        this._endSlide();
      }
    }
    
    // Update cooldowns
    this._dashCooldown = Math.max(0, this._dashCooldown - deltaTime);
    this._wallRunCooldown = Math.max(0, this._wallRunCooldown - deltaTime);
    this._slideCooldown = Math.max(0, this._slideCooldown - deltaTime);
    this._grappleCooldown = Math.max(0, this._grappleCooldown - deltaTime);
  }
  
  public jump(): void {
    if (!this._playerMesh?.physicsImpostor) return;
    
    if (this._isGrounded || this._jumpCount < MOVEMENT_CONFIG.maxJumps) {
      // Apply jump force
      const jumpForce = this._isWallRunning 
        ? MOVEMENT_CONFIG.wallJumpForce 
        : (this._jumpCount === 0 ? MOVEMENT_CONFIG.jumpForce : MOVEMENT_CONFIG.doubleJumpForce);
      
      this._playerMesh.physicsImpostor.applyImpulse(
        new Vector3(0, jumpForce, 0), 
        this._playerMesh.position
      );
      
      // If wall running, also jump away from wall
      if (this._isWallRunning) {
        const pushForce = this._wallNormal.scale(MOVEMENT_CONFIG.wallJumpForce * 0.7);
        this._playerMesh.physicsImpostor.applyImpulse(
          pushForce,
          this._playerMesh.position
        );
        this._endWallRun();
      }
      
      // Increment jump count
      this._jumpCount++;
    }
  }
  
  public startWallRun(): void {
    if (this._checkWallContact() && this._wallRunCooldown <= 0 && !this._isGrounded) {
      this._isWallRunning = true;
      this._wallRunTimer = MOVEMENT_CONFIG.wallRunDuration / 1000;
    }
  }
  
  private _endWallRun(): void {
    this._isWallRunning = false;
    this._wallRunTimer = 0;
    this._wallRunCooldown = MOVEMENT_CONFIG.wallRunCooldown / 1000;
  }
  
  public startSlide(): void {
    if (this._isGrounded && !this._isSliding && this._slideCooldown <= 0) {
      this._isSliding = true;
      this._slideTimer = MOVEMENT_CONFIG.slideDuration / 1000;
      
      if (this._playerMesh?.physicsImpostor) {
        // Apply slide impulse forward
        const forward = new Vector3(0, 0, 1);
        this._playerMesh.physicsImpostor.applyImpulse(
          forward.scale(MOVEMENT_CONFIG.slideForce),
          this._playerMesh.position
        );
      }
    }
  }
  
  private _endSlide(): void {
    this._isSliding = false;
    this._slideTimer = 0;
    this._slideCooldown = MOVEMENT_CONFIG.slideCooldown / 1000;
  }
  
  public dash(): void {
    if (this._dashCooldown <= 0 && !this._isDashing) {
      this._isDashing = true;
      this._dashCooldown = MOVEMENT_CONFIG.dashCooldown / 1000;
      
      if (this._playerMesh?.physicsImpostor) {
        // Apply dash impulse forward
        const forward = new Vector3(0, 0, 1);
        this._playerMesh.physicsImpostor.applyImpulse(
          forward.scale(MOVEMENT_CONFIG.dashForce),
          this._playerMesh.position
        );
      }
      
      // End dash after a short time
      setTimeout(() => {
        this._isDashing = false;
      }, 200);
    }
  }
  
  public fireGrapplingHook(): void {
    if (this._grappleCooldown <= 0 && !this._isGrappling && this._playerMesh) {
      // Check if there's a valid grapple target
      const forward = new Vector3(0, 0, 1);
      const grappleRay = new Ray(this._playerMesh.position, forward, MOVEMENT_CONFIG.grappleRange);
      const hit = this._scene.pickWithRay(grappleRay);
      
      if (hit && hit.hit && hit.pickedPoint && this._playerMesh.physicsImpostor) {
        this._isGrappling = true;
        this._grappleCooldown = MOVEMENT_CONFIG.grappleCooldown / 1000;
        
        // Apply initial pull impulse
        const pullDir = hit.pickedPoint.subtract(this._playerMesh.position).normalize();
        this._playerMesh.physicsImpostor.applyImpulse(
          pullDir.scale(MOVEMENT_CONFIG.grapplePullSpeed),
          this._playerMesh.position
        );
        
        // End grapple after a short duration
        setTimeout(() => {
          this._isGrappling = false;
        }, 1000);
      }
    }
  }
  
  // Public getters for state
  public get isWallRunning(): boolean { return this._isWallRunning; }
  public get isSliding(): boolean { return this._isSliding; }
  public get isDashing(): boolean { return this._isDashing; }
  public get isGrappling(): boolean { return this._isGrappling; }
  public get isGrounded(): boolean { return this._isGrounded; }
  public get jumpCount(): number { return this._jumpCount; }
}

