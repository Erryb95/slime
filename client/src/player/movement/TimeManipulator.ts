// Time Manipulation System for SLIME FPS
import { Scene } from '@babylonjs/core/scene';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import { MOVEMENT_CONFIG } from './MovementController';

const DEFAULT_ENGINE_TIMESTEP = 1 / 60; // Assuming a base of 60 FPS for default timeStep

export class TimeManipulator {
  private _scene: Scene;
  private _isActive: boolean = false;
  private _cooldown: number = 0;
  private _duration: number = 0;
  private _accumulatedTime: number = 0; // To store accumulated time for shader effects
  
  // Post-processing effects for time manipulation
  private _timeSlowPostProcess: PostProcess | null = null;
  
  constructor(scene: Scene) {
    this._scene = scene;
    this._setupPostProcessing();
  }
  
  private _setupPostProcessing(): void {
    if (!this._scene.activeCamera) {
      console.warn("No active camera found for TimeManipulator post-processing");
      return;
    }

    this._timeSlowPostProcess = new PostProcess(
      "timeSlowEffect",
      "standard", // Placeholder, actual shader set by updateEffect
      ["time", "intensity"],
      null, 
      1.0, 
      this._scene.activeCamera
    );
    
    this._timeSlowPostProcess.onApply = (effect) => {
      effect.setFloat("time", this._accumulatedTime);
      effect.setFloat("intensity", this._isActive ? 0.5 : 0.0);
    };
    
    this._timeSlowPostProcess.updateEffect(`
      precision highp float;
      
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform float time;
      uniform float intensity;
      
      void main(void) {
        vec2 uv = vUV;
        
        float distFromCenter = length(uv - 0.5);
        float edgeEffect = smoothstep(0.4, 0.5, distFromCenter);
        
        vec2 offset = vec2(
          sin(uv.y * 10.0 + time * 2.0) * 0.003,
          cos(uv.x * 10.0 + time * 2.0) * 0.003
        ) * intensity * edgeEffect;
        
        vec4 baseColor = texture2D(textureSampler, uv + offset);
        
        vec3 tintedColor = mix(baseColor.rgb, baseColor.rgb * vec3(0.8, 0.9, 1.2), intensity * 0.3);
        
        float vignette = 1.0 - edgeEffect * intensity * 0.7;
        tintedColor *= vignette;
        
        gl_FragColor = vec4(tintedColor, baseColor.a);
      }
    `);
    // Post-process is not attached here; it's attached on activate()
  }
  
  public update(deltaTime: number): void {
    // deltaTime is the logical game update delta (e.g., from requestAnimationFrame)
    // For shader time, use engine's delta time which might be affected by time scaling
    this._accumulatedTime += this._scene.getEngine().getDeltaTime() / 1000.0;

    if (this._cooldown > 0) {
      this._cooldown -= deltaTime;
    }
    
    if (this._isActive) {
      this._duration -= deltaTime;
      if (this._duration <= 0) {
        this.deactivate();
      }
    }
  }
  
  public activate(): boolean {
    if (this._cooldown > 0 || this._isActive) {
      return false;
    }
    
    this._isActive = true;
    this._duration = MOVEMENT_CONFIG.timeSlowDuration / 1000;
    
    // Slow down the engine
    // Accessing _timeStep is using an internal property, ensure this is acceptable for your project
    (this._scene.getEngine() as any)._timeStep = DEFAULT_ENGINE_TIMESTEP / MOVEMENT_CONFIG.timeSlowFactor;
    
    if (this._timeSlowPostProcess && this._scene.activeCamera) {
      // Check if already attached to prevent duplicates, though attachPostProcess usually handles this
      if ((this._scene.activeCamera as any)._postProcesses.indexOf(this._timeSlowPostProcess) === -1) {
         this._scene.activeCamera.attachPostProcess(this._timeSlowPostProcess);
      }
    }
    
    return true;
  }
  
  public deactivate(): void {
    if (!this._isActive) return;
    
    this._isActive = false;
    this._duration = 0;
    this._cooldown = MOVEMENT_CONFIG.timeSlowCooldown / 1000;
    
    // Reset engine speed
    (this._scene.getEngine() as any)._timeStep = DEFAULT_ENGINE_TIMESTEP;
    
    if (this._timeSlowPostProcess && this._scene.activeCamera) {
      this._scene.activeCamera.detachPostProcess(this._timeSlowPostProcess);
    }
  }
  
  public toggle(): boolean {
    if (this._isActive) {
      this.deactivate();
      return false;
    } else {
      return this.activate();
    }
  }
  
  // Getters
  public get isActive(): boolean { return this._isActive; }
  public get cooldownPercent(): number { 
    return Math.max(0, this._cooldown / (MOVEMENT_CONFIG.timeSlowCooldown / 1000)); 
  }
  public get durationPercent(): number { 
    return this._isActive ? this._duration / (MOVEMENT_CONFIG.timeSlowDuration / 1000) : 0; 
  }
}
