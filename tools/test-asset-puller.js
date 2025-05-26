// Simple test script to debug asset puller issues
console.log('🚀 Starting asset puller test...');

import { Octokit } from '@octokit/rest';
import fs from 'fs/promises';
import path from 'path';

console.log('✅ Imports successful');

// Test GitHub token and basic functionality
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN // Use environment variable
});

console.log('✅ Octokit initialized');

async function testAssetPull() {
    try {
        console.log('📦 Testing GitHub API access...');
        
        // Test with a small, known repository
        const response = await octokit.rest.repos.getContent({
            owner: 'szymor',
            repo: 'anarch',
            path: 'assets'
        });
        
        console.log('✅ GitHub API working, found assets:', response.data.length);
        
        // Test directory creation
        const testDir = 'client/public/assets/test-download';
        await fs.mkdir(testDir, { recursive: true });
        console.log('✅ Directory creation working');
        
        console.log('🎉 All tests passed! Asset puller should work.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

testAssetPull();
