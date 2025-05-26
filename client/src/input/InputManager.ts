export class InputManager3D {
  private canvas: HTMLCanvasElement
  private keys: Map<string, boolean> = new Map()
  private mousePosition = { x: 0, y: 0 }
  private mouseDelta = { x: 0, y: 0 }
  private isPointerLocked = false
  private onPrimaryFire?: () => void
  private onSecondaryFire?: () => void
  private onReload?: () => void
  private onWeaponSwitch?: (slot: number) => void
  
  // Advanced movement callbacks
  private onDash?: () => void
  private onSlide?: () => void
  private onTimeSlow?: () => void
  private onGrapple?: () => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.setupEventListeners()
  }

  private setupEventListeners() {
    // Keyboard events
    document.addEventListener('keydown', (event) => {
      this.keys.set(event.code, true)
      this.handleKeyDown(event)
    })

    document.addEventListener('keyup', (event) => {
      this.keys.set(event.code, false)
    })

    // Mouse events
    this.canvas.addEventListener('click', () => {
      this.requestPointerLock()
    })

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas
    })

    document.addEventListener('mousemove', (event) => {
      if (this.isPointerLocked) {
        this.mouseDelta.x = event.movementX
        this.mouseDelta.y = event.movementY
      } else {
        this.mousePosition.x = event.clientX
        this.mousePosition.y = event.clientY
      }
    })

    // Mouse buttons
    this.canvas.addEventListener('mousedown', (event) => {
      this.handleMouseDown(event)
    })

    this.canvas.addEventListener('mouseup', (event) => {
      this.handleMouseUp(event)
    })

    // Prevent context menu
    this.canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault()
    })
  }

  private handleKeyDown(event: KeyboardEvent) {
    // Handle specific key actions
    switch (event.code) {
      case 'Escape':
        if (this.isPointerLocked) {
          document.exitPointerLock()
        }
        break
      case 'KeyF':
        // Toggle fullscreen
        if (!document.fullscreenElement) {
          this.canvas.requestFullscreen()
        } else {
          document.exitFullscreen()
        }
        break
      case 'KeyR':
        // Reload weapon
        if (this.onReload) {
          this.onReload()
        }
        break
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
        // Weapon switching
        const weaponSlot = parseInt(event.code.replace('Digit', ''))
        if (this.onWeaponSwitch) {
          this.onWeaponSwitch(weaponSlot)
        }
        break
      // Advanced movement controls
      case 'KeyE':
        // Dash
        if (this.onDash) {
          this.onDash()
        }
        break
      case 'KeyC':
        // Slide
        if (this.onSlide) {
          this.onSlide()
        }
        break
      case 'KeyQ':
        // Time slow
        if (this.onTimeSlow) {
          this.onTimeSlow()
        }
        break
      case 'KeyG':
        // Grappling hook
        if (this.onGrapple) {
          this.onGrapple()
        }
        break
    }
  }

  private handleMouseDown(event: MouseEvent) {
    if (!this.isPointerLocked) return

    switch (event.button) {
      case 0: // Left click - primary fire
        this.handlePrimaryFire()
        break
      case 2: // Right click - secondary fire/aim
        this.handleSecondaryFire()
        break
    }
  }
  private handleMouseUp(_event: MouseEvent) {
    // Handle mouse button releases
  }
  private handlePrimaryFire() {
    if (this.onPrimaryFire) {
      this.onPrimaryFire()
    }
  }

  private handleSecondaryFire() {
    if (this.onSecondaryFire) {
      this.onSecondaryFire()
    }
  }

  private requestPointerLock() {
    this.canvas.requestPointerLock()
  }

  // Public methods for checking input state
  isKeyPressed(keyCode: string): boolean {
    return this.keys.get(keyCode) || false
  }

  getMouseDelta(): { x: number, y: number } {
    const delta = { ...this.mouseDelta }
    this.mouseDelta.x = 0
    this.mouseDelta.y = 0
    return delta
  }

  getMousePosition(): { x: number, y: number } {
    return { ...this.mousePosition }
  }

  isPointerLockedActive(): boolean {
    return this.isPointerLocked
  }  // Movement input helpers
  getMovementState(): { forward: number, right: number, up: number } {
    return {
      forward: (this.isKeyPressed('KeyW') ? 1 : 0) - (this.isKeyPressed('KeyS') ? 1 : 0),
      right: (this.isKeyPressed('KeyD') ? 1 : 0) - (this.isKeyPressed('KeyA') ? 1 : 0),
      up: (this.isKeyPressed('Space') ? 1 : 0) - (this.isKeyPressed('ShiftLeft') ? 1 : 0)
    }
  }

  // Alias for getMovementState for compatibility
  getInputState(): { forward: number, right: number, up: number } {
    return this.getMovementState()
  }
  update(_deltaTime: number) {
    // Update input state if needed
  }
  // Set weapon fire callbacks
  setWeaponFireCallbacks(onPrimaryFire?: () => void, onSecondaryFire?: () => void) {
    this.onPrimaryFire = onPrimaryFire
    this.onSecondaryFire = onSecondaryFire
  }

  // Set weapon control callbacks
  setWeaponControlCallbacks(onReload?: () => void, onWeaponSwitch?: (slot: number) => void) {
    this.onReload = onReload
    this.onWeaponSwitch = onWeaponSwitch
  }

  // Set reload and weapon switch callbacks
  setReloadAndWeaponSwitchCallbacks(onReload?: () => void, onWeaponSwitch?: (slot: number) => void) {
    this.onReload = onReload
    this.onWeaponSwitch = onWeaponSwitch
  }
  
  // Advanced movement callbacks
  setAdvancedMovementCallbacks(onDash?: () => void, onSlide?: () => void, onTimeSlow?: () => void, onGrapple?: () => void) {
    this.onDash = onDash
    this.onSlide = onSlide
    this.onTimeSlow = onTimeSlow
    this.onGrapple = onGrapple
  }
}
