// Enhanced Asset Manager for SLIME FPS - handles high-quality assets from multiple open-source projects
import { 
  Scene, 
  AssetContainer, 
  AbstractMesh, 
  Material, 
  BaseTexture, 
  AssetsManager, 
  PBRMaterial,
  StandardMaterial,
  Texture,
  SceneLoader
} from '@babylonjs/core'
import '@babylonjs/loaders/glTF' // For GLB/GLTF support
import '@babylonjs/loaders/OBJ' // For OBJ support
import { ASSET_CONFIG } from './AssetLoadingConfig.js'
import path from 'path-browserify' // Browser-compatible path module

// Asset source tracking for attribution and licensing
interface AssetSource {
  name: string;
  license: string;
  attribution?: string;
  url?: string;
}

const ASSET_SOURCES: Record<string, AssetSource> = {
  unity: {
    name: 'Unity FPS Sample',
    license: 'Unity-Default-License',
    url: 'https://github.com/Unity-Technologies/FPSSample'
  },
  kenney: {
    name: 'KenneyNL Starter Kit FPS',
    license: 'MIT/CC0',
    attribution: 'Kenney (www.kenney.nl)',
    url: 'https://github.com/KenneyNL/Starter-Kit-FPS'
  },
  dahoom: {
    name: 'TheDahoom FPS Multiplayer Template',
    license: 'MIT',
    url: 'https://github.com/TheDahoom/FPS-Multiplayer-Template'
  },
  miziziziz: {
    name: 'Retro 3D Graphics Collection',
    license: 'CC0/Public Domain',
    attribution: 'Miziziziz',
    url: 'https://github.com/Miziziziz/Retro3DGraphicsCollection'
  },
  anarch: {
    name: 'Anarch Public Domain FPS',
    license: 'CC0/Public Domain',
    url: 'https://github.com/szymor/anarch'
  },
  custom: {
    name: 'Custom Assets',
    license: 'Various'
  }
}

// Simple browser-compatible event emitter
class SimpleEventEmitter {
  private events: Map<string, Array<(...args: any[]) => void>> = new Map()

  on(event: string, callback: (...args: any[]) => void): void {
    if (!this.events.has(event)) {
      this.events.set(event, [])
    }
    this.events.get(event)!.push(callback)
  }

  emit(event: string, ...args: any[]): void {
    const callbacks = this.events.get(event)
    if (callbacks) {
      callbacks.forEach(callback => callback(...args))
    }
  }
}

interface LoadedAsset {
  name: string
  meshes: AbstractMesh[]
  materials: Material[]
  textures: BaseTexture[]
  container: AssetContainer
  category: string
  source: string // Track asset source for attribution
  license: string // Track license for compliance
}

// Progress tracking interface
interface LoadingProgress {
  total: number
  loaded: number
  percentage: number
}

export class EnhancedAssetManager {
  private scene: Scene
  private loadedAssets: Map<string, LoadedAsset> = new Map()
  private assetCache: Map<string, AssetContainer> = new Map()
  private textureCache: Map<string, Texture> = new Map()
  private loadingPromises: Map<string, Promise<AssetContainer>> = new Map()
  private baseUrl: string
  private eventEmitter = new SimpleEventEmitter()
  private sourceTracking: Map<string, AssetSource> = new Map()

  constructor(scene: Scene, baseUrl = '/assets/') {
    this.scene = scene
    this.baseUrl = baseUrl
    this.initializeSourceTracking()
  }

  private initializeSourceTracking(): void {
    Object.entries(ASSET_SOURCES).forEach(([key, source]) => {
      this.sourceTracking.set(key, source)
    })
  }

  /**
   * Subscribe to asset loading events
   * @param event Event name: 'progress', 'asset-loaded', 'critical-assets-loaded', 'all-assets-loaded'
   * @param callback Callback function
   */
  on(event: string, callback: (...args: any[]) => void): void {
    this.eventEmitter.on(event, callback)
  }

