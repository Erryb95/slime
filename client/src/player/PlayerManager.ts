import {
    Scene,
    Vector3,
    ArcRotateCamera,
    TransformNode,
    AbstractMesh,
    MeshBuilder,
    Skeleton,
    AnimationGroup,
    Animatable
} from '@babylonjs/core';
import '@babylonjs/loaders';

import { WeaponManager } from '../weapons/WeaponManager';
import { InputManager3D } from '../input/InputManager';
import { EnhancedAssetManager } from '../assets/EnhancedAssetManager';
import { ASSET_CONFIG } from '../assets/AssetLoadingConfig';
import { MovementController } from './movement/MovementController';
import { GrapplingHook } from './movement/GrapplingHook';
import { TimeManipulator } from './movement/TimeManipulator';

export interface PlayerSkin {
    name: string;
    textures: Record<string, string>;
}

export class PlayerManager {
    private scene: Scene;
    private camera!: ArcRotateCamera;
    private playerRoot: TransformNode;
    private _playerMesh: AbstractMesh | null = null;
    private playerSkeleton: Skeleton | null = null;
    private weaponManager: WeaponManager | null = null;
    private inputManager: InputManager3D | null = null;
    private assetManager: EnhancedAssetManager;
    private animations: Map<string, AnimationGroup | Animatable> = new Map();
    private currentAnimation: Animatable | null = null;
    private isMoving: boolean = false;
    private audioManager: any = null; // Audio manager
    
    // Third-person camera settings
    private cameraLookAtOffset = new Vector3(0, 1, 0); // Look at player's head
    
    // Current character
    private currentCharacter: string = 'yBot';
    private currentSkin: string = 'default';
    
    // Advanced movement systems
    private movementController: MovementController | null = null;
    private grapplingHook: GrapplingHook | null = null;
    private timeManipulator: TimeManipulator | null = null;
    
    constructor(scene: Scene, assetManager: EnhancedAssetManager) {
        this.scene = scene;
        this.assetManager = assetManager;
        this.playerRoot = new TransformNode('playerRoot', scene);
    }

    async initialize(): Promise<void> {
        console.log('Initializing PlayerManager...');
        const canvas = this.scene.getEngine().getRenderingCanvas() as HTMLCanvasElement;
        
        // Create third-person camera
        this.camera = new ArcRotateCamera(
            'thirdPersonCamera', 
            -Math.PI / 2, // Alpha (rotation around Y axis)
            Math.PI / 3,  // Beta (rotation around X axis)
            8,            // Radius (distance from target)
            new Vector3(0, 1, 0),
            this.scene
        );
        
        // Set camera constraints for third-person view
        this.camera.lowerRadiusLimit = 4;
        this.camera.upperRadiusLimit = 10;
        this.camera.lowerBetaLimit = Math.PI / 8; // Don't go below player
        this.camera.upperBetaLimit = Math.PI / 2.1; // Don't go above player too much
        
        // Camera inertia for smooth movement
        this.camera.inertia = 0.5;
        this.camera.angularSensibilityX = 500; // Mouse sensitivity
        this.camera.angularSensibilityY = 500;
        
        // Attach camera to canvas for controls
        this.camera.attachControl(canvas, true);
        
        // Load player model with the default character and skin
        await this.loadPlayerModel(this.currentCharacter, this.currentSkin);
        
        // Initialize advanced movement systems
        if (this._playerMesh && this.inputManager) {
            // Create movement controller
            this.movementController = new MovementController(this.scene, this, this.inputManager);
            
            // Create grappling hook
            this.grapplingHook = new GrapplingHook(this.scene, this);
            
            // Create time manipulator
            this.timeManipulator = new TimeManipulator(this.scene);
            
            // Set up advanced movement callbacks
            this.inputManager.setAdvancedMovementCallbacks(
                () => this.dash(),
                () => this.slide(),
                () => this.toggleTimeSlow(),
                () => this.fireGrapplingHook()
            );
        }
        
        console.log('PlayerManager initialized');
    }

