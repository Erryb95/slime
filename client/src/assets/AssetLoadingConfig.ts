// Asset Loading Configuration for SLIME FPS with Multi-Source Asset Integration
// Supports Unity FPS Sample, KenneyNL, TheDahoom, Miziziziz, and Anarch asset collections

export interface TextureSet {
  diffuse?: string;
  normal?: string;
  metalness?: string;
  roughness?: string;
  emission?: string;
  occlusion?: string;
  [key: string]: string | undefined; // Allow additional texture properties
}

export interface WeaponSkin {
  textures: TextureSet;
}

export interface WeaponAsset {
  model: string;
  displayName: string;
  category: 'rifle' | 'pistol' | 'shotgun' | 'sniper' | 'smg' | 'melee';
  source: 'unity' | 'kenney' | 'dahoom' | 'miziziziz' | 'anarch' | 'custom' | 'ultimate';
  skins: Record<string, WeaponSkin>;
  stats?: {
    damage: number;
    fireRate: number;
    range: number;
    accuracy: number;
  };
}

export interface CharacterAsset {
  model: string;
  displayName: string;
  category: 'player' | 'enemy' | 'npc';
  source: 'unity' | 'kenney' | 'dahoom' | 'miziziziz' | 'anarch' | 'custom' | 'ultimate';
  skins: Record<string, WeaponSkin>;
  animations?: Record<string, string>; // Animation file paths
}

export interface MapAsset {
  path: string;
  displayName: string;
  source: 'unity' | 'kenney' | 'dahoom' | 'miziziziz' | 'anarch' | 'custom' | 'ultimate';
  category: 'arena' | 'city' | 'industrial' | 'outdoor' | 'retro' | 'demo';
  textures: Record<string, string>;
  spawnPoints?: Array<{x: number, y: number, z: number}>;
  description?: string;
  features?: string[];
  gameMode?: string;
  maxPlayers?: number;
  recommendedPlayers?: number;
}

export interface AssetConfig {
  weapons: Record<string, WeaponAsset>;
  characters: Record<string, CharacterAsset>;
  maps: Record<string, MapAsset>;
  sounds: Record<string, string>;
  props?: Record<string, {
    model: string;
    displayName: string;
    category: string;
    source: string;
  }>;
}

