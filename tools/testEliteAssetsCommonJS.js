// CommonJS version for testing
const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;
const path = require('path');

async function testEliteAssetPull() {
    console.log('🚀 Testing Elite Asset Pull with CommonJS...');
    
    try {
        if (!process.env.GITHUB_TOKEN) {
            console.error('❌ GITHUB_TOKEN not set');
            return;
        }
        
        console.log('✅ GitHub token found');
        
        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN
        });
        
        console.log('🔍 Testing GitHub API...');
        
        const { data } = await octokit.rest.repos.get({
            owner: 'BabylonJS',
            repo: 'SampleAssets'
        });
        
        console.log(`✅ Connected! Found repo: ${data.name}`);
        console.log(`📊 Stars: ${data.stargazers_count}, Size: ${data.size}KB`);
        
        // Create elite-fps directory
        const eliteDir = 'client/public/assets/elite-fps';
        await fs.mkdir(eliteDir, { recursive: true });
        console.log(`📁 Created directory: ${eliteDir}`);
        
        // Create a simple manifest
        const manifest = {
            created: new Date().toISOString(),
            status: 'test-success',
            source: 'CommonJS test'
        };
        
        await fs.writeFile(
            path.join(eliteDir, 'test-manifest.json'),
            JSON.stringify(manifest, null, 2)
        );
        
        console.log('✅ Test manifest created');
        console.log('🎉 CommonJS test completed successfully!');
        
    } catch (error) {
        console.error('💥 Error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
    }
}

testEliteAssetPull();
