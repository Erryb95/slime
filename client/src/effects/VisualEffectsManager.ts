import { 
    Scene, 
    Vector3, 
    ParticleSystem, 
    Texture, 
    Color4, 
    Animation,
    MeshBuilder,
    StandardMaterial,
    DynamicTexture
} from '@babylonjs/core';

export interface HitEffect {
    position: Vector3;
    normal: Vector3;
    material: string;
}

export class VisualEffectsManager {
    private scene: Scene;
    private muzzleFlashSystems: Map<string, ParticleSystem> = new Map();
    private hitEffectSystems: Map<string, ParticleSystem> = new Map();
    private bulletHoleTexture: Texture | null = null;
    private muzzleFlashTexture: Texture | null = null;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    async initialize(): Promise<void> {
        console.log('Initializing VisualEffectsManager...');
        
        try {
            // Load textures
            this.bulletHoleTexture = new Texture('/assets/textures/bulletHole.png', this.scene);
            this.muzzleFlashTexture = new Texture('/assets/textures/flare.png', this.scene);
            
            // Create particle systems
            this.createMuzzleFlashSystem();
            this.createHitEffectSystems();
            
            console.log('VisualEffectsManager initialized');
        } catch (error) {
            console.error('Failed to initialize VisualEffectsManager:', error);
        }
    }

    private createMuzzleFlashSystem(): void {
        // Create muzzle flash particle system
        const muzzleFlash = new ParticleSystem('muzzleFlash', 50, this.scene);
        muzzleFlash.particleTexture = this.muzzleFlashTexture || new Texture('/assets/textures/flare.png', this.scene);
        
        // Configure particles
        muzzleFlash.minEmitBox = new Vector3(-0.1, -0.1, 0);
        muzzleFlash.maxEmitBox = new Vector3(0.1, 0.1, 0);
        
        muzzleFlash.color1 = new Color4(1, 0.8, 0.3, 1);
        muzzleFlash.color2 = new Color4(1, 0.5, 0, 1);
        muzzleFlash.colorDead = new Color4(0.5, 0.2, 0, 0);
        
        muzzleFlash.minSize = 0.3;
        muzzleFlash.maxSize = 0.8;
        
        muzzleFlash.minLifeTime = 0.05;
        muzzleFlash.maxLifeTime = 0.15;
        
        muzzleFlash.emitRate = 500;
        
        muzzleFlash.direction1 = new Vector3(-0.2, -0.2, 1);
        muzzleFlash.direction2 = new Vector3(0.2, 0.2, 1.5);
        
        muzzleFlash.minEmitPower = 8;
        muzzleFlash.maxEmitPower = 15;
        
        muzzleFlash.gravity = new Vector3(0, -5, 0);
        
        this.muzzleFlashSystems.set('default', muzzleFlash);
    }

    private createHitEffectSystems(): void {
        // Spark effect for metal hits
        const sparkEffect = new ParticleSystem('sparkEffect', 30, this.scene);
        sparkEffect.particleTexture = this.muzzleFlashTexture || new Texture('/assets/textures/flare.png', this.scene);
        
        sparkEffect.minEmitBox = new Vector3(-0.05, -0.05, -0.05);
        sparkEffect.maxEmitBox = new Vector3(0.05, 0.05, 0.05);
        
        sparkEffect.color1 = new Color4(1, 0.9, 0.3, 1);
        sparkEffect.color2 = new Color4(1, 0.6, 0.1, 1);
        sparkEffect.colorDead = new Color4(0.3, 0.1, 0, 0);
        
        sparkEffect.minSize = 0.02;
        sparkEffect.maxSize = 0.08;
        
        sparkEffect.minLifeTime = 0.2;
        sparkEffect.maxLifeTime = 0.5;
        
        sparkEffect.emitRate = 100;
        
        sparkEffect.minEmitPower = 2;
        sparkEffect.maxEmitPower = 8;
        
        sparkEffect.gravity = new Vector3(0, -9.8, 0);
        
        this.hitEffectSystems.set('metal', sparkEffect);

        // Dust effect for concrete/stone hits
        const dustEffect = new ParticleSystem('dustEffect', 40, this.scene);
        dustEffect.particleTexture = this.createDustTexture();
        
        dustEffect.minEmitBox = new Vector3(-0.1, -0.1, -0.1);
        dustEffect.maxEmitBox = new Vector3(0.1, 0.1, 0.1);
        
        dustEffect.color1 = new Color4(0.7, 0.6, 0.5, 1);
        dustEffect.color2 = new Color4(0.5, 0.4, 0.3, 1);
        dustEffect.colorDead = new Color4(0.3, 0.2, 0.1, 0);
        
        dustEffect.minSize = 0.1;
        dustEffect.maxSize = 0.3;
        
        dustEffect.minLifeTime = 0.5;
        dustEffect.maxLifeTime = 1.5;
        
        dustEffect.emitRate = 80;
        
        dustEffect.minEmitPower = 1;
        dustEffect.maxEmitPower = 4;
        
        dustEffect.gravity = new Vector3(0, -2, 0);
        
        this.hitEffectSystems.set('concrete', dustEffect);
    }