export const ASSET_CONFIG: AssetConfig = {
  weapons: {
    ak47: {
      model: 'models/ak47.babylon',
      displayName: 'AK-47',
      category: 'rifle',
      source: 'unity',
      stats: {
        damage: 35,
        fireRate: 600,
        range: 100,
        accuracy: 85
      },
      skins: {
        default: {
          textures: {
            diffuse: 'models/textures/Low_Poly_AKM_Texture.webp',
            normal: 'models/textures/Low_Poly_AKM_Normal.webp',
            metalness: 'models/textures/Low_Poly_AKM_Metalness.webp'
          }
        },
        unity_variant: {
          textures: {
            diffuse: 'fps-assets/ClientApp/resources/models/textures/Low_Poly_AKM_Texture.webp',
            normal: 'fps-assets/ClientApp/resources/models/textures/Low_Poly_AKM_Normal.webp',
            metalness: 'fps-assets/ClientApp/resources/models/textures/Low_Poly_AKM_Metalness.webp'
          }
        }
      }
    },
    // KenneyNL Starter Kit FPS Weapons
    kenney_pistol: {
      model: 'kenney-fps/weapons/pistol.glb',
      displayName: 'Kenney Pistol',
      category: 'pistol',
      source: 'kenney',
      stats: {
        damage: 25,
        fireRate: 300,
        range: 50,
        accuracy: 90
      },
      skins: {
        default: {
          textures: {
            diffuse: 'kenney-fps/textures/weapons/pistol_diffuse.png'
          }
        }
      }
    },
    kenney_rifle: {
      model: 'kenney-fps/weapons/rifle.glb',
      displayName: 'Kenney Assault Rifle',
      category: 'rifle',
      source: 'kenney',
      stats: {
        damage: 30,
        fireRate: 500,
        range: 80,
        accuracy: 75
      },
      skins: {
        default: {
          textures: {
            diffuse: 'kenney-fps/textures/weapons/rifle_diffuse.png'
          }
        }
      }
    },
    kenney_shotgun: {
      model: 'kenney-fps/weapons/shotgun.glb',
      displayName: 'Kenney Shotgun',
      category: 'shotgun',
      source: 'kenney',
      stats: {
        damage: 70,
        fireRate: 120,
        range: 30,
        accuracy: 60
      },
      skins: {
        default: {
          textures: {
            diffuse: 'kenney-fps/textures/weapons/shotgun_diffuse.png'
          }
        }
      }
    },    // TheDahoom FPS Multiplayer Template Weapons
    dahoom_pistol: {
      model: 'dahoom-fps/imports/pistol.glb',
      displayName: 'Dahoom Combat Pistol',
      category: 'pistol',
      source: 'dahoom',
      stats: {
        damage: 30,
        fireRate: 400,
        range: 55,
        accuracy: 85
      },
      skins: {
        default: {
          textures: {
            diffuse: 'dahoom-fps/textures/kenney_prototype_textures/orange/texture_07.png'
          }
        },
        dark: {
          textures: {
            diffuse: 'dahoom-fps/textures/kenney_prototype_textures/dark/texture_09.png'
          }
        }
      }
    },
    // Anarch Public Domain Weapons (sprite-based retro weapons)
    anarch_axe: {
      model: 'sprite', // Special marker for sprite-based weapons
      displayName: 'Anarch Axe',
      category: 'melee',
      source: 'anarch',
      stats: {
        damage: 50,
        fireRate: 150,
        range: 5,
        accuracy: 95
      },
      skins: {
        default: {
          textures: {
            diffuse: 'anarch/assets/weapon_axe.png'
          }
        }
      }
    },
    anarch_knife: {
      model: 'sprite',
      displayName: 'Anarch Knife',
      category: 'melee',
      source: 'anarch',
      stats: {
        damage: 30,
        fireRate: 250,
        range: 3,
        accuracy: 100
      },
      skins: {
        default: {
          textures: {
            diffuse: 'anarch/assets/weapon_knife.png'
          }
        }
      }
    },
    anarch_machinegun: {
      model: 'sprite',
      displayName: 'Anarch Machine Gun',
      category: 'rifle',
      source: 'anarch',
      stats: {
        damage: 25,
        fireRate: 800,
        range: 70,
        accuracy: 70
      },
      skins: {
        default: {
          textures: {
            diffuse: 'anarch/assets/weapon_machinegun.png'
          }
        }
      }
    },
    anarch_plasmagun: {
      model: 'sprite',
      displayName: 'Anarch Plasma Gun',
      category: 'rifle',
      source: 'anarch',
      stats: {
        damage: 45,
        fireRate: 300,
        range: 85,
        accuracy: 80
      },
      skins: {
        default: {
          textures: {
            diffuse: 'anarch/assets/weapon_plasmagun.png'
          }
        }
      }
    },
    anarch_rocketlauncher: {
      model: 'sprite',
      displayName: 'Anarch Rocket Launcher',
      category: 'rifle',
      source: 'anarch',
      stats: {
        damage: 100,
        fireRate: 60,
        range: 120,
        accuracy: 60
      },
      skins: {
        default: {
          textures: {
            diffuse: 'anarch/assets/weapon_rocketlauncher.png'
          }
        }
      }
    },
    anarch_shotgun: {
      model: 'sprite',
      displayName: 'Anarch Shotgun',
      category: 'shotgun',
      source: 'anarch',
      stats: {
        damage: 75,
        fireRate: 100,
        range: 25,
        accuracy: 65
      },
      skins: {
        default: {
          textures: {
            diffuse: 'anarch/assets/weapon_shotgun.png'
          }
        }
      }
    }
  },
  characters: {
    yBot: {
      model: 'models/yBot.babylon',
      displayName: 'Unity yBot',
      category: 'player',
      source: 'unity',
      skins: {
        default: {
          textures: {
            diffuse: 'models/textures/yBot_diffuse.jpg'
          }
        }
      },
      animations: {
        idle: 'models/animations/yBot_idle.babylon',
        walk: 'models/animations/yBot_walk.babylon',
        run: 'models/animations/yBot_run.babylon'
      }
    },
    // KenneyNL Characters
    kenney_soldier: {
      model: 'kenney-fps/characters/soldier.glb',
      displayName: 'Kenney Soldier',
      category: 'player',
      source: 'kenney',
      skins: {
        default: {
          textures: {
            diffuse: 'kenney-fps/textures/characters/soldier_diffuse.png'
          }
        },
        urban: {
          textures: {
            diffuse: 'kenney-fps/textures/characters/soldier_urban.png'
          }
        }
      }
    },
    kenney_enemy: {
      model: 'kenney-fps/characters/enemy.glb',
      displayName: 'Kenney Enemy',
      category: 'enemy',
      source: 'kenney',
      skins: {
        default: {
          textures: {
            diffuse: 'kenney-fps/textures/characters/enemy_diffuse.png'
          }
        }
      }    },
    // Anarch Characters (sprite-based retro enemies)
    anarch_spider: {
      model: 'sprite',
      displayName: 'Anarch Spider',
      category: 'enemy',
      source: 'anarch',
      skins: {
        idle: {
          textures: {
            diffuse: 'anarch/assets/monster_spider_idle.png'
          }
        },
        walk: {
          textures: {
            diffuse: 'anarch/assets/monster_spider_walk.png'
          }
        },
        attack: {
          textures: {
            diffuse: 'anarch/assets/monster_spider_attack.png'
          }
        }
      }
    },
    anarch_destroyer: {
      model: 'sprite',
      displayName: 'Anarch Destroyer',
      category: 'enemy',
      source: 'anarch',
      skins: {
        idle: {
          textures: {
            diffuse: 'anarch/assets/monster_destroyer_idle.png'
          }
        },
        walk: {
          textures: {
            diffuse: 'anarch/assets/monster_destroyer_walk.png'
          }
        },
        attack: {
          textures: {
            diffuse: 'anarch/assets/monster_destroyer_attack.png'
          }
        }
      }
    },
    anarch_warrior: {
      model: 'sprite',
      displayName: 'Anarch Warrior',
      category: 'enemy',
      source: 'anarch',
      skins: {
        idle: {
          textures: {
            diffuse: 'anarch/assets/monster_warrior_idle.png'
          }
        },
        attack: {
          textures: {
            diffuse: 'anarch/assets/monster_warrior_attack.png'
          }
        }
      }
    },
    anarch_turret: {
      model: 'sprite',
      displayName: 'Anarch Turret',
      category: 'enemy',
      source: 'anarch',
      skins: {
        idle: {
          textures: {
            diffuse: 'anarch/assets/monster_turret_idle.png'
          }
        },
        walk: {
          textures: {
            diffuse: 'anarch/assets/monster_turret_walk.png'
          }
        },
        attack: {
          textures: {
            diffuse: 'anarch/assets/monster_turret_attack.png'
          }
        }
      }
    },
    anarch_ender: {
      model: 'sprite',
      displayName: 'Anarch Ender',
      category: 'enemy',
      source: 'anarch',
      skins: {
        idle: {
          textures: {
            diffuse: 'anarch/assets/monster_ender_idle.png'
          }
        },
        walk: {
          textures: {
            diffuse: 'anarch/assets/monster_ender_walk.png'
          }
        },
        attack: {
          textures: {
            diffuse: 'anarch/assets/monster_ender_attack.png'
          }
        }
      }
    },
    anarch_plasmabot: {
      model: 'sprite',
      displayName: 'Anarch Plasma Bot',
      category: 'enemy',
      source: 'anarch',
      skins: {
        idle: {
          textures: {
            diffuse: 'anarch/assets/monster_plasmabot_idle.png'
          }
        },
        attack: {
          textures: {
            diffuse: 'anarch/assets/monster_plasmabot_attack.png'
          }
        }
      }
    },
    // Miziziziz Retro 3D Graphics Collection
    retro_bot: {
      model: 'retro3d/characters/bot.obj',
      displayName: 'Retro Bot',
      category: 'enemy',
      source: 'miziziziz',
      skins: {
        default: {
          textures: {
            diffuse: 'retro3d/textures/bot_diffuse.png'
          }
        },
        neon: {
          textures: {
            diffuse: 'retro3d/textures/bot_neon.png',
            emission: 'retro3d/textures/bot_emission.png'
          }
        }
      }
    },
    retro_guard: {
      model: 'retro3d/characters/guard.obj',
      displayName: 'Retro Guard',
      category: 'enemy',
      source: 'miziziziz',
      skins: {
        default: {
          textures: {
            diffuse: 'retro3d/textures/guard_diffuse.png'
          }
        }
      }
    },
    // Anarch Characters
    anarch_player: {
      model: 'anarch/characters/player.obj',
      displayName: 'Anarch Player',
      category: 'player',
      source: 'anarch',
      skins: {
        default: {
          textures: {
            diffuse: 'anarch/textures/player_diffuse.png'
          }
        }
      }
    }  },  maps: {
    // Ultimate FPS Demo Level - Comprehensive asset integration showcase
    ultimate_fps_demo: {
      path: 'ultimate-fps-demo',
      displayName: 'Ultimate FPS Demo Level',
      source: 'ultimate',
      category: 'demo',
      textures: {},
      description: 'Comprehensive FPS demo featuring third-person camera, weapon systems, physics, and all downloaded assets from elite repositories',
      features: [
        'Third-person camera system with competitive optimizations',
        'Advanced weapon systems with recoil patterns',
        'Character controller with physics and animations',
        'Visual effects (muzzle flash, bullet trails, explosions)',
        '240Hz optimization and post-processing pipeline',
        'Elite asset integration from multiple sources',
        'Professional death animations and ragdoll physics',
        'Complete input handling (WASD, weapon switching, camera toggle)'
      ],
      gameMode: 'Demo/Training',
      maxPlayers: 1,
      recommendedPlayers: 1,      spawnPoints: [
        {x: 0, y: 2, z: 0}
      ]
    },

    // Enhanced Ultimate FPS Demo Level - Advanced competitive FPS experience
    ultimate_fps_demo_enhanced: {
      path: 'ultimate-fps-demo-enhanced',
      displayName: 'Enhanced Ultimate FPS Demo',
      source: 'ultimate',
      category: 'demo',
      textures: {},
      description: 'Advanced competitive FPS experience with enemies, AI, multiple weapons, wave-based combat, and camera switching',
      features: [
        'Advanced enemy AI with patrol, chase, and attack behaviors',
        'Wave-based enemy spawning system with increasing difficulty',
        'Multiple weapon types: rifles, pistols, shotguns, snipers, melee, clubs',
        '1st and 3rd person camera switching (C key)',
        'Physics-based combat with raycast hit detection',
        'Comprehensive HUD with health, ammo, score, and wave information',
        'Cover objects, weapon pickups, and arena boundaries',
        'Performance monitoring and game statistics',
        'Advanced particle systems and visual effects',
        'Competitive 240Hz optimization for smooth gameplay'
      ],
      gameMode: 'Survival/Wave Defense',
      maxPlayers: 1,
      recommendedPlayers: 1,
      spawnPoints: [
        {x: 0, y: 2, z: 0}
      ]
    },
    
    // Unity FPS Sample Maps  
    firstLevel: {
      path: 'fps-assets/ClientApp/resources/levels/firstLevel.babylon',
      displayName: 'Unity First Level',
      source: 'unity',
      category: 'industrial',
      textures: {
        gradient: 'fps-assets/ClientApp/resources/levels/textures/Gradient.webp',
        ground: 'fps-assets/ClientApp/resources/levels/textures/GroundTexture.webp',
        medieval_blocks_diffuse: 'fps-assets/ClientApp/resources/levels/textures/medieval_blocks_06_diff_4k.webp',
        medieval_blocks_normal: 'fps-assets/ClientApp/resources/levels/textures/medieval_blocks_06_nor_gl_4k.webp',
        medieval_blocks_rough: 'fps-assets/ClientApp/resources/levels/textures/medieval_blocks_06_rough_4k.webp',
        rock_diffuse: 'fps-assets/ClientApp/resources/levels/textures/rock_pitted_mossy_diff_4k.webp',
        rusty_metal_diffuse: 'fps-assets/ClientApp/resources/levels/textures/rusty_metal_02_diff_4k.webp',
        rusty_metal_rough: 'fps-assets/ClientApp/resources/levels/textures/rusty_metal_02_rough_4k.webp',
        rust_coarse_diffuse: 'fps-assets/ClientApp/resources/levels/textures/rust_coarse_01_diff_4k.webp'
      },
      spawnPoints: [
        {x: 0, y: 2, z: 0},
        {x: 10, y: 2, z: 10},
        {x: -10, y: 2, z: -10},
        {x: 15, y: 2, z: -5}
      ]
    },
    training: {
      path: 'fps-assets/ClientApp/resources/levels/training.babylon',
      displayName: 'Unity Training Ground',
      source: 'unity',
      category: 'outdoor',
      textures: {
        gradient: 'fps-assets/ClientApp/resources/levels/textures/Gradient.webp',
        ground: 'fps-assets/ClientApp/resources/levels/textures/GroundTexture.webp'
      },
      spawnPoints: [
        {x: 0, y: 1, z: 0}
      ]
    },
    // KenneyNL FPS Starter Kit Maps
    kenney_arena: {
      path: 'kenney-fps/maps/arena.glb',
      displayName: 'Kenney Arena',
      source: 'kenney',
      category: 'arena',
      textures: {
        floor: 'kenney-fps/textures/maps/arena_floor.png',
        walls: 'kenney-fps/textures/maps/arena_walls.png'
      },
      spawnPoints: [
        {x: -5, y: 1, z: -5},
        {x: 5, y: 1, z: 5},
        {x: -5, y: 1, z: 5},
        {x: 5, y: 1, z: -5}
      ]
    },
    // Retro 3D Collection Maps
    retro_city: {
      path: 'retro3d/maps/city_block.obj',
      displayName: 'Retro City Block',
      source: 'miziziziz',
      category: 'city',
      textures: {
        buildings: 'retro3d/textures/city_buildings.png',
        ground: 'retro3d/textures/city_ground.png',
        sky: 'retro3d/textures/city_sky.png'
      },
      spawnPoints: [
        {x: 0, y: 1, z: 0},
        {x: 20, y: 1, z: 20},
        {x: -20, y: 1, z: -20}
      ]
    },    // Anarch Minimalist Map
    anarch_maze: {
      path: 'anarch/maps/maze.obj',
      displayName: 'Anarch Maze',
      source: 'anarch',
      category: 'arena',
      textures: {
        walls: 'anarch/textures/maze_walls.png',
        floor: 'anarch/textures/maze_floor.png'
      },
      spawnPoints: [
        {x: 0, y: 0.5, z: 0},
        {x: 10, y: 0.5, z: 10},
        {x: -10, y: 0.5, z: -10}
      ]
    },

    // Calinou Game Maps Collection - Sauerbraten Maps (Classic Arena FPS)
    sauerbraten_anubis: {
      path: 'calinou-maps/sauerbraten/anubis.obj',
      displayName: 'Anubis (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/anubis.mtl'
      }
    },
    sauerbraten_asteroids: {
      path: 'calinou-maps/sauerbraten/asteroids.obj',
      displayName: 'Asteroids (Sauerbraten)',
      source: 'custom',
      category: 'outdoor',
      textures: {
        material: 'calinou-maps/sauerbraten/asteroids.mtl'
      }
    },
    sauerbraten_collide: {
      path: 'calinou-maps/sauerbraten/collide.obj',
      displayName: 'Collide (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/collide.mtl'
      }
    },
    sauerbraten_core_transfer: {
      path: 'calinou-maps/sauerbraten/core_transfer.obj',
      displayName: 'Core Transfer (Sauerbraten)',
      source: 'custom',
      category: 'industrial',
      textures: {
        material: 'calinou-maps/sauerbraten/core_transfer.mtl'
      }
    },
    sauerbraten_forge: {
      path: 'calinou-maps/sauerbraten/forge.obj',
      displayName: 'Forge (Sauerbraten)',
      source: 'custom',
      category: 'industrial',
      textures: {
        material: 'calinou-maps/sauerbraten/forge.mtl'
      }
    },
    sauerbraten_gorge: {
      path: 'calinou-maps/sauerbraten/gorge.obj',
      displayName: 'Gorge (Sauerbraten)',
      source: 'custom',
      category: 'outdoor',
      textures: {
        material: 'calinou-maps/sauerbraten/gorge.mtl'
      }
    },
    sauerbraten_oasis: {
      path: 'calinou-maps/sauerbraten/oasis.obj',
      displayName: 'Oasis (Sauerbraten)',
      source: 'custom',
      category: 'outdoor',
      textures: {
        material: 'calinou-maps/sauerbraten/oasis.mtl'
      }
    },
    sauerbraten_tatooine: {
      path: 'calinou-maps/sauerbraten/tatooine.obj',
      displayName: 'Tatooine (Sauerbraten)',
      source: 'custom',
      category: 'outdoor',
      textures: {
        material: 'calinou-maps/sauerbraten/tatooine.mtl'
      }
    },

    // Red Eclipse Maps
    redeclipse_auster: {
      path: 'calinou-maps/redeclipse/auster.obj',
      displayName: 'Auster (Red Eclipse)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/redeclipse/auster.mtl'
      }
    },
    redeclipse_cargo16: {
      path: 'calinou-maps/redeclipse/cargo16.obj',
      displayName: 'Cargo 16 (Red Eclipse)',
      source: 'custom',
      category: 'industrial',
      textures: {
        material: 'calinou-maps/redeclipse/cargo16.mtl'
      }
    },
    redeclipse_conquest: {
      path: 'calinou-maps/redeclipse/conquest.obj',
      displayName: 'Conquest (Red Eclipse)',
      source: 'custom',
      category: 'city',
      textures: {
        material: 'calinou-maps/redeclipse/conquest.mtl'
      }
    },
    redeclipse_echo: {
      path: 'calinou-maps/redeclipse/echo.obj',
      displayName: 'Echo (Red Eclipse)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/redeclipse/echo.mtl'
      }
    },
    redeclipse_institute: {
      path: 'calinou-maps/redeclipse/institute.obj',
      displayName: 'Institute (Red Eclipse)',
      source: 'custom',
      category: 'city',
      textures: {
        material: 'calinou-maps/redeclipse/institute.mtl'
      }
    },

    // Tesseract Maps
    tesseract_alphacorp: {
      path: 'calinou-maps/tesseract/alphacorp.obj',
      displayName: 'Alpha Corp (Tesseract)',
      source: 'custom',
      category: 'city',
      textures: {
        material: 'calinou-maps/tesseract/alphacorp.mtl'
      }
    },
    tesseract_complex: {
      path: 'calinou-maps/tesseract/complex.obj',
      displayName: 'Complex (Tesseract)',
      source: 'custom',
      category: 'industrial',
      textures: {
        material: 'calinou-maps/tesseract/complex.mtl'
      }
    },
    tesseract_reflection: {
      path: 'calinou-maps/tesseract/reflection.obj',
      displayName: 'Reflection (Tesseract)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/tesseract/reflection.mtl'
      }
    },    tesseract_turbine: {
      path: 'calinou-maps/tesseract/turbine.obj',
      displayName: 'Turbine (Tesseract)',
      source: 'custom',
      category: 'industrial',
      textures: {
        material: 'calinou-maps/tesseract/turbine.mtl'
      }
    },

    // Additional Sauerbraten Maps
    sauerbraten_curvedm: {
      path: 'calinou-maps/sauerbraten/curvedm.obj',
      displayName: 'Curved M (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/curvedm.mtl'
      }
    },
    sauerbraten_darkdeath: {
      path: 'calinou-maps/sauerbraten/darkdeath.obj',
      displayName: 'Dark Death (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/darkdeath.mtl'
      }
    },
    sauerbraten_depot: {
      path: 'calinou-maps/sauerbraten/depot.obj',
      displayName: 'Depot (Sauerbraten)',
      source: 'custom',
      category: 'industrial',
      textures: {
        material: 'calinou-maps/sauerbraten/depot.mtl'
      }
    },
    sauerbraten_earthstation: {
      path: 'calinou-maps/sauerbraten/earthstation.obj',
      displayName: 'Earth Station (Sauerbraten)',
      source: 'custom',
      category: 'outdoor',
      textures: {
        material: 'calinou-maps/sauerbraten/earthstation.mtl'
      }
    },
    sauerbraten_eternal_valley: {
      path: 'calinou-maps/sauerbraten/eternal_valley.obj',
      displayName: 'Eternal Valley (Sauerbraten)',
      source: 'custom',
      category: 'outdoor',
      textures: {
        material: 'calinou-maps/sauerbraten/eternal_valley.mtl'
      }
    },
    sauerbraten_evilness: {
      path: 'calinou-maps/sauerbraten/evilness.obj',
      displayName: 'Evilness (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/evilness.mtl'
      }
    },
    sauerbraten_fb_capture: {
      path: 'calinou-maps/sauerbraten/fb_capture.obj',
      displayName: 'FB Capture (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/fb_capture.mtl'
      }
    },
    sauerbraten_fc3: {
      path: 'calinou-maps/sauerbraten/fc3.obj',
      displayName: 'FC3 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/fc3.mtl'
      }
    },
    sauerbraten_fc4: {
      path: 'calinou-maps/sauerbraten/fc4.obj',
      displayName: 'FC4 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/fc4.mtl'
      }
    },
    sauerbraten_fc5: {
      path: 'calinou-maps/sauerbraten/fc5.obj',
      displayName: 'FC5 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/fc5.mtl'
      }
    },
    sauerbraten_fdm6: {
      path: 'calinou-maps/sauerbraten/fdm6.obj',
      displayName: 'FDM6 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/fdm6.mtl'
      }
    },
    sauerbraten_frozen: {
      path: 'calinou-maps/sauerbraten/frozen.obj',
      displayName: 'Frozen (Sauerbraten)',
      source: 'custom',
      category: 'outdoor',
      textures: {
        material: 'calinou-maps/sauerbraten/frozen.mtl'
      }
    },
    sauerbraten_hidden: {
      path: 'calinou-maps/sauerbraten/hidden.obj',
      displayName: 'Hidden (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/hidden.mtl'
      }
    },
    sauerbraten_killcore3: {
      path: 'calinou-maps/sauerbraten/killcore3.obj',
      displayName: 'Killcore 3 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/killcore3.mtl'
      }
    },
    sauerbraten_killfactory: {
      path: 'calinou-maps/sauerbraten/killfactory.obj',
      displayName: 'Kill Factory (Sauerbraten)',
      source: 'custom',
      category: 'industrial',
      textures: {
        material: 'calinou-maps/sauerbraten/killfactory.mtl'
      }
    },
    sauerbraten_kmap5: {
      path: 'calinou-maps/sauerbraten/kmap5.obj',
      displayName: 'Kmap5 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/kmap5.mtl'
      }
    },
    sauerbraten_ksauer1: {
      path: 'calinou-maps/sauerbraten/ksauer1.obj',
      displayName: 'KSauer1 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/ksauer1.mtl'
      }
    },
    sauerbraten_k_rpg1: {
      path: 'calinou-maps/sauerbraten/k_rpg1.obj',
      displayName: 'K RPG1 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/k_rpg1.mtl'
      }
    },
    sauerbraten_masdm: {
      path: 'calinou-maps/sauerbraten/masdm.obj',
      displayName: 'Masdm (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/masdm.mtl'
      }
    },
    sauerbraten_memento: {
      path: 'calinou-maps/sauerbraten/memento.obj',
      displayName: 'Memento (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/memento.mtl'
      }
    },
    sauerbraten_moonlite: {
      path: 'calinou-maps/sauerbraten/moonlite.obj',
      displayName: 'Moonlite (Sauerbraten)',
      source: 'custom',
      category: 'outdoor',
      textures: {
        material: 'calinou-maps/sauerbraten/moonlite.mtl'
      }
    },
    sauerbraten_pandora: {
      path: 'calinou-maps/sauerbraten/pandora.obj',
      displayName: 'Pandora (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/pandora.mtl'
      }
    },
    sauerbraten_purgatory: {
      path: 'calinou-maps/sauerbraten/purgatory.obj',
      displayName: 'Purgatory (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/purgatory.mtl'
      }
    },
    sauerbraten_rm1: {
      path: 'calinou-maps/sauerbraten/rm1.obj',
      displayName: 'RM1 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/rm1.mtl'
      }
    },
    sauerbraten_rm5: {
      path: 'calinou-maps/sauerbraten/rm5.obj',
      displayName: 'RM5 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/rm5.mtl'
      }
    },
    sauerbraten_shadowed: {
      path: 'calinou-maps/sauerbraten/shadowed.obj',
      displayName: 'Shadowed (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/shadowed.mtl'
      }
    },
    sauerbraten_skrdm1: {
      path: 'calinou-maps/sauerbraten/skrdm1.obj',
      displayName: 'Skrdm1 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/skrdm1.mtl'
      }
    },
    sauerbraten_skrsp1: {
      path: 'calinou-maps/sauerbraten/skrsp1.obj',
      displayName: 'Skrsp1 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/skrsp1.mtl'
      }
    },
    sauerbraten_tectonic: {
      path: 'calinou-maps/sauerbraten/tectonic.obj',
      displayName: 'Tectonic (Sauerbraten)',
      source: 'custom',
      category: 'outdoor',
      textures: {
        material: 'calinou-maps/sauerbraten/tectonic.mtl'
      }
    },
    sauerbraten_thetowers: {
      path: 'calinou-maps/sauerbraten/thetowers.obj',
      displayName: 'The Towers (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/thetowers.mtl'
      }
    },
    sauerbraten_turbulence: {
      path: 'calinou-maps/sauerbraten/turbulence.obj',
      displayName: 'Turbulence (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/turbulence.mtl'
      }
    },
    sauerbraten_wake5: {
      path: 'calinou-maps/sauerbraten/wake5.obj',
      displayName: 'Wake5 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/wake5.mtl'
      }
    },
    sauerbraten_warlock: {
      path: 'calinou-maps/sauerbraten/warlock.obj',
      displayName: 'Warlock (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/warlock.mtl'
      }
    },
    sauerbraten_zdm2: {
      path: 'calinou-maps/sauerbraten/zdm2.obj',
      displayName: 'ZDM2 (Sauerbraten)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/sauerbraten/zdm2.mtl'
      }
    },

    // Additional Red Eclipse Maps
    redeclipse_cyanide: {
      path: 'calinou-maps/redeclipse/cyanide.obj',
      displayName: 'Cyanide (Red Eclipse)',
      source: 'custom',
      category: 'industrial',
      textures: {
        material: 'calinou-maps/redeclipse/cyanide.mtl'
      }
    },
    redeclipse_dutility: {
      path: 'calinou-maps/redeclipse/dutility.obj',
      displayName: 'Dutility (Red Eclipse)',
      source: 'custom',
      category: 'industrial',
      textures: {
        material: 'calinou-maps/redeclipse/dutility.mtl'
      }
    },
    redeclipse_edge: {
      path: 'calinou-maps/redeclipse/edge.obj',
      displayName: 'Edge (Red Eclipse)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/redeclipse/edge.mtl'
      }
    },
    redeclipse_ennui: {
      path: 'calinou-maps/redeclipse/ennui.obj',
      displayName: 'Ennui (Red Eclipse)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/redeclipse/ennui.mtl'
      }
    },
    redeclipse_fortitude: {
      path: 'calinou-maps/redeclipse/fortitude.obj',
      displayName: 'Fortitude (Red Eclipse)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/redeclipse/fortitude.mtl'
      }
    },
    redeclipse_octavus: {
      path: 'calinou-maps/redeclipse/octavus.obj',
      displayName: 'Octavus (Red Eclipse)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/redeclipse/octavus.mtl'
      }
    },
    redeclipse_rift: {
      path: 'calinou-maps/redeclipse/rift.obj',
      displayName: 'Rift (Red Eclipse)',
      source: 'custom',
      category: 'outdoor',
      textures: {
        material: 'calinou-maps/redeclipse/rift.mtl'
      }
    },
    redeclipse_trespass: {
      path: 'calinou-maps/redeclipse/trespass.obj',
      displayName: 'Trespass (Red Eclipse)',
      source: 'custom',
      category: 'city',
      textures: {
        material: 'calinou-maps/redeclipse/trespass.mtl'
      }
    },
    redeclipse_ubik: {
      path: 'calinou-maps/redeclipse/ubik.obj',
      displayName: 'Ubik (Red Eclipse)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/redeclipse/ubik.mtl'
      }
    },

    // Additional Tesseract Maps
    tesseract_ot: {
      path: 'calinou-maps/tesseract/ot.obj',
      displayName: 'OT (Tesseract)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/tesseract/ot.mtl'
      }
    },
    tesseract_steelribs: {
      path: 'calinou-maps/tesseract/steelribs.obj',
      displayName: 'Steel Ribs (Tesseract)',
      source: 'custom',
      category: 'industrial',
      textures: {
        material: 'calinou-maps/tesseract/steelribs.mtl'
      }
    },
    tesseract_test_ctf: {
      path: 'calinou-maps/tesseract/test_ctf.obj',
      displayName: 'Test CTF (Tesseract)',
      source: 'custom',
      category: 'arena',
      textures: {
        material: 'calinou-maps/tesseract/test_ctf.mtl'
      }
    },
    tesseract_waterworks: {
      path: 'calinou-maps/tesseract/waterworks.obj',
      displayName: 'Waterworks (Tesseract)',
      source: 'custom',
      category: 'industrial',
      textures: {
        material: 'calinou-maps/tesseract/waterworks.mtl'
      }
    }
  },sounds: {
    // Unity FPS Sample Sounds
    weapon_fire: 'sounds/weapon_fire.wav',
    footstep: 'sounds/footstep.wav',
    reload: 'sounds/reload.wav',
    ak47_shot: 'sounds/ak47_shot.mp3',
    galil_reload: 'sounds/galil_reload.mp3',
    
    // KenneyNL FPS Sounds
    kenney_pistol_fire: 'kenney-fps/sounds/pistol_fire.ogg',
    kenney_rifle_fire: 'kenney-fps/sounds/rifle_fire.ogg',
    kenney_shotgun_fire: 'kenney-fps/sounds/shotgun_fire.ogg',
    kenney_reload: 'kenney-fps/sounds/reload.ogg',
    kenney_footstep: 'kenney-fps/sounds/footstep.ogg',
    
    // Anarch Minimalist Sounds
    anarch_gun_fire: 'anarch/sounds/gun_fire.wav',
    anarch_footstep: 'anarch/sounds/footstep.wav',
    
    // UI Sounds
    menu_click: 'kenney-fps/sounds/ui/click.ogg',
    menu_hover: 'kenney-fps/sounds/ui/hover.ogg',
    game_start: 'kenney-fps/sounds/ui/game_start.ogg'
  },
  
  // Environmental Props and Objects
  props: {
    // KenneyNL Props
    kenney_crate: {
      model: 'kenney-fps/props/crate.glb',
      displayName: 'Wooden Crate',
      category: 'container',
      source: 'kenney'
    },
    kenney_barrel: {
      model: 'kenney-fps/props/barrel.glb',
      displayName: 'Metal Barrel',
      category: 'container',
      source: 'kenney'
    },
    kenney_wall: {
      model: 'kenney-fps/props/wall_section.glb',
      displayName: 'Wall Section',
      category: 'structure',
      source: 'kenney'
    },
    
    // Retro 3D Collection Props
    retro_crate: {
      model: 'retro3d/props/crate.obj',
      displayName: 'Retro Crate',
      category: 'container',
      source: 'miziziziz'
    },
    retro_pillar: {
      model: 'retro3d/props/pillar.obj',
      displayName: 'Retro Pillar',
      category: 'structure',
      source: 'miziziziz'
    },
    retro_computer: {
      model: 'retro3d/props/computer.obj',
      displayName: 'Retro Computer',
      category: 'interactive',
      source: 'miziziziz'
    },
    
    // Anarch Minimalist Props
    anarch_block: {
      model: 'anarch/props/block.obj',
      displayName: 'Simple Block',
      category: 'structure',
      source: 'anarch'
    },
    anarch_pickup: {
      model: 'anarch/props/pickup.obj',
      displayName: 'Health Pickup',
      category: 'powerup',
      source: 'anarch'
    }
  }
};

