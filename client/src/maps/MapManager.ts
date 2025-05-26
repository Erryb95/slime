import { Scene, Vector3, HemisphericLight, MeshBuilder, StandardMaterial, Color3, Texture, SceneLoader, AssetContainer } from '@babylonjs/core';
import '@babylonjs/loaders';

export interface MapConfig {
    name: string;
    displayName: string;
    file?: string;
    spawn: Vector3[];
    bounds: {
        min: Vector3;
        max: Vector3;
    };
    skybox?: string;
    lighting?: {
        direction: Vector3;
        diffuse: Color3;
        specular: Color3;
    };
}

export class MapManager {
    private scene: Scene;
    private currentMap: string | null = null;
    private loadedAssets: Map<string, AssetContainer> = new Map();    private maps: Map<string, MapConfig> = new Map([
        ['training', {
            name: 'training',
            displayName: 'Training Ground',
            file: '/assets/maps/training.babylon',
            spawn: [
                new Vector3(0, 2, 10),
                new Vector3(10, 2, 0),
                new Vector3(-10, 2, 0),
                new Vector3(0, 2, -10)
            ],
            bounds: {
                min: new Vector3(-50, 0, -50),
                max: new Vector3(50, 20, 50)
            },
            lighting: {
                direction: new Vector3(0, -1, 0.5),
                diffuse: new Color3(1, 1, 0.8),
                specular: new Color3(1, 1, 1)
            }
        }],
        ['arena', {
            name: 'arena',
            displayName: 'Combat Arena',
            file: '/assets/maps/firstLevel.babylon',
            spawn: [
                new Vector3(-15, 2, -15),
                new Vector3(15, 2, -15),
                new Vector3(15, 2, 15),
                new Vector3(-15, 2, 15),
                new Vector3(0, 2, 0)
            ],
            bounds: {
                min: new Vector3(-30, 0, -30),
                max: new Vector3(30, 15, 30)
            },
            lighting: {
                direction: new Vector3(0.3, -1, 0.3),
                diffuse: new Color3(0.8, 0.9, 1),
                specular: new Color3(1, 1, 1)
            }
        }]
    ]);

    constructor(scene: Scene) {
        this.scene = scene;
    }

    async loadMap(mapName: string): Promise<boolean> {
        const mapConfig = this.maps.get(mapName);
        if (!mapConfig) {
            console.error(`Map '${mapName}' not found`);
            return false;
        }

        try {
            // Clear current map
            await this.clearCurrentMap();

            // Load map assets if specified
            if (mapConfig.file) {
                await this.loadMapFile(mapConfig);
            } else {
                // Generate procedural map
                await this.generateProceduralMap(mapConfig);
            }

            // Setup lighting
            this.setupLighting(mapConfig);

            // Setup skybox
            if (mapConfig.skybox) {
                this.setupSkybox(mapConfig.skybox);
            }

            this.currentMap = mapName;
            console.log(`Map '${mapName}' loaded successfully`);
            return true;

        } catch (error) {
            console.error(`Failed to load map '${mapName}':`, error);
            return false;
        }
    }

    private async clearCurrentMap(): Promise<void> {
        // Remove all meshes except camera and lights
        const meshesToRemove = this.scene.meshes.filter(mesh => 
            !mesh.name.includes('camera') && 
            !mesh.name.includes('light') &&
            !mesh.name.includes('player')
        );

        meshesToRemove.forEach(mesh => {
            mesh.dispose();
        });

        // Clear lights except ambient
        const lightsToRemove = this.scene.lights.filter(light => 
            light.name !== 'ambientLight'
        );

        lightsToRemove.forEach(light => {
            light.dispose();
        });
    }    private async loadMapFile(mapConfig: MapConfig): Promise<void> {
        if (!mapConfig.file) return;
        
        try {
            const result = await SceneLoader.ImportMeshAsync(
                '',
                '',
                mapConfig.file,
                this.scene
            );
            
            console.log(`Loaded ${result.meshes.length} meshes for map ${mapConfig.name}`);
            
            // Store loaded assets
            const container = new AssetContainer(this.scene);
            result.meshes.forEach(mesh => container.meshes.push(mesh));
            this.loadedAssets.set(mapConfig.name, container);

        } catch (error) {
            console.warn(`Failed to load map file ${mapConfig.file}, generating procedural map instead:`, error);
            await this.generateProceduralMap(mapConfig);
        }
    }

    private async generateProceduralMap(mapConfig: MapConfig): Promise<void> {
        // Create ground
        const ground = MeshBuilder.CreateGround('ground', {
            width: Math.abs(mapConfig.bounds.max.x - mapConfig.bounds.min.x),
            height: Math.abs(mapConfig.bounds.max.z - mapConfig.bounds.min.z),
            subdivisions: 32
        }, this.scene);

        const groundMaterial = new StandardMaterial('groundMaterial', this.scene);
        groundMaterial.diffuseColor = new Color3(0.4, 0.4, 0.4);
        groundMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
        ground.material = groundMaterial;

        // Add some basic geometry based on map type
        if (mapConfig.name === 'training') {
            this.createTrainingMap();
        } else if (mapConfig.name === 'arena') {
            this.createArenaMap();
        }
    }

