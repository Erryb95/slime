// Windows-optimized FPS Asset Puller for SLIME
// Pulls the best FPS game assets from verified GitHub repositories

import { Octokit } from '@octokit/rest';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('🚀 SLIME FPS Asset Puller (Windows) Starting...');
console.log('📦 Targeting high-quality FPS assets for Babylon.js\n');

class WindowsFPSAssetPuller {
    constructor() {
        this.octokit = new Octokit({
            auth: 'ghp_hPGTJ0jqr6uy3dG1HqTMn7K8tPILdP4U8TY1'
        });
        
        this.baseDir = 'client/public/assets';
        this.sourceDir = 'client/src/assets';
        
        // Verified working repositories with high-quality FPS assets
        this.assetSources = [
            {
                name: 'Babylon.js Official Assets',
                owner: 'BabylonJS',
                repo: 'SampleAssets',
                path: '',
                types: ['models', 'textures', 'animations'],
                priority: 'high'
            },
            {
                name: 'Professional FPS Maps',
                owner: 'Calinou',
                repo: 'game-maps-obj',
                path: '',
                types: ['maps', 'textures'],
                priority: 'high'
            },
            {
                name: 'Physics Engine',
                owner: 'dimforge',
                repo: 'rapier.js',
                path: '',
                types: ['physics', 'wasm'],
                priority: 'medium'
            },
            {
                name: 'GLTF Sample Models',
                owner: 'KhronosGroup',
                repo: 'glTF-Sample-Models',
                path: '2.0',
                types: ['models', 'textures', 'animations'],
                priority: 'high'
            },
            {
                name: 'Retro FPS Assets',
                owner: 'szymor',
                repo: 'anarch',
                path: 'assets',
                types: ['textures', 'sprites', 'weapons'],
                priority: 'medium'
            }
        ];
        
        this.stats = {
            repositories: 0,
            downloads: 0,
            successes: 0,
            failures: 0,
            totalSize: 0
        };
    }