export const AssetLoadingConfig = {
  preloadAssets: {
    characters: [
      {
        name: 'yBot.babylon',
        path: '/assets/models/yBot.babylon',
        type: '.babylon',
        category: 'characters',
        babylonCompatible: true
      }
    ],
    weapons: [
      {
        name: 'ak47.babylon',
        path: '/assets/models/ak47.babylon',
        type: '.babylon',
        category: 'weapons',
        babylonCompatible: true
      }
    ],
    maps: [
      {
        name: 'firstLevel.babylon',
        path: '/assets/fps-assets/ClientApp/resources/levels/firstLevel.babylon',
        type: '.babylon',
        category: 'maps',
        babylonCompatible: true
      }
    ]
  },
  lazyLoadAssets: {
    weapons: [],
    characters: [],
    maps: [
      {
        name: 'training.babylon',
        path: '/assets/fps-assets/ClientApp/resources/levels/training.babylon',
        type: '.babylon',
        category: 'maps',
        babylonCompatible: true
      }
    ],
    textures: [
      {
        name: 'Low_Poly_AKM_Texture.webp',
        path: '/assets/fps-assets/ClientApp/resources/models/textures/Low_Poly_AKM_Texture.webp',
        type: '.webp',
        category: 'textures',
        babylonCompatible: true
      }
    ],
    animations: []
  },
  loadingPriorities: {
    weapons: 'high' as const,
    characters: 'high' as const,
    maps: 'medium' as const,
    textures: 'low' as const,
    animations: 'medium' as const
  }
} as const;

export type AssetCategory = keyof typeof AssetLoadingConfig.preloadAssets;
export type AssetPriority = 'high' | 'medium' | 'low';

export interface AssetFile {
  name: string;
  path: string;
  type: string;
  category: string;
  babylonCompatible: boolean;
}