    private createTrainingMap(): void {
        // Create training obstacles and cover
        const boxMaterial = new StandardMaterial('boxMaterial', this.scene);
        boxMaterial.diffuseColor = new Color3(0.6, 0.4, 0.2);

        // Training boxes
        for (let i = 0; i < 5; i++) {
            const box = MeshBuilder.CreateBox(`trainingBox${i}`, {
                width: 2,
                height: 2,
                depth: 2
            }, this.scene);

            box.position = new Vector3(
                (Math.random() - 0.5) * 30,
                1,
                (Math.random() - 0.5) * 30
            );
            box.material = boxMaterial;
        }

        // Create walls for cover
        const wallMaterial = new StandardMaterial('wallMaterial', this.scene);
        wallMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);

        for (let i = 0; i < 8; i++) {
            const wall = MeshBuilder.CreateBox(`wall${i}`, {
                width: 6,
                height: 3,
                depth: 0.5
            }, this.scene);

            const angle = (i / 8) * Math.PI * 2;
            wall.position = new Vector3(
                Math.cos(angle) * 20,
                1.5,
                Math.sin(angle) * 20
            );
            wall.rotation.y = angle + Math.PI / 2;
            wall.material = wallMaterial;
        }
    }

    private createArenaMap(): void {
        // Create arena with elevated platforms
        const platformMaterial = new StandardMaterial('platformMaterial', this.scene);
        platformMaterial.diffuseColor = new Color3(0.3, 0.3, 0.6);

        // Central platform
        const centralPlatform = MeshBuilder.CreateBox('centralPlatform', {
            width: 8,
            height: 1,
            depth: 8
        }, this.scene);
        centralPlatform.position = new Vector3(0, 2, 0);
        centralPlatform.material = platformMaterial;

        // Corner platforms
        const corners = [
            new Vector3(-12, 2, -12),
            new Vector3(12, 2, -12),
            new Vector3(12, 2, 12),
            new Vector3(-12, 2, 12)
        ];

        corners.forEach((corner, index) => {
            const platform = MeshBuilder.CreateBox(`cornerPlatform${index}`, {
                width: 6,
                height: 1,
                depth: 6
            }, this.scene);
            platform.position = corner;
            platform.material = platformMaterial;
        });

        // Arena walls
        const wallMaterial = new StandardMaterial('arenaWallMaterial', this.scene);
        wallMaterial.diffuseColor = new Color3(0.2, 0.2, 0.2);

        const wallPositions = [
            { pos: new Vector3(0, 5, -25), size: { w: 50, h: 10, d: 1 } },
            { pos: new Vector3(0, 5, 25), size: { w: 50, h: 10, d: 1 } },
            { pos: new Vector3(-25, 5, 0), size: { w: 1, h: 10, d: 50 } },
            { pos: new Vector3(25, 5, 0), size: { w: 1, h: 10, d: 50 } }
        ];

        wallPositions.forEach((wallPos, index) => {
            const wall = MeshBuilder.CreateBox(`arenaWall${index}`, {
                width: wallPos.size.w,
                height: wallPos.size.h,
                depth: wallPos.size.d
            }, this.scene);
            wall.position = wallPos.pos;
            wall.material = wallMaterial;
        });
    }

    private setupLighting(mapConfig: MapConfig): void {
        // Create main directional light
        const mainLight = new HemisphericLight('mainLight', 
            mapConfig.lighting?.direction || new Vector3(0, -1, 0.5), 
            this.scene
        );
        
        if (mapConfig.lighting) {
            mainLight.diffuse = mapConfig.lighting.diffuse;
            mainLight.specular = mapConfig.lighting.specular;
        }
    }

    private setupSkybox(skyboxTexture: string): void {
        const skybox = MeshBuilder.CreateSphere('skybox', { diameter: 100 }, this.scene);
        const skyboxMaterial = new StandardMaterial('skyboxMaterial', this.scene);
        
        skyboxMaterial.backFaceCulling = false;
        skyboxMaterial.diffuseTexture = new Texture(`/assets/textures/${skyboxTexture}`, this.scene);
        skyboxMaterial.disableLighting = true;
        
        skybox.material = skyboxMaterial;
        skybox.infiniteDistance = true;
    }

    getSpawnPoints(mapName?: string): Vector3[] {
        const map = this.maps.get(mapName || this.currentMap || 'training');
        return map ? [...map.spawn] : [new Vector3(0, 2, 0)];
    }

    getRandomSpawnPoint(mapName?: string): Vector3 {
        const spawnPoints = this.getSpawnPoints(mapName);
        return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    }

    getCurrentMap(): string | null {
        return this.currentMap;
    }

    getAvailableMaps(): MapConfig[] {
        return Array.from(this.maps.values());
    }

    isPositionInBounds(position: Vector3, mapName?: string): boolean {
        const map = this.maps.get(mapName || this.currentMap || 'training');
        if (!map) return false;

        return position.x >= map.bounds.min.x && position.x <= map.bounds.max.x &&
               position.y >= map.bounds.min.y && position.y <= map.bounds.max.y &&
               position.z >= map.bounds.min.z && position.z <= map.bounds.max.z;
    }

    enforceBounds(position: Vector3, mapName?: string): void {
        const map = this.maps.get(mapName || this.currentMap || 'training');
        if (!map) return;

        // Clamp position to map bounds
        position.x = Math.max(map.bounds.min.x, Math.min(map.bounds.max.x, position.x));
        position.y = Math.max(map.bounds.min.y, Math.min(map.bounds.max.y, position.y));
        position.z = Math.max(map.bounds.min.z, Math.min(map.bounds.max.z, position.z));
    }

    dispose(): void {
        this.loadedAssets.forEach(container => container.dispose());
        this.loadedAssets.clear();
    }
}
