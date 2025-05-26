// Enhanced Ultimate FPS Demo Level - Full FPS Experience
// Features: Enemies, 3rd person, multiple weapons, clubs, advanced combat, AI, and comprehensive gameplay
import { Engine, Scene, Vector3, HemisphericLight, DirectionalLight, MeshBuilder, StandardMaterial, Color3, SceneLoader, ArcRotateCamera, PhysicsImpostor, FreeCamera, Animation, BezierCurveEase, Ray, ActionManager } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import '@babylonjs/loaders';
import { PhysicsManager } from '../physics/PhysicsManager';
import { InputManager3D } from '../input/InputManager';
export class EnhancedUltimateFPSDemoLevel {
    constructor(canvas) {
        this.enemies = [];
        this.weapons = new Map();
        this.loadedAssets = new Map();
        this.isThirdPerson = true;
        this.waveNumber = 1;
        this.score = 0;
        this.enemiesKilled = 0;
        this.isReloading = false;
        this.gameStarted = false;
        // Re‑added movement properties used in initializePlayer
        this.sprintMultiplier = 1.8;
        this.slideSpeedMultiplier = 2.2;
        // Removed unused performance tracking properties
        this.lastFireTime = 0;
        this.engine = new Engine(canvas, true, {
            stencil: true,
            antialias: true,
            adaptToDeviceRatio: true,
            powerPreference: "high-performance"
        });
        this.scene = new Scene(this.engine);
        this.scene.actionManager = new ActionManager(this.scene);
        // Initialize components with proper error handling
        this.initializePhysics();
        this.initializeCamera();
        this.setupLighting();
        this.initializeWeapons();
        this.initializePlayer();
        this.setupInputHandlers();
        // Load assets with fallbacks, then setup scene
        this.loadAllAssets().then(() => {
            console.log('✅ All assets loaded successfully');
            this.setupEnhancedScene();
            this.spawnEnemyWave(this.waveNumber);
            this.equipInitialWeapon();
            this.startGameLoop();
        }).catch((error) => {
            console.warn('⚠️ Asset loading failed, using primitive fallbacks:', error);
            this.setupEnhancedScene();
            this.spawnEnemyWave(this.waveNumber);
            this.equipInitialWeapon();
            this.startGameLoop();
        });
    }
    async initializePhysics() {
        try {
            this.physicsManager = new PhysicsManager(this.scene);
            await this.physicsManager.initialize();
            // For Babylon.js physics compatibility, we still enable scene physics
            // but we'll primarily use Rapier through PhysicsManager
            this.scene.enablePhysics(new Vector3(0, -9.81, 0));
            console.log('🔧 Physics engine initialized with Rapier and Babylon.js compatibility');
        }
        catch (error) {
            console.error('Failed to initialize physics:', error);
            throw error;
        }
    }
    initializeCamera() {
        if (this.isThirdPerson) {
            this.camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 8, Vector3.Zero(), this.scene);
            this.camera.setTarget(Vector3.Zero());
            this.camera.lowerRadiusLimit = 3;
            this.camera.upperRadiusLimit = 15;
            this.camera.panningSensibility = 100;
        }
        else {
            this.camera = new FreeCamera("camera", new Vector3(0, 2, -5), this.scene);
            this.camera.setTarget(Vector3.Zero());
        }
        this.camera.fov = Math.PI / 1.5; // 120 degrees
        // Fix camera sensitivity based on type.
        if (this.camera instanceof FreeCamera) {
            this.camera.angularSensibility = 300;
        }
        else {
            this.camera.panningSensibility = 300;
        }
        this.camera.speed = 1.0;
        this.camera.inertia = 0.8;
        console.log('📷 Camera initialized with 120° FOV and enhanced controls');
    }
    setupLighting() {
        // Enhanced lighting for better visibility
        const ambientLight = new HemisphericLight("ambientLight", new Vector3(0, 1, 0), this.scene);
        ambientLight.intensity = 0.4;
        const directionalLight = new DirectionalLight("directionalLight", new Vector3(-1, -1, -1), this.scene);
        directionalLight.intensity = 0.8;
        directionalLight.diffuse = new Color3(1, 1, 0.9);
        directionalLight.specular = new Color3(1, 1, 1);
        console.log('💡 Enhanced lighting setup complete');
    }
    initializeWeapons() {
        // Define weapon configurations with realistic stats
        const weaponConfigs = [
            {
                name: 'CombatPistol',
                type: 'pistol',
                damage: 35,
                fireRate: 400,
                range: 30,
                accuracy: 0.85,
                recoil: new Vector3(0.02, 0.03, 0),
                ammoCapacity: 15,
                reloadTime: 1.5
            },
            {
                name: 'AssaultRifle',
                type: 'rifle',
                damage: 45,
                fireRate: 600,
                range: 60,
                accuracy: 0.75,
                recoil: new Vector3(0.03, 0.04, 0),
                ammoCapacity: 30,
                reloadTime: 2.5
            },
            {
                name: 'TacticalShotgun',
                type: 'shotgun',
                damage: 80,
                fireRate: 120,
                range: 15,
                accuracy: 0.6,
                recoil: new Vector3(0.06, 0.08, 0),
                ammoCapacity: 8,
                reloadTime: 3.0
            },
            {
                name: 'SniperRifle',
                type: 'sniper',
                damage: 120,
                fireRate: 60,
                range: 100,
                accuracy: 0.95,
                recoil: new Vector3(0.08, 0.1, 0),
                ammoCapacity: 5,
                reloadTime: 3.5
            },
            {
                name: 'CombatKnife',
                type: 'melee',
                damage: 50,
                fireRate: 180,
                range: 2,
                accuracy: 1.0,
                recoil: Vector3.Zero(),
                ammoCapacity: -1,
                reloadTime: 0
            },
            {
                name: 'BaseballBat',
                type: 'club',
                damage: 60,
                fireRate: 120,
                range: 2.5,
                accuracy: 1.0,
                recoil: Vector3.Zero(),
                ammoCapacity: -1,
                reloadTime: 0
            }
        ];
        weaponConfigs.forEach(weapon => {
            this.weapons.set(weapon.name, weapon);
        });
        console.log('🔫 Weapons initialized:', this.weapons.size);
    }
    initializePlayer() {
        this.player = {
            position: new Vector3(0, 1, 0),
            mesh: null,
            health: 100,
            maxHealth: 100,
            speed: 8,
            jumpHeight: 3.2,
            equippedWeapon: null,
            inventory: [],
            ammo: new Map()
        };
        // Initialize ammo for all weapons
        this.weapons.forEach((weapon, name) => {
            if (weapon.type !== 'melee' && weapon.type !== 'club') {
                this.player.ammo.set(name, weapon.ammoCapacity * 3);
            }
        });
        // Now the properties exist
        this.sprintMultiplier = 1.8;
        this.slideSpeedMultiplier = 2.2;
        console.log('👤 Player initialized with enhanced Fortnite-style movement');
    }
    setupInputHandlers() {
        try {
            // Fix: InputManager3D expects HTMLCanvasElement, not Scene
            const canvas = this.engine.getRenderingCanvas();
            this.inputManager = new InputManager3D(canvas);
            // Fix: Use the actual available methods from InputManager3D
            this.inputManager.setWeaponFireCallbacks(() => this.fireWeapon(), () => this.aimDownSights());
            this.inputManager.setWeaponControlCallbacks(() => this.reloadWeapon(), (slot) => this.switchWeapon(slot - 1));
            this.inputManager.setAdvancedMovementCallbacks(() => this.dash(), () => this.performSlide(), () => this.toggleSlowMotion(), undefined // grapple not implemented
            );
            console.log('🎮 Input handlers configured');
        }
        catch (error) {
            console.error('Failed to setup input handlers:', error);
        }
    }
    async loadAllAssets() {
        try {
            await Promise.all([
                this.loadWeaponAssets(),
                this.loadEnemyAssets(),
                this.loadEnvironmentAssets()
            ]);
        }
        catch (error) {
            console.warn('Some assets failed to load, continuing with primitives:', error);
        }
    }
    async loadWeaponAssets() {
        const weaponAssets = [
            { name: 'CombatPistol', path: 'assets/ultimate-fps/weapons/TacticalWeapon.gltf' },
            { name: 'AssaultRifle', path: 'assets/fps-assets/ClientApp/resources/models/ak47.babylon' },
            { name: 'TacticalShotgun', path: 'assets/ultimate-fps/weapons/WeaponMechanism.gltf' },
            { name: 'SniperRifle', path: 'assets/ultimate-fps/weapons/TacticalWeapon.gltf' },
            { name: 'CombatKnife', path: 'assets/ultimate-fps/weapons/Suzanne.gltf' }, // Placeholder for knife
            { name: 'BaseballBat', path: 'assets/ultimate-fps/weapons/Lantern.gltf' } // Placeholder for bat
        ];
        for (const asset of weaponAssets) {
            try {
                const result = await SceneLoader.ImportMeshAsync("", "", asset.path, this.scene);
                this.loadedAssets.set(asset.name, result);
                const weapon = this.weapons.get(asset.name);
                if (weapon && result.meshes[0]) {
                    weapon.mesh = result.meshes[0];
                    weapon.mesh.setEnabled(false);
                }
                console.log(`✅ Loaded weapon: ${asset.name}`);
            }
            catch (error) {
                console.warn(`⚠️ Failed to load ${asset.name}, creating primitive fallback:`, error);
                this.createPrimitiveWeapon(asset.name);
            }
        }
    }
    async loadEnemyAssets() {
        const enemyAssets = [
            { name: 'Enemy1', path: 'assets/fps-assets/ClientApp/resources/models/yBot.babylon' },
            { name: 'Enemy2', path: 'assets/ultimate-fps/characters/RiggedSimple.gltf' },
            { name: 'Enemy3', path: 'assets/elite-fps/characters/DamagedHelmet.gltf' }
        ];
        for (const asset of enemyAssets) {
            try {
                const result = await SceneLoader.ImportMeshAsync("", "", asset.path, this.scene);
                this.loadedAssets.set(asset.name, result);
                console.log(`✅ Loaded enemy: ${asset.name}`);
            }
            catch (error) {
                console.warn(`⚠️ Failed to load ${asset.name}, creating primitive fallback:`, error);
                this.createPrimitiveEnemy(asset.name);
            }
        }
    }
    async loadEnvironmentAssets() {
        const environmentAssets = [
            { name: 'Environment1', path: 'assets/ultimate-fps/weapons/MilitaryVehicle.gltf' }, // Using as environment piece
            { name: 'Cover1', path: 'assets/elite-fps/characters/BoomBox.gltf' }, // Using as cover object
            { name: 'Building1', path: 'assets/ultimate-fps/weapons/MilitaryVehicle.gltf' } // Placeholder building
        ];
        for (const asset of environmentAssets) {
            try {
                const result = await SceneLoader.ImportMeshAsync("", "", asset.path, this.scene);
                this.loadedAssets.set(asset.name, result);
                console.log(`✅ Loaded environment: ${asset.name}`);
            }
            catch (error) {
                console.warn(`⚠️ Failed to load ${asset.name}, using primitive fallback:`, error);
                this.createPrimitiveEnvironment(asset.name);
            }
        }
    }
    // Primitive fallback creation methods
    createPrimitiveWeapon(weaponName) {
        const weapon = this.weapons.get(weaponName);
        if (!weapon)
            return;
        let primitive;
        switch (weapon.type) {
            case 'pistol':
                primitive = MeshBuilder.CreateBox(`${weaponName}_primitive`, { width: 0.3, height: 0.2, depth: 0.8 }, this.scene);
                break;
            case 'rifle':
                primitive = MeshBuilder.CreateBox(`${weaponName}_primitive`, { width: 0.15, height: 0.15, depth: 1.2 }, this.scene);
                break;
            case 'shotgun':
                primitive = MeshBuilder.CreateBox(`${weaponName}_primitive`, { width: 0.2, height: 0.2, depth: 1.0 }, this.scene);
                break;
            case 'sniper':
                primitive = MeshBuilder.CreateBox(`${weaponName}_primitive`, { width: 0.12, height: 0.12, depth: 1.5 }, this.scene);
                break;
            case 'melee':
                primitive = MeshBuilder.CreateBox(`${weaponName}_primitive`, { width: 0.05, height: 0.05, depth: 0.6 }, this.scene);
                break;
            case 'club':
                primitive = MeshBuilder.CreateCylinder(`${weaponName}_primitive`, { height: 1.0, diameter: 0.1 }, this.scene);
                break;
            default:
                primitive = MeshBuilder.CreateBox(`${weaponName}_primitive`, { width: 0.2, height: 0.2, depth: 0.8 }, this.scene);
        }
        const material = new StandardMaterial(`${weaponName}_material`, this.scene);
        material.diffuseColor = new Color3(0.4, 0.4, 0.4);
        material.specularColor = new Color3(0.8, 0.8, 0.8);
        primitive.material = material;
        primitive.setEnabled(false);
        weapon.mesh = primitive;
        const mockResult = {
            meshes: [primitive],
            animationGroups: [],
            skeletons: [],
            transformNodes: []
        };
        this.loadedAssets.set(weaponName, mockResult);
        console.log(`🔧 Created primitive weapon: ${weaponName}`);
    }
    createPrimitiveEnemy(enemyName) {
        // Create a simple capsule for enemy
        const enemy = MeshBuilder.CreateCapsule(`${enemyName}_primitive`, {
            radius: 0.5,
            height: 2
        }, this.scene);
        const material = new StandardMaterial(`${enemyName}_material`, this.scene);
        material.diffuseColor = new Color3(0.8, 0.2, 0.2);
        material.emissiveColor = new Color3(0.1, 0.0, 0.0);
        enemy.material = material;
        enemy.setEnabled(false);
        const mockResult = {
            meshes: [enemy],
            animationGroups: [],
            skeletons: [],
            transformNodes: []
        };
        this.loadedAssets.set(enemyName, mockResult);
        console.log(`🤖 Created primitive enemy: ${enemyName}`);
    }
    createPrimitiveEnvironment(envName) {
        // Create simple environment objects
        let primitive;
        if (envName.includes('Cover')) {
            primitive = MeshBuilder.CreateBox(`${envName}_primitive`, { width: 3, height: 3, depth: 1 }, this.scene);
        }
        else if (envName.includes('Building')) {
            primitive = MeshBuilder.CreateBox(`${envName}_primitive`, { width: 8, height: 6, depth: 8 }, this.scene);
        }
        else {
            primitive = MeshBuilder.CreateGround(`${envName}_primitive`, { width: 50, height: 50 }, this.scene);
        }
        const material = new StandardMaterial(`${envName}_material`, this.scene);
        material.diffuseColor = new Color3(0.6, 0.6, 0.6);
        primitive.material = material;
        primitive.setEnabled(false);
        const mockResult = {
            meshes: [primitive],
            animationGroups: [],
            skeletons: [],
            transformNodes: []
        };
        this.loadedAssets.set(envName, mockResult);
        console.log(`🏗️ Created primitive environment: ${envName}`);
    }
    async setupEnhancedScene() {
        // Create ground
        const ground = MeshBuilder.CreateGround("ground", { width: 100, height: 100 }, this.scene);
        const groundMaterial = new StandardMaterial("groundMaterial", this.scene);
        groundMaterial.diffuseColor = new Color3(0.3, 0.4, 0.3);
        groundMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
        ground.material = groundMaterial;
        ground.physicsImpostor = new PhysicsImpostor(ground, PhysicsImpostor.BoxImpostor, { mass: 0, restitution: 0.5 }, this.scene);
        // Create player mesh
        this.createPlayerMesh();
        // Setup scene elements
        this.createCoverObjects();
        this.createWeaponPickups();
        this.createArenaBoundaries();
        console.log('🏟️ Enhanced arena setup complete');
    }
    async createPlayerMesh() {
        const playerMesh = MeshBuilder.CreateCapsule("player", {
            radius: 0.5,
            height: 2
        }, this.scene);
        const playerMaterial = new StandardMaterial("playerMaterial", this.scene);
        playerMaterial.diffuseColor = new Color3(0.2, 0.8, 0.2);
        playerMaterial.emissiveColor = new Color3(0.0, 0.1, 0.0);
        playerMesh.material = playerMaterial;
        playerMesh.position = this.player.position.clone();
        playerMesh.physicsImpostor = new PhysicsImpostor(playerMesh, PhysicsImpostor.CapsuleImpostor, { mass: 1, restitution: 0.1 }, this.scene);
        this.player.mesh = playerMesh;
        console.log('👤 Player mesh created');
    }
    async createCoverObjects() {
        const coverPositions = [
            new Vector3(10, 1.5, 0),
            new Vector3(-10, 1.5, 0),
            new Vector3(0, 1.5, 15),
            new Vector3(0, 1.5, -15),
            new Vector3(15, 1.5, 15),
            new Vector3(-15, 1.5, -15)
        ];
        coverPositions.forEach((pos, index) => {
            const cover = MeshBuilder.CreateBox(`cover_${index}`, { width: 3, height: 3, depth: 1 }, this.scene);
            const material = new StandardMaterial(`coverMat_${index}`, this.scene);
            material.diffuseColor = new Color3(0.5, 0.4, 0.3);
            material.specularColor = new Color3(0.2, 0.2, 0.2);
            cover.material = material;
            cover.position = pos;
            cover.physicsImpostor = new PhysicsImpostor(cover, PhysicsImpostor.BoxImpostor, { mass: 0, restitution: 0.3 }, this.scene);
        });
    }
    createWeaponPickups() {
        const weaponPositions = [
            { weapon: 'AssaultRifle', pos: new Vector3(20, 1, 10) },
            { weapon: 'TacticalShotgun', pos: new Vector3(-20, 1, 10) },
            { weapon: 'SniperRifle', pos: new Vector3(10, 1, 20) },
            { weapon: 'BaseballBat', pos: new Vector3(-10, 1, -20) }
        ];
        weaponPositions.forEach(({ weapon, pos }) => {
            const pickup = MeshBuilder.CreateSphere(`pickup_${weapon}`, { diameter: 1.5 }, this.scene);
            const material = new StandardMaterial(`pickupMat_${weapon}`, this.scene);
            material.diffuseColor = new Color3(1, 0.8, 0);
            material.emissiveColor = new Color3(0.3, 0.2, 0);
            pickup.material = material;
            pickup.position = pos;
            this.animateWeaponPickup(pickup);
        });
    }
    animateWeaponPickup(pickup) {
        const animationKeys = [];
        animationKeys.push({ frame: 0, value: pickup.position.y });
        animationKeys.push({ frame: 60, value: pickup.position.y + 0.5 });
        animationKeys.push({ frame: 120, value: pickup.position.y });
        const animation = new Animation("pickupFloat", "position.y", 30, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
        animation.setKeys(animationKeys);
        animation.setEasingFunction(new BezierCurveEase(0.32, 0.73, 0.69, 0.28));
        pickup.animations.push(animation);
        this.scene.beginAnimation(pickup, 0, 120, true);
    }
    async createArenaBoundaries() {
        const wallHeight = 5;
        const arenaSize = 50;
        const walls = [
            { pos: new Vector3(arenaSize, wallHeight / 2, 0), size: new Vector3(1, wallHeight, arenaSize * 2) },
            { pos: new Vector3(-arenaSize, wallHeight / 2, 0), size: new Vector3(1, wallHeight, arenaSize * 2) },
            { pos: new Vector3(0, wallHeight / 2, arenaSize), size: new Vector3(arenaSize * 2, wallHeight, 1) },
            { pos: new Vector3(0, wallHeight / 2, -arenaSize), size: new Vector3(arenaSize * 2, wallHeight, 1) }
        ];
        walls.forEach((wall, index) => {
            const wallMesh = MeshBuilder.CreateBox(`wall_${index}`, {
                width: wall.size.x,
                height: wall.size.y,
                depth: wall.size.z
            }, this.scene);
            wallMesh.position = wall.pos;
            wallMesh.physicsImpostor = new PhysicsImpostor(wallMesh, PhysicsImpostor.BoxImpostor, { mass: 0, restitution: 0.5 }, this.scene);
        });
    }
    spawnEnemyWave(waveNumber) {
        const enemyCount = Math.min(3 + waveNumber * 2, 15);
        const spawnRadius = 30;
        for (let i = 0; i < enemyCount; i++) {
            this.spawnEnemy(spawnRadius, i);
        }
        console.log(`👹 Spawned wave ${waveNumber} with ${enemyCount} enemies`);
    }
    spawnEnemy(spawnRadius, index) {
        const angle = (index / 8) * Math.PI * 2;
        const distance = spawnRadius + Math.random() * 10;
        const spawnPos = new Vector3(Math.cos(angle) * distance, 1, Math.sin(angle) * distance);
        const enemyAsset = this.loadedAssets.get('Enemy1');
        if (!enemyAsset || !enemyAsset.meshes[0])
            return;
        // Fix: Add null check and proper cloning parameters
        const sourceMesh = enemyAsset.meshes[0];
        if (!sourceMesh)
            return;
        const enemyMesh = sourceMesh.clone(`enemy_${index}`, null, false);
        if (!enemyMesh)
            return;
        enemyMesh.position = spawnPos;
        enemyMesh.setEnabled(true);
        const enemy = {
            mesh: enemyMesh,
            health: 60 + (this.waveNumber * 20),
            maxHealth: 60 + (this.waveNumber * 20),
            speed: 3 + (this.waveNumber * 0.5),
            damage: 15 + (this.waveNumber * 5),
            attackRange: 3,
            sightRange: 25,
            state: 'patrol',
            lastAttackTime: 0,
            attackCooldown: 2000,
            currentPatrolIndex: 0,
            patrolPoints: this.generatePatrolPoints(spawnPos),
            animations: new Map()
        };
        // Setup physics for enemy
        enemyMesh.physicsImpostor = new PhysicsImpostor(enemyMesh, PhysicsImpostor.CapsuleImpostor, { mass: 1, restitution: 0.1 }, this.scene);
        // Clone animations if available
        if (enemyAsset.animationGroups) {
            enemyAsset.animationGroups.forEach((animGroup, animIndex) => {
                const clonedAnim = animGroup.clone(`enemy_${index}_anim_${animIndex}`, (oldTarget) => {
                    return enemyMesh.getChildren().find(child => child.name === oldTarget.name) || enemyMesh;
                });
                enemy.animations.set(animGroup.name, clonedAnim);
            });
        }
        this.enemies.push(enemy);
    }
    generatePatrolPoints(center) {
        const points = [];
        const radius = 8;
        const numPoints = 4;
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            points.push(new Vector3(center.x + Math.cos(angle) * radius, center.y, center.z + Math.sin(angle) * radius));
        }
        return points;
    }
    equipInitialWeapon() {
        const startingWeapon = this.weapons.get('CombatPistol');
        if (startingWeapon) {
            this.equipWeapon(startingWeapon);
            this.player.inventory.push(startingWeapon);
        }
    }
    equipWeapon(weapon) {
        // Hide currently equipped weapon
        if (this.player.equippedWeapon?.mesh) {
            this.player.equippedWeapon.mesh.setEnabled(false);
        }
        // Equip new weapon
        this.player.equippedWeapon = weapon;
        if (weapon.mesh && this.player.mesh) {
            weapon.mesh.setEnabled(true);
            weapon.mesh.parent = this.player.mesh;
            weapon.mesh.position = new Vector3(0.5, 0.5, 0.8);
            weapon.mesh.rotation = new Vector3(0, Math.PI / 4, 0);
        }
        this.updateWeaponHUD();
        console.log(`🔫 Equipped ${weapon.name}`);
    }
    fireWeapon() {
        if (!this.player.equippedWeapon || this.isReloading)
            return;
        const weapon = this.player.equippedWeapon;
        const now = performance.now();
        const fireInterval = 60000 / weapon.fireRate; // Convert RPM to ms
        if (now - this.lastFireTime < fireInterval)
            return;
        // Check ammo
        const currentAmmo = this.player.ammo.get(weapon.name) || 0;
        if (currentAmmo <= 0 && weapon.type !== 'melee' && weapon.type !== 'club') {
            console.log('🔫 Out of ammo!');
            return;
        }
        this.lastFireTime = now;
        if (weapon.type === 'melee' || weapon.type === 'club') {
            this.performMeleeAttack(weapon);
        }
        else {
            this.performRangedAttack(weapon);
            this.player.ammo.set(weapon.name, currentAmmo - 1);
        }
        this.updateWeaponHUD();
    }
    performRangedAttack(weapon) {
        this.createMuzzleFlash(weapon);
        this.applyRecoil(weapon);
        const ray = this.createFireRay();
        const hit = this.scene.pickWithRay(ray);
        if (hit?.hit) {
            this.processHit(hit, weapon);
        }
        this.createBulletTrail(ray.origin, hit?.pickedPoint || ray.direction.scale(weapon.range));
        console.log(`🔥 Fired ${weapon.name}`);
    }
    performMeleeAttack(weapon) {
        const meleeTargets = this.enemies.filter(enemy => Vector3.Distance(this.player.position, enemy.mesh.position) <= weapon.range);
        meleeTargets.forEach(enemy => {
            this.damageEnemy(enemy, weapon.damage);
        });
        this.createMeleeEffect();
        console.log(`⚔️ ${weapon.type} attack with ${weapon.name}`);
    }
    createFireRay() {
        if (this.isThirdPerson) {
            const camera = this.camera;
            const forward = camera.target.subtract(camera.position).normalize();
            return new Ray(camera.position, forward);
        }
        else {
            const camera = this.camera;
            return new Ray(camera.position, camera.getForwardRay().direction);
        }
    }
    processHit(hit, weapon) {
        if (!hit.pickedMesh)
            return;
        const hitEnemy = this.enemies.find(enemy => hit.pickedMesh === enemy.mesh ||
            (hit.pickedMesh && enemy.mesh.getChildren().includes(hit.pickedMesh)));
        if (hitEnemy) {
            this.damageEnemy(hitEnemy, weapon.damage);
            this.createBloodEffect(hit.pickedPoint);
        }
        else {
            this.createImpactEffect(hit.pickedPoint);
        }
    }
    damageEnemy(enemy, damage) {
        enemy.health -= damage;
        if (enemy.health <= 0) {
            this.killEnemy(enemy);
        }
        else {
            enemy.state = 'chase';
            enemy.target = this.player.position.clone();
        }
    }
    killEnemy(enemy) {
        enemy.state = 'dead';
        enemy.mesh.dispose();
        this.enemiesKilled++;
        this.score += 100 * this.waveNumber;
        const index = this.enemies.indexOf(enemy);
        if (index > -1) {
            this.enemies.splice(index, 1);
        }
        if (this.enemies.length === 0) {
            this.startNextWave();
        }
        this.updateScoreHUD();
        console.log(`💀 Enemy eliminated! Score: ${this.score}`);
    }
    startNextWave() {
        this.waveNumber++;
        setTimeout(() => {
            this.spawnEnemyWave(this.waveNumber);
        }, 3000);
        console.log(`🌊 Wave ${this.waveNumber} incoming!`);
    }
    // Add missing stub for performSlide:
    performSlide() {
        console.log('⛹️ Slide not implemented yet');
    }
    // Keep only one copy of the following methods (removed duplicate copies):
    switchWeapon(index) {
        if (index < 0 || index >= this.player.inventory.length)
            return;
        const newWeapon = this.player.inventory[index];
        if (newWeapon === this.player.equippedWeapon)
            return;
        this.equipWeapon(newWeapon);
        console.log(`🔫 Switched to ${newWeapon.name}`);
    }
    reloadWeapon() {
        if (!this.player.equippedWeapon || this.isReloading)
            return;
        const weapon = this.player.equippedWeapon;
        if (weapon.type === 'melee' || weapon.type === 'club')
            return;
        console.log(`🔄 Reloading ${weapon.name}...`);
        this.isReloading = true;
        setTimeout(() => {
            if (this.player.equippedWeapon === weapon) {
                const maxAmmo = weapon.ammoCapacity;
                const currentAmmo = this.player.ammo.get(weapon.name) || 0;
                if (currentAmmo < maxAmmo) {
                    this.player.ammo.set(weapon.name, maxAmmo);
                    console.log(`✅ Reloaded ${weapon.name}`);
                }
            }
            this.isReloading = false;
        }, weapon.reloadTime * 1000);
    }
    aimDownSights() {
        if (!this.isThirdPerson && this.camera instanceof FreeCamera) {
            if (this.camera.fov === Math.PI / 1.5) {
                this.camera.fov = Math.PI / 2.2;
                this.camera.angularSensibility = 400;
                console.log('🔍 Aiming');
            }
            else {
                this.camera.fov = Math.PI / 1.5;
                this.camera.angularSensibility = 300;
                console.log('👁️ Hip fire');
            }
        }
    }
    dash() {
        if (!this.player.mesh || !this.player.mesh.physicsImpostor)
            return;
        const camera = this.camera;
        let forward = Vector3.Zero();
        if (this.isThirdPerson) {
            const arcCamera = camera;
            forward = arcCamera.target.subtract(arcCamera.position).normalize();
        }
        else {
            const freeCamera = camera;
            forward = freeCamera.getDirection(Vector3.Forward());
        }
        forward.y = 0;
        forward.normalize();
        const dashForce = forward.scale(this.player.speed * 25);
        this.player.mesh.physicsImpostor.applyImpulse(dashForce, this.player.mesh.getAbsolutePosition());
        console.log('💨 Dash!');
    }
    toggleSlowMotion() {
        const currentTimeScale = this.scene.getAnimationRatio();
        if (currentTimeScale === 1) {
            this.scene.animationTimeScale = 0.4; // fixed property name
            // Removed physicsTimeScale since it does not exist
            console.log('⏱️ Bullet time activated!');
            setTimeout(() => {
                this.scene.animationTimeScale = 1;
                console.log('⏱️ Bullet time deactivated');
            }, 3000);
        }
        else {
            this.scene.animationTimeScale = 1;
            console.log('⏱️ Bullet time deactivated');
        }
    }
    startGameLoop() {
        this.engine.runRenderLoop(() => {
            const deltaTime = this.engine.getDeltaTime() / 1000;
            this.physicsManager.update(deltaTime);
            this.updateGame(deltaTime);
            this.updateHUD();
            const targetFPS = 60;
            const maxDeltaTime = 1 / targetFPS;
            if (deltaTime > maxDeltaTime) {
                this.scene.animationTimeScale = maxDeltaTime / deltaTime;
            }
            else {
                this.scene.animationTimeScale = 1;
            }
        });
    }
    // Add missing stubs for firing and visual effects:
    createMuzzleFlash(weapon) {
        console.log(`💥 Muzzle flash for ${weapon.name} (stub)`);
    }
    applyRecoil(weapon) {
        console.log(`↻ Applied recoil for ${weapon.name} (stub)`);
    }
    createBulletTrail(start, end) {
        console.log('🔫 Bullet trail (stub)');
    }
    createMeleeEffect() {
        console.log('⚔️ Melee effect (stub)');
    }
    createBloodEffect(pickedPoint) {
        console.log('🩸 Blood effect (stub)');
    }
    createImpactEffect(pickedPoint) {
        console.log('💥 Impact effect (stub)');
    }
    updateGame(deltaTime) {
        this.updatePlayerCamera();
        this.updateEnemyAI(deltaTime);
    }
    updateEnemyAI(deltaTime) {
        this.enemies.forEach(enemy => {
            switch (enemy.state) {
                case 'patrol':
                    this.updateEnemyPatrol(enemy, deltaTime);
                    break;
                case 'chase':
                    this.updateEnemyChase(enemy, deltaTime);
                    break;
                case 'attack':
                    this.updateEnemyAttack(enemy, deltaTime);
                    break;
                case 'dead':
                    // Do nothing, or play death animation
                    break;
            }
        });
    }
    updateEnemyPatrol(enemy, deltaTime) {
        // Patrol logic
        if (enemy.patrolPoints.length === 0)
            return;
        const target = enemy.patrolPoints[enemy.currentPatrolIndex];
        const direction = target.subtract(enemy.mesh.position).normalize();
        enemy.mesh.position.addInPlace(direction.scale(enemy.speed * deltaTime));
        // Check arrival at patrol point
        if (Vector3.Distance(enemy.mesh.position, target) < 1) {
            enemy.currentPatrolIndex = (enemy.currentPatrolIndex + 1) % enemy.patrolPoints.length;
        }
        // Check player sight
        if (Vector3.Distance(enemy.mesh.position, this.player.position) < enemy.sightRange) {
            enemy.state = 'chase';
            enemy.target = this.player.position.clone();
        }
    }
    updateEnemyChase(enemy, deltaTime) {
        if (!enemy.target)
            return;
        // Move towards player
        const direction = enemy.target.subtract(enemy.mesh.position).normalize();
        enemy.mesh.position.addInPlace(direction.scale(enemy.speed * deltaTime));
        // Check attack range
        if (Vector3.Distance(enemy.mesh.position, this.player.position) <= enemy.attackRange) {
            enemy.state = 'attack';
        }
        // If player escapes sight, go back to patrol
        if (Vector3.Distance(enemy.mesh.position, this.player.position) > enemy.sightRange) {
            enemy.state = 'patrol';
            enemy.currentPatrolIndex = (enemy.currentPatrolIndex + 1) % enemy.patrolPoints.length;
        }
    }
    updateEnemyAttack(enemy, deltaTime) {
        // Attack logic (e.g., deal damage to player)
        if (enemy.lastAttackTime + enemy.attackCooldown < performance.now()) {
            // Deal damage to player
            this.damagePlayer(enemy.damage);
            enemy.lastAttackTime = performance.now();
        }
        // If player escapes, go back to chase
        if (Vector3.Distance(enemy.mesh.position, this.player.position) > enemy.attackRange) {
            enemy.state = 'chase';
            enemy.target = this.player.position.clone();
        }
    }
    damagePlayer(amount) {
        this.player.health -= amount;
        if (this.player.health <= 0) {
            this.player.health = 0;
            this.gameOver();
        }
        this.updateHUD();
    }
    gameOver() {
        console.log('💀 Game Over!');
        // Implement game over logic (e.g., show menu, restart level, etc.)
    }
    updatePlayerCamera() {
        if (!this.player.mesh)
            return;
        // Third-person camera follow
        if (this.isThirdPerson) {
            const offset = new Vector3(0, 1.5, -4);
            this.camera.position = this.player.mesh.position.add(offset);
            this.camera.setTarget(this.player.mesh.position);
        }
        else {
            // First-person or free camera
            this.camera.position = this.player.mesh.position.add(new Vector3(0, 1.5, 0));
            this.camera.setTarget(this.player.mesh.position.add(this.camera.getForwardRay().direction));
        }
    }
    updateHUD() {
        // Update HUD elements like health, ammo, score, etc.
        this.updateWeaponHUD();
        this.updateScoreHUD();
    }
    // UI methods
    updateWeaponHUD() {
        // This would be implemented to update the weapon HUD
        // For now, just log the current weapon status
        if (!this.player.equippedWeapon)
            return;
        const weapon = this.player.equippedWeapon;
        const ammo = this.player.ammo.get(weapon.name) || 0;
        console.log(`HUD: ${weapon.name} | Ammo: ${ammo}/${weapon.ammoCapacity}`);
    }
    updateScoreHUD() {
        // This would update score and stats on the HUD
        console.log(`HUD: Score: ${this.score} | Enemies killed: ${this.enemiesKilled}`);
    }
    updateFPSDisplay(fps) {
        // This would update the FPS counter on the HUD
        console.log(`Performance: ${fps} FPS`);
    }
}