    async loadPlayerModel(characterName: string, skinName: string = 'default'): Promise<void> {
        try {
            console.log(`Loading player model: ${characterName} with skin: ${skinName}`);
            
            // Load character using EnhancedAssetManager - get cloned meshes for instantiation
            const characterMeshes = await this.assetManager.getCharacter(characterName, skinName);
            
            if (characterMeshes && characterMeshes.length > 0) {
                // Dispose existing player mesh if any
                if (this._playerMesh) {
                    this._playerMesh.dispose();
                }
                
                // Use the first mesh as the main character mesh
                this._playerMesh = characterMeshes[0];
                if (this._playerMesh) {
                    this._playerMesh.name = 'playerModel';
                    this._playerMesh.parent = this.playerRoot;
                    
                    // Scale and position the model appropriately for third-person view
                    this._playerMesh.scaling = new Vector3(1, 1, 1); // Unity FPS Sample models are already properly scaled
                    this._playerMesh.position = new Vector3(0, 0, 0);
                    
                    // Get the skeleton for animations
                    if (this._playerMesh.skeleton) {
                        this.playerSkeleton = this._playerMesh.skeleton;
                        console.log(`Skeleton loaded with ${this.playerSkeleton.bones.length} bones`);
                    }
                    
                    // Load and store animation groups
                    await this.loadAnimations(characterName);
                    
                    // Play idle animation by default
                    this.playAnimation('idle');
                    
                    // Update weapon attachment if weapon manager exists
                    this.attachWeaponToHand();
                }
                
                this.currentCharacter = characterName;
                this.currentSkin = skinName;
                console.log('Player model loaded successfully');
                
            } else {
                console.error('Failed to load character mesh');
                this.createPlaceholderMesh();
            }
            
        } catch (error) {
            console.error('Failed to load player model:', error);
            this.createPlaceholderMesh();
        }
    }    private async loadAnimations(characterName: string): Promise<void> {        // Clear existing animations
        this.animations.forEach(anim => {
            if (anim instanceof AnimationGroup) {
                anim.dispose();
            } else {
                // Animatable - stop and pause
                anim.stop();
                anim.pause();
            }
        });
        this.animations.clear();
        
        try {
            // Check if the character has animations defined in the asset config
            const characterConfig = ASSET_CONFIG.characters[characterName];
            
            if (characterConfig?.animations) {
                console.log(`Loading animations for character: ${characterName}`);
                
                // Load animations from asset configuration
                for (const [animName, animPath] of Object.entries(characterConfig.animations)) {
                    try {
                        console.log(`Attempting to load animation: ${animName} from ${animPath}`);
                        // For now, we'll look for the animation in the scene's animation groups
                        // since the yBot model should come with built-in animations
                        this.loadAnimationFromScene(animName);
                    } catch (error) {
                        console.warn(`Failed to load animation ${animName}:`, error);
                    }
                }
            }
            
            // Fallback: Load from scene's existing animation groups
            if (this.animations.size === 0 && this._playerMesh) {
                console.log('No animations found in config, checking scene animation groups...');
                this.loadAnimationsFromScene();
            }
            
            console.log(`Loaded ${this.animations.size} animations: ${Array.from(this.animations.keys()).join(', ')}`);
            
        } catch (error) {
            console.warn('Failed to load animations:', error);
            // Create a basic idle animation fallback
            this.createBasicAnimations();
        }
    }
    
