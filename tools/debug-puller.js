// Debug version of the Elite FPS Asset Puller
import { Octokit } from '@octokit/rest';

async function debugMain() {
    try {
        console.log('🚀 Starting debug test...');
        
        // Check GitHub token
        if (!process.env.GITHUB_TOKEN) {
            console.error('❌ GITHUB_TOKEN environment variable not set!');
            process.exit(1);
        }
        
        console.log('✅ GitHub token found');
        
        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN
        });
        
        console.log('🔍 Testing GitHub API connection...');
        
        // Test with a simple repository
        const { data } = await octokit.rest.repos.get({
            owner: 'BabylonJS',
            repo: 'SampleAssets'
        });
        
        console.log(`✅ Connected to GitHub API. Found repo: ${data.name}`);
        console.log(`📊 Repository stats: ${data.stargazers_count} stars, ${data.forks_count} forks`);
        
        // Test listing contents
        console.log('🔍 Listing repository contents...');
        const contents = await octokit.rest.repos.getContent({
            owner: 'BabylonJS',
            repo: 'SampleAssets',
            path: ''
        });
        
        console.log(`📁 Found ${contents.data.length} items in root directory`);
        
        console.log('🎉 Debug test completed successfully!');
        
    } catch (error) {
        console.error('💥 Debug Error:', error.message);
        if (error.status) {
            console.error(`HTTP Status: ${error.status}`);
        }
        process.exit(1);
    }
}

debugMain();
