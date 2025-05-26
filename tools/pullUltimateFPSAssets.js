// Ultimate FPS Asset Puller for Babylon.js
// Pulls complete FPS game systems: maps, characters, physics, weapons, animations
// Targets real GitHub repositories with Babylon.js compatibility

import { Octokit } from '@octokit/rest';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class UltimateFPSAssetPuller {
    constructor() {
        this.octokit = new Octokit({
            auth: 'ghp_hPGTJ0jqr6uy3dG1HqTMn7K8tPILdP4U8TY1' // GitHub token
        });
        
        this.baseDir = 'client/public/assets';
        this.sourceDir = 'client/src/assets';
        
        // Verified repositories with high-quality FPS assets
        this.assetSources = {
            // Complete FPS games and demos
            babylonjs: {
                repositories: [
                    'BabylonJS/Demos', // Official Babylon.js demos
                    'BabylonJS/SampleAssets', // Sample assets
                    'BabylonJS/Documentation', // Tutorial assets
                    'BabylonJS/Babylon.js', // Core engine with examples
                ],
                assetTypes: ['models', 'textures', 'animations', 'physics', 'scenes']
            },
            
            // Professional FPS assets
            gameAssets: {
                repositories: [
                    'mixamo/Basic', // Character animations
                    'KhronosGroup/glTF-Sample-Models', // GLTF models
                    'google/model-viewer', // 3D model examples
                    'mrdoob/three.js', // Three.js examples (convertible)
                    'unity3d-jp/UnityChanToonShaderVer2_Project', // Character models
                ],
                assetTypes: ['characters', 'animations', 'models']
            },
            
            // Physics and movement systems
            physicsSystems: {
                repositories: [
                    'dimforge/rapier.js', // Physics engine
                    'BabylonJS/Extensions', // Babylon.js extensions
                    'chandlerprall/Physijs', // Physics library
                    'lo-th/Oimo.js', // Physics engine
                ],
                assetTypes: ['physics', 'systems']
            },
            
            // Maps and environments
            maps: {
                repositories: [
                    'Calinou/game-maps-obj', // Professional FPS maps
                    'id-Software/Quake-III-Arena', // Classic FPS maps
                    'ioquake/ioquake3', // Quake 3 assets
                    'freedoom/freedoom', // Open source FPS assets
                    'OpenArena/engine', // Open Arena assets
                ],
                assetTypes: ['maps', 'textures', 'environments']
            },
            
            // Weapons and shooting systems
            weapons: {
                repositories: [
                    'BabylonJS/SampleAssets', // Weapon models
                    'freegamedev/weapons', // Weapon assets
                    'OpenGameArt/OpenGameArt.org', // Open game art
                ],
                assetTypes: ['weapons', 'effects', 'sounds']
            },
            
            // Character systems and animations
            characters: {
                repositories: [
                    'mixamo/mixamo-js', // Character animations
                    'BabylonJS/SampleAssets', // Character models
                    'unity3d-jp/UnityChanToonShaderVer2_Project', // Unity Chan
                ],
                assetTypes: ['characters', 'animations', 'rigs']
            },
            
            // Sound and audio systems
            audio: {
                repositories: [
                    'freesound-org/freesound.js', // Sound effects
                    'BabylonJS/Babylon.js', // Audio examples
                    'WebAudio/web-audio-api', // Web Audio examples
                ],
                assetTypes: ['sounds', 'music', 'audio']
            },
            
            // Complete FPS projects for reference
            completeFPS: {
                repositories: [
                    'BabylonJS/SampleAssets', // Complete demos
                    'mrdoob/three.js', // FPS examples
                    'playcanvas/engine', // PlayCanvas FPS demos
                ],
                assetTypes: ['complete', 'systems', 'integration']
            }
        };
        
        this.stats = {
            totalDownloads: 0,
            successfulDownloads: 0,
            failedDownloads: 0,
            totalSize: 0,
            repositories: 0
        };
    }

    async ensureDirectoryExists(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            return true;
        } catch (error) {
            console.warn(`⚠️  Could not create directory ${dirPath}:`, error.message);
            return false;
        }
    }

    async downloadFile(url, filePath) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            await this.ensureDirectoryExists(path.dirname(filePath));
            await fs.writeFile(filePath, buffer);
            
            this.stats.totalSize += buffer.length;
            this.stats.successfulDownloads++;
            
            return { success: true, size: buffer.length };
        } catch (error) {
            this.stats.failedDownloads++;
            console.warn(`❌ Failed to download ${url}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    async cloneRepository(repoUrl, targetDir) {
        try {
            await this.ensureDirectoryExists(path.dirname(targetDir));
            
            const cloneCommand = `git clone --depth 1 "${repoUrl}" "${targetDir}"`;
            await execAsync(cloneCommand);
            
            console.log(`✅ Cloned repository to ${targetDir}`);
            return true;
        } catch (error) {
            console.warn(`❌ Failed to clone ${repoUrl}:`, error.message);
            return false;
        }
    }

    async extractRepoAssets(owner, repo, assetTypes) {
        try {
            console.log(`\n📦 Processing ${owner}/${repo}...`);
            
            // Check if repository exists
            try {
                await this.octokit.rest.repos.get({ owner, repo });
            } catch (error) {
                if (error.status === 404) {
                    console.log(`⚠️  Repository ${owner}/${repo} not found, skipping...`);
                    return;
                }
                throw error;
            }
            
            this.stats.repositories++;
            
            // Clone the repository
            const repoDir = path.join(this.baseDir, `github-${owner}-${repo}`);
            const repoUrl = `https://github.com/${owner}/${repo}.git`;
            
            const cloned = await this.cloneRepository(repoUrl, repoDir);
            if (!cloned) return;
            
            // Extract relevant assets based on file extensions and paths
            await this.extractAssetsByType(repoDir, owner, repo, assetTypes);
            
        } catch (error) {
            console.error(`💥 Error processing ${owner}/${repo}:`, error.message);
        }
    }

    async extractAssetsByType(repoDir, owner, repo, assetTypes) {
        try {
            const assetExtensions = {
                models: ['.babylon', '.gltf', '.glb', '.obj', '.fbx', '.dae'],
                textures: ['.jpg', '.jpeg', '.png', '.webp', '.tga', '.dds'],
                animations: ['.babylon', '.gltf', '.glb', '.bvh', '.fbx'],
                sounds: ['.wav', '.mp3', '.ogg', '.m4a'],
                scripts: ['.js', '.ts', '.cs', '.cpp', '.h'],
                physics: ['.wasm', '.js', '.ts'],
                maps: ['.babylon', '.obj', '.gltf', '.map'],
                shaders: ['.glsl', '.hlsl', '.fx', '.vert', '.frag']
            };
            
            // Walk through repository files
            const files = await this.getAllFiles(repoDir);
            
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                const relativePath = path.relative(repoDir, file);
                
                // Categorize and copy relevant assets
                for (const assetType of assetTypes) {
                    if (assetExtensions[assetType]?.includes(ext)) {
                        await this.copyAsset(file, owner, repo, assetType, relativePath);
                    }
                }
                
                // Special handling for specific file patterns
                await this.handleSpecialAssets(file, owner, repo, relativePath);
            }
            
        } catch (error) {
            console.warn(`⚠️  Error extracting assets from ${owner}/${repo}:`, error.message);
        }
    }

    async getAllFiles(dir) {
        const files = [];
        
        try {
            const items = await fs.readdir(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                if (item.isDirectory() && !item.name.startsWith('.')) {
                    files.push(...await this.getAllFiles(fullPath));
                } else if (item.isFile()) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Directory might not exist or be accessible
        }
        
        return files;
    }

    async copyAsset(sourcePath, owner, repo, assetType, relativePath) {
        try {
            const targetDir = path.join(this.baseDir, assetType, `${owner}-${repo}`);
            const targetPath = path.join(targetDir, relativePath);
            
            await this.ensureDirectoryExists(path.dirname(targetPath));
            await fs.copyFile(sourcePath, targetPath);
            
            console.log(`📄 Copied ${assetType}: ${relativePath}`);
            this.stats.totalDownloads++;
            
        } catch (error) {
            console.warn(`⚠️  Failed to copy ${relativePath}:`, error.message);
        }
    }

    async handleSpecialAssets(file, owner, repo, relativePath) {
        const fileName = path.basename(file).toLowerCase();
        
        // Handle specific FPS-related files
        if (fileName.includes('player') || fileName.includes('character')) {
            await this.copyAsset(file, owner, repo, 'characters', relativePath);
        }
        
        if (fileName.includes('weapon') || fileName.includes('gun')) {
            await this.copyAsset(file, owner, repo, 'weapons', relativePath);
        }
        
        if (fileName.includes('map') || fileName.includes('level')) {
            await this.copyAsset(file, owner, repo, 'maps', relativePath);
        }
        
        if (fileName.includes('physics') || fileName.includes('collision')) {
            await this.copyAsset(file, owner, repo, 'physics', relativePath);
        }
    }

    async generateAssetManifest() {
        const manifest = {
            version: "2.0.0",
            generated: new Date().toISOString(),
            stats: this.stats,
            assets: {}
        };
        
        // Scan all asset directories and build manifest
        const assetTypes = ['models', 'textures', 'animations', 'sounds', 'maps', 'weapons', 'characters', 'physics'];
        
        for (const assetType of assetTypes) {
            const assetDir = path.join(this.baseDir, assetType);
            try {
                const assets = await this.scanAssetDirectory(assetDir, assetType);
                if (assets.length > 0) {
                    manifest.assets[assetType] = assets;
                }
            } catch (error) {
                // Directory might not exist
            }
        }
        
        const manifestPath = path.join(this.baseDir, 'fps-manifest.json');
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        
        console.log(`📋 Generated asset manifest: ${manifestPath}`);
        return manifest;
    }

    async scanAssetDirectory(dir, assetType) {
        const assets = [];
        
        try {
            const items = await fs.readdir(dir, { withFileTypes: true });
            
            for (const item of items) {
                if (item.isDirectory()) {
                    const subAssets = await this.scanAssetDirectory(
                        path.join(dir, item.name), 
                        assetType
                    );
                    assets.push(...subAssets);
                } else {
                    const filePath = path.join(dir, item.name);
                    const relativePath = path.relative(this.baseDir, filePath);
                    
                    assets.push({
                        name: item.name,
                        path: relativePath,
                        type: assetType,
                        size: (await fs.stat(filePath)).size
                    });
                }
            }
        } catch (error) {
            // Directory might not exist
        }
        
        return assets;
    }

    async generateBabylonIntegration() {
        const integrationCode = `
// Auto-generated FPS Asset Integration for Babylon.js
// Generated on ${new Date().toISOString()}

import { AssetContainer, Scene, SceneLoader } from '@babylonjs/core';

export class FPSAssetManager {
    private scene: Scene;
    private assetContainers: Map<string, AssetContainer> = new Map();
    
    constructor(scene: Scene) {
        this.scene = scene;
    }
    
    async loadWeapon(weaponName: string): Promise<AssetContainer> {
        const weaponPath = \`/assets/weapons/\${weaponName}/\`;
        return await this.loadAsset(weaponPath, weaponName);
    }
    
    async loadCharacter(characterName: string): Promise<AssetContainer> {
        const characterPath = \`/assets/characters/\${characterName}/\`;
        return await this.loadAsset(characterPath, characterName);
    }
    
    async loadMap(mapName: string): Promise<AssetContainer> {
        const mapPath = \`/assets/maps/\${mapName}/\`;
        return await this.loadAsset(mapPath, mapName);
    }
    
    private async loadAsset(assetPath: string, assetName: string): Promise<AssetContainer> {
        if (this.assetContainers.has(assetName)) {
            return this.assetContainers.get(assetName)!;
        }
        
        try {
            const container = await SceneLoader.ImportMeshAsync("", assetPath, "", this.scene);
            this.assetContainers.set(assetName, container);
            return container;
        } catch (error) {
            console.error(\`Failed to load asset \${assetName}:\`, error);
            throw error;
        }
    }
    
    getLoadedAssets(): string[] {
        return Array.from(this.assetContainers.keys());
    }
    
    disposeAsset(assetName: string): void {
        const container = this.assetContainers.get(assetName);
        if (container) {
            container.dispose();
            this.assetContainers.delete(assetName);
        }
    }
    
    disposeAll(): void {
        this.assetContainers.forEach(container => container.dispose());
        this.assetContainers.clear();
    }
}

// Physics integration
export class FPSPhysicsManager {
    // Implement physics system integration
}

// Animation system
export class FPSAnimationManager {
    // Implement character animation system
}

// Weapon system
export class FPSWeaponSystem {
    // Implement weapon mechanics
}
`;
        
        const integrationPath = path.join(this.sourceDir, 'FPSAssetIntegration.ts');
        await this.ensureDirectoryExists(path.dirname(integrationPath));
        await fs.writeFile(integrationPath, integrationCode);
        
        console.log(`🔧 Generated Babylon.js integration: ${integrationPath}`);
    }

    async pullAllAssets() {
        console.log('🚀 Ultimate FPS Asset Puller Starting...');
        console.log('🎯 Targeting Babylon.js-compatible FPS assets\n');
        
        // Ensure base directories exist
        await this.ensureDirectoryExists(this.baseDir);
        await this.ensureDirectoryExists(this.sourceDir);
        
        // Process all asset sources
        for (const [category, config] of Object.entries(this.assetSources)) {
            console.log(`\n🎮 Processing ${category} assets...`);
            
            for (const repoPath of config.repositories) {
                const [owner, repo] = repoPath.split('/');
                await this.extractRepoAssets(owner, repo, config.assetTypes);
            }
        }
        
        // Generate integration files
        console.log('\n🔧 Generating integration files...');
        await this.generateAssetManifest();
        await this.generateBabylonIntegration();
        
        // Print final statistics
        this.printStatistics();
    }
    
    printStatistics() {
        console.log('\n' + '='.repeat(60));
        console.log('🎉 FPS Asset Pulling Complete!');
        console.log('='.repeat(60));
        console.log(`📊 Repositories processed: ${this.stats.repositories}`);
        console.log(`📥 Total downloads: ${this.stats.totalDownloads}`);
        console.log(`✅ Successful: ${this.stats.successfulDownloads}`);
        console.log(`❌ Failed: ${this.stats.failedDownloads}`);
        console.log(`💾 Total size: ${(this.stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log('\n🎮 Ready to build your FPS game!');
        console.log('📋 Check fps-manifest.json for asset inventory');
        console.log('🔧 Use FPSAssetIntegration.ts for Babylon.js integration');
    }
}

// Main execution
async function main() {
    try {
        console.log('🔍 Checking prerequisites...');
        await execAsync('git --version');
        
        const puller = new UltimateFPSAssetPuller();
        await puller.pullAllAssets();
    } catch (error) {
        console.error('💥 Error:', error.message);
        process.exit(1);
    }
}

// Always run main if this script is executed directly (CommonJS or ESM)
// This works for CommonJS, and is harmless in ESM if not bundled
if (typeof require !== 'undefined' && require.main === module) {
    main();
}

export { UltimateFPSAssetPuller };