    private loadAnimationFromScene(animName: string): void {
        if (!this._playerMesh) return;
        
        // Look for animation groups that match the animation name
        const scene = this._playerMesh.getScene();
        const matchingAnimGroup = scene.animationGroups.find(animGroup => 
            animGroup.name.toLowerCase().includes(animName.toLowerCase()) ||
            animName.toLowerCase().includes(animGroup.name.toLowerCase())
        );
        
        if (matchingAnimGroup) {
            matchingAnimGroup.stop();
            this.animations.set(animName.toLowerCase(), matchingAnimGroup);
            console.log(`✅ Loaded animation: ${animName} (${matchingAnimGroup.name})`);
        }
    }    private loadAnimationsFromScene(): void {
        if (!this._playerMesh || !this.playerSkeleton) return;
        
        const scene = this._playerMesh.getScene();
        console.log(`Found ${scene.animationGroups.length} animation groups in scene`);
        console.log(`Skeleton has ${this.playerSkeleton.getAnimationRanges()?.length || 0} animation ranges`);
        
        // First, try to load from skeleton animation ranges (common for .babylon files)
        const animationRanges = this.playerSkeleton.getAnimationRanges();
        if (animationRanges && animationRanges.length > 0) {
            console.log('Loading animations from skeleton animation ranges:');
            animationRanges.forEach((range, index) => {
                if (!range) return; // Skip null ranges
                
                console.log(`Animation Range ${index}: "${range.name}" from ${range.from} to ${range.to}`);
                
                // Map common animation names
                let animName = range.name.toLowerCase();
                if (animName.includes('idle') || animName.includes('aimingidle') || animName.includes('standing')) {
                    animName = 'idle';
                } else if (animName.includes('walk') || animName.includes('walking')) {
                    animName = 'walk';
                } else if (animName.includes('run') || animName.includes('running')) {
                    animName = 'run';
                } else if (animName.includes('jump') || animName.includes('jumping')) {
                    animName = 'jump';
                } else if (animName.includes('strafeleft')) {
                    animName = 'strafeleft';
                } else if (animName.includes('straferight')) {
                    animName = 'straferight';
                } else if (animName.includes('runback')) {
                    animName = 'runback';
                } else if (animName.includes('fire') || animName.includes('shoot')) {
                    animName = 'fire';
                } else if (animName.includes('reload')) {
                    animName = 'reload';
                }
                
                // Create an animation using the skeleton animation range
                const animatable = scene.beginWeightedAnimation(this.playerSkeleton!, range.from, range.to, 0, true, 1.0);
                animatable.pause(); // Start paused
                
                this.animations.set(animName, animatable);
                console.log(`✅ Loaded skeleton animation: ${range.name} -> ${animName}`);
            });
        }
        
        // Log all available animation groups for debugging
        scene.animationGroups.forEach((animGroup, index) => {
            console.log(`Animation Group ${index}: "${animGroup.name}" with ${animGroup.targetedAnimations.length} animations`);
        });
        
        // Also try animation groups if available
        scene.animationGroups.forEach((animGroup: AnimationGroup) => {
            // Try to match animations regardless of skeleton target initially to get debug info
            animGroup.stop();
            
            // Map common animation names
            let animName = animGroup.name.toLowerCase();
            if (animName.includes('idle') || animName.includes('standing')) {
                animName = 'idle';
            } else if (animName.includes('walk') || animName.includes('walking')) {
                animName = 'walk';
            } else if (animName.includes('run') || animName.includes('running')) {
                animName = 'run';
            } else if (animName.includes('jump') || animName.includes('jumping')) {
                animName = 'jump';
            }
            
            this.animations.set(animName, animGroup);
            console.log(`✅ Mapped scene animation: ${animGroup.name} -> ${animName}`);
        });
    }
    
    private createBasicAnimations(): void {
        console.log('Creating basic fallback animations...');
        // For now, we'll just note that basic animations could be created here
        // This would involve creating simple transform animations for the character
    }
    
    private createPlaceholderMesh(): void {
        // Create a simple capsule as placeholder for failed model loads
        this._playerMesh = MeshBuilder.CreateCapsule('playerPlaceholder', 
            { height: 2, radius: 0.5 }, this.scene);
        this._playerMesh.parent = this.playerRoot;
        this._playerMesh.position = new Vector3(0, 1, 0);
    }
    
    setWeaponManager(weaponManager: WeaponManager): void {
        this.weaponManager = weaponManager;
        this.attachWeaponToHand();
    }
    
    setInputManager(inputManager: InputManager3D): void {
        this.inputManager = inputManager;
    }
    
    setAudioManager(audioManager: any): void {
        this.audioManager = audioManager;
    }

