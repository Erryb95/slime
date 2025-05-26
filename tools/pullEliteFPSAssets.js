// Elite FPS Asset Puller - Maps, Characters, Ragdoll Physics, Death Animations, Third-Person Shooting
// Targets the best GitHub repositories for complete FPS game systems

import { Octokit } from '@octokit/rest';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class EliteFPSAssetPuller {
    constructor() {
        // Use environment variable for GitHub token
        this.octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN
        });
        
        this.baseDir = 'client/public/assets';
        this.sourceDir = 'client/src/assets';
        
        // Elite repositories with the best FPS game systems
        this.eliteRepos = {
            // Professional Maps and Levels
            maps: {
                repositories: [
                    'id-Software/DOOM-3-BFG', // Classic DOOM maps
                    'OpenArena/engine', // OpenArena maps
                    'ioquake/ioquake3', // Quake 3 maps
                    'freedoom/freedoom', // Open source FPS maps
                    'xonotic/xonotic-maps.pk3dir', // Professional FPS maps
                    'AssaultCube/AC', // Assault Cube maps
                    'Calinou/game-maps-obj', // Converted game maps
                    'RedEclipse/base', // Red Eclipse maps
                    'Sauerbraten-fork/sauerbraten', // Sauerbraten maps
                    'cube2/sauerbraten' // Cube 2 maps
                ],
                priority: ['maps', 'levels', 'environments']
            },
            
            // Character Models and Animations
            characters: {
                repositories: [
                    'mixamo/mixamo-js', // Professional character animations
                    'BabylonJS/SampleAssets', // High-quality character models
                    'KhronosGroup/glTF-Sample-Models', // Industry standard models
                    'google/model-viewer', // Google's 3D character examples
                    'unity3d-jp/UnityChanToonShaderVer2_Project', // Unity Chan character
                    'godotengine/godot-demo-projects', // Godot character examples
                    'mrdoob/three.js', // Three.js character demos
                    'playcanvas/engine', // PlayCanvas character assets
                    'Microsoft/MixedRealityToolkit-Unity', // Microsoft character models
                    'facebook/fbx-conv' // FBX character conversion tools
                ],
                priority: ['characters', 'models', 'animations', 'rigs']
            },
            
            // Ragdoll Physics and Death Systems
            ragdollPhysics: {
                repositories: [
                    'dimforge/rapier.js', // Advanced physics engine
                    'bulletphysics/bullet3', // Bullet physics
                    'erincatto/box2d', // Box2D physics
                    'chandlerprall/Physijs', // Web physics library
                    'lo-th/Oimo.js', // JavaScript physics engine
                    'BabylonJS/Extensions', // Babylon.js physics extensions
                    'mrdoob/three.js', // Three.js physics examples
                    'schteppe/cannon.js', // Cannon.js physics
                    'kripken/ammo.js', // Ammo.js physics
                    'liabru/matter-js' // 2D physics (for reference)
                ],
                priority: ['physics', 'ragdoll', 'collision', 'dynamics']
            },
            
            // Death Animations and Effects
            deathAnimations: {
                repositories: [
                    'mixamo/mixamo-js', // Professional death animations
                    'BabylonJS/SampleAssets', // Animation examples
                    'mrdoob/three.js', // Animation systems
                    'playcanvas/engine', // Death effect examples
                    'godotengine/godot-demo-projects', // Animation demos
                    'unity3d-jp/UnityChanToonShaderVer2_Project', // Character animations
                    'KhronosGroup/glTF-Sample-Models', // Animated models
                    'Microsoft/MixedRealityToolkit-Unity', // Animation systems
                    'facebook/fbx-conv', // Animation conversion
                    'google/model-viewer' // Animation examples
                ],
                priority: ['animations', 'death', 'effects', 'particles']
            },
            
            // Third-Person Shooting Systems
            thirdPersonShooting: {
                repositories: [
                    'BabylonJS/SampleAssets', // Camera and shooting examples
                    'mrdoob/three.js', // Third-person camera examples
                    'playcanvas/engine', // Third-person shooting demos
                    'godotengine/godot-demo-projects', // Third-person examples
                    'unity3d-jp/UnityChanToonShaderVer2_Project', // Third-person systems
                    'Microsoft/MixedRealityToolkit-Unity', // Camera systems
                    'google/model-viewer', // Camera control examples
                    'facebook/fbx-conv', // Animation systems
                    'KhronosGroup/glTF-Sample-Models', // Camera examples
                    'dimforge/rapier.js' // Physics for shooting
                ],
                priority: ['camera', 'shooting', 'aiming', 'targeting']
            },
            
            // Complete FPS Game References
            completeFPS: {
                repositories: [
                    'AssaultCube/AC', // Complete open source FPS
                    'RedEclipse/base', // Complete FPS game
                    'xonotic/xonotic', // Professional FPS
                    'OpenArena/engine', // Quake-based FPS
                    'ioquake/ioquake3', // Quake 3 engine
                    'freedoom/freedoom', // DOOM-compatible FPS
                    'Sauerbraten-fork/sauerbraten', // Complete FPS
                    'cube2/sauerbraten', // Cube 2 FPS
                    'BabylonJS/SampleAssets', // Complete examples
                    'mrdoob/three.js' // FPS examples
                ],
                priority: ['complete', 'systems', 'integration', 'gameplay']
            }
        };
        
        this.stats = {
            totalRepos: 0,
            successfulClones: 0,
            failedClones: 0,
            assetsExtracted: 0,
            totalSize: 0
        };
    }

    async ensureDirectory(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            return true;
        } catch (error) {
            console.warn(`⚠️ Could not create directory ${dirPath}:`, error.message);
            return false;
        }
    }

    async cloneRepository(owner, repo, category) {
        try {
            console.log(`\n📦 Cloning ${owner}/${repo} for ${category}...`);
            
            // Check if repository exists
            try {
                await this.octokit.rest.repos.get({ owner, repo });
            } catch (error) {
                if (error.status === 404) {
                    console.log(`⚠️ Repository ${owner}/${repo} not found, skipping...`);
                    return null;
                }
                throw error;
            }
            
            this.stats.totalRepos++;
            
            const targetDir = path.join(this.baseDir, category, `${owner}-${repo}`);
            
            // Skip if already cloned
            try {
                await fs.access(targetDir);
                console.log(`✅ ${owner}/${repo} already exists, skipping clone`);
                return targetDir;
            } catch {
                // Directory doesn't exist, proceed with clone
            }
            
            await this.ensureDirectory(path.dirname(targetDir));
            
            const repoUrl = `https://github.com/${owner}/${repo}.git`;
            const cloneCommand = `git clone --depth 1 "${repoUrl}" "${targetDir}"`;
            
            await execAsync(cloneCommand);
            
            console.log(`✅ Successfully cloned ${owner}/${repo}`);
            this.stats.successfulClones++;
            
            return targetDir;
            
        } catch (error) {
            console.error(`❌ Failed to clone ${owner}/${repo}:`, error.message);
            this.stats.failedClones++;
            return null;
        }
    }

    async extractAssets(repoPath, category, priorities) {
        if (!repoPath) return;
        
        try {
            console.log(`🔍 Extracting ${category} assets from ${path.basename(repoPath)}...`);
            
            const files = await this.getAllFiles(repoPath);
            let extracted = 0;
            
            for (const file of files) {
                const extracted_asset = await this.categorizeAndExtract(file, repoPath, category, priorities);
                if (extracted_asset) extracted++;
            }
            
            console.log(`📄 Extracted ${extracted} ${category} assets`);
            this.stats.assetsExtracted += extracted;
            
        } catch (error) {
            console.warn(`⚠️ Error extracting assets from ${repoPath}:`, error.message);
        }
    }

    async getAllFiles(dir) {
        const files = [];
        
        try {
            const items = await fs.readdir(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                // Skip .git and other system directories
                if (item.name.startsWith('.') || item.name === 'node_modules') {
                    continue;
                }
                
                if (item.isDirectory()) {
                    files.push(...await this.getAllFiles(fullPath));
                } else if (item.isFile()) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Directory might not be accessible
        }
        
        return files;
    }

    async categorizeAndExtract(filePath, repoPath, category, priorities) {
        const fileName = path.basename(filePath).toLowerCase();
        const ext = path.extname(filePath).toLowerCase();
        const relativePath = path.relative(repoPath, filePath);
        
        // Define asset patterns for each category
        const assetPatterns = {
            maps: {
                extensions: ['.obj', '.gltf', '.glb', '.babylon', '.map', '.bsp', '.pk3'],
                keywords: ['map', 'level', 'arena', 'dm_', 'ctf_', 'environment', 'terrain']
            },
            characters: {
                extensions: ['.gltf', '.glb', '.babylon', '.fbx', '.dae', '.obj'],
                keywords: ['character', 'player', 'human', 'soldier', 'warrior', 'avatar', 'person']
            },
            physics: {
                extensions: ['.js', '.wasm', '.ts', '.cpp', '.h'],
                keywords: ['physics', 'ragdoll', 'collision', 'dynamics', 'rigidbody', 'constraint']
            },
            animations: {
                extensions: ['.gltf', '.glb', '.babylon', '.fbx', '.bvh', '.anim'],
                keywords: ['death', 'die', 'fall', 'hit', 'damage', 'animation', 'anim', 'idle', 'walk', 'run']
            },
            camera: {
                extensions: ['.js', '.ts', '.cs', '.cpp'],
                keywords: ['camera', 'third', 'person', 'orbit', 'follow', 'target', 'shooting', 'aim']
            }
        };
        
        // Check if file matches category
        let matches = false;
        for (const priority of priorities) {
            const pattern = assetPatterns[priority];
            if (pattern) {
                // Check extension
                if (pattern.extensions.includes(ext)) {
                    matches = true;
                    break;
                }
                
                // Check keywords in filename or path
                for (const keyword of pattern.keywords) {
                    if (fileName.includes(keyword) || relativePath.toLowerCase().includes(keyword)) {
                        matches = true;
                        break;
                    }
                }
                
                if (matches) break;
            }
        }
        
        if (matches) {
            return await this.copyAsset(filePath, category, relativePath);
        }
        
        return false;
    }

    async copyAsset(sourcePath, category, relativePath) {
        try {
            const targetDir = path.join(this.baseDir, 'elite-fps', category);
            const targetPath = path.join(targetDir, relativePath);
            
            await this.ensureDirectory(path.dirname(targetPath));
            
            const stats = await fs.stat(sourcePath);
            this.stats.totalSize += stats.size;
            
            await fs.copyFile(sourcePath, targetPath);
            
            console.log(`📋 Copied ${category} asset: ${relativePath}`);
            return true;
            
        } catch (error) {
            console.warn(`⚠️ Failed to copy ${relativePath}:`, error.message);
            return false;
        }
    }

    async generateIntegrationCode() {
        const integrationCode = `
// Elite FPS Game Integration - Auto-generated
// Maps, Characters, Ragdoll Physics, Death Animations, Third-Person Shooting

import { 
    Scene, 
    Engine, 
    ArcRotateCamera, 
    Vector3, 
    SceneLoader,
    PhysicsImpostor,
    Animation,
    AnimationGroup
} from '@babylonjs/core';

export class EliteFPSSystem {
    private scene: Scene;
    private engine: Engine;
    private thirdPersonCamera: ArcRotateCamera;
    private character: any;
    private physicsEnabled: boolean = false;
    
    constructor(scene: Scene, engine: Engine) {
        this.scene = scene;
        this.engine = engine;
        this.setupThirdPersonCamera();
    }
    
    // Third-Person Camera System
    private setupThirdPersonCamera() {
        this.thirdPersonCamera = new ArcRotateCamera(
            "thirdPersonCamera",
            -Math.PI / 2,
            Math.PI / 2.5,
            10,
            Vector3.Zero(),
            this.scene
        );
        
        this.thirdPersonCamera.attachControls();
        this.thirdPersonCamera.lowerBetaLimit = 0.1;
        this.thirdPersonCamera.upperBetaLimit = (Math.PI / 2) * 0.99;
        this.thirdPersonCamera.lowerRadiusLimit = 5;
        this.thirdPersonCamera.upperRadiusLimit = 50;
    }
    
    // Load Elite Maps
    async loadEliteMap(mapName: string): Promise<void> {
        const mapPaths = [
            \`/assets/elite-fps/maps/\${mapName}.gltf\`,
            \`/assets/elite-fps/maps/\${mapName}.glb\`,
            \`/assets/elite-fps/maps/\${mapName}.babylon\`,
            \`/assets/elite-fps/maps/\${mapName}.obj\`
        ];
        
        for (const mapPath of mapPaths) {
            try {
                const result = await SceneLoader.ImportMeshAsync("", "", mapPath, this.scene);
                console.log(\`🗺️ Loaded elite map: \${mapName}\`);
                
                // Add physics to map
                this.addMapPhysics(result.meshes);
                return;
            } catch (error) {
                console.log(\`⚠️ Could not load map from \${mapPath}\`);
            }
        }
        
        console.warn(\`❌ Could not load map: \${mapName}\`);
    }
    
    // Load Character with Animations
    async loadCharacterWithAnimations(characterName: string): Promise<any> {
        const characterPaths = [
            \`/assets/elite-fps/characters/\${characterName}.gltf\`,
            \`/assets/elite-fps/characters/\${characterName}.glb\`,
            \`/assets/elite-fps/characters/\${characterName}.babylon\`,
            \`/assets/elite-fps/characters/\${characterName}.fbx\`
        ];
        
        for (const characterPath of characterPaths) {
            try {
                const result = await SceneLoader.ImportMeshAsync("", "", characterPath, this.scene);
                
                if (result.meshes.length > 0) {
                    this.character = result.meshes[0];
                    
                    // Setup ragdoll physics
                    this.setupRagdollPhysics(this.character);
                    
                    // Setup death animations
                    this.setupDeathAnimations(result.animationGroups);
                    
                    // Attach camera to character
                    this.thirdPersonCamera.setTarget(this.character.position);
                    
                    console.log(\`👤 Loaded character: \${characterName}\`);
                    return this.character;
                }
            } catch (error) {
                console.log(\`⚠️ Could not load character from \${characterPath}\`);
            }
        }
        
        console.warn(\`❌ Could not load character: \${characterName}\`);
        return null;
    }
    
    // Ragdoll Physics System
    private setupRagdollPhysics(character: any) {
        try {
            // Enable physics for character
            character.physicsImpostor = new PhysicsImpostor(
                character,
                PhysicsImpostor.CapsuleImpostor,
                { mass: 1, restitution: 0.2 },
                this.scene
            );
            
            this.physicsEnabled = true;
            console.log('🎭 Ragdoll physics enabled');
            
        } catch (error) {
            console.warn('⚠️ Could not enable ragdoll physics:', error.message);
        }
    }
    
    // Death Animation System
    private setupDeathAnimations(animationGroups: AnimationGroup[]) {
        const deathAnimations = animationGroups.filter(group => 
            group.name.toLowerCase().includes('death') ||
            group.name.toLowerCase().includes('die') ||
            group.name.toLowerCase().includes('fall')
        );
        
        if (deathAnimations.length > 0) {
            console.log(\`💀 Found \${deathAnimations.length} death animations\`);
            
            // Store death animations for later use
            this.character.deathAnimations = deathAnimations;
        }
    }
    
    // Third-Person Shooting System
    setupThirdPersonShooting() {
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === 1 && pointerInfo.event.button === 0) { // Left click
                this.shootFromThirdPerson();
            }
        });
    }
    
    private shootFromThirdPerson() {
        if (!this.character) return;
        
        // Calculate shooting direction from camera to target
        const cameraDirection = this.thirdPersonCamera.getForwardRay().direction;
        const shootOrigin = this.character.position.clone();
        shootOrigin.y += 1.5; // Chest height
        
        // Create bullet physics
        this.createBullet(shootOrigin, cameraDirection);
        
        console.log('🔫 Third-person shot fired');
    }
    
    private createBullet(origin: Vector3, direction: Vector3) {
        // Implementation for bullet physics and effects
        // This would integrate with your weapon system
    }
    
    // Trigger Death Sequence
    triggerDeath() {
        if (!this.character || !this.character.deathAnimations) return;
        
        console.log('💀 Triggering death sequence...');
        
        // Play death animation
        const deathAnim = this.character.deathAnimations[0];
        deathAnim.play();
        
        // Enable ragdoll physics after animation starts
        setTimeout(() => {
            if (this.physicsEnabled) {
                this.character.physicsImpostor?.setLinearVelocity(Vector3.Zero());
                console.log('🎭 Ragdoll activated');
            }
        }, 500);
    }
    
    // Add physics to map elements
    private addMapPhysics(meshes: any[]) {
        meshes.forEach(mesh => {
            if (mesh.name.toLowerCase().includes('ground') || 
                mesh.name.toLowerCase().includes('floor') ||
                mesh.name.toLowerCase().includes('wall')) {
                
                mesh.physicsImpostor = new PhysicsImpostor(
                    mesh,
                    PhysicsImpostor.MeshImpostor,
                    { mass: 0, restitution: 0.7 },
                    this.scene
                );
            }
        });
        
        console.log('🏗️ Map physics enabled');
    }
    
    // Get current camera for integration
    getThirdPersonCamera(): ArcRotateCamera {
        return this.thirdPersonCamera;
    }
    
    // Get character for integration
    getCharacter(): any {
        return this.character;
    }
    
    // Cleanup
    dispose() {
        this.character?.dispose();
        this.thirdPersonCamera?.dispose();
    }
}

export default EliteFPSSystem;
`;
        
        const integrationPath = path.join(this.sourceDir, 'EliteFPSSystem.ts');
        await this.ensureDirectory(path.dirname(integrationPath));
        await fs.writeFile(integrationPath, integrationCode);
        
        console.log(`🔧 Generated elite FPS integration: ${integrationPath}`);
    }

    async generateAssetManifest() {
        const manifest = {
            version: "3.0.0-elite",
            generated: new Date().toISOString(),
            description: "Elite FPS Assets - Maps, Characters, Ragdoll Physics, Death Animations, Third-Person Shooting",
            stats: this.stats,
            categories: {}
        };
        
        // Scan elite assets
        for (const category of Object.keys(this.eliteRepos)) {
            const categoryDir = path.join(this.baseDir, 'elite-fps', category);
            try {
                const assets = await this.scanAssetDirectory(categoryDir);
                if (assets.length > 0) {
                    manifest.categories[category] = assets;
                }
            } catch (error) {
                // Category might not exist
            }
        }
        
        const manifestPath = path.join(this.baseDir, 'elite-fps-manifest.json');
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        
        console.log(`📋 Generated elite asset manifest: ${manifestPath}`);
    }

    async scanAssetDirectory(dir) {
        const assets = [];
        
        try {
            const items = await fs.readdir(dir, { withFileTypes: true });
            
            for (const item of items) {
                if (item.isDirectory()) {
                    const subAssets = await this.scanAssetDirectory(path.join(dir, item.name));
                    assets.push(...subAssets);
                } else {
                    const filePath = path.join(dir, item.name);
                    const relativePath = path.relative(this.baseDir, filePath);
                    const stats = await fs.stat(filePath);
                    
                    assets.push({
                        name: item.name,
                        path: relativePath,
                        size: stats.size,
                        modified: stats.mtime
                    });
                }
            }
        } catch (error) {
            // Directory might not exist
        }
        
        return assets;
    }

    async pullEliteAssets() {
        console.log('🏆 Elite FPS Asset Puller Starting...');
        console.log('🎯 Targeting: Maps, Characters, Ragdoll Physics, Death Animations, Third-Person Shooting\n');
        
        // Ensure base directories exist
        await this.ensureDirectory(this.baseDir);
        await this.ensureDirectory(this.sourceDir);
        await this.ensureDirectory(path.join(this.baseDir, 'elite-fps'));
        
        // Process each category
        for (const [category, config] of Object.entries(this.eliteRepos)) {
            console.log(`\n🎮 Processing ${category.toUpperCase()} repositories...`);
            
            for (const repoPath of config.repositories) {
                const [owner, repo] = repoPath.split('/');
                
                // Clone repository
                const repoDir = await this.cloneRepository(owner, repo, category);
                
                // Extract relevant assets
                await this.extractAssets(repoDir, category, config.priority);
            }
        }
        
        // Generate integration files
        console.log('\n🔧 Generating integration files...');
        await this.generateAssetManifest();
        await this.generateIntegrationCode();
        
        // Print final statistics
        this.printStats();
    }
    
    printStats() {
        console.log('\n' + '='.repeat(60));
        console.log('🏆 ELITE FPS ASSET PULLING COMPLETE!');
        console.log('='.repeat(60));
        console.log(`📊 Total repositories processed: ${this.stats.totalRepos}`);
        console.log(`✅ Successful clones: ${this.stats.successfulClones}`);
        console.log(`❌ Failed clones: ${this.stats.failedClones}`);
        console.log(`📦 Assets extracted: ${this.stats.assetsExtracted}`);
        console.log(`💾 Total size: ${(this.stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log('\n🎮 Elite FPS Assets Ready!');
        console.log('📁 Check /assets/elite-fps/ for organized assets');
        console.log('📋 Check elite-fps-manifest.json for inventory');
        console.log('🔧 Use EliteFPSSystem.ts for integration');
        console.log('\n🏆 Features Available:');
        console.log('   🗺️  Professional FPS Maps');
        console.log('   👤 Character Models & Animations');
        console.log('   🎭 Ragdoll Physics Systems');
        console.log('   💀 Death Animation Sequences');
        console.log('   📷 Third-Person Shooting Systems');
    }
}

// Main execution
async function main() {
    try {
        // Check GitHub token
        if (!process.env.GITHUB_TOKEN) {
            console.error('❌ GITHUB_TOKEN environment variable not set!');
            console.log('💡 Set it with: $env:GITHUB_TOKEN = "your_token_here"');
            process.exit(1);
        }
        
        console.log('🔍 Checking prerequisites...');
        await execAsync('git --version');
        
        const puller = new EliteFPSAssetPuller();
        await puller.pullEliteAssets();
        
    } catch (error) {
        console.error('💥 Error:', error.message);
        process.exit(1);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { EliteFPSAssetPuller };