  /**
   * Preload essential assets for immediate gameplay with prioritization
   */
  async preloadAssets(): Promise<void> {
    console.log('🎮 Preloading essential FPS assets from Unity FPS Sample...')
    
    try {
      // PHASE 1: Load critical gameplay assets first (weapons, player model)
      console.log('📦 Loading critical gameplay assets...')
      await Promise.all([
        this.loadCharacter('yBot', 'default').then(() => {
          this.eventEmitter.emit('asset-loaded', { type: 'character', id: 'yBot' })
        }),
        this.loadWeapon('ak47', 'default').then(() => {
          this.eventEmitter.emit('asset-loaded', { type: 'weapon', id: 'ak47' })
        })
      ])
      
      this.eventEmitter.emit('critical-assets-loaded')
      console.log('✅ Critical assets loaded successfully!')
      
      // PHASE 2: Load map in parallel with less critical assets
      console.log('🗺️ Loading game map...')
      
      // Start map loading but don't await it yet
      const mapPromise = this.loadMap('firstLevel').then(() => {
        this.eventEmitter.emit('asset-loaded', { type: 'map', id: 'firstLevel' })
        this.eventEmitter.emit('map-ready')
        console.log('✅ Map loaded successfully!')
      })
      
      // PHASE 3: Load remaining assets progressively
      this.loadRemainingAssetsProgressively()
      
      // Now wait for the map to finish
      await mapPromise
      
      console.log('✅ All essential assets preloaded successfully!')
      this.eventEmitter.emit('all-assets-loaded')
      
    } catch (error) {
      console.error('❌ Asset preloading failed:', error)
      throw error
    }
  }
  