    private attachWeaponToHand(): void {
        if (!this._playerMesh || !this.playerSkeleton || !this.weaponManager) return;
        
        // Find the right hand bone in the skeleton
        const handBone = this.playerSkeleton.bones.find(bone => 
            bone.name.toLowerCase().includes('righthand') ||
            bone.name.toLowerCase().includes('hand_r') ||
            bone.name.toLowerCase().includes('mixamorig:righthand') ||
            bone.name.toLowerCase().includes('right_hand'));
        
        if (handBone) {
            console.log(`Found hand bone: ${handBone.name}`);
            
            // Attach the weapon to the hand bone
            this.weaponManager.attachWeaponToBone(this.playerSkeleton, handBone.name);
        } else {
            console.warn('Could not find hand bone for weapon attachment');
        }
    }
      playAnimation(animationName: string): void {
        // Stop current animation if playing
        if (this.currentAnimation) {
            this.currentAnimation.stop();
            this.currentAnimation = null;
        }
        
        // Find the requested animation
        const anim = this.animations.get(animationName.toLowerCase());
        
        if (anim) {
            if ('start' in anim) {
                // AnimationGroup
                anim.start(true, 1.0);
                console.log(`Playing animation: ${animationName}`);
            } else if ('restart' in anim) {
                // Animatable
                anim.restart();
                console.log(`Playing animation: ${animationName}`);
            }
        } else {
            // If specific animation not found, try some common naming patterns
            const animKeys = Array.from(this.animations.keys());
            const bestMatch = animKeys.find(key => 
                key.toLowerCase().includes(animationName.toLowerCase())
            );
            
            if (bestMatch) {
                const bestAnim = this.animations.get(bestMatch);
                if (bestAnim) {
                    if ('start' in bestAnim) {
                        // AnimationGroup
                        bestAnim.start(true, 1.0);
                        console.log(`Playing best match animation: ${bestMatch}`);
                    } else if ('restart' in bestAnim) {
                        // Animatable
                        bestAnim.restart();
                        console.log(`Playing best match animation: ${bestMatch}`);
                    }
                }
            } else {
                console.warn(`Animation not found: ${animationName}`);
                console.log('Available animations:', Array.from(this.animations.keys()));
            }
        }
    }
    
    update(deltaTime: number): void {
        if (!this._playerMesh || !this.inputManager) return;
        
        // Update advanced movement systems first
        if (this.movementController) {
            this.movementController.update(deltaTime);
        }
        
        if (this.grapplingHook) {
            this.grapplingHook.update(deltaTime);
        }
        
        if (this.timeManipulator) {
            this.timeManipulator.update(deltaTime);
        }
        
        // If using advanced movement, skip the basic movement handling
        if (this.movementController && 
            (this.movementController.isWallRunning || 
             this.movementController.isSliding || 
             this.movementController.isDashing || 
             this.movementController.isGrappling)) {
            // Advanced movement is handling the player, just update camera
            this.updateCameraPosition();
            return;
        }
        
        // Basic movement handling for when advanced movement is not active
        const inputState = this.inputManager.getInputState();
        const isMovingForward = inputState.forward !== 0;
        const isMovingRight = inputState.right !== 0;
        const cameraDirection = this.camera.getDirection(Vector3.Forward());
        cameraDirection.y = 0; // Keep movement horizontal
        cameraDirection.normalize();
        
        // Calculate movement direction in world space
        const moveDirection = new Vector3(0, 0, 0);
        
        if (isMovingForward) {
            const forwardVector = cameraDirection.scale(inputState.forward * 0.1);
            moveDirection.addInPlace(forwardVector);
        }
        
        if (isMovingRight) {
            const rightVector = this.camera.getDirection(Vector3.Right()).scale(inputState.right * 0.1);
            rightVector.y = 0;
            moveDirection.addInPlace(rightVector);
        }
        
        // Move the player root
        if (moveDirection.length() > 0.01) {
            // Normalize and apply speed
            moveDirection.normalize();
            this.playerRoot.position.addInPlace(moveDirection.scale(5.0 * deltaTime)); // Use deltaTime for frame-rate independent movement
            
            // Rotate player to face movement direction
            const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);
            this.playerRoot.rotation.y = targetRotation;
            
            // Play running animation if not already running
            if (!this.isMoving) {
                this.isMoving = true;
                this.playAnimation('run');
            }
        } else {
            // Return to idle when not moving
            if (this.isMoving) {
                this.isMoving = false;
                this.playAnimation('idle');
            }
        }
        
