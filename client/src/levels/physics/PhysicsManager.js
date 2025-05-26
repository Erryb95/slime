import { Vector3 } from '@babylonjs/core/Maths/math.vector';
// Physics will be initialized when Rapier WASM loads
let RAPIER = null;
export class PhysicsManager {
    constructor(_scene) {
        // Scene parameter reserved for future mesh-physics synchronization
    }
    async initialize() {
        try {
            // Import Rapier physics engine
            RAPIER = await import('@dimforge/rapier3d-compat');
            await RAPIER.init();
            // Create physics world
            this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
            console.log('Rapier physics engine initialized with 128Hz simulation');
            return true;
        }
        catch (error) {
            console.error('Failed to initialize physics engine:', error);
            return false;
        }
    }
    createRigidBody(position, bodyType = 'dynamic', shape = 'box', size = new Vector3(1, 1, 1)) {
        if (!this.world || !RAPIER)
            return null;
        // Create rigid body descriptor
        let bodyDesc;
        switch (bodyType) {
            case 'static':
                bodyDesc = RAPIER.RigidBodyDesc.fixed();
                break;
            case 'kinematic':
                bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
                break;
            default:
                bodyDesc = RAPIER.RigidBodyDesc.dynamic();
        }
        bodyDesc.setTranslation(position.x, position.y, position.z);
        const rigidBody = this.world.createRigidBody(bodyDesc);
        // Create collider descriptor
        let colliderDesc;
        switch (shape) {
            case 'sphere':
                colliderDesc = RAPIER.ColliderDesc.ball(size.x);
                break;
            case 'capsule':
                colliderDesc = RAPIER.ColliderDesc.capsule(size.y, size.x);
                break;
            default:
                colliderDesc = RAPIER.ColliderDesc.cuboid(size.x, size.y, size.z);
        }
        // Set physics properties
        colliderDesc.setFriction(0.5);
        colliderDesc.setRestitution(0.3);
        colliderDesc.setDensity(1.0);
        // Create collider
        const collider = this.world.createCollider(colliderDesc, rigidBody);
        return { rigidBody, collider };
    }
    createCharacterController(position, radius = 0.5, height = 1.8) {
        if (!this.world || !RAPIER)
            return null;
        // Create character controller for FPS movement
        const characterController = this.world.createCharacterController(0.01);
        // Configure character controller
        characterController.enableAutostep(0.5, 0.2, true);
        characterController.enableSnapToGround(0.5);
        characterController.setApplyImpulsesToDynamicBodies(true);
        // Create collider for character
        const colliderDesc = RAPIER.ColliderDesc.capsule(height / 2, radius);
        colliderDesc.setTranslation(position.x, position.y, position.z);
        colliderDesc.setFriction(0.0); // No friction for smooth FPS movement
        const collider = this.world.createCollider(colliderDesc);
        return { characterController, collider };
    }
    moveCharacter(characterController, collider, movement, deltaTime) {
        if (!this.world || !RAPIER || !characterController)
            return;
        // Scale movement by delta time for frame-rate independent movement
        const scaledMovement = movement.scale(deltaTime);
        // Compute desired movement
        const desiredTranslation = {
            x: scaledMovement.x,
            y: scaledMovement.y,
            z: scaledMovement.z
        };
        // Move character
        characterController.computeColliderMovement(collider, desiredTranslation);
        const correctedMovement = characterController.computedMovement();
        // Apply movement to collider
        const currentPos = collider.translation();
        const newPos = {
            x: currentPos.x + correctedMovement.x,
            y: currentPos.y + correctedMovement.y,
            z: currentPos.z + correctedMovement.z
        };
        collider.setTranslation(newPos, true);
        return new Vector3(newPos.x, newPos.y, newPos.z);
    }
    raycast(origin, direction, maxDistance = 1000) {
        if (!this.world || !RAPIER)
            return null;
        const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: direction.x, y: direction.y, z: direction.z });
        const hit = this.world.castRay(ray, maxDistance, true);
        if (hit) {
            return {
                point: new Vector3(hit.point.x, hit.point.y, hit.point.z),
                normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
                distance: hit.toi,
                collider: hit.collider
            };
        }
        return null;
    }
    update(_deltaTime) {
        if (!this.world)
            return;
        // Step physics simulation at fixed 128Hz regardless of framerate
        const targetFPS = 128;
        const fixedTimeStep = 1.0 / targetFPS;
        // Accumulate time and step physics in fixed intervals
        this.world.timestep = fixedTimeStep;
        this.world.step();
    }
    dispose() {
        if (this.world) {
            this.world.free();
            this.world = null;
        }
    }
    getWorld() {
        return this.world;
    }
}
