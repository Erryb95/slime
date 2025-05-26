// Ultimate FPS Asset Puller with File Logging
import { Octokit } from '@octokit/rest';
import fs from 'fs/promises';
import path from 'path';

const logFile = 'ultimate-puller.log';

async function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    await fs.appendFile(logFile, logMessage);
}

async function main() {
    try {
        await log('🚀 Ultimate FPS Asset Puller Starting...');
        
        const octokit = new Octokit({
            auth: 'ghp_hPGTJ0jqr6uy3dG1HqTMn7K8tPILdP4U8TY1'
        });
        
        await log('✅ Octokit client created');
        
        // Test API connection
        const testRepo = await octokit.rest.repos.get({
            owner: 'BabylonJS',
            repo: 'Babylon.js'
        });
        
        await log(`✅ API connection successful: ${testRepo.data.name}`);
        
        // List some Babylon.js assets
        const contents = await octokit.rest.repos.getContent({
            owner: 'BabylonJS',
            repo: 'Babylon.js',
            path: 'Tools/Gulp/helpers'
        });
        
        await log(`📁 Found ${contents.data.length} items in BabylonJS helpers`);
        
        // Check for asset files
        let assetCount = 0;
        for (const item of contents.data) {
            if (item.type === 'file') {
                const ext = path.extname(item.name).toLowerCase();
                if (['.gltf', '.glb', '.babylon', '.obj', '.fbx'].includes(ext)) {
                    await log(`🎯 Found asset: ${item.name}`);
                    assetCount++;
                }
            }
        }
        
        await log(`📊 Total assets found: ${assetCount}`);
        
        // Try to download a sample file
        const baseDir = 'client/public/assets/ultimate-test';
        await fs.mkdir(baseDir, { recursive: true });
        await log(`📁 Created directory: ${baseDir}`);
        
        await log('🎉 Ultimate FPS Asset Puller Test Complete!');
        
    } catch (error) {
        await log(`❌ Error: ${error.message}`);
        if (error.stack) {
            await log(`📜 Stack: ${error.stack}`);
        }
    }
}

main().catch(console.error);