        // Update camera position to follow player smoothly
        this.updateCameraPosition();
    }
    
    private updateCameraPosition(): void {
        // Update camera target to follow player smoothly
        const targetPosition = this.playerRoot.position.add(this.cameraLookAtOffset);
        this.camera.setTarget(targetPosition);
    }
    
    getCamera(): ArcRotateCamera {
        return this.camera;
    }
    
    getPlayerPosition(): Vector3 {
        return this.playerRoot.position;
    }
    
    setPlayerPosition(position: Vector3): void {
        this.playerRoot.position = position.clone();
        console.log(`Player position set to: ${position.toString()}`);
    }
    
    getPlayerRotation(): Vector3 {
        return this.playerRoot.rotation;
    }
    
    setPlayerRotation(rotation: Vector3): void {
        this.playerRoot.rotation = rotation.clone();
    }
    
    // Convenience method for setting position that matches the GameSpawner usage
    setPosition(position: Vector3): void {
        this.setPlayerPosition(position);
    }
    
    // Get available characters from asset config
    getAvailableCharacters(): string[] {
        return Object.keys(ASSET_CONFIG.characters);
    }
    
    // Get available skins for a character
    getAvailableSkins(characterName: string): string[] {
        const character = ASSET_CONFIG.characters[characterName];
        return character ? Object.keys(character.skins) : [];
    }
    
    async changeCharacter(characterName: string, skinName: string = 'default'): Promise<boolean> {
        try {
            await this.loadPlayerModel(characterName, skinName);
            return true;
        } catch (error) {
            console.error('Failed to change character:', error);
            return false;
        }
    }
    
    async changeSkin(skinName: string): Promise<boolean> {
        try {
            await this.loadPlayerModel(this.currentCharacter, skinName);
            return true;
        } catch (error) {
            console.error('Failed to change skin:', error);
            return false;
        }
    }
    
    // Get current character info
    getCurrentCharacter(): string {
        return this.currentCharacter;
    }
    
    getCurrentSkin(): string {
        return this.currentSkin;
    }
    
    // Advanced movement methods
    dash(): void {
        if (this.movementController) {
            // Call the movement controller's dash method
            this._applyMovementAction('dash');
        }
    }
    
    slide(): void {
        if (this.movementController) {
            // Call the movement controller's slide method
            this._applyMovementAction('slide');
        }
    }
    
    toggleTimeSlow(): void {
        if (this.timeManipulator) {
            this.timeManipulator.toggle();
        }
    }
    
    fireGrapplingHook(): void {
        if (this.grapplingHook && this._playerMesh) {
            // Get the forward direction based on camera
            const forward = this.camera.getDirection(Vector3.Forward());
            this.grapplingHook.fire(forward);
        }
    }
      private _applyMovementAction(action: string): void {
        // This is a helper method for the movement controller
        if (!this.movementController || !this._playerMesh) return;
        
        // Apply the requested action via the movement controller
        const inputState = this.inputManager?.getInputState();
        if (!inputState) return;
        
        // The movement controller will handle the actual physics through its update method
        // This method is just a marker for when the action was triggered
        console.log(`Applied movement action: ${action}`);
    }
    
    dispose(): void {
        if (this._playerMesh) {
            this._playerMesh.dispose();
        }
        
        if (this.playerRoot) {
            this.playerRoot.dispose();
        }
          this.animations.forEach(anim => {
            if (anim instanceof AnimationGroup) {
                anim.dispose();
            } else {
                // Animatable - stop and pause
                anim.stop();
                anim.pause();
            }
        });
        
        this.animations.clear();
    }
    
    // Getter for playerMesh to be used by movement controllers
    get playerMesh(): AbstractMesh | null {
        return this._playerMesh;
    }
    
    // Play sounds for movement
    playSound(soundName: string): void {
        if (this.audioManager) {
            this.audioManager.playSound(soundName);
        }
    }
    
    // Get forward direction (used by movement controllers)
    getForwardDirection(): Vector3 {
        const cameraDirection = this.camera.getDirection(Vector3.Forward());
        cameraDirection.y = 0; // Keep it horizontal
        return cameraDirection.normalize();
    }
}
