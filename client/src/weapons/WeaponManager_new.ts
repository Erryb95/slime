import { 
    Scene, 
    Vector3, 
    Ray, 
    PickingInfo, 
    AbstractMesh, 
    Skeleton,
    Bone,
    TransformNode
} from '@babylonjs/core';
import '@babylonjs/loaders';
import { AudioManager } from '../audio/AudioManager';
import { VisualEffectsManager } from '../effects/VisualEffectsManager';
import type { HitEffect } from '../effects/VisualEffectsManager';
import { EnhancedAssetManager } from '../assets/EnhancedAssetManager';
import { ASSET_CONFIG } from '../assets/AssetLoadingConfig';

export interface WeaponConfig {
    name: string;
    displayName: string;
    damage: number;
    fireRate: number; // rounds per minute
    range: number;
    accuracy: number; // 0-1, where 1 is perfect accuracy
    magazineSize: number;
    reloadTime: number; // seconds
    projectileSpeed?: number; // for projectile weapons
    model?: string;
    muzzleFlash?: boolean;
    recoil?: Vector3;
    // Add positioning info for third-person mode
    position?: Vector3; // Position offset relative to hand
    rotation?: Vector3; // Rotation offset relative to hand
    scale?: Vector3; // Scale to apply to the weapon model
}

export interface WeaponState {
    ammo: number;
    totalAmmo: number;
    isReloading: boolean;
    lastFireTime: number;
    weaponConfig: WeaponConfig;
}

export class WeaponManager {
    private scene: Scene;
    private assetManager: EnhancedAssetManager;
    private currentWeapon: WeaponState | null = null;
    private weaponModels: Map<string, AbstractMesh> = new Map();
    private audioManager: AudioManager | null = null;
    private visualEffectsManager: VisualEffectsManager | null = null;
      // For third-person weapon attachment
    private attachmentBone: Bone | null = null;
    private attachmentNode: TransformNode | null = null;
    private currentWeaponName: string = 'ak47';

    constructor(scene: Scene, assetManager: EnhancedAssetManager) {
        this.scene = scene;
        this.assetManager = assetManager;
    }

    setAudioManager(audioManager: AudioManager): void {
        this.audioManager = audioManager;
    }

    setVisualEffectsManager(visualEffectsManager: VisualEffectsManager): void {
        this.visualEffectsManager = visualEffectsManager;
    }

    async switchWeapon(weaponName: string, skinName: string = 'default'): Promise<boolean> {
        // Check if weapon exists in asset config
        const weaponConfig = ASSET_CONFIG.weapons[weaponName];
        if (!weaponConfig) {
            console.error(`Weapon '${weaponName}' not found in asset config`);
            return false;
        }        try {
            // Load weapon using EnhancedAssetManager - get cloned meshes for instantiation
            const weaponMeshes = await this.assetManager.getWeapon(weaponName, skinName);
            
            if (weaponMeshes && weaponMeshes.length > 0) {
                // Dispose existing weapon model if any
                const existingModel = this.weaponModels.get(this.currentWeaponName);
                if (existingModel) {
                    existingModel.dispose();
                    this.weaponModels.delete(this.currentWeaponName);
                }
                
                // Use the first mesh as the main weapon model
                const weaponMesh = weaponMeshes[0];
                
                // Store the new weapon model
                this.weaponModels.set(weaponName, weaponMesh);
                
                // Create weapon state with default stats (can be customized per weapon)
                this.currentWeapon = {
                    ammo: 30, // Default magazine size
                    totalAmmo: 90, // Start with 3 magazines
                    isReloading: false,
                    lastFireTime: 0,
                    weaponConfig: {
                        name: weaponName,
                        displayName: weaponConfig.displayName,
                        damage: 35, // Default damage
                        fireRate: 600, // Default fire rate (600 RPM)
                        range: 100, // Default range
                        accuracy: 0.75, // Default accuracy
                        magazineSize: 30, // Default magazine size
                        reloadTime: 2.5, // Default reload time
                        projectileSpeed: 200, // Default projectile speed
                        muzzleFlash: true,
                        recoil: new Vector3(-0.02, 0.02, 0),
                        position: new Vector3(0.1, -0.05, 0.1),
                        rotation: new Vector3(0, Math.PI / 2, 0),
                        scale: new Vector3(1, 1, 1)
                    }
                };                
                this.currentWeaponName = weaponName;
                
                // Update weapon position if attachedto a bone
                this.updateWeaponPosition();
                
                console.log(`Switched to weapon: ${weaponConfig.displayName} with skin: ${skinName}`);
                return true;
                
            } else {
                console.error('Failed to load weapon mesh');
                return false;
            }
            
        } catch (error) {
            console.error('Error switching weapon:', error);
            return false;
        }
    }

