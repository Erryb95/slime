// Simple test of the Ultimate FPS Asset Puller functionality
console.log('🚀 Testing Ultimate FPS Asset Puller...');

import { Octokit } from '@octokit/rest';

console.log('✅ Octokit imported successfully');

try {
    const octokit = new Octokit({
        auth: 'ghp_hPGTJ0jqr6uy3dG1HqTMn7K8tPILdP4U8TY1' // GitHub token from the script
    });
    
    console.log('✅ Octokit instance created');
    
    // Test a simple API call
    const response = await octokit.rest.repos.get({
        owner: 'BabylonJS',
        repo: 'Babylon.js'
    });
    
    console.log(`✅ API test successful: ${response.data.name}`);
    console.log(`📊 Repository: ${response.data.full_name}`);
    console.log(`⭐ Stars: ${response.data.stargazers_count}`);
    
} catch (error) {
    console.error('❌ Error:', error.message);
    if (error.status) {
        console.error(`📄 Status: ${error.status}`);
    }
}
