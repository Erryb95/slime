// Test runner for Ultimate FPS Asset Puller
import { UltimateFPSAssetPuller } from './pullUltimateFPSAssets.js';

console.log('🔍 Starting Ultimate FPS Asset Puller test...');

try {
    console.log('🔍 Checking prerequisites...');
    
    const puller = new UltimateFPSAssetPuller();
    console.log('✅ UltimateFPSAssetPuller instance created');
    
    await puller.pullAllAssets();
    
} catch (error) {
    console.error('💥 Error:', error.message);
    console.error('Stack:', error.stack);
}