    canFire(): boolean {
        if (!this.currentWeapon || this.currentWeapon.isReloading || this.currentWeapon.ammo <= 0) {
            return false;
        }

        const currentTime = Date.now();
        const fireInterval = 60000 / this.currentWeapon.weaponConfig.fireRate; // Convert RPM to milliseconds
        const timeSinceLastShot = currentTime - this.currentWeapon.lastFireTime;

        return timeSinceLastShot >= fireInterval;
    }

    fire(origin: Vector3, direction: Vector3, onHit?: (hit: PickingInfo) => void): boolean {
        if (!this.canFire() || !this.currentWeapon) return false;

        const weapon = this.currentWeapon;
        
        // Apply accuracy - reduce accuracy based on weapon config
        const spreadDirection = direction.clone();
        const spread = (1 - weapon.weaponConfig.accuracy) * 0.1; // Max spread of 0.1 radians for 0 accuracy
        spreadDirection.x += (Math.random() - 0.5) * spread;
        spreadDirection.y += (Math.random() - 0.5) * spread;
        spreadDirection.normalize();

        // Create ray for hit detection
        const ray = new Ray(origin, spreadDirection, weapon.weaponConfig.range);

        // Perform hit detection
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            // Filter out the weapon mesh itself and player mesh
            return !this.weaponModels.has(mesh.name) && mesh.name !== 'playerModel';
        });

        // Play sound effect
        if (this.audioManager) {
            this.audioManager.playWeaponFire(weapon.weaponConfig.name, origin);
        }        // Play muzzle flash effect
        if (weapon.weaponConfig.muzzleFlash && this.visualEffectsManager) {
            // TODO: Implement muzzle flash effect
            // const muzzleOffset = new Vector3(0, 0, 1); // Forward from weapon
            // this.visualEffectsManager.playMuzzleFlash(origin.add(muzzleOffset), direction);
        }

        // Handle hit effects and damage
        if (hit && hit.hit && hit.pickedPoint && hit.getNormal) {
            if (onHit) {
                onHit(hit);
            }

            // Create hit effects
            if (this.visualEffectsManager) {
                const hitEffect: HitEffect = {
                    position: hit.pickedPoint,
                    normal: hit.getNormal() || Vector3.Up(),
                    material: hit.pickedMesh?.material?.name || 'default'
                };
                this.visualEffectsManager.playHitEffect(hitEffect);
            }
        }

        // Update weapon state
        weapon.lastFireTime = Date.now();
        weapon.ammo--;

        // Special handling for shotgun (multiple pellets)
        if (weapon.weaponConfig.name === 'shotgun') {
            this.fireShotgunPellets(origin, direction, onHit);
        }

        return true;
    }

    private fireShotgunPellets(origin: Vector3, direction: Vector3, onHit?: (hit: PickingInfo) => void): void {
        const pelletCount = 8; // Number of pellets
        const spread = 0.2; // Spread angle in radians

        for (let i = 0; i < pelletCount; i++) {
            const pelletDirection = direction.clone();
            pelletDirection.x += (Math.random() - 0.5) * spread;
            pelletDirection.y += (Math.random() - 0.5) * spread;
            pelletDirection.normalize();

            const ray = new Ray(origin, pelletDirection, this.currentWeapon!.weaponConfig.range);
            const hit = this.scene.pickWithRay(ray, (mesh) => {
                return !this.weaponModels.has(mesh.name) && mesh.name !== 'playerModel';
            });

            if (hit && hit.hit && onHit) {
                onHit(hit);
            }

            // Create individual hit effects for each pellet
            if (hit && hit.hit && hit.pickedPoint && this.visualEffectsManager) {
                const hitEffect: HitEffect = {
                    position: hit.pickedPoint,
                    normal: hit.getNormal() || Vector3.Up(),
                    material: hit.pickedMesh?.material?.name || 'default'
                };
                this.visualEffectsManager.playHitEffect(hitEffect);
            }
        }
    }

    async reload(): Promise<boolean> {
        if (!this.currentWeapon || this.currentWeapon.isReloading) return false;

        const weapon = this.currentWeapon;
        if (weapon.ammo >= weapon.weaponConfig.magazineSize || weapon.totalAmmo <= 0) {
            return false; // Already full or no ammo left
        }

        weapon.isReloading = true;

        // Simulate reload time
        setTimeout(() => {
            if (this.currentWeapon) {
                const ammoNeeded = this.currentWeapon.weaponConfig.magazineSize - this.currentWeapon.ammo;
                const ammoToLoad = Math.min(ammoNeeded, this.currentWeapon.totalAmmo);
                
                this.currentWeapon.ammo += ammoToLoad;
                this.currentWeapon.totalAmmo -= ammoToLoad;
                this.currentWeapon.isReloading = false;

                console.log(`Reloaded ${this.currentWeapon.weaponConfig.displayName}`);
            }
        }, weapon.weaponConfig.reloadTime * 1000);

        return true;
    }    update(_deltaTime: number): void {
        // Update weapon systems - could include recoil recovery, animations, etc.
        // For now, just update weapon position if attached
        this.updateWeaponPosition();
    }

    getCurrentWeapon(): WeaponState | null {
        return this.currentWeapon;
    }

    getAvailableWeapons(): string[] {
        return Object.keys(ASSET_CONFIG.weapons);
    }

    addAmmo(weaponName: string, amount: number): boolean {
        if (!this.currentWeapon || this.currentWeapon.weaponConfig.name !== weaponName) {
            return false;
        }

        this.currentWeapon.totalAmmo += amount;
        return true;
    }

    /**
     * Attach the weapon to a specific bone in the player's skeleton
     * @param skeleton The player's skeleton
     * @param boneName The name of the bone to attach to (usually right hand)
     */
    attachWeaponToBone(skeleton: Skeleton, boneName: string): void {
        // Find the target bone
        this.attachmentBone = skeleton.bones.find(bone => 
            bone.name.toLowerCase() === boneName.toLowerCase() ||
            bone.name.toLowerCase().includes(boneName.toLowerCase())
        ) || null;

        if (!this.attachmentBone) {
            console.warn(`Bone '${boneName}' not found in skeleton`);
            console.log('Available bones:', skeleton.bones.map(b => b.name));
            return;
        }

        // Create an attachment node if it doesn't exist
        if (!this.attachmentNode) {
            this.attachmentNode = new TransformNode('weaponAttachment', this.scene);
        }

        // Set up the attachment node to follow the bone
        this.attachmentNode.parent = this.attachmentBone;

        // Attach the current weapon to the attachment node
        if (this.currentWeapon) {
            const weaponModel = this.weaponModels.get(this.currentWeapon.weaponConfig.name);
            if (weaponModel) {
                weaponModel.parent = this.attachmentNode;
                
                // Apply weapon-specific positioning
                const config = this.currentWeapon.weaponConfig;
                if (config.position) {
                    weaponModel.position = config.position;
                }
                if (config.rotation) {
                    weaponModel.rotation = config.rotation;
                }
                if (config.scale) {
                    weaponModel.scaling = config.scale;
                }
            }
        }
    }

    /**
     * Update the weapon position to follow the bone
     */
    private updateWeaponPosition(): void {
        // The weapon automatically follows the bone through the parent-child relationship
        // No additional update needed unless we want to add weapon sway, recoil, etc.
    }

    dispose(): void {
        this.weaponModels.forEach(model => {
            model.dispose();
        });
        this.weaponModels.clear();

        if (this.attachmentNode) {
            this.attachmentNode.dispose();
        }
    }
}
