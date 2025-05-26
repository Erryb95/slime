// Elite FPS Asset Puller with file logging
import { Octokit } from '@octokit/rest';
import fs from 'fs/promises';
import path from 'path';

class LoggingEliteAssetPuller {
    constructor() {
        this.octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN
        });
        
        this.baseDir = 'client/public/assets/elite-fps';
        this.logFile = 'tools/elite-puller.log';
        
        // Key repositories for elite FPS assets
        this.eliteRepos = [
            {
                owner: 'BabylonJS',
                repo: 'SampleAssets', 
                category: 'characters'
            },
            {
                owner: 'KhronosGroup',
                repo: 'glTF-Sample-Models',
                category: 'characters'
            }
        ];
    }

    async log(message) {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}\n`;
        await fs.appendFile(this.logFile, logLine);
        console.log(message); // Also try console
    }

    async createDirectories() {
        await this.log('📁 Creating elite-fps directory structure...');
        
        const dirs = [
            `${this.baseDir}/characters`,
            `${this.baseDir}/maps`,
            `${this.baseDir}/physics`, 
            `${this.baseDir}/animations`,
            `${this.baseDir}/systems`
        ];
        
        for (const dir of dirs) {
            await fs.mkdir(dir, { recursive: true });
            await this.log(`✅ Created: ${dir}`);
        }
    }

    async downloadFile(downloadUrl, localPath) {
        try {
            await this.log(`⬇️ Downloading: ${path.basename(localPath)}`);
            
            const response = await fetch(downloadUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const buffer = await response.arrayBuffer();
            await fs.writeFile(localPath, Buffer.from(buffer));
            
            await this.log(`✅ Downloaded: ${localPath}`);
            return true;
        } catch (error) {
            await this.log(`❌ Failed to download ${localPath}: ${error.message}`);
            return false;
        }
    }

    async exploreRepository(owner, repo, category) {
        try {
            await this.log(`🔍 Exploring ${owner}/${repo} for ${category}...`);
            
            const { data: contents } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: ''
            });
            
            await this.log(`📊 Found ${contents.length} items in ${owner}/${repo}`);
            
            const assetExtensions = ['.gltf', '.glb', '.babylon', '.fbx', '.obj'];
            let downloadCount = 0;
            
            for (const item of contents) {
                if (item.type === 'file') {
                    const ext = path.extname(item.name).toLowerCase();
                    if (assetExtensions.includes(ext)) {
                        const localPath = path.join(this.baseDir, category, item.name);
                        const success = await this.downloadFile(item.download_url, localPath);
                        if (success) downloadCount++;
                        
                        if (downloadCount >= 2) break; // Limit for testing
                    }
                }
            }
            
            await this.log(`✅ Downloaded ${downloadCount} assets from ${owner}/${repo}`);
            
        } catch (error) {
            await this.log(`❌ Error exploring ${owner}/${repo}: ${error.message}`);
        }
    }

    async pullEliteAssets() {
        // Clear log file
        await fs.writeFile(this.logFile, '');
        
        await this.log('🚀 Starting Elite FPS Asset Pull...');
        
        try {
            await this.createDirectories();
            
            for (const repo of this.eliteRepos) {
                await this.exploreRepository(repo.owner, repo.repo, repo.category);
            }
            
            // Create manifest
            const manifest = {
                pullDate: new Date().toISOString(),
                repositories: this.eliteRepos.map(r => `${r.owner}/${r.repo}`),
                status: 'completed'
            };
            
            await fs.writeFile(
                path.join(this.baseDir, 'manifest.json'),
                JSON.stringify(manifest, null, 2)
            );
            
            await this.log('🎉 Elite FPS asset pull completed!');
            
        } catch (error) {
            await this.log(`💥 Fatal error: ${error.message}`);
            throw error;
        }
    }
}

async function main() {
    try {
        const puller = new LoggingEliteAssetPuller();
        await puller.pullEliteAssets();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