  /**
   * Load remaining assets in a progressive, non-blocking manner
   */
  private async loadRemainingAssetsProgressively(): Promise<void> {
    console.log('🔄 Loading additional assets progressively...')
    
    // Create a queue of non-critical assets to load
    const assetQueue: Array<{type: string, id: string, skinId?: string}> = [
      // Additional weapons with default skins
      { type: 'weapon', id: 'mp5', skinId: 'default' },
      { type: 'weapon', id: 'pistol', skinId: 'default' },
      
      // Additional characters
      { type: 'character', id: 'xBot', skinId: 'default' },
      
      // Additional weapon skins
      { type: 'weapon', id: 'ak47', skinId: 'gold' },
    ]
    
    const totalAssets = assetQueue.length
    let loadedAssets = 0
    
    // Load assets in small batches to avoid blocking the main thread
    const batchSize = 2
    
    for (let i = 0; i < assetQueue.length; i += batchSize) {
      const batch = assetQueue.slice(i, i + batchSize)
      const batchPromises = batch.map(async (asset) => {
        try {
          if (asset.type === 'weapon') {
            await this.loadWeapon(asset.id, asset.skinId)
          } else if (asset.type === 'character') {
            await this.loadCharacter(asset.id, asset.skinId)
          }
          
          loadedAssets++
          this.eventEmitter.emit('progress', {
            total: totalAssets,
            loaded: loadedAssets,
            percentage: Math.floor((loadedAssets / totalAssets) * 100)
          } as LoadingProgress)
          
          this.eventEmitter.emit('asset-loaded', asset)
        } catch (error) {
          console.warn(`Failed to load ${asset.type} ${asset.id}:`, error)
        }
      })
      
      // Wait for current batch to complete before starting next batch
      await Promise.all(batchPromises)
      
      // Small delay to avoid blocking the main thread
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    console.log('✅ Progressive asset loading complete')
  }

  /**
   * Enhanced weapon loading with multi-format support
   */
  async loadWeapon(weaponId: string, skinId: string = 'default'): Promise<LoadedAsset> {
    const cacheKey = `weapon_${weaponId}_${skinId}`
    
    if (this.loadedAssets.has(cacheKey)) {
      return this.loadedAssets.get(cacheKey)!
    }

    const weaponConfig = ASSET_CONFIG.weapons[weaponId]
    if (!weaponConfig) {
      throw new Error(`Weapon ${weaponId} not found in asset configuration`)
    }

    const skinConfig = weaponConfig.skins[skinId]
    if (!skinConfig) {
      console.warn(`Skin ${skinId} not found for weapon ${weaponId}, using default`)
      skinId = 'default'
    }

    try {
      const container = await this.loadAssetContainerAdvanced(weaponConfig.model)
      const sourceInfo = this.getAssetSource(weaponConfig.source) || ASSET_SOURCES.custom
      
      const loadedAsset: LoadedAsset = {
        name: `${weaponId}_${skinId}`,
        meshes: container.meshes,
        materials: container.materials,
        textures: container.textures,
        container,
        category: 'weapons',
        source: weaponConfig.source,
        license: sourceInfo.license
      }

      // Apply skin textures if available
      const finalSkinConfig = weaponConfig.skins[skinId]
      if (finalSkinConfig?.textures) {
        await this.applySkinTextures(loadedAsset, finalSkinConfig.textures)
      }
      
      this.loadedAssets.set(cacheKey, loadedAsset)
      console.log(`✅ Loaded weapon: ${weaponId} with skin: ${skinId} (Source: ${sourceInfo.name})`)
      return loadedAsset
    } catch (error) {
      console.error(`❌ Failed to load weapon ${weaponId}:`, error)
      throw error
    }
  }

  /**
   * Enhanced character loading with animation support
   */
  async loadCharacter(characterId: string, skinId: string = 'default'): Promise<LoadedAsset> {
    const cacheKey = `character_${characterId}_${skinId}`
    
    if (this.loadedAssets.has(cacheKey)) {
      return this.loadedAssets.get(cacheKey)!
    }

    const characterConfig = ASSET_CONFIG.characters[characterId]
    if (!characterConfig) {
      throw new Error(`Character ${characterId} not found in asset configuration`)
    }

    const skinConfig = characterConfig.skins[skinId]
    if (!skinConfig) {
      console.warn(`Skin ${skinId} not found for character ${characterId}, using default`)
      skinId = 'default'
    }

    try {
      const container = await this.loadAssetContainerAdvanced(characterConfig.model)
      const sourceInfo = this.getAssetSource(characterConfig.source) || ASSET_SOURCES.custom
      
      const loadedAsset: LoadedAsset = {
        name: `${characterId}_${skinId}`,
        meshes: container.meshes,
        materials: container.materials,
        textures: container.textures,
        container,
        category: 'characters',
        source: characterConfig.source,
        license: sourceInfo.license
      }

      // Apply skin textures if available
      const finalSkinConfig = characterConfig.skins[skinId]
      if (finalSkinConfig?.textures) {
        await this.applySkinTextures(loadedAsset, finalSkinConfig.textures)
      }

      // Load animations if available
      if (characterConfig.animations) {
        await this.loadCharacterAnimations(loadedAsset, characterConfig.animations)
      }
      
      this.loadedAssets.set(cacheKey, loadedAsset)
      console.log(`✅ Loaded character: ${characterId} with skin: ${skinId} (Source: ${sourceInfo.name})`)
      return loadedAsset
    } catch (error) {
      console.error(`❌ Failed to load character ${characterId}:`, error)
      throw error
    }  }

  /**
   * Load a map/level from Unity FPS Sample
   */
  async loadMap(mapId: string, mapAsset?: any): Promise<LoadedAsset> {
    const cacheKey = `map_${mapId}`
    
    if (this.loadedAssets.has(cacheKey)) {
      return this.loadedAssets.get(cacheKey)!
    }

    const mapConfig = mapAsset || ASSET_CONFIG.maps[mapId]
    if (!mapConfig) {
      throw new Error(`Map ${mapId} not found in asset configuration`)
    }

    try {
      let container: AssetContainer;
      const sourceInfo = this.getAssetSource(mapConfig.source) || ASSET_SOURCES.custom
      
      // Handle different file formats
      const fileExtension = path.extname(mapConfig.path).toLowerCase()
      
      if (fileExtension === '.obj') {
        // Special handling for OBJ files with MTL materials
        container = await this.loadOBJWithMaterials(mapConfig.path, mapConfig.textures?.material)
      } else {
        // Standard Babylon.js file loading (.babylon, .glb, .gltf)
        container = await this.loadAssetContainer(mapConfig.path)
      }
      
      const loadedAsset: LoadedAsset = {
        name: mapId,
        meshes: container.meshes,
        materials: container.materials,
        textures: container.textures,
        container,
        category: 'maps',
        source: mapConfig.source,
        license: sourceInfo.license
      }
      
      this.loadedAssets.set(cacheKey, loadedAsset)
      console.log(`✅ Loaded map: ${mapId} (Source: ${sourceInfo.name}) Format: ${fileExtension}`)
      return loadedAsset
    } catch (error) {
      console.error(`❌ Failed to load map ${mapId}:`, error)
      throw error
    }
  }

  /**
   * Load environmental props and objects
   */
  async loadProp(propId: string): Promise<LoadedAsset> {
    const cacheKey = `prop_${propId}`
    
    if (this.loadedAssets.has(cacheKey)) {
      return this.loadedAssets.get(cacheKey)!
    }

    const propConfig = ASSET_CONFIG.props?.[propId]
    if (!propConfig) {
      throw new Error(`Prop ${propId} not found in asset configuration`)
    }

    try {
      const container = await this.loadAssetContainerAdvanced(propConfig.model)
      const sourceInfo = this.getAssetSource(propConfig.source) || ASSET_SOURCES.custom
      
      const loadedAsset: LoadedAsset = {
        name: propId,
        meshes: container.meshes,
        materials: container.materials,
        textures: container.textures,
        container,
        category: propConfig.category,
        source: propConfig.source,
        license: sourceInfo.license
      }
      
      this.loadedAssets.set(cacheKey, loadedAsset)
      console.log(`✅ Loaded prop: ${propId} (Source: ${sourceInfo.name})`)
      return loadedAsset
    } catch (error) {
      console.error(`❌ Failed to load prop ${propId}:`, error)
      throw error
    }
  }

  /**
   * Get weapon meshes for gameplay - returns cloned instances
   */
  async getWeapon(weaponId: string, skinId: string = 'default'): Promise<AbstractMesh[]> {
    const asset = await this.loadWeapon(weaponId, skinId)
    return asset.meshes.map(mesh => {
      const cloned = mesh.clone(`${mesh.name}_instance_${Date.now()}`, null)
      return cloned!
    }).filter(mesh => mesh !== null)
  }

  /**
   * Get character meshes for gameplay - returns cloned instances
   */
  async getCharacter(characterId: string = 'yBot', skinId: string = 'default'): Promise<AbstractMesh[]> {
    const asset = await this.loadCharacter(characterId, skinId)
    return asset.meshes.map(mesh => {
      const cloned = mesh.clone(`${mesh.name}_instance_${Date.now()}`, null)
      return cloned!
    }).filter(mesh => mesh !== null)
  }

  /**
   * Get map meshes for gameplay - returns original meshes (maps are typically not cloned)
   */
  async getMap(mapId: string): Promise<AbstractMesh[]> {
    const asset = await this.loadMap(mapId)
    return asset.meshes
  }

  /**
   * Get prop meshes for gameplay
   */
  async getProp(propId: string): Promise<AbstractMesh[]> {
    const asset = await this.loadProp(propId)
    return asset.meshes.map(mesh => {
      const cloned = mesh.clone(`${mesh.name}_instance_${Date.now()}`, null)
      return cloned!
    }).filter(mesh => mesh !== null)
  }

  /**
   * Get available weapon skins for UI
   */
  getWeaponSkins(weaponId: string): string[] {
    const weaponConfig = ASSET_CONFIG.weapons[weaponId]
    return weaponConfig ? Object.keys(weaponConfig.skins) : []
  }

  /**
   * Get available character skins for UI
   */
  getCharacterSkins(characterId: string): string[] {
    const characterConfig = ASSET_CONFIG.characters[characterId]
    return characterConfig ? Object.keys(characterConfig.skins) : []
  }

  /**
   * Get asset loading progress 
   */
  getLoadingProgress(): LoadingProgress {
    const loaded = this.loadedAssets.size
    const total = this.loadingPromises.size + loaded
    
    return {
      total,
      loaded,
      percentage: total > 0 ? Math.floor((loaded / total) * 100) : 100
    }
  }

  /**
   * Get asset source information for attribution
   */
  getAssetSource(sourceKey: string): AssetSource | undefined {
    return this.sourceTracking.get(sourceKey)
  }

  /**
   * Get all loaded assets with their source attribution
   */
  getAssetAttribution(): Array<{assetName: string, source: AssetSource}> {
    const attributions: Array<{assetName: string, source: AssetSource}> = []
    
    this.loadedAssets.forEach((asset, name) => {
      const source = this.getAssetSource(asset.source)
      if (source) {
        attributions.push({ assetName: name, source })
      }
    })
    
    return attributions
  }

  /**
   * Private method to load asset container with caching
   */
  private async loadAssetContainer(modelPath: string): Promise<AssetContainer> {
    if (this.assetCache.has(modelPath)) {
      return this.assetCache.get(modelPath)!
    }

    if (this.loadingPromises.has(modelPath)) {
      return await this.loadingPromises.get(modelPath)!
    }

    const loadPromise = new Promise<AssetContainer>((resolve, reject) => {
      const assetsManager = new AssetsManager(this.scene)
      
      const fullPath = modelPath.startsWith('/') ? modelPath : `${this.baseUrl}${modelPath}`
      const containerTask = assetsManager.addContainerTask('loadAsset', '', '', fullPath)
      
      containerTask.onSuccess = (task) => {
        const container = task.loadedContainer
        this.assetCache.set(modelPath, container)
        this.loadingPromises.delete(modelPath)
        resolve(container)
      }
      
      containerTask.onError = (_task, message, _exception) => {
        this.loadingPromises.delete(modelPath)
        reject(new Error(`Failed to load asset ${modelPath}: ${message}`))
      }
      
      assetsManager.load()
    })

    this.loadingPromises.set(modelPath, loadPromise)
    return loadPromise
  }
  /**
   * Enhanced asset container loading with multi-format support
   */
  private async loadAssetContainerAdvanced(modelPath: string): Promise<AssetContainer> {
    if (this.assetCache.has(modelPath)) {
      return this.assetCache.get(modelPath)!
    }

    if (this.loadingPromises.has(modelPath)) {
      return await this.loadingPromises.get(modelPath)!
    }

    const loadPromise = new Promise<AssetContainer>((resolve, reject) => {
      const fullPath = modelPath.startsWith('/') ? modelPath : `${this.baseUrl}${modelPath}`
      const fileExtension = path.extname(modelPath).toLowerCase()
      
      // Determine loading method based on file format
      if (fileExtension === '.babylon') {
        // Use AssetsManager for .babylon files
        const assetsManager = new AssetsManager(this.scene)
        const containerTask = assetsManager.addContainerTask('loadAsset', '', '', fullPath)
        
        containerTask.onSuccess = (task) => {
          const container = task.loadedContainer
          this.assetCache.set(modelPath, container)
          this.loadingPromises.delete(modelPath)
          resolve(container)
        }
        
        containerTask.onError = (_task, message, _exception) => {
          this.loadingPromises.delete(modelPath)
          reject(new Error(`Failed to load Babylon asset ${modelPath}: ${message}`))
        }
        
        assetsManager.load()
      } else if (['.glb', '.gltf', '.obj'].includes(fileExtension)) {
        // Use SceneLoader for modern formats
        SceneLoader.ImportMeshAsync('', '', fullPath, this.scene).then((result) => {
          // Create asset container from imported meshes
          const container = new AssetContainer(this.scene)
          
          // Add meshes to container
          result.meshes.forEach(mesh => {
            container.meshes.push(mesh)
            mesh.setParent(null) // Remove from scene, keep in container
          })
          
          // Add materials to container from scene
          const sceneMaterials = this.scene.materials.filter(material => 
            result.meshes.some(mesh => mesh.material === material)
          )
          sceneMaterials.forEach(material => {
            container.materials.push(material)
          })
          
          // Add textures to container from scene  
          const sceneTextures = this.scene.textures.filter(texture => 
            sceneMaterials.some(material => {
              if (material instanceof PBRMaterial) {
                return material.albedoTexture === texture || 
                       material.bumpTexture === texture ||
                       material.metallicTexture === texture
              }
              return false
            })
          )
          sceneTextures.forEach(texture => {
            container.textures.push(texture)
          })
          
          this.assetCache.set(modelPath, container)
          this.loadingPromises.delete(modelPath)
          resolve(container)
          
        }).catch((error) => {
          this.loadingPromises.delete(modelPath)
          reject(new Error(`Failed to load ${fileExtension} asset ${modelPath}: ${error.message}`))
        })
        
      } else {
        this.loadingPromises.delete(modelPath)
        reject(new Error(`Unsupported file format: ${fileExtension}`))
      }
    })

    this.loadingPromises.set(modelPath, loadPromise)
    return loadPromise
  }
  /**
   * Load character animations
   */
  private async loadCharacterAnimations(_asset: LoadedAsset, animationPaths: Record<string, string>): Promise<void> {
    for (const [animName, animPath] of Object.entries(animationPaths)) {
      try {
        // Load animation data - implementation depends on animation format
        console.log(`🎬 Loading animation ${animName} from ${animPath}`)
        // TODO: Implement animation loading based on format
      } catch (error) {
        console.warn(`Failed to load animation ${animName}:`, error)
      }
    }
  }

  /**
   * Apply skin textures to loaded asset
   */
  private async applySkinTextures(asset: LoadedAsset, textures: Record<string, string | undefined>): Promise<void> {
    for (const [materialSlot, texturePath] of Object.entries(textures)) {
      if (!texturePath) continue
      
      try {
        const texture = await this.loadTexture(texturePath)
        
        // Find materials that match the slot name        // Try to find materials by slot name, fallback to all materials if none found
        let targetMaterials = asset.materials.filter(material => 
          material.name.toLowerCase().includes(materialSlot.toLowerCase())
        )
        
        // If no specific materials found, apply to all materials (common for single-material assets)
        if (targetMaterials.length === 0 && asset.materials.length > 0) {
          targetMaterials = asset.materials
          console.log(`Applying ${materialSlot} texture to all ${asset.materials.length} materials`)
        }
        
        if (targetMaterials.length === 0) {
          console.warn(`No materials found for slot ${materialSlot}`)
          continue
        }        // Apply texture to materials (both PBR and Standard)
        targetMaterials.forEach(material => {
          if (material instanceof PBRMaterial) {
            if (materialSlot.includes('diffuse') || materialSlot.includes('albedo')) {
              material.albedoTexture = texture
              console.log(`Applied diffuse texture to PBR material: ${material.name}`)
            } else if (materialSlot.includes('normal')) {
              material.bumpTexture = texture
              console.log(`Applied normal texture to PBR material: ${material.name}`)
            } else if (materialSlot.includes('metalness') || materialSlot.includes('metallic')) {
              material.metallicTexture = texture
              console.log(`Applied metallic texture to PBR material: ${material.name}`)
            } else if (materialSlot.includes('roughness')) {
              material.microSurfaceTexture = texture
              console.log(`Applied roughness texture to PBR material: ${material.name}`)
            }
          } else if (material instanceof StandardMaterial) {
            if (materialSlot.includes('diffuse') || materialSlot.includes('albedo')) {
              (material as StandardMaterial).diffuseTexture = texture
              console.log(`Applied diffuse texture to Standard material: ${material.name}`)
            } else if (materialSlot.includes('normal')) {
              (material as StandardMaterial).bumpTexture = texture
              console.log(`Applied normal texture to Standard material: ${material.name}`)
            }
          }
        })
        
      } catch (error) {
        console.warn(`Failed to load texture ${texturePath}:`, error)
      }
    }
  }  /**
   * Load and cache a texture with improved error handling
   */
  private async loadTexture(texturePath: string): Promise<Texture> {
    if (this.textureCache.has(texturePath)) {
      return this.textureCache.get(texturePath)!
    }

    return new Promise((resolve) => {
      const fullPath = texturePath.startsWith('/') ? texturePath : `${this.baseUrl}${texturePath}`
      
      try {
        const texture = new Texture(fullPath, this.scene, false, false)
        
        let resolved = false
        
        texture.onLoadObservable.addOnce(() => {
          if (!resolved) {
            resolved = true
            this.textureCache.set(texturePath, texture)
            console.log(`✅ Texture loaded: ${texturePath}`)
            resolve(texture)
          }
        })
        
        // Reduced timeout for better performance
        setTimeout(() => {
          if (!resolved) {
            resolved = true
            if (texture.isReady()) {
              console.log(`✅ Texture ready after timeout: ${texturePath}`)
              this.textureCache.set(texturePath, texture)
              resolve(texture)
            } else {
              console.warn(`⏰ Texture load timeout (3s): ${texturePath} - using placeholder`)
              // Create a simple placeholder texture
              const placeholderTexture = new Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', this.scene)
              this.textureCache.set(texturePath, placeholderTexture)
              resolve(placeholderTexture)
            }
          }
        }, 3000) // Reduced from 5000ms to 3000ms
        
      } catch (error) {
        console.warn(`❌ Texture creation failed: ${texturePath}`, error)
        // Create a placeholder texture
        const placeholderTexture = new Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', this.scene)
        this.textureCache.set(texturePath, placeholderTexture)
        resolve(placeholderTexture)
      }
    })
  }

  /**
   * Dispose of an asset and free memory
   */
  disposeAsset(assetName: string): void {
    const asset = this.loadedAssets.get(assetName)
    if (asset) {
      asset.container.dispose()
      this.loadedAssets.delete(assetName)
      console.log(`🗑️  Disposed asset: ${assetName}`)
    }
  }

  /**
   * Get loading statistics
   */
  getLoadingStats(): { loaded: number; cached: number; textures: number } {
    return {
      loaded: this.loadedAssets.size,
      cached: this.assetCache.size,
      textures: this.textureCache.size
    }
  }

  /**
   * Clear all caches and loaded assets
   */
  dispose(): void {
    // Dispose all loaded assets
    this.loadedAssets.forEach(asset => asset.container.dispose())
    this.loadedAssets.clear()
    
    // Clear caches
    this.assetCache.clear()
    this.textureCache.clear()
    this.loadingPromises.clear()
    
    console.log('🗑️  EnhancedAssetManager disposed')
  }

  /**
   * Generate attribution notice for loaded assets
   */
  generateAttributionNotice(): string {
    const attributions = this.getAssetAttribution()
    const sourceMap = new Map<string, AssetSource>()
    
    // Collect unique sources
    attributions.forEach(({source}) => {
      sourceMap.set(source.name, source)
    })
    
    let notice = 'Asset Attributions:\n'
    notice += '='.repeat(50) + '\n\n'
    
    sourceMap.forEach((source, name) => {
      notice += `${name}\n`
      notice += `License: ${source.license}\n`
      if (source.attribution) {
        notice += `Attribution: ${source.attribution}\n`
      }
      if (source.url) {
        notice += `Source: ${source.url}\n`
      }
      notice += '\n'
    })
    
    return notice
  }
  /**
   * Load OBJ files with MTL materials (used for classic FPS maps)
   */
  private async loadOBJWithMaterials(objPath: string, mtlPath?: string): Promise<AssetContainer> {
    try {
      console.log(`Loading OBJ file: ${objPath}`)
      if (mtlPath) {
        console.log(`With MTL materials: ${mtlPath}`)
      }

      // Import the OBJ file
      const result = await SceneLoader.ImportMeshAsync("", "/assets/", objPath, this.scene)
      
      // Create a container to match the AssetContainer interface
      const container = new AssetContainer(this.scene)
      
      // Add loaded meshes to the container
      result.meshes.forEach(mesh => {
        container.meshes.push(mesh)
      })
      
      // Get materials from the scene (they are added automatically during OBJ load)
      const sceneMaterials = this.scene.materials.filter(material => 
        material.name && material.name.includes(objPath.split('/').pop()?.split('.')[0] || '')
      )
      sceneMaterials.forEach(material => {
        container.materials.push(material)
      })
      
      // Get textures from the scene
      const sceneTextures = this.scene.textures.filter(texture => 
        texture.name && texture.name.includes(objPath.split('/').pop()?.split('.')[0] || '')
      )
      sceneTextures.forEach(texture => {
        container.textures.push(texture)
      })

      // If we have an MTL file, try to load it
      if (mtlPath) {
        try {
          // MTL files are automatically loaded by the OBJ loader if they're in the same directory
          // or if properly referenced in the OBJ file
          console.log(`MTL materials should be automatically loaded from: ${mtlPath}`)
        } catch (mtlError) {
          console.warn(`Failed to load MTL file ${mtlPath}:`, mtlError)
        }
      }

      console.log(`✅ OBJ loaded: ${result.meshes.length} meshes, ${sceneMaterials.length} materials`)
      return container
      
    } catch (error) {
      console.error(`❌ Failed to load OBJ file ${objPath}:`, error)
      throw error
    }
  }
}
