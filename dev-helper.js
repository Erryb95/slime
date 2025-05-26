#!/usr/bin/env node
/**
 * SLIME FPS Development Helper
 * Enhanced development tools for competitive FPS game development
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class SLIMEDevHelper {
    constructor() {
        this.processes = new Map();
        this.startTime = Date.now();
        this.stats = {
            clientRestarts: 0,
            serverRestarts: 0,
            assetReloads: 0
        };
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const colors = {
            info: '\x1b[36m',  // Cyan
            success: '\x1b[32m', // Green
            warning: '\x1b[33m', // Yellow
            error: '\x1b[31m',   // Red
            reset: '\x1b[0m'
        };
        
        console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
    }

    async checkPorts() {
        return new Promise((resolve) => {
            const checkPort = (port, name) => {
                return new Promise((res) => {
                    const { spawn } = require('child_process');
                    const netstat = spawn('netstat', ['-an']);
                    
                    let output = '';
                    netstat.stdout.on('data', (data) => {
                        output += data.toString();
                    });
                    
                    netstat.on('close', () => {
                        const isUsed = output.includes(`:${port}`);
                        res({ port, name, isUsed });
                    });
                });
            };

            Promise.all([
                checkPort(3001, 'Vite Client'),
                checkPort(2567, 'Colyseus Server')
            ]).then(resolve);
        });
    }

    async getAssetStats() {
        const assetDir = path.join(__dirname, 'client', 'public', 'assets');
        const stats = {
            totalAssets: 0,
            gltfFiles: 0,
            babylonFiles: 0,
            collections: 0
        };

        try {
            const collections = await fs.promises.readdir(assetDir);
            stats.collections = collections.length;

            for (const collection of collections) {
                const collectionPath = path.join(assetDir, collection);
                const stat = await fs.promises.stat(collectionPath);
                
                if (stat.isDirectory()) {
                    const files = await this.getFilesRecursive(collectionPath);
                    stats.totalAssets += files.length;
                    stats.gltfFiles += files.filter(f => f.endsWith('.gltf')).length;
                    stats.babylonFiles += files.filter(f => f.endsWith('.babylon')).length;
                }
            }
        } catch (error) {
            this.log(`Asset stats error: ${error.message}`, 'warning');
        }

        return stats;
    }

    async getFilesRecursive(dir) {
        const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
        const files = await Promise.all(dirents.map((dirent) => {
            const res = path.resolve(dir, dirent.name);
            return dirent.isDirectory() ? this.getFilesRecursive(res) : res;
        }));
        return Array.prototype.concat(...files);
    }

    async showDevStatus() {
        this.log('🚀 SLIME FPS Development Status', 'info');
        this.log('=' * 50, 'info');

        // Port status
        const ports = await this.checkPorts();
        ports.forEach(({ port, name, isUsed }) => {
            const status = isUsed ? '✅ RUNNING' : '❌ STOPPED';
            const color = isUsed ? 'success' : 'error';
            this.log(`${name}: ${status} on port ${port}`, color);
        });

        // Asset status
        const assetStats = await this.getAssetStats();
        this.log(`📦 Assets: ${assetStats.totalAssets} files in ${assetStats.collections} collections`, 'info');
        this.log(`   - GLTF: ${assetStats.gltfFiles} files`, 'info');
        this.log(`   - Babylon: ${assetStats.babylonFiles} files`, 'info');

        // Development stats
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        this.log(`⏱️  Session uptime: ${uptime}s`, 'info');
        this.log(`🔄 Stats: Client: ${this.stats.clientRestarts}, Server: ${this.stats.serverRestarts}`, 'info');

        // Quick links
        this.log('🌐 Quick Links:', 'success');
        this.log('   - Game: http://localhost:3001/test-enhanced-fps-assets.html', 'success');
        this.log('   - Assets: http://localhost:3001/test-asset-loading.html', 'success');
        this.log('   - Monitor: http://localhost:2567/colyseus', 'success');
        this.log('   - Playground: http://localhost:2567/playground', 'success');
    }

    async restartClient() {
        this.log('🔄 Restarting Vite client...', 'warning');
        this.stats.clientRestarts++;
        
        // Kill existing client process if any
        if (this.processes.has('client')) {
            this.processes.get('client').kill();
            this.processes.delete('client');
        }

        // Start new client process
        const clientProcess = spawn('npm', ['run', 'dev'], {
            cwd: path.join(__dirname, 'client'),
            shell: true,
            stdio: 'inherit'
        });

        this.processes.set('client', clientProcess);
        this.log('✅ Client restarted', 'success');
    }

    async restartServer() {
        this.log('🔄 Restarting Colyseus server...', 'warning');
        this.stats.serverRestarts++;
        
        // Kill existing server process if any
        if (this.processes.has('server')) {
            this.processes.get('server').kill();
            this.processes.delete('server');
        }

        // Start new server process
        const serverProcess = spawn('npm', ['run', 'dev'], {
            cwd: path.join(__dirname, 'server'),
            shell: true,
            stdio: 'inherit'
        });

        this.processes.set('server', serverProcess);
        this.log('✅ Server restarted', 'success');
    }

    async pullAssets() {
        this.log('📦 Pulling latest assets...', 'info');
        this.stats.assetReloads++;

        return new Promise((resolve, reject) => {
            const assetProcess = spawn('node', ['tools/pullAssetsWindows.js'], {
                shell: true,
                stdio: 'inherit'
            });

            assetProcess.on('close', (code) => {
                if (code === 0) {
                    this.log('✅ Assets updated successfully', 'success');
                    resolve();
                } else {
                    this.log(`❌ Asset update failed with code ${code}`, 'error');
                    reject(new Error(`Asset update failed: ${code}`));
                }
            });
        });
    }

    async startInteractiveMode() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.log('🎮 SLIME FPS Interactive Development Mode', 'success');
        this.log('Commands: status, restart-client, restart-server, pull-assets, quit', 'info');

        const handleCommand = async (input) => {
            const command = input.trim().toLowerCase();

            switch (command) {
                case 'status':
                case 's':
                    await this.showDevStatus();
                    break;
                
                case 'restart-client':
                case 'rc':
                    await this.restartClient();
                    break;
                
                case 'restart-server':
                case 'rs':
                    await this.restartServer();
                    break;
                
                case 'pull-assets':
                case 'pa':
                    await this.pullAssets();
                    break;
                
                case 'quit':
                case 'q':
                case 'exit':
                    this.log('👋 Goodbye!', 'success');
                    rl.close();
                    return;
                
                default:
                    this.log('❓ Unknown command. Available: status, restart-client, restart-server, pull-assets, quit', 'warning');
            }

            rl.question('SLIME> ', handleCommand);
        };

        rl.question('SLIME> ', handleCommand);
    }
}

// CLI Interface
const command = process.argv[2];
const helper = new SLIMEDevHelper();

switch (command) {
    case 'status':
        helper.showDevStatus();
        break;
    
    case 'interactive':
    case 'i':
        helper.startInteractiveMode();
        break;
    
    case 'restart-client':
        helper.restartClient();
        break;
    
    case 'restart-server':
        helper.restartServer();
        break;
    
    case 'pull-assets':
        helper.pullAssets();
        break;
    
    default:
        console.log(`
🚀 SLIME FPS Development Helper

Usage: node dev-helper.js [command]

Commands:
  status           Show development status
  interactive      Start interactive mode
  restart-client   Restart Vite client
  restart-server   Restart Colyseus server
  pull-assets      Download latest assets

Examples:
  node dev-helper.js status
  node dev-helper.js interactive
        `);
}