    async ensureDirectory(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            return true;
        } catch (error) {
            console.warn(`⚠️  Could not create ${dirPath}:`, error.message);
            return false;
        }
    }

    async downloadFile(url, targetPath) {
        try {
            console.log(`📥 Downloading: ${path.basename(targetPath)}`);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            await this.ensureDirectory(path.dirname(targetPath));
            await fs.writeFile(targetPath, buffer);
            
            this.stats.totalSize += buffer.length;
            this.stats.successes++;
            
            console.log(`✅ Downloaded: ${path.basename(targetPath)} (${(buffer.length / 1024).toFixed(1)} KB)`);
            return true;
            
        } catch (error) {
            this.stats.failures++;
            console.warn(`❌ Failed to download ${url}:`, error.message);
            return false;
        }
    }

    async cloneRepository(owner, repo, targetDir) {
        try {
            console.log(`\n🔄 Cloning ${owner}/${repo}...`);
            
            // Check if directory already exists
            try {
                await fs.access(targetDir);
                console.log(`📁 Repository already exists: ${targetDir}`);
                return true;
            } catch {
                // Directory doesn't exist, proceed with clone
            }
            
            await this.ensureDirectory(path.dirname(targetDir));
            
            const repoUrl = `https://github.com/${owner}/${repo}.git`;
            const cloneCommand = `git clone --depth 1 "${repoUrl}" "${targetDir}"`;
            
            await execAsync(cloneCommand);
            console.log(`✅ Cloned: ${owner}/${repo}`);
            
            this.stats.repositories++;
            return true;
            
        } catch (error) {
            console.warn(`❌ Failed to clone ${owner}/${repo}:`, error.message);
            return false;
        }
    }

    async extractAssets(repoDir, assetTypes, targetCategory) {
        try {
            const assetExtensions = {
                models: ['.babylon', '.gltf', '.glb', '.obj', '.fbx'],
                textures: ['.jpg', '.jpeg', '.png', '.webp', '.tga', '.dds'],
                animations: ['.babylon', '.gltf', '.glb', '.fbx'],
                sounds: ['.wav', '.mp3', '.ogg'],
                maps: ['.babylon', '.obj', '.gltf'],
                physics: ['.wasm', '.js'],
                sprites: ['.png', '.jpg', '.jpeg'],
                weapons: ['.babylon', '.gltf', '.glb', '.obj', '.png']
            };
            
            const files = await this.getAllFiles(repoDir);
            let extracted = 0;
            
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                const fileName = path.basename(file);
                
                // Check if file matches desired asset types
                for (const assetType of assetTypes) {
                    if (assetExtensions[assetType]?.includes(ext)) {
                        const relativePath = path.relative(repoDir, file);
                        const targetPath = path.join(
                            this.baseDir, 
                            targetCategory, 
                            path.basename(repoDir),
                            relativePath
                        );
                        
                        try {
                            await this.ensureDirectory(path.dirname(targetPath));
                            await fs.copyFile(file, targetPath);
                            
                            console.log(`📄 Extracted ${assetType}: ${fileName}`);
                            extracted++;
                            this.stats.downloads++;
                            
                        } catch (error) {
                            console.warn(`⚠️  Failed to copy ${fileName}:`, error.message);
                        }
                        
                        break; // Don't duplicate same file for multiple types
                    }
                }
            }
            
            console.log(`📦 Extracted ${extracted} assets from repository`);
            return extracted;
            
        } catch (error) {
            console.warn(`⚠️  Error extracting assets:`, error.message);
            return 0;
        }
    }

    async getAllFiles(dir) {
        const files = [];
        
        try {
            const items = await fs.readdir(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                if (item.isDirectory() && !item.name.startsWith('.')) {
                    // Skip large directories that might cause issues
                    if (!['node_modules', '.git', 'dist', 'build'].includes(item.name)) {
                        files.push(...await this.getAllFiles(fullPath));
                    }
                } else if (item.isFile()) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Directory might not be accessible
        }
        
        return files;
    }

    async processRepository(source) {
        try {
            console.log(`\n🎯 Processing: ${source.name}`);
            console.log(`📍 Repository: ${source.owner}/${source.repo}`);
            
            // Check if repository exists
            try {
                await this.octokit.rest.repos.get({
                    owner: source.owner,
                    repo: source.repo
                });
            } catch (error) {
                if (error.status === 404) {
                    console.log(`⚠️  Repository ${source.owner}/${source.repo} not found`);
                    return false;
                }
                throw error;
            }
            
            // Clone repository
            const repoDir = path.join('temp', `${source.owner}-${source.repo}`);
            const cloned = await this.cloneRepository(source.owner, source.repo, repoDir);
            
            if (!cloned) return false;
            
            // Extract assets
            const targetCategory = source.types[0]; // Use primary type as category
            const extracted = await this.extractAssets(repoDir, source.types, targetCategory);
            
            console.log(`✅ Completed: ${source.name} (${extracted} assets)`);
            return extracted > 0;
            
        } catch (error) {
            console.error(`💥 Error processing ${source.name}:`, error.message);
            return false;
        }
    }

    async generateManifest() {
        const manifest = {
            version: "2.0.0",
            generated: new Date().toISOString(),
            platform: "Windows",
            engine: "Babylon.js",
            stats: this.stats,
            assets: {}
        };
        
        try {
            // Scan asset directories
            const assetCategories = ['models', 'textures', 'maps', 'sounds', 'physics'];
            
            for (const category of assetCategories) {
                const categoryDir = path.join(this.baseDir, category);
                try {
                    const assets = await this.scanAssetCategory(categoryDir);
                    if (assets.length > 0) {
                        manifest.assets[category] = assets;
                    }
                } catch (error) {
                    // Category might not exist
                }
            }
            
            const manifestPath = path.join(this.baseDir, 'windows-manifest.json');
            await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
            
            console.log(`📋 Generated manifest: ${manifestPath}`);
            
        } catch (error) {
            console.warn(`⚠️  Could not generate manifest:`, error.message);
        }
    }

    async scanAssetCategory(categoryDir) {
        const assets = [];
        
        try {
            const items = await fs.readdir(categoryDir, { withFileTypes: true });
            
            for (const item of items) {
                if (item.isFile()) {
                    const filePath = path.join(categoryDir, item.name);
                    const stats = await fs.stat(filePath);
                    const relativePath = path.relative(this.baseDir, filePath);
                    
                    assets.push({
                        name: item.name,
                        path: relativePath.replace(/\\/g, '/'), // Use forward slashes for web
                        size: stats.size,
                        modified: stats.mtime.toISOString()
                    });
                }
            }
        } catch (error) {
            // Directory might not exist
        }
        
        return assets;
    }

    async pullAllAssets() {
        console.log('🔍 Checking prerequisites...');
        
        try {
            await execAsync('git --version');
            console.log('✅ Git is available');
        } catch (error) {
            console.error('❌ Git is required but not found');
            process.exit(1);
        }
        
        // Ensure base directories exist
        await this.ensureDirectory(this.baseDir);
        await this.ensureDirectory('temp');
        
        console.log('\n🎮 Starting FPS asset collection...');
        
        // Process high priority assets first
        const highPriority = this.assetSources.filter(s => s.priority === 'high');
        const mediumPriority = this.assetSources.filter(s => s.priority === 'medium');
        
        for (const source of highPriority) {
            await this.processRepository(source);
        }
        
        for (const source of mediumPriority) {
            await this.processRepository(source);
        }
        
        // Generate asset manifest
        await this.generateManifest();
        
        // Print final statistics
        this.printStatistics();
    }

    printStatistics() {
        console.log('\n' + '='.repeat(60));
        console.log('🎉 Windows FPS Asset Pulling Complete!');
        console.log('='.repeat(60));
        console.log(`📊 Repositories processed: ${this.stats.repositories}`);
        console.log(`📥 Total downloads: ${this.stats.downloads}`);
        console.log(`✅ Successful: ${this.stats.successes}`);
        console.log(`❌ Failed: ${this.stats.failures}`);
        console.log(`💾 Total size: ${(this.stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log('\n🎮 Assets ready for SLIME FPS!');
        console.log('📁 Check client/public/assets/ for downloaded content');
        console.log('📋 See windows-manifest.json for asset inventory');
        console.log('\n💡 Next steps:');
        console.log('   1. Run "Client: Dev Server" task to start development');
        console.log('   2. Open fps-demo.html to test the game');
        console.log('   3. Use CompleteFPSGame.ts for integration');
    }
}

// Main execution
async function main() {
    try {
        const puller = new WindowsFPSAssetPuller();
        await puller.pullAllAssets();
    } catch (error) {
        console.error('💥 Fatal error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Auto-run when called directly
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
    main();
}

export { WindowsFPSAssetPuller };
