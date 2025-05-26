import { Scene, Sound, Vector3 } from '@babylonjs/core';

export interface AudioConfig {
    name: string;
    file: string;
    volume: number;
    loop: boolean;
    spatial: boolean;
    maxDistance?: number;
}

export class AudioManager {
    private scene: Scene;
    private sounds: Map<string, Sound> = new Map();
    private masterVolume: number = 1.0;
    private sfxVolume: number = 1.0;
    private musicVolume: number = 0.5;

    private audioConfigs: Map<string, AudioConfig> = new Map([
        ['rifle_shot', {
            name: 'rifle_shot',
            file: '/assets/sounds/ak47_shot.mp3',
            volume: 0.8,
            loop: false,
            spatial: true,
            maxDistance: 100
        }],
        ['reload', {
            name: 'reload',
            file: '/assets/sounds/galil_reload.mp3',
            volume: 0.6,
            loop: false,
            spatial: true,
            maxDistance: 50
        }]
    ]);

    constructor(scene: Scene) {
        this.scene = scene;
    }

    async initialize(): Promise<void> {
        console.log('Initializing AudioManager...');
        
        // Preload important sounds
        const importantSounds = ['rifle_shot', 'reload'];
        for (const soundName of importantSounds) {
            await this.loadSound(soundName);
        }
        
        console.log('AudioManager initialized');
    }

    private async loadSound(soundName: string): Promise<Sound | null> {
        const config = this.audioConfigs.get(soundName);
        if (!config) {
            console.warn(`Audio config not found for: ${soundName}`);
            return null;
        }

        try {
            const sound = new Sound(
                config.name,
                config.file,
                this.scene,
                () => {
                    console.log(`Sound loaded: ${config.name}`);
                },
                {
                    loop: config.loop,
                    autoplay: false,
                    volume: config.volume * this.sfxVolume * this.masterVolume,
                    spatialSound: config.spatial,
                    maxDistance: config.maxDistance || 100,
                    rolloffFactor: 1,
                    refDistance: 1,
                    distanceModel: 'exponential'
                }
            );

            this.sounds.set(soundName, sound);
            return sound;

        } catch (error) {
            console.error(`Failed to load sound ${soundName}:`, error);
            return null;
        }
    }    async playSound(soundName: string, position?: Vector3, delay: number = 0): Promise<void> {
        let sound = this.sounds.get(soundName);
        
        if (!sound) {
            const loadedSound = await this.loadSound(soundName);
            if (!loadedSound) return;
            sound = loadedSound;
        }

        try {
            if (position && sound.spatialSound) {
                sound.setPosition(position);
            }

            if (delay > 0) {
                setTimeout(() => {
                    sound?.play();
                }, delay);
            } else {
                sound.play();
            }
        } catch (error) {
            console.error(`Failed to play sound ${soundName}:`, error);
        }
    }

    stopSound(soundName: string): void {
        const sound = this.sounds.get(soundName);
        if (sound) {
            sound.stop();
        }
    }

    stopAllSounds(): void {
        this.sounds.forEach(sound => {
            sound.stop();
        });
    }

    setMasterVolume(volume: number): void {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }

    setSfxVolume(volume: number): void {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }

    setMusicVolume(volume: number): void {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }

    private updateAllVolumes(): void {
        this.sounds.forEach((sound, name) => {
            const config = this.audioConfigs.get(name);
            if (config) {
                const finalVolume = config.volume * this.sfxVolume * this.masterVolume;
                sound.setVolume(finalVolume);
            }
        });
    }

    getMasterVolume(): number {
        return this.masterVolume;
    }

    getSfxVolume(): number {
        return this.sfxVolume;
    }

    getMusicVolume(): number {
        return this.musicVolume;
    }

    dispose(): void {
        this.sounds.forEach(sound => {
            sound.dispose();
        });
        this.sounds.clear();
    }

    // Add a new sound configuration at runtime
    addSoundConfig(config: AudioConfig): void {
        this.audioConfigs.set(config.name, config);
    }

    // Play weapon firing sound with position
    playWeaponFire(weaponType: string, position: Vector3): void {
        // Map weapon types to sound names
        const soundMap: { [key: string]: string } = {
            'rifle': 'rifle_shot',
            'pistol': 'rifle_shot', // Using same sound for now
            'sniper': 'rifle_shot',
            'shotgun': 'rifle_shot'
        };

        const soundName = soundMap[weaponType] || 'rifle_shot';
        this.playSound(soundName, position);
    }

    // Play reload sound
    playReload(position?: Vector3): void {
        this.playSound('reload', position);
    }
}
