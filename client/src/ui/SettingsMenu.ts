// SLIME FPS - Settings Menu System
// Provides graphics settings, keybind configuration, and game preferences

export interface GraphicsSettings {
  renderQuality: 'low' | 'medium' | 'high' | 'ultra';
  targetFPS: 60 | 120 | 240;
  antialiasing: boolean;
  vsync: boolean;
  shadowQuality: 'off' | 'low' | 'medium' | 'high';
  textureQuality: 'low' | 'medium' | 'high';
  particleEffects: boolean;
  bloom: boolean;
  fov: number; // 60-120 degrees
}

export interface KeybindSettings {
  moveForward: string;
  moveBackward: string;
  moveLeft: string;
  moveRight: string;
  jump: string;
  crouch: string;
  sprint: string;
  shoot: string;
  reload: string;
  weapon1: string;
  weapon2: string;
  weapon3: string;
  weapon4: string;
  interact: string;
  inventory: string;
  map: string;
  chat: string;
  scoreboard: string;
  menu: string;
}

export interface AudioSettings {
  masterVolume: number; // 0-100
  sfxVolume: number;
  musicVolume: number;
  voiceVolume: number;
  footstepVolume: number;
  weaponVolume: number;
}

export interface GameplaySettings {
  mouseSensitivity: number; // 0.1-10.0
  invertMouseY: boolean;
  autoReload: boolean;
  autoWeaponSwitch: boolean;
  showCrosshair: boolean;
  showFPS: boolean;
  showPing: boolean;
  chatFilter: boolean;
}

export interface AllSettings {
  graphics: GraphicsSettings;
  keybinds: KeybindSettings;
  audio: AudioSettings;
  gameplay: GameplaySettings;
}

export class SettingsMenu {
  private container: HTMLElement;
  private isVisible: boolean = false;
  private settings: AllSettings;
  private onCloseCallback?: () => void;

  constructor(containerId: string = 'settingsMenu') {
    this.container = document.getElementById(containerId) || this.createContainer(containerId);
    this.settings = this.loadSettings();
    this.createUI();
    this.bindEvents();
  }

  private createContainer(id: string): HTMLElement {
    const container = document.createElement('div');
    container.id = id;
    document.body.appendChild(container);
    return container;
  }

  private getDefaultSettings(): AllSettings {
    return {
      graphics: {
        renderQuality: 'high',
        targetFPS: 240,
        antialiasing: true,
        vsync: false,
        shadowQuality: 'medium',
        textureQuality: 'high',
        particleEffects: true,
        bloom: true,
        fov: 90
      },
      keybinds: {
        moveForward: 'W',
        moveBackward: 'S',
        moveLeft: 'A',
        moveRight: 'D',
        jump: 'Space',
        crouch: 'C',
        sprint: 'Shift',
        shoot: 'Mouse0',
        reload: 'R',
        weapon1: '1',
        weapon2: '2',
        weapon3: '3',
        weapon4: '4',
        interact: 'E',
        inventory: 'I',
        map: 'M',
        chat: 'T',
        scoreboard: 'Tab',
        menu: 'Escape'
      },
      audio: {
        masterVolume: 80,
        sfxVolume: 90,
        musicVolume: 60,
        voiceVolume: 100,
        footstepVolume: 70,
        weaponVolume: 95
      },
      gameplay: {
        mouseSensitivity: 2.5,
        invertMouseY: false,
        autoReload: true,
        autoWeaponSwitch: false,
        showCrosshair: true,
        showFPS: true,
        showPing: true,
        chatFilter: true
      }
    };
  }

