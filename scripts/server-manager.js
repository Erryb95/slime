#!/usr/bin/env node

import { exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_PORT = 2567;
const CLIENT_PORT = 3001;
const PID_FILE = path.join(__dirname, '..', 'server', '.server.pid');

class ServerManager {
  async checkPortInUse(port) {
    return new Promise((resolve) => {
      exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
        if (error || !stdout) {
          resolve(false);
        } else {
          const listening = stdout.split('\n').find(line => line.includes('LISTENING'));
          resolve(!!listening);
        }
      });
    });
  }

  async killProcessOnPort(port) {
    return new Promise((resolve) => {
      exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
        if (error || !stdout) {
          resolve(false);
          return;
        }

        const lines = stdout.split('\n');
        const listening = lines.find(line => line.includes('LISTENING'));
        
        if (listening) {
          const parts = listening.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          
          if (pid && pid !== '0') {
            console.log(`🔄 Killing process ${pid} on port ${port}...`);
            exec(`taskkill /PID ${pid} /F`, (killError) => {
              if (killError) {
                console.warn(`⚠️  Could not kill process ${pid}:`, killError.message);
                resolve(false);
              } else {
                console.log(`✅ Successfully killed process ${pid}`);
                resolve(true);
              }
            });
          } else {
            resolve(false);
          }
        } else {
          resolve(false);
        }
      });
    });
  }

  async stopServer() {
    console.log('🛑 Stopping SLIME server...');
    
    // Try to read PID file first
    if (fs.existsSync(PID_FILE)) {
      try {
        const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
        console.log(`📝 Found PID file with process ${pid}`);
        
        exec(`taskkill /PID ${pid} /F`, (error) => {
          if (error) {
            console.warn(`⚠️  Could not kill process ${pid} from PID file`);
          } else {
            console.log(`✅ Killed process ${pid} from PID file`);
          }
        });
        
        fs.unlinkSync(PID_FILE);
      } catch (error) {
        console.warn('⚠️  Could not read PID file:', error.message);
      }
    }
    
    // Also check port directly
    const killed = await this.killProcessOnPort(SERVER_PORT);
    if (!killed) {
      console.log('ℹ️  No process found on port', SERVER_PORT);
    }
  }

  async startServer() {
    console.log('🚀 Starting SLIME server...');
    
    // First ensure any existing server is stopped
    await this.stopServer();
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if port is still in use
    const inUse = await this.checkPortInUse(SERVER_PORT);
    if (inUse) {
      console.error(`❌ Port ${SERVER_PORT} is still in use after cleanup attempt`);
      process.exit(1);
    }
    
    // Start the server
    const serverPath = path.join(__dirname, '..', 'server');
    console.log(`📁 Starting server from: ${serverPath}`);
    
    const server = spawn('npm', ['run', 'dev'], {
      cwd: serverPath,
      stdio: 'inherit',
      shell: true
    });
    
    server.on('error', (error) => {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    });
    
    server.on('exit', (code) => {
      console.log(`🛑 Server exited with code ${code}`);
    });
    
    // Handle cleanup
    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping server...');
      server.kill('SIGINT');
      await this.stopServer();
      process.exit(0);
    });
  }

  async restartServer() {
    console.log('🔄 Restarting SLIME server...');
    await this.stopServer();
    await new Promise(resolve => setTimeout(resolve, 3000));
    await this.startServer();
  }

  async status() {
    const inUse = await this.checkPortInUse(SERVER_PORT);
    const pidExists = fs.existsSync(PID_FILE);
    
    console.log('📊 SLIME Server Status:');
    console.log(`   Port ${SERVER_PORT}:`, inUse ? '🟢 In Use' : '🔴 Free');
    console.log(`   PID File:`, pidExists ? '🟢 Exists' : '🔴 Missing');
    
    if (pidExists) {
      try {
        const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
        console.log(`   Process ID: ${pid}`);
      } catch (error) {
        console.log(`   PID File Error: ${error.message}`);
      }
    }
  }
}

// CLI Interface
const manager = new ServerManager();
const command = process.argv[2];

switch (command) {
  case 'start':
    manager.startServer();
    break;
  case 'stop':
    manager.stopServer().then(() => process.exit(0));
    break;
  case 'restart':
    manager.restartServer();
    break;
  case 'status':
    manager.status().then(() => process.exit(0));
    break;
  case 'clean':
    manager.stopServer().then(() => {
      console.log('🧹 Server cleanup completed');
      process.exit(0);
    });
    break;
  default:
    console.log('🎮 SLIME Server Manager');
    console.log('');
    console.log('Usage: node server-manager.js <command>');
    console.log('');
    console.log('Commands:');
    console.log('  start    - Start the server');
    console.log('  stop     - Stop the server');
    console.log('  restart  - Restart the server');
    console.log('  status   - Show server status');
    console.log('  clean    - Clean up any stuck processes');
    console.log('');
    process.exit(0);
}
