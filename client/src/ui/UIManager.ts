export class UIManager {
  private fpsElement!: HTMLElement
  private crosshairElement!: HTMLElement

  constructor() {
    this.fpsElement = document.getElementById('fps') as HTMLElement
    this.crosshairElement = document.getElementById('crosshair') as HTMLElement
    this.setupUI()
  }

  private setupUI() {
    // Additional UI setup can go here
    this.updateFPS(0)
  }

  updateFPS(fps: number) {
    if (this.fpsElement) {
      this.fpsElement.textContent = `FPS: ${fps}`
      
      // Color code FPS for performance monitoring
      if (fps >= 144) {
        this.fpsElement.style.color = '#00ff00' // Green for high FPS
      } else if (fps >= 60) {
        this.fpsElement.style.color = '#ffff00' // Yellow for medium FPS
      } else {
        this.fpsElement.style.color = '#ff0000' // Red for low FPS
      }
    }
  }

  showCrosshair() {
    if (this.crosshairElement) {
      this.crosshairElement.style.display = 'block'
    }
  }

  hideCrosshair() {
    if (this.crosshairElement) {
      this.crosshairElement.style.display = 'none'
    }
  }

  showMessage(message: string, duration: number = 3000) {
    const messageDiv = document.createElement('div')
    messageDiv.style.cssText = `
      position: absolute;
      top: 50px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 5px;
      z-index: 1001;
      font-size: 18px;
    `
    messageDiv.textContent = message
    document.body.appendChild(messageDiv)

    setTimeout(() => {
      document.body.removeChild(messageDiv)
    }, duration)
  }

  createHealthBar(): HTMLElement {
    const healthBar = document.createElement('div')
    healthBar.id = 'healthBar'
    healthBar.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 20px;
      width: 200px;
      height: 20px;
      background: rgba(255,0,0,0.3);
      border: 2px solid #fff;
      border-radius: 10px;
      overflow: hidden;
    `

    const healthFill = document.createElement('div')
    healthFill.id = 'healthFill'
    healthFill.style.cssText = `
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, #ff0000, #ff4444);
      transition: width 0.3s ease;
    `

    healthBar.appendChild(healthFill)
    document.getElementById('ui')?.appendChild(healthBar)
    
    return healthBar
  }

  updateHealth(percentage: number) {
    const healthFill = document.getElementById('healthFill')
    if (healthFill) {
      healthFill.style.width = `${Math.max(0, Math.min(100, percentage))}%`
    }
  }

  createAmmoCounter(): HTMLElement {
    const ammoCounter = document.createElement('div')
    ammoCounter.id = 'ammoCounter'
    ammoCounter.style.cssText = `
      position: absolute;
      bottom: 20px;
      right: 20px;
      color: #ffffff;
      font-size: 24px;
      font-weight: bold;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    `
    ammoCounter.textContent = '30 / 90'
    
    document.getElementById('ui')?.appendChild(ammoCounter)
    return ammoCounter
  }

  updateAmmo(current: number, reserve: number) {
    const ammoCounter = document.getElementById('ammoCounter')
    if (ammoCounter) {
      ammoCounter.textContent = `${current} / ${reserve}`
    }
  }

  showGameMenu() {
    const menu = document.createElement('div')
    menu.id = 'gameMenu'
    menu.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 2000;
      color: white;
      font-size: 24px;
    `
    
    menu.innerHTML = `
      <h1>SLIME FPS</h1>
      <button onclick="this.parentElement.remove()" style="
        margin: 10px;
        padding: 15px 30px;
        font-size: 18px;
        background: #444;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
      ">Resume Game</button>
      <button style="
        margin: 10px;
        padding: 15px 30px;
        font-size: 18px;
        background: #444;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
      ">Settings</button>
      <button style="
        margin: 10px;
        padding: 15px 30px;
        font-size: 18px;
        background: #444;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
      ">Exit Game</button>
    `
    
    document.body.appendChild(menu)
  }

  createWeaponHUD(): HTMLElement {
    const weaponHUD = document.createElement('div')
    weaponHUD.id = 'weaponHUD'
    weaponHUD.style.cssText = `
      position: absolute;
      bottom: 20px;
      right: 20px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 15px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      min-width: 200px;
      border: 2px solid #444;
    `

    weaponHUD.innerHTML = `
      <div id="weaponName" style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">No Weapon</div>
      <div id="ammoCount" style="font-size: 16px;">0 / 0</div>
      <div id="reloadStatus" style="font-size: 14px; color: #ff6b6b; margin-top: 5px;"></div>
    `

    document.body.appendChild(weaponHUD)
    return weaponHUD
  }

  updateWeaponHUD(weaponInfo: { weapon: string; ammo: number; totalAmmo: number; isReloading: boolean } | null) {
    const weaponName = document.getElementById('weaponName')
    const ammoCount = document.getElementById('ammoCount')
    const reloadStatus = document.getElementById('reloadStatus')

    if (!weaponInfo) {
      if (weaponName) weaponName.textContent = 'No Weapon'
      if (ammoCount) ammoCount.textContent = '0 / 0'
      if (reloadStatus) reloadStatus.textContent = ''
      return
    }

    if (weaponName) weaponName.textContent = weaponInfo.weapon
    if (ammoCount) {
      ammoCount.textContent = `${weaponInfo.ammo} / ${weaponInfo.totalAmmo}`
      // Color code ammo based on amount
      if (weaponInfo.ammo === 0) {
        ammoCount.style.color = '#ff4757' // Red for empty
      } else if (weaponInfo.ammo <= 3) {
        ammoCount.style.color = '#ffa502' // Orange for low
      } else {
        ammoCount.style.color = '#2ed573' // Green for good
      }
    }
    if (reloadStatus) {
      reloadStatus.textContent = weaponInfo.isReloading ? 'RELOADING...' : ''
      reloadStatus.style.display = weaponInfo.isReloading ? 'block' : 'none'
    }
  }

  showWeaponSwitchIndicator(weaponName: string) {
    const indicator = document.createElement('div')
    indicator.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.9);
      color: #2ed573;
      padding: 20px 40px;
      border-radius: 10px;
      font-size: 24px;
      font-weight: bold;
      z-index: 1002;
      border: 2px solid #2ed573;
    `
    indicator.textContent = weaponName
    document.body.appendChild(indicator)

    setTimeout(() => {
      document.body.removeChild(indicator)
    }, 1000)
  }

  /**
   * Updates the crosshair for third-person view
   * Centers it based on the player's aim direction
   * @param visible Whether the crosshair should be visible
   */
  updateThirdPersonCrosshair(visible: boolean = true) {
    if (!this.crosshairElement) return;
    
    if (visible) {
      // Make crosshair visible with third-person styling
      this.crosshairElement.style.display = 'block';
      
      // Use a different style for third-person mode
      this.crosshairElement.classList.add('third-person-crosshair');
      
      // Make it slightly larger for better visibility at a distance
      this.crosshairElement.style.width = '12px';
      this.crosshairElement.style.height = '12px';
    } else {
      this.crosshairElement.style.display = 'none';
      this.crosshairElement.classList.remove('third-person-crosshair');
    }
  }

  /**
   * Creates a HUD for weapons in third-person view
   * Shows weapon name, ammo count, etc.
   */
  createThirdPersonWeaponHUD() {
    // Create container for weapon HUD
    const weaponHUD = document.createElement('div');
    weaponHUD.id = 'weapon-hud';
    weaponHUD.style.cssText = `
      position: absolute;
      bottom: 20px;
      right: 20px;
      background: rgba(0,0,0,0.5);
      color: white;
      padding: 10px;
      border-radius: 5px;
      font-family: 'Arial', sans-serif;
      font-size: 14px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    `;
    
    // Create weapon name element
    const weaponName = document.createElement('div');
    weaponName.id = 'weapon-name';
    weaponName.style.cssText = `
      font-weight: bold;
      margin-bottom: 5px;
    `;
    weaponName.textContent = 'Pistol';
    
    // Create ammo counter
    const ammoCounter = document.createElement('div');
    ammoCounter.id = 'ammo-counter';
    ammoCounter.style.cssText = `
      font-family: 'Courier New', monospace;
    `;
    ammoCounter.textContent = '12 / 36';
    
    // Add elements to HUD
    weaponHUD.appendChild(weaponName);
    weaponHUD.appendChild(ammoCounter);
      // Add HUD to document
    document.body.appendChild(weaponHUD);
  }

  /**
   * Updates the UI for third-person mode
   * @param show Whether to show third-person UI elements
   */
  setupThirdPersonUI(show: boolean = true): void {
    // Update crosshair for third-person view
    this.updateThirdPersonCrosshair(show);
    
    // Create weapon HUD if it doesn't exist
    if (show && !document.getElementById('weapon-hud')) {
      this.createThirdPersonWeaponHUD();
    }
  }
}
