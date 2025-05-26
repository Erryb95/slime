console.log('🚀 Simple test starting...');

async function simpleTest() {
    console.log('📊 Environment check:');
    console.log('- Node version:', process.version);
    console.log('- Platform:', process.platform);
    console.log('- GitHub token set:', !!process.env.GITHUB_TOKEN);
    
    if (process.env.GITHUB_TOKEN) {
        console.log('- Token prefix:', process.env.GITHUB_TOKEN.substring(0, 8) + '...');
    }
    
    console.log('✅ Simple test completed');
}

simpleTest().catch(console.error);
