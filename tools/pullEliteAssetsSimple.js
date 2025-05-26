// Simplified Elite FPS Asset Puller - Focus on key assets first
import { Octokit } from '@octokit/rest';
import fs from 'fs/promises';
import path from 'path';

class SimplifiedEliteAssetPuller {
    constructor() {
        this.octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN
        });
        
        this.baseDir = 'client/public/assets/elite-fps';
        
        // Start with just a few high-quality repositories
        this.targetRepos = [
            {
                owner: 'BabylonJS',
                repo: 'SampleAssets',
                category: 'characters',
                paths: ['models/']
            },
            {
                owner: 'KhronosGroup', 
                repo: 'glTF-Sample-Models',
                category: 'characters',
                paths: ['2.0/']
            }
        ];
    }

    async createDirectories() {
        console.log('📁 Creating elite-fps directory structure...');
        
        const dirs = [
            `${this.baseDir}/characters`,
            `${this.baseDir}/maps`, 
            `${this.baseDir}/physics`,
            `${this.baseDir}/animations`,
            `${this.baseDir}/systems`
        ];
        
        for (const dir of dirs) {
            await fs.mkdir(dir, { recursive: true });
            console.log(`✅ Created: ${dir}`);
        }
    }

    async downloadFile(downloadUrl, localPath) {
        try {
            console.log(`⬇️ Downloading: ${path.basename(localPath)}`);
            
            const response = await fetch(downloadUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const buffer = await response.arrayBuffer();
            await fs.writeFile(localPath, Buffer.from(buffer));
            
            console.log(`✅ Downloaded: ${localPath}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to download ${localPath}:`, error.message);
            return false;
        }
    }

    async exploreRepository(owner, repo, category) {
        try {
            console.log(`🔍 Exploring ${owner}/${repo} for ${category}...`);
            
            // Get repository contents
            const { data: contents } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: ''
            });
            
            console.log(`📊 Found ${contents.length} items in ${owner}/${repo}`);
            
            // Look for asset files
            const assetExtensions = ['.gltf', '.glb', '.babylon', '.fbx', '.obj', '.dae'];
            let downloadCount = 0;
            
            for (const item of contents) {
                if (item.type === 'file') {
                    const ext = path.extname(item.name).toLowerCase();
                    if (assetExtensions.includes(ext)) {
                        const localPath = path.join(this.baseDir, category, item.name);
                        const success = await this.downloadFile(item.download_url, localPath);
                        if (success) downloadCount++;
                        
                        // Limit downloads for testing
                        if (downloadCount >= 3) break;
                    }
                }
            }
            
            console.log(`✅ Downloaded ${downloadCount} assets from ${owner}/${repo}`);
            
        } catch (error) {
            console.error(`❌ Error exploring ${owner}/${repo}:`, error.message);
        }
    }

    async pullEliteAssets() {
        console.log('🚀 Starting Simplified Elite FPS Asset Pull...');
        
        await this.createDirectories();
        
        for (const repo of this.targetRepos) {
            await this.exploreRepository(repo.owner, repo.repo, repo.category);
        }
        
        // Create manifest
        const manifest = {
            pullDate: new Date().toISOString(),
            repositories: this.targetRepos.map(r => `${r.owner}/${r.repo}`),
            categories: ['characters', 'maps', 'physics', 'animations', 'systems']
        };
        
        await fs.writeFile(
            path.join(this.baseDir, 'manifest.json'),
            JSON.stringify(manifest, null, 2)
        );
        
        console.log('🎉 Elite FPS asset pull completed!');
        console.log(`📁 Assets saved to: ${this.baseDir}`);
    }
}

async function main() {
    try {
        console.log('🔥 SIMPLIFIED ELITE FPS ASSET PULLER 🔥');
        
        if (!process.env.GITHUB_TOKEN) {
            console.error('❌ GITHUB_TOKEN environment variable not set!');
            process.exit(1);
        }
        
        console.log('✅ GitHub token found');
        
        const puller = new SimplifiedEliteAssetPuller();
        await puller.pullEliteAssets();
        
    } catch (error) {
        console.error('💥 Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
