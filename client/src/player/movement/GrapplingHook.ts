// Grappling Hook System for SLIME FPS
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PlayerManager } from '../PlayerManager';
import { MOVEMENT_CONFIG } from './MovementController';

export class GrapplingHook {
  private _scene: Scene;
  private _player: PlayerManager;
  private _playerMesh: AbstractMesh;
  
  private _isActive: boolean = false;
  private _cooldown: number = 0;
  private _hookTarget: Vector3 | null = null;
  private _hookMesh: LinesMesh | null = null;
  private _hookMaterial: StandardMaterial | null = null;
  
  constructor(scene: Scene, player: PlayerManager) {
    this._scene = scene;
    this._player = player;
    if (!this._player.playerMesh) {
      throw new Error('GrapplingHook: playerMesh is null. Ensure player model is loaded before creating GrapplingHook.');
    }
    this._playerMesh = this._player.playerMesh;
    this._createHookMaterial();
  }
  
  private _createHookMaterial(): void {
    this._hookMaterial = new StandardMaterial('grapplingHookMaterial', this._scene);
    this._hookMaterial.emissiveColor = new Color3(0.2, 0.6, 1.0);
    this._hookMaterial.alpha = 0.8;
  }
  
  public update(deltaTime: number): void {
    // Update cooldown
    if (this._cooldown > 0) {
      this._cooldown -= deltaTime;
    }
    
    // Update grappling hook physics and visuals
    if (this._isActive && this._hookTarget) {
      this._updateHookVisuals();
      this._applyGrapplePull();
      
      // Check if reached target
      const distanceToTarget = Vector3.Distance(this._playerMesh.position, this._hookTarget);
      if (distanceToTarget < 2.0) {
        this.deactivate();
      }
    }
  }
  
  public fire(direction: Vector3): boolean {
    // Check if can fire
    if (this._cooldown > 0 || this._isActive) {
      return false;
    }
    
    // Fire grappling hook in given direction
    const hookRay = new Ray(this._playerMesh.position, direction, MOVEMENT_CONFIG.grappleRange);
    const hit = this._scene.pickWithRay(hookRay);
    
    if (hit && hit.hit && hit.pickedPoint) {
      this._isActive = true;
      this._hookTarget = hit.pickedPoint.clone();
      
      // Create hook visual
      this._createHookVisual();
      
      // Initial pull impulse
      this._applyInitialPull();
      
      return true;
    }
    
    return false;
  }
  
  public deactivate(): void {
    if (!this._isActive) return;
    
    this._isActive = false;
    this._hookTarget = null;
    this._cooldown = MOVEMENT_CONFIG.grappleCooldown / 1000; // Convert to seconds
    
    // Remove hook visual
    if (this._hookMesh) {
      this._hookMesh.dispose();
      this._hookMesh = null;
    }
  }
  
  private _createHookVisual(): void {
    if (!this._hookTarget) return;
    
    // Create a line from player to hook target
    const points = [
      this._playerMesh.position.clone(),
      this._hookTarget.clone()
    ];
    
    this._hookMesh = MeshBuilder.CreateLines(
      'grapplingHook',
      { points, updatable: true },
      this._scene
    );
    
    // Apply material
    if (this._hookMaterial) {
      this._hookMesh.material = this._hookMaterial;
    }
  }
  
  private _updateHookVisuals(): void {
    if (!this._hookMesh || !this._hookTarget) return;
    
    // Update hook line points
    const points = [
      this._playerMesh.position.clone(),
      this._hookTarget.clone()
    ];
    
    this._hookMesh = MeshBuilder.CreateLines(
      'grapplingHook',
      { points, instance: this._hookMesh },
      this._scene
    );
  }
  
  private _applyInitialPull(): void {
    if (!this._playerMesh.physicsImpostor || !this._hookTarget) return;
    
    // Apply initial pull impulse
    const pullDir = this._hookTarget.subtract(this._playerMesh.position).normalize();
    this._playerMesh.physicsImpostor.applyImpulse(
      pullDir.scale(MOVEMENT_CONFIG.grapplePullSpeed),
      this._playerMesh.position
    );
  }
  
  private _applyGrapplePull(): void {
    if (!this._playerMesh.physicsImpostor || !this._hookTarget) return;
    
    // Apply continuous pull force
    const pullDir = this._hookTarget.subtract(this._playerMesh.position).normalize();
    
    // Get distance to target for force scaling
    const distance = Vector3.Distance(this._playerMesh.position, this._hookTarget);
    const forceFactor = Math.min(distance * 0.5, 20); // Scale force based on distance, with maximum
    
    this._playerMesh.physicsImpostor.applyForce(
      pullDir.scale(MOVEMENT_CONFIG.grapplePullSpeed * forceFactor),
      this._playerMesh.position
    );
  }
  
  // Getters
  public get isActive(): boolean { return this._isActive; }
  public get cooldownPercent(): number { 
    return Math.max(0, this._cooldown / (MOVEMENT_CONFIG.grappleCooldown / 1000)); 
  }
  public get hookTarget(): Vector3 | null { return this._hookTarget; }
}