  private loadSettings(): AllSettings {
    try {
      const saved = localStorage.getItem('slimefps-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure all properties exist
        return {
          ...this.getDefaultSettings(),
          ...parsed,
          graphics: { ...this.getDefaultSettings().graphics, ...parsed.graphics },
          keybinds: { ...this.getDefaultSettings().keybinds, ...parsed.keybinds },
          audio: { ...this.getDefaultSettings().audio, ...parsed.audio },
          gameplay: { ...this.getDefaultSettings().gameplay, ...parsed.gameplay }
        };
      }
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error);
    }
    return this.getDefaultSettings();
  }

  private saveSettings(): void {
    try {
      localStorage.setItem('slimefps-settings', JSON.stringify(this.settings));
      console.log('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  private createUI(): void {
    this.container.innerHTML = `
      <div class="settings-overlay">
        <div class="settings-modal">
          <div class="settings-header">
            <h2>⚙️ Settings</h2>
            <button class="close-btn" data-action="close">✕</button>
          </div>
          
          <div class="settings-content">
            <div class="settings-tabs">
              <button class="tab-btn active" data-tab="graphics">🎮 Graphics</button>
              <button class="tab-btn" data-tab="keybinds">⌨️ Controls</button>
              <button class="tab-btn" data-tab="audio">🔊 Audio</button>
              <button class="tab-btn" data-tab="gameplay">🎯 Gameplay</button>
            </div>
            
            <div class="settings-panels">
              <div id="graphics-panel" class="settings-panel active">
                ${this.createGraphicsPanel()}
              </div>
              
              <div id="keybinds-panel" class="settings-panel">
                ${this.createKeybindsPanel()}
              </div>
              
              <div id="audio-panel" class="settings-panel">
                ${this.createAudioPanel()}
              </div>
              
              <div id="gameplay-panel" class="settings-panel">
                ${this.createGameplayPanel()}
              </div>
            </div>
          </div>
          
          <div class="settings-footer">
            <button class="btn btn-secondary" data-action="reset">Reset to Defaults</button>
            <div class="footer-right">
              <button class="btn btn-secondary" data-action="cancel">Cancel</button>
              <button class="btn btn-primary" data-action="save">Save & Close</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.addStyles();
    this.updateUIFromSettings();
  }

  private createGraphicsPanel(): string {
    return `
      <div class="setting-group">
        <h3>Performance</h3>
        <div class="setting-item">
          <label>Render Quality</label>
          <select id="renderQuality">
            <option value="low">Low (Best Performance)</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="ultra">Ultra (Best Quality)</option>
          </select>
        </div>
        
        <div class="setting-item">
          <label>Target FPS</label>
          <select id="targetFPS">
            <option value="60">60 FPS</option>
            <option value="120">120 FPS</option>
            <option value="240">240 FPS (Competitive)</option>
          </select>
        </div>
        
        <div class="setting-item">
          <label>Field of View</label>
          <input type="range" id="fov" min="60" max="120" step="5">
          <span class="range-value" id="fov-value">90°</span>
        </div>
      </div>
      
      <div class="setting-group">
        <h3>Visual Quality</h3>
        <div class="setting-item">
          <label>Anti-aliasing</label>
          <input type="checkbox" id="antialiasing">
        </div>
        
        <div class="setting-item">
          <label>V-Sync</label>
          <input type="checkbox" id="vsync">
        </div>
        
        <div class="setting-item">
          <label>Shadow Quality</label>
          <select id="shadowQuality">
            <option value="off">Off</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        
        <div class="setting-item">
          <label>Texture Quality</label>
          <select id="textureQuality">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        
        <div class="setting-item">
          <label>Particle Effects</label>
          <input type="checkbox" id="particleEffects">
        </div>
        
        <div class="setting-item">
          <label>Bloom Effects</label>
          <input type="checkbox" id="bloom">
        </div>
      </div>
    `;
  }

  private createKeybindsPanel(): string {
    const keybinds = [
      { key: 'moveForward', label: 'Move Forward' },
      { key: 'moveBackward', label: 'Move Backward' },
      { key: 'moveLeft', label: 'Move Left' },
      { key: 'moveRight', label: 'Move Right' },
      { key: 'jump', label: 'Jump' },
      { key: 'crouch', label: 'Crouch' },
      { key: 'sprint', label: 'Sprint' },
      { key: 'shoot', label: 'Shoot' },
      { key: 'reload', label: 'Reload' },
      { key: 'weapon1', label: 'Weapon 1' },
      { key: 'weapon2', label: 'Weapon 2' },
      { key: 'weapon3', label: 'Weapon 3' },
      { key: 'weapon4', label: 'Weapon 4' },
      { key: 'interact', label: 'Interact' },
      { key: 'inventory', label: 'Inventory' },
      { key: 'map', label: 'Map' },
      { key: 'chat', label: 'Chat' },
      { key: 'scoreboard', label: 'Scoreboard' },
      { key: 'menu', label: 'Menu' }
    ];

    return `
      <div class="keybinds-grid">
        ${keybinds.map(bind => `
          <div class="keybind-item">
            <label>${bind.label}</label>
            <button class="keybind-btn" data-bind="${bind.key}" id="${bind.key}">
              ${this.settings.keybinds[bind.key as keyof KeybindSettings]}
            </button>
          </div>
        `).join('')}
      </div>
      
      <div class="keybind-help">
        <p>Click on a key to rebind it. Press the new key you want to assign.</p>
        <p>Use "Mouse0" for left click, "Mouse1" for right click, "Mouse2" for middle click.</p>
      </div>
    `;
  }

  private createAudioPanel(): string {
    return `
      <div class="setting-group">
        <h3>Volume Levels</h3>
        <div class="setting-item">
          <label>Master Volume</label>
          <input type="range" id="masterVolume" min="0" max="100" step="5">
          <span class="range-value" id="masterVolume-value">80%</span>
        </div>
        
        <div class="setting-item">
          <label>Sound Effects</label>
          <input type="range" id="sfxVolume" min="0" max="100" step="5">
          <span class="range-value" id="sfxVolume-value">90%</span>
        </div>
        
        <div class="setting-item">
          <label>Music</label>
          <input type="range" id="musicVolume" min="0" max="100" step="5">
          <span class="range-value" id="musicVolume-value">60%</span>
        </div>
        
        <div class="setting-item">
          <label>Voice Chat</label>
          <input type="range" id="voiceVolume" min="0" max="100" step="5">
          <span class="range-value" id="voiceVolume-value">100%</span>
        </div>
        
        <div class="setting-item">
          <label>Footsteps</label>
          <input type="range" id="footstepVolume" min="0" max="100" step="5">
          <span class="range-value" id="footstepVolume-value">70%</span>
        </div>
        
        <div class="setting-item">
          <label>Weapons</label>
          <input type="range" id="weaponVolume" min="0" max="100" step="5">
          <span class="range-value" id="weaponVolume-value">95%</span>
        </div>
      </div>
    `;
  }

  private createGameplayPanel(): string {
    return `
      <div class="setting-group">
        <h3>Mouse & Movement</h3>
        <div class="setting-item">
          <label>Mouse Sensitivity</label>
          <input type="range" id="mouseSensitivity" min="0.1" max="10" step="0.1">
          <span class="range-value" id="mouseSensitivity-value">2.5</span>
        </div>
        
        <div class="setting-item">
          <label>Invert Mouse Y-Axis</label>
          <input type="checkbox" id="invertMouseY">
        </div>
      </div>
      
      <div class="setting-group">
        <h3>Gameplay</h3>
        <div class="setting-item">
          <label>Auto Reload</label>
          <input type="checkbox" id="autoReload">
        </div>
        
        <div class="setting-item">
          <label>Auto Weapon Switch</label>
          <input type="checkbox" id="autoWeaponSwitch">
        </div>
        
        <div class="setting-item">
          <label>Show Crosshair</label>
          <input type="checkbox" id="showCrosshair">
        </div>
      </div>
      
      <div class="setting-group">
        <h3>HUD</h3>
        <div class="setting-item">
          <label>Show FPS Counter</label>
          <input type="checkbox" id="showFPS">
        </div>
        
        <div class="setting-item">
          <label>Show Ping</label>
          <input type="checkbox" id="showPing">
        </div>
        
        <div class="setting-item">
          <label>Chat Filter</label>
          <input type="checkbox" id="chatFilter">
        </div>
      </div>
    `;
  }

  private addStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .settings-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        font-family: 'Courier New', monospace;
      }

      .settings-modal {
        background: #1a1a1a;
        border: 2px solid #00ff41;
        border-radius: 8px;
        width: 90%;
        max-width: 800px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        color: #00ff41;
      }

      .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid #333;
      }

      .settings-header h2 {
        margin: 0;
        font-size: 24px;
      }

      .close-btn {
        background: none;
        border: none;
        color: #00ff41;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .close-btn:hover {
        background: #333;
        border-radius: 4px;
      }

      .settings-content {
        flex: 1;
        display: flex;
        overflow: hidden;
      }

      .settings-tabs {
        display: flex;
        flex-direction: column;
        background: #222;
        border-right: 1px solid #333;
        min-width: 150px;
      }

      .tab-btn {
        background: none;
        border: none;
        color: #888;
        padding: 15px;
        text-align: left;
        cursor: pointer;
        font-family: inherit;
        font-size: 14px;
        transition: all 0.2s;
      }

      .tab-btn:hover {
        background: #333;
        color: #00ff41;
      }

      .tab-btn.active {
        background: #333;
        color: #00ff41;
        border-right: 2px solid #00ff41;
      }

      .settings-panels {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }

      .settings-panel {
        display: none;
      }

      .settings-panel.active {
        display: block;
      }

      .setting-group {
        margin-bottom: 30px;
      }

      .setting-group h3 {
        color: #00ff41;
        margin-bottom: 15px;
        font-size: 16px;
        border-bottom: 1px solid #333;
        padding-bottom: 5px;
      }

      .setting-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        gap: 20px;
      }

      .setting-item label {
        flex: 1;
        color: #ccc;
      }

      .setting-item input,
      .setting-item select {
        background: #333;
        border: 1px solid #555;
        color: #00ff41;
        padding: 8px;
        border-radius: 4px;
        font-family: inherit;
        min-width: 120px;
      }

      .setting-item input[type="checkbox"] {
        min-width: auto;
        width: 18px;
        height: 18px;
      }

      .setting-item input[type="range"] {
        flex: 1;
        max-width: 150px;
      }

      .range-value {
        color: #00ff41;
        font-weight: bold;
        min-width: 50px;
        text-align: right;
      }

      .keybinds-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 15px;
        margin-bottom: 20px;
      }

      .keybind-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 15px;
      }

      .keybind-btn {
        background: #333;
        border: 1px solid #555;
        color: #00ff41;
        padding: 8px 15px;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        min-width: 80px;
        text-align: center;
      }

      .keybind-btn:hover {
        background: #444;
      }

      .keybind-btn.listening {
        background: #004400;
        border-color: #00ff41;
        animation: pulse 1s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }

      .keybind-help {
        background: #222;
        padding: 15px;
        border-radius: 4px;
        border-left: 3px solid #00ff41;
      }

      .keybind-help p {
        margin: 5px 0;
        color: #ccc;
        font-size: 12px;
      }

      .settings-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-top: 1px solid #333;
      }

      .footer-right {
        display: flex;
        gap: 10px;
      }

      .btn {
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 14px;
        transition: all 0.2s;
      }

      .btn-primary {
        background: #00ff41;
        color: #000;
      }

      .btn-primary:hover {
        background: #00cc33;
      }

      .btn-secondary {
        background: #333;
        color: #ccc;
        border: 1px solid #555;
      }

      .btn-secondary:hover {
        background: #444;
        color: #00ff41;
      }
    `;
    document.head.appendChild(style);
  }

  private bindEvents(): void {
    // Tab switching
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      if (target.classList.contains('tab-btn')) {
        const tabName = target.dataset.tab;
        if (tabName) {
          this.switchTab(tabName);
        }
      }
      
      // Button actions
      if (target.dataset.action) {
        switch (target.dataset.action) {
          case 'close':
          case 'cancel':
            this.hide();
            break;
          case 'save':
            this.saveCurrentSettings();
            this.hide();
            break;
          case 'reset':
            this.resetToDefaults();
            break;
        }
      }
    });

    // Range input updates
    this.container.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.type === 'range') {
        const valueSpan = document.getElementById(`${target.id}-value`);
        if (valueSpan) {
          let value = target.value;
          if (target.id === 'fov') value += '°';
          else if (target.id.includes('Volume') || target.id === 'masterVolume') value += '%';
          valueSpan.textContent = value;
        }
      }
    });

    // Keybind listening
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('keybind-btn')) {
        this.startKeybindListening(target);
      }
    });

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        e.preventDefault();
        this.hide();
      }
    });
  }
  private switchTab(tabName: string): void {
    // Update tab buttons
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    this.container.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

    // Update panels
    this.container.querySelectorAll('.settings-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    this.container.querySelector(`#${tabName}-panel`)?.classList.add('active');
  }

  private updateUIFromSettings(): void {
    // Graphics
    (document.getElementById('renderQuality') as HTMLSelectElement).value = this.settings.graphics.renderQuality;
    (document.getElementById('targetFPS') as HTMLSelectElement).value = this.settings.graphics.targetFPS.toString();
    (document.getElementById('fov') as HTMLInputElement).value = this.settings.graphics.fov.toString();
    (document.getElementById('fov-value') as HTMLElement).textContent = this.settings.graphics.fov + '°';
    (document.getElementById('antialiasing') as HTMLInputElement).checked = this.settings.graphics.antialiasing;
    (document.getElementById('vsync') as HTMLInputElement).checked = this.settings.graphics.vsync;
    (document.getElementById('shadowQuality') as HTMLSelectElement).value = this.settings.graphics.shadowQuality;
    (document.getElementById('textureQuality') as HTMLSelectElement).value = this.settings.graphics.textureQuality;
    (document.getElementById('particleEffects') as HTMLInputElement).checked = this.settings.graphics.particleEffects;
    (document.getElementById('bloom') as HTMLInputElement).checked = this.settings.graphics.bloom;

    // Audio
    Object.keys(this.settings.audio).forEach(key => {
      const input = document.getElementById(key) as HTMLInputElement;
      const value = this.settings.audio[key as keyof AudioSettings];
      if (input) {
        input.value = value.toString();
        const valueSpan = document.getElementById(`${key}-value`);
        if (valueSpan) valueSpan.textContent = value + '%';
      }
    });

    // Gameplay
    (document.getElementById('mouseSensitivity') as HTMLInputElement).value = this.settings.gameplay.mouseSensitivity.toString();
    (document.getElementById('mouseSensitivity-value') as HTMLElement).textContent = this.settings.gameplay.mouseSensitivity.toString();
    (document.getElementById('invertMouseY') as HTMLInputElement).checked = this.settings.gameplay.invertMouseY;
    (document.getElementById('autoReload') as HTMLInputElement).checked = this.settings.gameplay.autoReload;
    (document.getElementById('autoWeaponSwitch') as HTMLInputElement).checked = this.settings.gameplay.autoWeaponSwitch;
    (document.getElementById('showCrosshair') as HTMLInputElement).checked = this.settings.gameplay.showCrosshair;
    (document.getElementById('showFPS') as HTMLInputElement).checked = this.settings.gameplay.showFPS;
    (document.getElementById('showPing') as HTMLInputElement).checked = this.settings.gameplay.showPing;
    (document.getElementById('chatFilter') as HTMLInputElement).checked = this.settings.gameplay.chatFilter;

    // Keybinds
    Object.keys(this.settings.keybinds).forEach(key => {
      const btn = document.getElementById(key) as HTMLElement;
      if (btn) {
        btn.textContent = this.settings.keybinds[key as keyof KeybindSettings];
      }
    });
  }

  private saveCurrentSettings(): void {
    // Graphics
    this.settings.graphics.renderQuality = (document.getElementById('renderQuality') as HTMLSelectElement).value as any;
    this.settings.graphics.targetFPS = parseInt((document.getElementById('targetFPS') as HTMLSelectElement).value) as any;
    this.settings.graphics.fov = parseInt((document.getElementById('fov') as HTMLInputElement).value);
    this.settings.graphics.antialiasing = (document.getElementById('antialiasing') as HTMLInputElement).checked;
    this.settings.graphics.vsync = (document.getElementById('vsync') as HTMLInputElement).checked;
    this.settings.graphics.shadowQuality = (document.getElementById('shadowQuality') as HTMLSelectElement).value as any;
    this.settings.graphics.textureQuality = (document.getElementById('textureQuality') as HTMLSelectElement).value as any;
    this.settings.graphics.particleEffects = (document.getElementById('particleEffects') as HTMLInputElement).checked;
    this.settings.graphics.bloom = (document.getElementById('bloom') as HTMLInputElement).checked;

    // Audio
    Object.keys(this.settings.audio).forEach(key => {
      const input = document.getElementById(key) as HTMLInputElement;
      if (input) {
        this.settings.audio[key as keyof AudioSettings] = parseFloat(input.value);
      }
    });

    // Gameplay
    this.settings.gameplay.mouseSensitivity = parseFloat((document.getElementById('mouseSensitivity') as HTMLInputElement).value);
    this.settings.gameplay.invertMouseY = (document.getElementById('invertMouseY') as HTMLInputElement).checked;
    this.settings.gameplay.autoReload = (document.getElementById('autoReload') as HTMLInputElement).checked;
    this.settings.gameplay.autoWeaponSwitch = (document.getElementById('autoWeaponSwitch') as HTMLInputElement).checked;
    this.settings.gameplay.showCrosshair = (document.getElementById('showCrosshair') as HTMLInputElement).checked;
    this.settings.gameplay.showFPS = (document.getElementById('showFPS') as HTMLInputElement).checked;
    this.settings.gameplay.showPing = (document.getElementById('showPing') as HTMLInputElement).checked;
    this.settings.gameplay.chatFilter = (document.getElementById('chatFilter') as HTMLInputElement).checked;

    this.saveSettings();
  }

  private resetToDefaults(): void {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      this.settings = this.getDefaultSettings();
      this.updateUIFromSettings();
    }
  }

  private startKeybindListening(button: HTMLElement): void {
    const bindKey = button.dataset.bind;
    if (!bindKey) return;

    button.classList.add('listening');
    button.textContent = 'Press key...';

    const handleKeyPress = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      let keyName = e.key;
      
      // Handle special keys
      if (e.key === ' ') keyName = 'Space';
      else if (e.key === 'Control') keyName = 'Ctrl';
      else if (e.key === 'Alt') keyName = 'Alt';
      else if (e.key === 'Shift') keyName = 'Shift';
      else if (e.key === 'Tab') keyName = 'Tab';
      else if (e.key === 'Enter') keyName = 'Enter';
      else if (e.key === 'Escape') keyName = 'Escape';

      // Update the setting
      this.settings.keybinds[bindKey as keyof KeybindSettings] = keyName;
      
      // Update UI
      button.classList.remove('listening');
      button.textContent = keyName;

      // Remove event listener
      document.removeEventListener('keydown', handleKeyPress, true);
    };

    const handleMouseClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      let keyName = `Mouse${e.button}`;
      
      // Update the setting
      this.settings.keybinds[bindKey as keyof KeybindSettings] = keyName;
      
      // Update UI
      button.classList.remove('listening');
      button.textContent = keyName;

      // Remove event listeners
      document.removeEventListener('keydown', handleKeyPress, true);
      document.removeEventListener('mousedown', handleMouseClick, true);
    };

    // Listen for key or mouse input
    document.addEventListener('keydown', handleKeyPress, true);
    document.addEventListener('mousedown', handleMouseClick, true);

    // Cancel on escape
    const cancelHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        button.classList.remove('listening');
        button.textContent = this.settings.keybinds[bindKey as keyof KeybindSettings];
        document.removeEventListener('keydown', handleKeyPress, true);
        document.removeEventListener('mousedown', handleMouseClick, true);
        document.removeEventListener('keydown', cancelHandler, true);
      }
    };
    document.addEventListener('keydown', cancelHandler, true);
  }

  public show(): void {
    this.container.style.display = 'flex';
    this.isVisible = true;
    this.updateUIFromSettings();
  }

  public hide(): void {
    this.container.style.display = 'none';
    this.isVisible = false;
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }

  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  public getSettings(): AllSettings {
    return { ...this.settings };
  }

  public onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  public isOpen(): boolean {
    return this.isVisible;
  }
}