    private createDustTexture(): Texture {
        const size = 64;
        const dynamicTexture = new DynamicTexture('dustTexture', size, this.scene);
        const context = dynamicTexture.getContext();
        
        // Create a simple dust particle texture
        const gradient = context.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        gradient.addColorStop(0, 'rgba(200, 180, 150, 255)');
        gradient.addColorStop(0.5, 'rgba(150, 130, 100, 128)');
        gradient.addColorStop(1, 'rgba(100, 80, 60, 0)');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, size, size);
        
        dynamicTexture.update();
        return dynamicTexture;
    }

    playMuzzleFlash(position: Vector3, direction: Vector3): void {
        const muzzleFlash = this.muzzleFlashSystems.get('default');
        if (!muzzleFlash) return;

        // Position the emitter
        muzzleFlash.worldOffset = position;
        
        // Set direction
        muzzleFlash.direction1 = direction.scale(0.8);
        muzzleFlash.direction2 = direction.scale(1.2);
        
        // Play for a short burst
        muzzleFlash.start();
        setTimeout(() => {
            muzzleFlash.stop();
        }, 100);
    }

    playHitEffect(hitInfo: HitEffect): void {
        const materialType = this.determineMaterialType(hitInfo.material);
        const hitEffect = this.hitEffectSystems.get(materialType);
        
        if (!hitEffect) return;

        // Position the effect
        hitEffect.worldOffset = hitInfo.position;
        
        // Adjust direction based on surface normal
        const reflectedDirection = this.reflectVector(new Vector3(0, 0, -1), hitInfo.normal);
        hitEffect.direction1 = reflectedDirection.scale(0.5);
        hitEffect.direction2 = reflectedDirection.scale(1.5);
        
        // Play effect
        hitEffect.start();
        setTimeout(() => {
            hitEffect.stop();
        }, 200);

        // Create bullet hole decal
        this.createBulletHole(hitInfo.position, hitInfo.normal);
    }

    private determineMaterialType(materialName: string): string {
        const materialLower = materialName.toLowerCase();
        
        if (materialLower.includes('metal') || materialLower.includes('steel') || materialLower.includes('iron')) {
            return 'metal';
        } else {
            return 'concrete'; // Default to concrete/dust effect
        }
    }

    private reflectVector(incident: Vector3, normal: Vector3): Vector3 {
        // Reflect incident vector around normal
        const dot = Vector3.Dot(incident, normal);
        return incident.subtract(normal.scale(2 * dot));
    }    private createBulletHole(position: Vector3, normal: Vector3): void {
        if (!this.bulletHoleTexture) return;

        const bulletHole = MeshBuilder.CreatePlane('bulletHole', { size: 0.2 }, this.scene);
        bulletHole.position = position.add(normal.scale(0.001)); // Slightly offset from surface
        
        // Align with surface normal
        bulletHole.lookAt(position.add(normal));
        
        // Create material
        const material = new StandardMaterial('bulletHoleMaterial', this.scene);
        material.diffuseTexture = this.bulletHoleTexture;
        material.opacityTexture = this.bulletHoleTexture;
        material.useAlphaFromDiffuseTexture = true;
        bulletHole.material = material;
        
        // Fade out and dispose after some time
        setTimeout(() => {
            Animation.CreateAndStartAnimation(
                'bulletHoleFade',
                bulletHole,
                'visibility',
                30, // 30 fps
                60, // 2 seconds
                1,  // start value
                0,  // end value
                Animation.ANIMATIONLOOPMODE_CONSTANT,
                undefined,
                () => {
                    bulletHole.dispose();
                }
            );
        }, 10000); // Start fading after 10 seconds
    }

    createExplosion(position: Vector3, scale: number = 1): void {
        const explosion = new ParticleSystem('explosion', 200, this.scene);
        explosion.particleTexture = this.muzzleFlashTexture || new Texture('/assets/textures/fireExplosion.webp', this.scene);
        
        explosion.worldOffset = position;
        
        explosion.minEmitBox = new Vector3(-0.2 * scale, -0.2 * scale, -0.2 * scale);
        explosion.maxEmitBox = new Vector3(0.2 * scale, 0.2 * scale, 0.2 * scale);
        
        explosion.color1 = new Color4(1, 0.8, 0.1, 1);
        explosion.color2 = new Color4(1, 0.3, 0, 1);
        explosion.colorDead = new Color4(0.2, 0.1, 0, 0);
        
        explosion.minSize = 0.3 * scale;
        explosion.maxSize = 1.5 * scale;
        
        explosion.minLifeTime = 0.5;
        explosion.maxLifeTime = 2.0;
        
        explosion.emitRate = 300;
        
        explosion.minEmitPower = 5 * scale;
        explosion.maxEmitPower = 15 * scale;
        
        explosion.gravity = new Vector3(0, -9.8, 0);
        
        explosion.start();
        setTimeout(() => {
            explosion.stop();
            setTimeout(() => {
                explosion.dispose();
            }, 3000);
        }, 500);
    }

    dispose(): void {
        this.muzzleFlashSystems.forEach(system => system.dispose());
        this.hitEffectSystems.forEach(system => system.dispose());
        this.muzzleFlashSystems.clear();
        this.hitEffectSystems.clear();
        
        if (this.bulletHoleTexture) {
            this.bulletHoleTexture.dispose();
        }
        if (this.muzzleFlashTexture) {
            this.muzzleFlashTexture.dispose();
        }
    }
}
