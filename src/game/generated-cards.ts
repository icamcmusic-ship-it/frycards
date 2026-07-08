// AUTO-GENERATED from data/live_cards.csv. Do not edit by hand.
// Names, art, types, rarity, color costs and keywords come from the source
// data; numeric stats are generated deterministically to make the Shifting
// Multiverse rules playable. This file is the offline fallback for the
// Supabase 'cards' table.
import { CardTemplate } from '../types';

export const GENERATED_CARDS: CardTemplate[] = [
  {
    "id": "abyssal_soul_eater",
    "name": "Abyssal Soul-Eater",
    "type": "Unit",
    "elements": [
      "Dark",
      "Nature"
    ],
    "rarity": "Legendary",
    "set": "Blue Coral",
    "keywords": [
      "Graveborn",
      "Siphon"
    ],
    "text": "Can be cast from your Graveyard during normal Action phases. Deals Siphon damage to enemies.",
    "cost": {
      "Dark": 1,
      "Nature": 1,
      "Generic": 2
    },
    "attack": 4,
    "health": 4
  },
  {
    "id": "chrono_phalanx",
    "name": "Chrono-Phalanx",
    "type": "Unit",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Legendary",
    "set": "Blue Coral",
    "keywords": [
      "Phalanx",
      "Armor 1"
    ],
    "text": "Gains +1/+1 for each other friendly unit on the board. Its maximum health shrinking causes destruction if damage exceeds the cap.",
    "cost": {
      "Frost": 1,
      "Tech": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 4
  },
  {
    "id": "modularity_core",
    "name": "Modularity Core",
    "type": "Item",
    "elements": [
      "Tech"
    ],
    "rarity": "Legendary",
    "set": "Blue Coral",
    "keywords": [
      "Modularity"
    ],
    "text": "Increases the host's Item capacity by +1. If lost, excess items are automatically destroyed.",
    "cost": {
      "Tech": 1,
      "Generic": 1
    },
    "attach": {
      "attack": 1,
      "health": 2
    }
  },
  {
    "id": "quantum_overclocker",
    "name": "Quantum Overclocker",
    "type": "Event",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Legendary",
    "set": "Blue Coral",
    "keywords": [
      "Overclock 3"
    ],
    "text": "Overclock 3. Draw 1 card. (Grants 3 temporary generic resources now, but subtracts 3 from your next resource roll).",
    "cost": {
      "Flame": 1,
      "Chaos": 1,
      "Generic": 3
    },
    "effect": {
      "action": "draw",
      "value": 1
    }
  },
  {
    "id": "lurking_coral_prowler",
    "name": "Lurking Coral-Prowler",
    "type": "Unit",
    "elements": [
      "Light",
      "Order"
    ],
    "rarity": "Legendary",
    "set": "Blue Coral",
    "keywords": [
      "Lurk",
      "Blitz"
    ],
    "text": "Cannot be targeted by enemy actions unless Guard is actively applied to it.",
    "cost": {
      "Light": 1,
      "Order": 1,
      "Generic": 2
    },
    "attack": 3,
    "health": 3
  },
  {
    "id": "starfall_wildcaster",
    "name": "Starfall Wildcaster",
    "type": "Event",
    "elements": [
      "Frost"
    ],
    "rarity": "Legendary",
    "set": "Blue Coral",
    "keywords": [
      "Wildcast 3"
    ],
    "text": "Wildcast 3: Deals 1 damage to 3 unique random enemy units.",
    "cost": {
      "Frost": 2,
      "Generic": 3
    },
    "effect": {
      "action": "damage",
      "value": 1,
      "target": "unit"
    }
  },
  {
    "id": "abyssal_dragonfish",
    "name": "Abyssal Dragonfish",
    "type": "Unit",
    "elements": [
      "Order",
      "Light"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "It lures the unwary into the darkest depths.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_dragonfish_with_a_long_glowing_chin_barbel_and_needle-thin__eea9a746-ad31-423e-a0fb-919ee9cf4960_3_result.webp?updatedAt=1778240811387",
    "cost": {
      "Order": 1,
      "Light": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 4
  },
  {
    "id": "slate_scaled_serpent",
    "name": "Slate-Scaled Serpent",
    "type": "Unit",
    "elements": [
      "Nature"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 2",
      "Pierce"
    ],
    "text": "A terror of the fiery deep.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_sea_serpent_with_scales_like_wet_slate_winding_through_a_fi_54fea323-2fae-43e7-8812-e2d0abc9a067_2_result.webp?updatedAt=1778240811232",
    "cost": {
      "Nature": 2,
      "Generic": 1
    },
    "attack": 3,
    "health": 2
  },
  {
    "id": "submerged_starfall",
    "name": "Submerged Starfall",
    "type": "Event",
    "elements": [
      "Tech",
      "Frost"
    ],
    "rarity": "Mythic",
    "set": "Blue Coral",
    "keywords": [
      "Echo",
      "Pure",
      "Meltdown"
    ],
    "text": "The sky falls, even where the sun never shines. Destroy an Item on target enemy Unit; deal Flame damage equal to the Item's cost to its host.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_meteor_shower_viewed_from_underwater_the_falling_stars_stre_48fcca4a-4ecc-4256-86ce-82944aea31a5_3_result.webp?updatedAt=1778240811310",
    "cost": {
      "Tech": 1,
      "Frost": 1,
      "Generic": 3
    },
    "effect": {
      "action": "meltdown",
      "target": "unit",
      "text": "Destroy an Item on target enemy Unit; deal Flame damage equal to the Item's cost to its host."
    }
  },
  {
    "id": "chrono_tide",
    "name": "Chrono-Tide",
    "type": "Event",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Super-Rare",
    "set": "Blue Coral",
    "keywords": [
      "Echo",
      "Pure"
    ],
    "text": "Time flows backwards in the deep currents. Draw 2 cards.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_magical_Rewinding--a_scene_where_debris_from_a_shipwreck_is_1b002426-719e-443e-9aae-e8bfdafef730_2_result.webp?updatedAt=1778240811008",
    "cost": {
      "Flame": 1,
      "Chaos": 1,
      "Generic": 2
    },
    "effect": {
      "action": "draw",
      "value": 2,
      "text": "Draw 2 cards."
    }
  },
  {
    "id": "cavernous_watcher",
    "name": "Cavernous Watcher",
    "type": "Unit",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 2",
      "Pierce"
    ],
    "text": "It sees every bet, every bluff, every lie.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_giant_squids_eye_peering_out_from_a_dark_cavern_reflecting__9f4568e6-8f48-4da9-aeb8-378e4b8f2e9c_3_result.webp?updatedAt=1778240810971",
    "cost": {
      "Frost": 1,
      "Tech": 1,
      "Generic": 3
    },
    "attack": 4,
    "health": 4
  },
  {
    "id": "isle_of_the_ancients",
    "name": "Isle of the Ancients",
    "type": "Location",
    "elements": [
      "Dark"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Siphon"
    ],
    "text": "A wandering sanctuary for the lost.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_massive_ancient_turtle_with_a_miniature_forest_of_glowing_k_0b28c470-63e2-410e-9a7c-0e0e6586ee62_1_result.webp?updatedAt=1778240811182",
    "cost": {
      "Dark": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "abyssal_pathway",
    "name": "Abyssal Pathway",
    "type": "Location",
    "elements": [
      "Light",
      "Order"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric"
    ],
    "text": "Follow the light, but beware where it leads.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_pathway_of_glowing_white_stones_leading_through_a_forest_of_a24cf650-819b-4289-9510-238b3185ad1b_0_result.webp?updatedAt=1778240810966",
    "cost": {
      "Light": 1,
      "Order": 1
    },
    "locEffect": "ATK_ALL"
  },
  {
    "id": "chalice_of_quicksilver",
    "name": "Chalice of Quicksilver",
    "type": "Charm",
    "elements": [
      "Chaos",
      "Flame"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Ward 2"
    ],
    "text": "A drink that shifts the odds in your favor.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_silver_chalice_overflowing_with_liquid_mercury_that_doesnt__f6a17126-acad-4fa9-bd2e-f87533ddc2bb_2_result.webp?updatedAt=1778240810929",
    "cost": {
      "Chaos": 1,
      "Flame": 1,
      "Generic": 2
    },
    "duration": 3
  },
  {
    "id": "the_abyssal_gate",
    "name": "The Abyssal Gate",
    "type": "Event",
    "elements": [
      "Order",
      "Light"
    ],
    "rarity": "Super-Rare",
    "set": "Blue Coral",
    "keywords": [
      "Echo",
      "Pure"
    ],
    "text": "Some doors should never be opened. Deal 3 damage to target enemy Unit.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/The_Unlocking_of_the_Abyss--the_moment_a_massive_rusted_iron__1f69fc59-93d3-4ed9-a37d-8e7f708404f3_0_result.webp?updatedAt=1778240811132",
    "cost": {
      "Order": 1,
      "Light": 1,
      "Generic": 2
    },
    "effect": {
      "action": "damage",
      "value": 3,
      "target": "unit",
      "text": "Deal 3 damage to target enemy Unit."
    }
  },
  {
    "id": "anchor_graveyard",
    "name": "Anchor Graveyard",
    "type": "Location",
    "elements": [
      "Nature"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric",
      "Fix Nature"
    ],
    "text": "Where heavy hearts and heavier bets sink.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_floating_graveyard_of_rusted_anchors_all_suspended_by_invis_0f881980-826a-4310-90be-a8ffa5f41207_3_result.webp?updatedAt=1778240811158",
    "cost": {
      "Nature": 2,
      "Generic": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "the_descent",
    "name": "The Descent",
    "type": "Location",
    "elements": [
      "Tech",
      "Frost"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric"
    ],
    "text": "Step carefully into the unknown.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_set_of_ancient_stone_stairs_disappearing_into_a_black_trenc_f0e27a68-c6eb-40e9-82e6-66491a25c5ff_1_result.webp?updatedAt=1778240810857",
    "cost": {
      "Tech": 1,
      "Frost": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "black_coral_thicket",
    "name": "Black Coral Thicket",
    "type": "Location",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric",
      "Fix Flame"
    ],
    "text": "A beautiful but deadly maze.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_forest_of_black_coral_trees_with_tiny_blue_bioluminescent_l_70fb12cc-e8e2-4f5e-a23e-2573262794b8_0_result.webp?updatedAt=1778240810633",
    "cost": {
      "Flame": 1,
      "Chaos": 1,
      "Generic": 1
    },
    "locEffect": "ATK_ALL"
  },
  {
    "id": "pearl_of_the_deep",
    "name": "Pearl of the Deep",
    "type": "Charm",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Super-Rare",
    "set": "Blue Coral",
    "keywords": [
      "Ward 3",
      "Detonate 3"
    ],
    "text": "A treasure worth risking it all.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/The_Birth_of_a_Pearl--a_clam_opening_to_reveal_a_pearl_that_i_c023b563-fafe-4f6b-a2bf-f00ea151b68a_0_result.webp?updatedAt=1778240810567",
    "cost": {
      "Frost": 1,
      "Tech": 1,
      "Generic": 2
    },
    "duration": 2
  },
  {
    "id": "avatar_of_the_abyss",
    "name": "Avatar of the Abyss",
    "type": "Leader",
    "elements": [
      "Dark",
      "Nature"
    ],
    "rarity": "Mythic",
    "set": "Blue Coral",
    "keywords": [
      "Command 2",
      "Ward 2",
      "Sustain 1"
    ],
    "text": "The ocean incarnate, commanding the tides.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_deity_of_the_deep_a_colossal_figure_made_of_water_and_glowi_6a37d7fc-859b-46f9-8c11-588c84e2c377_2_result.webp?updatedAt=1778240810664",
    "health": 24,
    "attack": 3
  },
  {
    "id": "crystalline_metropolis",
    "name": "Crystalline Metropolis",
    "type": "Location",
    "elements": [
      "Light",
      "Order"
    ],
    "rarity": "Super-Rare",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric",
      "Boost 1"
    ],
    "text": "A fragile empire within a bubble.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_city_of_crystalline_spires_built_inside_a_massive_air-fille_5a94c8d8-c7b0-4293-8b33-8bf6db250d5e_3_result.webp?updatedAt=1778240810555",
    "cost": {
      "Light": 1,
      "Order": 1,
      "Generic": 2
    },
    "locEffect": "SCORCH_ALL"
  },
  {
    "id": "mirror_hatchetfish",
    "name": "Mirror Hatchetfish",
    "type": "Unit",
    "elements": [
      "Chaos"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "Reflecting the greed of those who hunt them.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_school_of_hatchetfish_with_mirror-like_sides_reflecting_the_0c67e36f-eb21-48d2-b27e-8cc7a44a053e_1_result.webp?updatedAt=1778240810515",
    "cost": {
      "Chaos": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "sunken_meadow",
    "name": "Sunken Meadow",
    "type": "Location",
    "elements": [
      "Order",
      "Light"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric"
    ],
    "text": "Life finds a way to bloom in the dark.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_field_of_underwater_sunflowers_that_follow_the_movement_of__3e363e70-327e-4ace-b6dc-85dd3fc6900a_1_result.webp?updatedAt=1778240810457",
    "cost": {
      "Order": 1,
      "Light": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "kraken_s_monolith",
    "name": "Kraken's Monolith",
    "type": "Item",
    "elements": [
      "Nature"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 1",
      "Pierce"
    ],
    "text": "Marked by the beast that rules the depths.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_monolithic_shard_of_black_rock_covered_in_suction-cup_marks_dcc69ff6-c44d-433d-b958-60fa8d43ea1d_2_result.webp?updatedAt=1778240810417",
    "cost": {
      "Nature": 2,
      "Generic": 1
    },
    "attach": {
      "attack": 1,
      "health": 2
    }
  },
  {
    "id": "tang_s_refuge",
    "name": "Tang's Refuge",
    "type": "Unit",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A rusted relic repurposed by nature.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_coral-encrusted_anchor_with_a_school_of_yellow_tangs_dartin_9d490bbf-fd69-4d9f-85ea-9ad39f7cbadc_0_result.webp?updatedAt=1778240810362",
    "cost": {
      "Tech": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 1
  },
  {
    "id": "helix_swarm",
    "name": "Helix Swarm",
    "type": "Unit",
    "elements": [
      "Flame"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "The building blocks of deep-sea life.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_swarm_of_transparent_eels_forming_a_DNA-like_double_helix_i_eec43e67-782e-4eef-87c6-5a279cfa9914_0_result.webp?updatedAt=1778240810230",
    "cost": {
      "Flame": 1,
      "Generic": 2
    },
    "attack": 4,
    "health": 2
  },
  {
    "id": "topographic_behemoth",
    "name": "Topographic Behemoth",
    "type": "Unit",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 2",
      "Pierce"
    ],
    "text": "A living map of the ocean floor.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_massive_whale_shark_with_a_back_that_mimics_a_topographical_1a32bd7c-dde1-46f7-b9ff-7521ec945f29_1_result.webp?updatedAt=1778240810247",
    "cost": {
      "Frost": 1,
      "Tech": 1,
      "Generic": 2
    },
    "attack": 3,
    "health": 3
  },
  {
    "id": "phantom_squadron",
    "name": "Phantom Squadron",
    "type": "Unit",
    "elements": [
      "Dark"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "Silent gliders of the eerie depths.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_group_of_stingrays_flying_in_formation_through_a_thick_eeri_bb68c679-c5bd-4ba0-98c8-9f60512796ea_3_result.webp?updatedAt=1778240810174",
    "cost": {
      "Dark": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 3
  },
  {
    "id": "admiral_iron_claw",
    "name": "Admiral Iron-Claw",
    "type": "Unit",
    "elements": [
      "Light",
      "Order"
    ],
    "rarity": "Super-Rare",
    "set": "Blue Coral",
    "keywords": [
      "Wither 2",
      "Reap"
    ],
    "text": "A devastating strike from a mechanical arm.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_cyborg_Mantis_Shrimp_Admiral_one_of_its_powerful_clubs_repl_ff5f568c-a58e-4cc5-a92e-85d26c87bcac_0_result.webp?updatedAt=1778240810055",
    "cost": {
      "Light": 1,
      "Order": 1,
      "Generic": 3
    },
    "attack": 5,
    "health": 3
  },
  {
    "id": "swaying_garden",
    "name": "Swaying Garden",
    "type": "Unit",
    "elements": [
      "Chaos"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A hypnotic dance that masks their deadly strike.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_colony_of_garden_eels_swaying_in_the_current_like_tall_thin_d2a9f229-ddd8-4110-8f98-49128292584c_3_result.webp?updatedAt=1778240809945",
    "cost": {
      "Chaos": 1,
      "Generic": 1
    },
    "attack": 1,
    "health": 4
  },
  {
    "id": "nebula_clutch",
    "name": "Nebula Clutch",
    "type": "Charm",
    "elements": [
      "Order",
      "Light"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Detonate 2"
    ],
    "text": "The birthplace of cosmic horrors.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_cluster_of_eggs_that_look_like_glowing_nebula_clouds_inside_72f7f85f-bfe9-43fa-9c4e-ad1923daf616_2_result.webp?updatedAt=1778240809926",
    "cost": {
      "Order": 1,
      "Light": 1,
      "Generic": 1
    },
    "duration": 2
  },
  {
    "id": "eel_s_weave",
    "name": "Eel's Weave",
    "type": "Charm",
    "elements": [
      "Nature"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Ward 1"
    ],
    "text": "A spell woven from living bodies.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_magical_ritual_where_a_group_of_eels_weave_themselves_toget_4f318a23-e2a0-447e-8b22-6b966bf4161e_2_result.webp?updatedAt=1778240809724",
    "cost": {
      "Nature": 1,
      "Generic": 2
    },
    "duration": 3
  },
  {
    "id": "crown_of_the_reef",
    "name": "Crown of the Reef",
    "type": "Item",
    "elements": [
      "Tech",
      "Frost"
    ],
    "rarity": "Super-Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 3",
      "Glitch"
    ],
    "text": "Worn by the true ruler of the coral kingdom.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/An_intricate_crown_made_of_polished_red_coral_branching_into__3a3ea0a6-ea7c-4649-92e9-ad7054106425_0_result.webp?updatedAt=1778240809770",
    "cost": {
      "Tech": 1,
      "Frost": 1,
      "Generic": 3
    },
    "attach": {
      "attack": 2,
      "health": 2
    }
  },
  {
    "id": "obsidian_altar",
    "name": "Obsidian Altar",
    "type": "Location",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric",
      "Fix Flame"
    ],
    "text": "Sacrifices must be made to the deep gods.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_dark_jagged_obsidian_altar_surrounded_by_floating_glowing_j_83a15e58-9205-40db-ae35-bde8067cd9d7_1_result.webp?updatedAt=1778240809463",
    "cost": {
      "Flame": 1,
      "Chaos": 1,
      "Generic": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "submerged_archives",
    "name": "Submerged Archives",
    "type": "Location",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Super-Rare",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric",
      "Boost 1"
    ],
    "text": "Knowledge lost to the tides of time.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/An_ancient_library_of_stone_tablets_buried_under_a_mountain_o_1691e7a5-82d0-42a7-9657-132520f185c2_3_result.webp?updatedAt=1778240809532",
    "cost": {
      "Frost": 1,
      "Tech": 1,
      "Generic": 2
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "crimson_tube_worms",
    "name": "Crimson Tube Worms",
    "type": "Unit",
    "elements": [
      "Dark"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "Thriving in the boiling heat of the vents.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_cluster_of_tube_worms_with_bright_red_tips_surrounding_a_gl_45b1c039-8494-4c33-a2a9-2b0bc3797fc5_0_result.webp?updatedAt=1778240809528",
    "cost": {
      "Dark": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "sunken_timepiece",
    "name": "Sunken Timepiece",
    "type": "Charm",
    "elements": [
      "Light",
      "Order"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Detonate 1"
    ],
    "text": "Time stopped when the ship went down.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/An_ornate_pocket_watch_with_a_cracked_crystal_the_hands_indic_914062f7-eafc-4237-aef0-5a62dbfd1a6e_0_result.webp?updatedAt=1778240809395",
    "cost": {
      "Light": 1,
      "Order": 1,
      "Generic": 1
    },
    "duration": 3
  },
  {
    "id": "algal_veil",
    "name": "Algal Veil",
    "type": "Charm",
    "elements": [
      "Chaos"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Ward 1"
    ],
    "text": "A shimmering barrier hiding terrible secrets.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_curtain_of_glowing_silk-like_algae_hanging_from_a_trench_ce_5d030bc5-90c0-424e-80d2-dfd980605736_3_result.webp?updatedAt=1778240809320",
    "cost": {
      "Chaos": 1,
      "Generic": 2
    },
    "duration": 3
  },
  {
    "id": "ethereal_sea_witch",
    "name": "Ethereal Sea Witch",
    "type": "Leader",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Command 2",
      "Ward 2",
      "Boost 1"
    ],
    "text": "Her magic is as cold as the abyss.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_powerful_ethereal_Sea_Witch_with_pale_skin_and_glowing_viol_660bc480-f4fc-44d2-bd62-2cb96ed1204d_1_result.webp?updatedAt=1778240809298",
    "health": 26,
    "attack": 3
  },
  {
    "id": "flickering_sea_pens",
    "name": "Flickering Sea Pens",
    "type": "Unit",
    "elements": [
      "Nature"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "They light the way for the lost.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_field_of_Sea_Pens_that_flicker_with_light_when_a_current_pa_41cb66b4-0797-4f52-a784-f72fb1f1be73_0_result.webp?updatedAt=1778240809203",
    "cost": {
      "Nature": 1
    },
    "attack": 1,
    "health": 1
  },
  {
    "id": "spectral_leviathan",
    "name": "Spectral Leviathan",
    "type": "Unit",
    "elements": [
      "Tech",
      "Frost"
    ],
    "rarity": "Super-Rare",
    "set": "Blue Coral",
    "keywords": [
      "Wither 2",
      "Reap"
    ],
    "text": "The ghost of a predator long gone.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_massive_skeletal_fish_frame_made_of_glowing_blue_energy._--_b47e18ab-cbe2-4844-844e-24f5ebcc1af6_3_result.webp?updatedAt=1778240809144",
    "cost": {
      "Tech": 1,
      "Frost": 1,
      "Generic": 4
    },
    "attack": 5,
    "health": 6
  },
  {
    "id": "trench_gateway",
    "name": "Trench Gateway",
    "type": "Location",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric",
      "Fix Flame"
    ],
    "text": "The entrance to the underworld.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/An_ancient_stone_gateway_at_the_edge_of_a_trench_carved_with__d8f03894-8bc6-4beb-9691-835f7e9f2746_0_result.webp?updatedAt=1778240809168",
    "cost": {
      "Flame": 1,
      "Chaos": 1,
      "Generic": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "scale_butterfly",
    "name": "Scale Butterfly",
    "type": "Unit",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "A fragile beauty in a harsh environment.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_butterfly_made_of_thin_translucent_fish_scales_fluttering_n_7d17c6b1-0dda-4e42-88b9-727bf36c8309_1_result.webp?updatedAt=1778240808984",
    "cost": {
      "Frost": 1,
      "Tech": 1
    },
    "attack": 2,
    "health": 3
  },
  {
    "id": "deceptive_angler",
    "name": "Deceptive Angler",
    "type": "Unit",
    "elements": [
      "Dark"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 2",
      "Pierce"
    ],
    "text": "The light is a lie.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/An_anglerfish_with_a_lure_that_looks_like_a_miniature_glowing_4f5cff58-6150-46e2-930a-6e9b8d5e5743_0_result.webp?updatedAt=1778240808875",
    "cost": {
      "Dark": 2,
      "Generic": 2
    },
    "attack": 4,
    "health": 3
  },
  {
    "id": "bone_white_forest",
    "name": "Bone-White Forest",
    "type": "Location",
    "elements": [
      "Light",
      "Order"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric"
    ],
    "text": "A pale imitation of life above.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_submerged_forest_of_bone-white_trees_with_no_leaves_only_gl_c888190b-9576-4111-a460-f4996fb40443_2_result.webp?updatedAt=1778240808748",
    "cost": {
      "Light": 1,
      "Order": 1
    },
    "locEffect": "ATK_ALL"
  },
  {
    "id": "seabed_mandala",
    "name": "Seabed Mandala",
    "type": "Event",
    "elements": [
      "Chaos",
      "Flame"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Meltdown"
    ],
    "text": "A puzzle waiting to be solved. Destroy an Item on target enemy Unit; deal Flame damage equal to the Item's cost to its host.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_mysterious_complex_mandala_pattern_formed_on_the_seabed_by__38c5005d-a4e0-48f9-ac4c-c07852638134_3_result.webp?updatedAt=1778240808702",
    "cost": {
      "Chaos": 1,
      "Flame": 1,
      "Generic": 1
    },
    "effect": {
      "action": "meltdown",
      "target": "unit",
      "text": "Destroy an Item on target enemy Unit; deal Flame damage equal to the Item's cost to its host."
    }
  },
  {
    "id": "amethyst_starfish",
    "name": "Amethyst Starfish",
    "type": "Unit",
    "elements": [
      "Order",
      "Light"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "Beautiful, but incredibly toxic.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_crown-of-thorns_starfish_encrusted_with_amethyst_crystals_m_f337c7a6-fdfb-4b13-89dd-1966112e502f_0_result.webp?updatedAt=1778240808615",
    "cost": {
      "Order": 1,
      "Light": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 5
  },
  {
    "id": "constellation_crabs",
    "name": "Constellation Crabs",
    "type": "Unit",
    "elements": [
      "Nature"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "They navigate by the stars on their backs.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_field_of_Star-Crabs_whose_shells_perfectly_match_the_conste_0625aabd-67ee-4c7a-bd5d-7804dd3ad877_1_result.webp?updatedAt=1778240808497",
    "cost": {
      "Nature": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 1
  },
  {
    "id": "bound_leviathan",
    "name": "Bound Leviathan",
    "type": "Event",
    "elements": [
      "Tech",
      "Frost"
    ],
    "rarity": "Super-Rare",
    "set": "Blue Coral",
    "keywords": [
      "Pure"
    ],
    "text": "Even monsters can be chained. Draw 2 cards.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_deeply_corroded_iron_anchor_chain_wrapped_around_a_massive__536f12b8-3669-405e-b7f5-af9afcc8a0eb_3_result.webp?updatedAt=1778240808484",
    "cost": {
      "Tech": 1,
      "Frost": 1,
      "Generic": 2
    },
    "effect": {
      "action": "draw",
      "value": 2,
      "text": "Draw 2 cards."
    }
  },
  {
    "id": "filigree_nautilus",
    "name": "Filigree Nautilus",
    "type": "Charm",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Ward 2"
    ],
    "text": "A masterpiece of natural engineering.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_nautilus_shell_with_silver_filigree_patterns_floating_near__9743f9ec-196b-4de0-b0d9-428c7bb0a512_1_result.webp?updatedAt=1778240808098",
    "cost": {
      "Flame": 1,
      "Chaos": 1,
      "Generic": 2
    },
    "duration": 3
  },
  {
    "id": "haunted_submarine",
    "name": "Haunted Submarine",
    "type": "Location",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric",
      "Fix Frost"
    ],
    "text": "The crew never left their posts.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_shipwrecked_submarine_its_windows_glowing_with_an_eerie_rhy_878f43b1-3df3-4268-95f4-94b480b64fcd_2_result.webp?updatedAt=1778240808115",
    "cost": {
      "Frost": 1,
      "Tech": 1,
      "Generic": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "clash_of_titans",
    "name": "Clash of Titans",
    "type": "Event",
    "elements": [
      "Dark"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Obliterate"
    ],
    "text": "An eternal struggle in the deep. Obliterate target enemy Unit (bypasses Armor, no Parting Shot).",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_colossal_squid_wrestling_with_a_sperm_whale_both_covered_in_401e42b2-bd87-4baa-9399-4c20d6c67746_1_result.webp?updatedAt=1778240808225",
    "cost": {
      "Dark": 1,
      "Generic": 3
    },
    "effect": {
      "action": "obliterate",
      "target": "unit",
      "text": "Obliterate target enemy Unit (bypasses Armor, no Parting Shot)."
    }
  },
  {
    "id": "chrome_barracuda",
    "name": "Chrome Barracuda",
    "type": "Unit",
    "elements": [
      "Light",
      "Order"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "Fast, sharp, and deadly.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_barracuda_with_silver-chrome_skin_and_eyes_like_glowing_red_ada8f792-655a-4145-927e-92cebc81137b_2_result.webp?updatedAt=1778240808123",
    "cost": {
      "Light": 1,
      "Order": 1
    },
    "attack": 2,
    "health": 1
  },
  {
    "id": "crowned_manatee",
    "name": "Crowned Manatee",
    "type": "Unit",
    "elements": [
      "Chaos",
      "Flame"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 2",
      "Pierce"
    ],
    "text": "The gentle king of the shallows.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_friendly_manatee_wearing_a_crown_made_of_woven_seagrass_and_6f6efb07-a84f-4654-81f0-c8061f3a4db8_0_result.webp?updatedAt=1778240808072",
    "cost": {
      "Chaos": 1,
      "Flame": 1,
      "Generic": 2
    },
    "attack": 4,
    "health": 2
  },
  {
    "id": "tangled_seahorses",
    "name": "Tangled Seahorses",
    "type": "Unit",
    "elements": [
      "Order"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "Bound together for life.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_pair_of_seahorses_with_manes_like_flowing_seaweed_intertwin_9e7e08be-e4b8-4458-8a1e-3695070f3fd7_0_result.webp?updatedAt=1778240808016",
    "cost": {
      "Order": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "mer_king",
    "name": "Mer-King",
    "type": "Leader",
    "elements": [
      "Light",
      "Order"
    ],
    "rarity": "Super-Rare",
    "set": "Blue Coral",
    "keywords": [
      "Command 2",
      "Ward 2",
      "Codex 1"
    ],
    "text": "Ruler of the sunken realms.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_majestic_Mer-King_with_a_beard_like_flowing_white_seaweed_s_8914ae9c-6e33-441e-b460-124428685853_0_result.webp?updatedAt=1778240808133",
    "health": 44,
    "attack": 3
  },
  {
    "id": "star_patterned_manta",
    "name": "Star-Patterned Manta",
    "type": "Unit",
    "elements": [
      "Tech",
      "Frost"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "A constellation gliding through the water.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_manta_ray_with_a_pattern_on_its_back_that_looks_like_a_star_bb075896-de0e-4b19-96c0-55ac43799ff7_2_result.webp?updatedAt=1778240808118",
    "cost": {
      "Tech": 1,
      "Frost": 1
    },
    "attack": 2,
    "health": 3
  },
  {
    "id": "phantom_dumbo",
    "name": "Phantom Dumbo",
    "type": "Unit",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 2",
      "Pierce"
    ],
    "text": "A silent spirit of the abyss.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_ghostly_white_Dumbo_octopus_drifting_like_a_silk_handkerchi_d3c4362c-d921-4ff0-bb31-e5c0958eb86f_1_result.webp?updatedAt=1778240807975",
    "cost": {
      "Flame": 1,
      "Chaos": 1,
      "Generic": 2
    },
    "attack": 4,
    "health": 2
  },
  {
    "id": "isle_of_shells",
    "name": "Isle of Shells",
    "type": "Unit",
    "elements": [
      "Frost"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A moving fortress.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/An_ancient_colossal_turtle_the_Isle_of_Shells_with_a_fully_re_a1eaaeea-a159-4cca-96eb-9d78264914d5_3_result.webp?updatedAt=1778240807932",
    "cost": {
      "Frost": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 1
  },
  {
    "id": "sunken_bounty",
    "name": "Sunken Bounty",
    "type": "Item",
    "elements": [
      "Dark"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 1",
      "Pierce"
    ],
    "text": "Riches beyond imagination.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_sunken_chest_overflowing_with_gold_coins_and_colorful_tropi_fac78884-25c5-4b3d-9d68-23e0e846bea6_3_result.webp?updatedAt=1778240807627",
    "cost": {
      "Dark": 2,
      "Generic": 1
    },
    "attach": {
      "attack": 1,
      "health": 2
    }
  },
  {
    "id": "obsidian_trident",
    "name": "Obsidian Trident",
    "type": "Item",
    "elements": [
      "Light",
      "Order"
    ],
    "rarity": "Super-Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 3",
      "Glitch"
    ],
    "text": "A weapon of dark tides.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_trident_forged_from_obsidian_its_points_dripping_with_cold__6870a022-aa83-4909-9b92-f7af6f2fa303_0_result.webp?updatedAt=1778240807496",
    "cost": {
      "Light": 1,
      "Order": 1,
      "Generic": 3
    },
    "attach": {
      "attack": 2,
      "health": 3
    }
  },
  {
    "id": "pufferfish_lantern",
    "name": "Pufferfish Lantern",
    "type": "Item",
    "elements": [
      "Chaos"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [],
    "text": "A macabre source of light.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_lantern_made_from_a_dried_pufferfish_containing_a_pulsating_0f791616-9d72-4791-a835-3220c5494046_1_result.webp?updatedAt=1778240807631",
    "cost": {
      "Chaos": 1
    },
    "attach": {
      "attack": 1,
      "health": 1
    }
  },
  {
    "id": "gossamer_jellyfish",
    "name": "Gossamer Jellyfish",
    "type": "Unit",
    "elements": [
      "Order"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A deadly sting wrapped in beauty.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_translucent_jellyfish_with_long_trailing_tentacles_that_loo_4ca23972-d237-42d9-9a12-558b6f9ef5b1_1_result.webp?updatedAt=1778240807572",
    "cost": {
      "Order": 1,
      "Generic": 1
    },
    "attack": 1,
    "health": 4
  },
  {
    "id": "bubble_harvest",
    "name": "Bubble Harvest",
    "type": "Event",
    "elements": [
      "Nature"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Echo"
    ],
    "text": "Gathering fuel for the deep-sea cities. Freeze target enemy Unit.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/The_Gas_Bubble_Harvest--divers_collecting_giant_glowing_bubbl_11874af8-95d4-428d-9476-cd30818077aa_0_result.webp?updatedAt=1778240807415",
    "cost": {
      "Nature": 1,
      "Generic": 1
    },
    "effect": {
      "action": "freeze",
      "target": "unit",
      "text": "Freeze target enemy Unit."
    }
  },
  {
    "id": "submerged_statue",
    "name": "Submerged Statue",
    "type": "Location",
    "elements": [
      "Tech",
      "Frost"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric",
      "Fix Tech"
    ],
    "text": "A monument to a forgotten civilization.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_wide-angle_view_of_a_submerged_marble_statue_overgrown_with_b7f876db-c90f-4f66-8864-6f00a6944f91_3_result.webp?updatedAt=1778240807367",
    "cost": {
      "Tech": 1,
      "Frost": 1,
      "Generic": 1
    },
    "locEffect": "SCORCH_ALL"
  },
  {
    "id": "silver_chimera",
    "name": "Silver Chimera",
    "type": "Unit",
    "elements": [
      "Flame"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "A bizarre amalgamation of the deep.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_long-nosed_chimera_fish_with_silver_skin_gliding_through_a__c396adc5-f761-431a-a326-82aa3c19a4e9_0_result.webp?updatedAt=1778240807391",
    "cost": {
      "Flame": 1,
      "Generic": 2
    },
    "attack": 4,
    "health": 3
  },
  {
    "id": "glowing_glyph_tablet",
    "name": "Glowing Glyph Tablet",
    "type": "Charm",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Detonate 2"
    ],
    "text": "Words of power lost to the sea.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_fractured_ancient_stone_tablet_etched_with_glowing_blue_gly_6667b0eb-723e-473c-ab81-ff549b2d3875_1_result.webp?updatedAt=1778240807336",
    "cost": {
      "Frost": 1,
      "Tech": 1,
      "Generic": 2
    },
    "duration": 3
  },
  {
    "id": "the_mirrored_trench",
    "name": "The Mirrored Trench",
    "type": "Location",
    "elements": [
      "Dark"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric"
    ],
    "text": "A reflection of your deepest fears.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_deep-sea_trench_that_looks_like_a_crack_in_a_giant_mirror_r_7ea7ca3e-5bcd-4aab-8661-4e3a92c0d8c3_2_result.webp?updatedAt=1778240807209",
    "cost": {
      "Dark": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "towering_tsunami",
    "name": "Towering Tsunami",
    "type": "Event",
    "elements": [
      "Light"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [],
    "text": "The ocean's wrath unleashed. Purge target Unit: strip its Items, statuses and buffs.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_tsunami_wave_forming_viewed_as_a_massive_towering_wall_of_d_69ec0d39-3e05-4cab-b911-2a6c5112ef6a_3_result.webp?updatedAt=1778240807141",
    "cost": {
      "Light": 1,
      "Generic": 2
    },
    "effect": {
      "action": "damage",
      "value": 4,
      "target": "unit",
      "text": "Deal 4 damage to target enemy Unit."
    }
  },
  {
    "id": "whale_fall_ceremony",
    "name": "Whale Fall Ceremony",
    "type": "Event",
    "elements": [
      "Chaos",
      "Flame"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Meltdown"
    ],
    "text": "In death, there is life. Destroy an Item on target enemy Unit; deal Flame damage equal to the Item's cost to its host.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/The_Whale_Fall_Ceremony--a_solemn_gathering_of_deep-sea_creat_e6577084-83c0-45b9-bb06-59b0fda0f780_3_result.webp?updatedAt=1778240806908",
    "cost": {
      "Chaos": 1,
      "Flame": 1,
      "Generic": 1
    },
    "effect": {
      "action": "meltdown",
      "target": "unit",
      "text": "Destroy an Item on target enemy Unit; deal Flame damage equal to the Item's cost to its host."
    }
  },
  {
    "id": "krill_constellation",
    "name": "Krill Constellation",
    "type": "Unit",
    "elements": [
      "Order"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A guiding light in the darkness.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_swarm_of_tiny_glowing_krill_forming_the_shape_of_a_constell_0797d41a-7aee-4025-a9a2-d6b645ec6fc3_0_result.webp?updatedAt=1778240806784",
    "cost": {
      "Order": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "narwhal_staff",
    "name": "Narwhal Staff",
    "type": "Item",
    "elements": [
      "Nature"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 1",
      "Pierce"
    ],
    "text": "Channeling the energy of the deep.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_staff_made_of_narwhal_tusk_wrapped_in_copper_wire_and_toppe_642e4745-1fd2-4f06-b0d5-78edf967c08b_1_result.webp?updatedAt=1778240806491",
    "cost": {
      "Nature": 2,
      "Generic": 1
    },
    "attach": {
      "attack": 1,
      "health": 2
    }
  },
  {
    "id": "glass_kelp_forest",
    "name": "Glass Kelp Forest",
    "type": "Location",
    "elements": [
      "Tech",
      "Frost"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric"
    ],
    "text": "A fragile ecosystem.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_majestic_kelp_forest_where_the_leaves_are_made_of_stained_g_c338ead6-7b51-4583-baab-92b91e8f903f_1_result.webp?updatedAt=1778240806397",
    "cost": {
      "Tech": 1,
      "Frost": 1
    },
    "locEffect": "SCORCH_ALL"
  },
  {
    "id": "vampire_squid",
    "name": "Vampire Squid",
    "type": "Unit",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 2",
      "Pierce"
    ],
    "text": "A cloak of darkness.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_vampire_squid_draped_in_its_dark_red_webbing_with_glowing_e_d724e05e-82f7-413f-ad8b-fdb8386c585d_3_result.webp?updatedAt=1778240806512",
    "cost": {
      "Flame": 1,
      "Chaos": 1,
      "Generic": 2
    },
    "attack": 4,
    "health": 2
  },
  {
    "id": "volcanic_crab",
    "name": "Volcanic Crab",
    "type": "Unit",
    "elements": [
      "Frost"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "Forged in the heat of hydrothermal vents.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_leviathan-sized_crab_with_a_shell_that_looks_like_a_volcani_d72b1473-c170-4285-8096-c3ea80f67f67_0_result.webp?updatedAt=1778240806378",
    "cost": {
      "Frost": 1,
      "Generic": 1
    },
    "attack": 1,
    "health": 4
  },
  {
    "id": "clam_chest",
    "name": "Clam Chest",
    "type": "Item",
    "elements": [
      "Dark"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [],
    "text": "A trap for the greedy.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_cursed_treasure_chest_its_lid_made_of_a_giant_gaping_clam_m_646b1a5b-c10e-42d9-88cd-4be885f6351f_2_result.webp?updatedAt=1778240806311",
    "cost": {
      "Dark": 1
    },
    "attach": {
      "attack": 1,
      "health": 1
    }
  },
  {
    "id": "diver_s_lantern",
    "name": "Diver's Lantern",
    "type": "Item",
    "elements": [
      "Light"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Burden 1"
    ],
    "text": "A light in the crushing dark.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_divers_lantern_sitting_on_a_rock_casting_a_warm_yellow_circ_8f5a3b08-5be6-40b0-b41d-b3afb290fb0d_2_result.webp?updatedAt=1778240806221",
    "cost": {
      "Light": 1
    },
    "attach": {
      "attack": 1,
      "health": 1
    }
  },
  {
    "id": "clockwork_nautilus",
    "name": "Clockwork Nautilus",
    "type": "Unit",
    "elements": [
      "Chaos"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "Tick tock goes the deep.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_clockwork_mechanical_nautilus_built_from_brass_and_copper_g_4282f592-eaad-45f9-a0a3-295e288a56da_0_result.webp?updatedAt=1778240806041",
    "cost": {
      "Chaos": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 1
  },
  {
    "id": "obsidian_swordfish",
    "name": "Obsidian Swordfish",
    "type": "Unit",
    "elements": [
      "Order",
      "Light"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "Sharp as glass, fast as thought.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_swordfish_with_a_blade_made_of_shimmering_obsidian_cutting__7ebb5fa0-b9a0-475c-a4ff-59509058cc1b_3_result.webp?updatedAt=1778240805816",
    "cost": {
      "Order": 1,
      "Light": 1,
      "Generic": 1
    },
    "attack": 4,
    "health": 3
  },
  {
    "id": "bone_throne",
    "name": "Bone Throne",
    "type": "Location",
    "elements": [
      "Nature"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric",
      "Fix Nature"
    ],
    "text": "A seat for the king of the graveyard.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_submerged_throne_made_of_bleached_whale_bone_and_purple_cor_4987b871-e3b4-46b2-b336-9e247ae0befe_0_result.webp?updatedAt=1778240805775",
    "cost": {
      "Nature": 2,
      "Generic": 1
    },
    "locEffect": "ATK_ALL"
  },
  {
    "id": "blind_colossus",
    "name": "Blind Colossus",
    "type": "Unit",
    "elements": [
      "Tech",
      "Frost"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 2",
      "Pierce"
    ],
    "text": "It feels every vibration.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_colossal_ancient_blind_octopus_with_skin_like_cracked_stone_73d78e5b-ff6d-4eaf-9c47-ac3fa18394e5_3_result.webp?updatedAt=1778240805805",
    "cost": {
      "Tech": 1,
      "Frost": 1,
      "Generic": 3
    },
    "attack": 4,
    "health": 4
  },
  {
    "id": "merfolk_ritual",
    "name": "Merfolk Ritual",
    "type": "Charm",
    "elements": [
      "Flame"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Ward 1"
    ],
    "text": "A dance to summon the tide.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_ritual_dance_of_Merfolk_surrounding_a_massive_floating_bubb_0717ce3c-5805-4cef-94bf-e4dff324ba2a_0_result.webp?updatedAt=1778240805640",
    "cost": {
      "Flame": 1
    },
    "duration": 1
  },
  {
    "id": "coral_collapse",
    "name": "Coral Collapse",
    "type": "Event",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pure"
    ],
    "text": "The reef falls, taking all with it. Deal 2 damage to the enemy Leader.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_catastrophic_collapse_of_a_giant_ancient_brain_coral_struct_a38c386a-d90f-4176-b49c-830f332fa2c0_3_result.webp?updatedAt=1778240805449",
    "cost": {
      "Frost": 1,
      "Tech": 1
    },
    "effect": {
      "action": "damage",
      "value": 2,
      "target": "leader",
      "text": "Deal 2 damage to the enemy Leader."
    }
  },
  {
    "id": "iron_scaled_snail",
    "name": "Iron-Scaled Snail",
    "type": "Unit",
    "elements": [
      "Dark"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "Slow, but impenetrable.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_snail_with_a_shell_made_of_iron_scales_scaly-foot_gastropod_8cf873e3-0438-4e61-b7e8-642e47995d98_1_result.webp?updatedAt=1778240805399",
    "cost": {
      "Dark": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 1
  },
  {
    "id": "diamond_anchor",
    "name": "Diamond Anchor",
    "type": "Item",
    "elements": [
      "Light",
      "Order"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "It holds more than just ships.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_massive_anchor_made_of_solid_diamond_hooked_into_a_glowing__902455aa-dc5a-4112-8e50-c8a1aeb941a7_1_result.webp?updatedAt=1778240805295",
    "cost": {
      "Light": 1,
      "Order": 1
    },
    "attach": {
      "attack": 1,
      "health": 1
    }
  },
  {
    "id": "phantom_whale",
    "name": "Phantom Whale",
    "type": "Unit",
    "elements": [
      "Chaos"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "A ghost of the open ocean.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_phantom_silhouette_of_a_colossal_whale_composed_entirely_of_587f89bc-fae5-4641-9bc0-6644690f3ddb_3_result.webp?updatedAt=1778240805257",
    "cost": {
      "Chaos": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 2
  },
  {
    "id": "anemone_weaver",
    "name": "Anemone Weaver",
    "type": "Unit",
    "elements": [
      "Order",
      "Light"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "Her strings control the currents.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_mermaid_with_multiple_arms_like_an_anemone_braiding_strings_99d00ed0-e2ef-497e-a2ad-c8ca04b12694_1_result.webp?updatedAt=1778240805244",
    "cost": {
      "Order": 1,
      "Light": 1
    },
    "attack": 2,
    "health": 1
  },
  {
    "id": "mer_warrior",
    "name": "Mer-Warrior",
    "type": "Unit",
    "elements": [
      "Nature"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "Fierce protector of the deep.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_sleek_Mer-Warrior_skin_covered_in_patterned_shark_scales_wi_da0ef383-7a81-436d-8039-3300b89e3782_0_result.webp?updatedAt=1778240805170",
    "cost": {
      "Nature": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "helmet_hermit",
    "name": "Helmet Hermit",
    "type": "Unit",
    "elements": [
      "Tech",
      "Frost"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "A home forged by surface dwellers.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_hermit_crab_using_a_discarded_ornate_brass_diving_helmet_as_d2ac14fb-e2a7-43ba-9286-90644683a356_2_result.webp?updatedAt=1778240805003",
    "cost": {
      "Tech": 1,
      "Frost": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 5
  },
  {
    "id": "glowing_manta",
    "name": "Glowing Manta",
    "type": "Unit",
    "elements": [
      "Flame"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "A majestic glider of the abyss.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_massive_manta_ray_with_glowing_white_markings_trailing_a_wa_ed30d574-def0-4caf-93fb-c329e7508849_3_result.webp?updatedAt=1778240804624",
    "cost": {
      "Flame": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 1
  },
  {
    "id": "research_fleet",
    "name": "Research Fleet",
    "type": "Event",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pure"
    ],
    "text": "Seeking knowledge in the dark. Deal 3 damage to target enemy Unit.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_fleet_of_miniature_glowing_research_submersibles_descending_56080902-ceec-4090-913e-4b7af01dc9fc_1_result.webp?updatedAt=1778240804274",
    "cost": {
      "Frost": 1,
      "Tech": 1
    },
    "effect": {
      "action": "damage",
      "value": 3,
      "target": "unit",
      "text": "Deal 3 damage to target enemy Unit."
    }
  },
  {
    "id": "charred_frilled_shark",
    "name": "Charred Frilled Shark",
    "type": "Unit",
    "elements": [
      "Dark"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "Born from the underwater vents.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_frilled_shark_with_a_body_like_a_charred_ribbon_and_glowing_654b64a8-bfbf-4324-a1de-8a2ca05f9f17_2_result.webp?updatedAt=1778240804110",
    "cost": {
      "Dark": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 2
  },
  {
    "id": "marble_reef_shark",
    "name": "Marble Reef Shark",
    "type": "Unit",
    "elements": [
      "Light",
      "Order"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "Cold and calculating predator.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_reef_shark_with_skin_like_polished_marble_patrolling_a_jagg_39379ae8-b8b3-44e7-8378-53d3e4fb12cc_1_result.webp?updatedAt=1778240804059",
    "cost": {
      "Light": 1,
      "Order": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 3
  },
  {
    "id": "cold_fire_volcano",
    "name": "Cold Fire Volcano",
    "type": "Location",
    "elements": [
      "Chaos"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric"
    ],
    "text": "Burning ice and freezing flames.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_massive_underwater_volcano_erupting_with_blue_cold_fire._--_94750f9b-ad77-4939-8f92-84514d919b2f_1_result.webp?updatedAt=1778240804004",
    "cost": {
      "Chaos": 1,
      "Generic": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "bioluminescent_tide",
    "name": "Bioluminescent Tide",
    "type": "Event",
    "elements": [
      "Order",
      "Light"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pure"
    ],
    "text": "The water itself glows with power. Heal 4 damage from your Leader.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/The_Bioluminescent_Tide--a_wave_of_pure_concentrated_glowing__89650f44-9095-4f47-a765-259f2fd8f49d_3_result.webp?updatedAt=1778240803723",
    "cost": {
      "Order": 1,
      "Light": 1,
      "Generic": 1
    },
    "effect": {
      "action": "heal",
      "value": 4,
      "target": "self",
      "text": "Heal 4 damage from your Leader."
    }
  },
  {
    "id": "swirling_ink_cloud",
    "name": "Swirling Ink Cloud",
    "type": "Event",
    "elements": [
      "Nature"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Echo"
    ],
    "text": "A perfect cover for a quick escape. Deal 2 damage to the enemy Leader.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_dense_cloud_of_ink_from_a_squid_containing_swirling_pattern_db4c58e4-087d-44a7-922f-004545a0947b_0_result.webp?updatedAt=1778240803552",
    "cost": {
      "Nature": 1,
      "Generic": 1
    },
    "effect": {
      "action": "damage",
      "value": 2,
      "target": "leader",
      "text": "Deal 2 damage to the enemy Leader."
    }
  },
  {
    "id": "scallop_map",
    "name": "Scallop Map",
    "type": "Item",
    "elements": [
      "Tech",
      "Frost"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "The path to the sunken treasure.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/An_ancient_brine-stained_map_etched_onto_a_giant_scallop_shel_cb52efc4-52bd-4893-8b69-cef0d12560de_2_result.webp?updatedAt=1778240803485",
    "cost": {
      "Tech": 1,
      "Frost": 1
    },
    "attach": {
      "attack": 1,
      "health": 1
    }
  },
  {
    "id": "ghost_tunicate",
    "name": "Ghost Tunicate",
    "type": "Unit",
    "elements": [
      "Flame"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Pierce"
    ],
    "text": "An empty shell that still hunts.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_predatory_tunicate_ghost_fish_with_a_translucent_hood_open__3d78cd67-4810-440c-bc83-45e55d2131e4_0_result.webp?updatedAt=1778240803200",
    "cost": {
      "Flame": 1,
      "Generic": 2
    },
    "attack": 3,
    "health": 5
  },
  {
    "id": "mist_ghost_ship",
    "name": "Mist Ghost Ship",
    "type": "Location",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric"
    ],
    "text": "Sailing the currents of the dead.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_ghost_ship_made_of_translucent_white_mist_manned_by_skeleta_79df45bb-5c6d-476f-b746-3bde4b6b0c61_3_result.webp?updatedAt=1778240803211",
    "cost": {
      "Frost": 1,
      "Tech": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "flash_freeze",
    "name": "Flash Freeze",
    "type": "Event",
    "elements": [
      "Dark"
    ],
    "rarity": "Uncommon",
    "set": "Blue Coral",
    "keywords": [
      "Echo"
    ],
    "text": "The ocean stops in its tracks. Heal 4 damage from your Leader.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_flash-freezing_event_in_the_deep_where_a_pocket_of_supercoo_f684b1bf-637b-4cd1-9302-3fb50ff28df4_0_result.webp?updatedAt=1778240803069",
    "cost": {
      "Dark": 1,
      "Generic": 2
    },
    "effect": {
      "action": "heal",
      "value": 4,
      "target": "self",
      "text": "Heal 4 damage from your Leader."
    }
  },
  {
    "id": "mermaid_statue",
    "name": "Mermaid Statue",
    "type": "Item",
    "elements": [
      "Light"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Burden 1"
    ],
    "text": "A silent watcher of the depths.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_stone_statue_of_a_mermaid_whose_tail_is_made_of_real_shimme_2bccb89d-300d-4407-a41d-7e33ab1b7e82_3_result.webp?updatedAt=1778240802873",
    "cost": {
      "Light": 1
    },
    "attach": {
      "attack": 1,
      "health": 1
    }
  },
  {
    "id": "amber_sphere",
    "name": "Amber Sphere",
    "type": "Charm",
    "elements": [
      "Chaos"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Ward 1"
    ],
    "text": "Preserved perfectly for millennia.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_sphere_of_polished_amber_containing_a_perfectly_preserved_g_5381c256-0b07-4479-aa8c-6d8f573c34cc_3_result.webp?updatedAt=1778240802656",
    "cost": {
      "Chaos": 1,
      "Generic": 1
    },
    "duration": 2
  },
  {
    "id": "brass_whale",
    "name": "Brass Whale",
    "type": "Unit",
    "elements": [
      "Order",
      "Light"
    ],
    "rarity": "Rare",
    "set": "Blue Coral",
    "keywords": [
      "Armor 2",
      "Pierce"
    ],
    "text": "A mechanical marvel of the deep.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_massive_mechanical_whale_made_of_rusted_brass_and_glowing_c_7cff4b05-f767-481a-b27b-90f1cced16e2_1_result.webp?updatedAt=1778240802579",
    "cost": {
      "Order": 1,
      "Light": 1,
      "Generic": 3
    },
    "attack": 5,
    "health": 4
  },
  {
    "id": "light_seahorse",
    "name": "Light Seahorse",
    "type": "Unit",
    "elements": [
      "Nature"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A tiny beacon of hope.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_tiny_glowing_seahorse_made_of_pure_white_light._--chaos_5_-_6b8d2e24-d96a-4711-b9d0-0120a230753f_1_result.webp?updatedAt=1778240802535",
    "cost": {
      "Nature": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "glacier_shark",
    "name": "Glacier Shark",
    "type": "Unit",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "Cold as ice, sharp as a tooth.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_creature_that_is_half-shark_half-glacier_with_ice-blue_glow_bfc65751-38d8-48b9-85e3-fd56fb67df2f_3_result.webp?updatedAt=1778240802467",
    "cost": {
      "Tech": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "sand_portal",
    "name": "Sand Portal",
    "type": "Location",
    "elements": [
      "Flame"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric"
    ],
    "text": "A gateway to the unknown.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_portal_made_of_swirling_white_sand_and_black_water_framed_b_aec7589e-11ad-4f05-8cc8-d3126db2df11_2_result.webp?updatedAt=1778240802471",
    "cost": {
      "Flame": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "stone_bubbles",
    "name": "Stone Bubbles",
    "type": "Location",
    "elements": [
      "Frost"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Fix Frost"
    ],
    "text": "Trapped air from a forgotten age.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_series_of_underwater_stone_bubbles_containing_tiny_preserve_1f3b8d61-5de8-4093-9581-f2b55342c3a9_1_result.webp?updatedAt=1778240802365",
    "cost": {
      "Frost": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "floating_jellyfish",
    "name": "Floating Jellyfish",
    "type": "Unit",
    "elements": [
      "Dark"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A massive drifter of the sea.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_massive_bioluminescent_jellyfish_that_looks_like_a_floating_1e3bbb89-9d8b-4e7d-b88e-aa697a1e7ceb_3_result.webp?updatedAt=1778240802162",
    "cost": {
      "Dark": 1,
      "Generic": 1
    },
    "attack": 1,
    "health": 3
  },
  {
    "id": "gulper_eel",
    "name": "Gulper Eel",
    "type": "Unit",
    "elements": [
      "Light"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "It can swallow anything whole.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_gulper_eel_with_an_impossibly_large_mouth_lined_with_tiny_g_3bbd23c2-3122-4ac0-acd1-ae0c621f4728_1_result.webp?updatedAt=1778240802180",
    "cost": {
      "Light": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "lace_lionfish",
    "name": "Lace Lionfish",
    "type": "Unit",
    "elements": [
      "Chaos"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "Beautiful, but deadly to touch.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_lionfish_with_fins_like_delicate_lace_and_poisonous_spines__eb06ebfc-a7f3-4982-93e0-fe69de2f85b7_1_result.webp?updatedAt=1778240802084",
    "cost": {
      "Chaos": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "tethered_orbs",
    "name": "Tethered Orbs",
    "type": "Location",
    "elements": [
      "Order"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Fix Order"
    ],
    "text": "Lights guiding the way home.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_series_of_floating_orbs_of_light_tethered_to_the_sea_floor__b73b6cf0-7fa5-4f5b-91cc-b02c4de30cd6_0_result.webp?updatedAt=1778240801995",
    "cost": {
      "Order": 1
    },
    "locEffect": "ATK_ALL"
  },
  {
    "id": "coral_cathedral",
    "name": "Coral Cathedral",
    "type": "Location",
    "elements": [
      "Nature"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Symmetric"
    ],
    "text": "A place of worship for the merfolk.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_wide_shot_of_a_Coral_Cathedral--a_massive_hollowed-out_reef_1adbbe9f-3d1c-412c-9b7b-a234853d06f8_3_result.webp?updatedAt=1778240801788",
    "cost": {
      "Nature": 1
    },
    "locEffect": "ATK_ALL"
  },
  {
    "id": "galaxy_jellyfish",
    "name": "Galaxy Jellyfish",
    "type": "Unit",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A universe within a bell.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_giant_jellyfish_whose_bell_contains_a_miniature_rotating_ga_ba1c6e8a-148f-429e-83f0-d449072fcb97_2_result.webp?updatedAt=1778240801719",
    "cost": {
      "Tech": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "shark_gathering",
    "name": "Shark Gathering",
    "type": "Event",
    "elements": [
      "Flame"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Scorch"
    ],
    "text": "A frenzy waiting to happen. Scorch 2 on target enemy Unit.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_gathering_of_a_dozen_different_species_of_sharks_swimming_i_7f4ecc96-4303-4c17-82ed-c0cfdb7aac79_3_result.webp?updatedAt=1778240801512",
    "cost": {
      "Flame": 1
    },
    "effect": {
      "action": "scorch",
      "value": 2,
      "target": "unit",
      "text": "Scorch 2 on target enemy Unit."
    }
  },
  {
    "id": "heart_coral",
    "name": "Heart Coral",
    "type": "Location",
    "elements": [
      "Frost"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Codex 1"
    ],
    "text": "The beating center of the reef.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_massive_pulsating_heart-shaped_coral_growing_in_the_center__b53de206-38ca-450d-af24-cbbbec3a7177_0_result.webp?updatedAt=1778240801439",
    "cost": {
      "Frost": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "nebula_snail",
    "name": "Nebula Snail",
    "type": "Unit",
    "elements": [
      "Dark"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A slow but inevitable doom.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_predatory_cone_snail_with_a_shell_like_a_dark_nebula_extend_25fb6523-41f2-4cc6-bd19-99c576834b20_2_result.webp?updatedAt=1778240801407",
    "cost": {
      "Dark": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 1
  },
  {
    "id": "driftwood_harp",
    "name": "Driftwood Harp",
    "type": "Item",
    "elements": [
      "Light"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Burden 1"
    ],
    "text": "Music that calms the savage beasts.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_musical_instrument_resembling_a_harp_made_of_driftwood_and__c99a707b-c281-4602-81e0-ac22a0785214_1_result.webp?updatedAt=1778240801340",
    "cost": {
      "Light": 1
    },
    "attach": {
      "attack": 1,
      "health": 1
    }
  },
  {
    "id": "playful_otters",
    "name": "Playful Otters",
    "type": "Unit",
    "elements": [
      "Chaos"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "Joyful swimmers of the kelp.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_group_of_playful_otters_weaving_through_a_canopy_of_glowing_7486d850-4c1e-4341-92cc-7e0b02912fe7_0_result.webp?updatedAt=1778240801338",
    "cost": {
      "Chaos": 1,
      "Generic": 1
    },
    "attack": 1,
    "health": 4
  },
  {
    "id": "hammerhead_silhouette",
    "name": "Hammerhead Silhouette",
    "type": "Event",
    "elements": [
      "Order"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Pure"
    ],
    "text": "A shadow of fear from above. Draw 2 cards.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_hammerhead_shark_silhouette_seen_from_below_framed_by_a_hal_77f31484-d105-428c-8d17-0a1745e6c4cd_3_result.webp?updatedAt=1778240801419",
    "cost": {
      "Order": 1
    },
    "effect": {
      "action": "draw",
      "value": 2,
      "text": "Draw 2 cards."
    }
  },
  {
    "id": "map_pearl",
    "name": "Map Pearl",
    "type": "Charm",
    "elements": [
      "Nature"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Ward 1"
    ],
    "text": "The world inside a shell.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_giant_iridescent_pearl_that_contains_a_map_of_the_entire_oc_70ccb525-3214-4694-92ef-98d830751f6f_0_result.webp?updatedAt=1778240801221",
    "cost": {
      "Nature": 1,
      "Generic": 1
    },
    "duration": 2
  },
  {
    "id": "stone_hand",
    "name": "Stone Hand",
    "type": "Location",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Boost 1"
    ],
    "text": "A remnant of a giant.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_giant_stone_hand_reaching_up_from_the_trench_floor_holding__d1744f01-1dcf-4f82-ba72-d9cfd652915c_3_result.webp?updatedAt=1778240801364",
    "cost": {
      "Tech": 1
    },
    "locEffect": "SCORCH_ALL"
  },
  {
    "id": "glowing_sea_spider",
    "name": "Glowing Sea Spider",
    "type": "Unit",
    "elements": [
      "Flame"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "Creeping along the ocean floor.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_sea_spider_with_spindly_glowing_legs_walking_over_a_bed_of__40ff17ce-dbfa-4400-8fc9-0aec91fa3878_2_result.webp?updatedAt=1778240801118",
    "cost": {
      "Flame": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "shimmering_statue",
    "name": "Shimmering Statue",
    "type": "Item",
    "elements": [
      "Frost"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Burden 1"
    ],
    "text": "A beautiful monument.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_stone_statue_of_a_mermaid_whose_tail_is_made_of_real_shimme_2bccb89d-300d-4407-a41d-7e33ab1b7e82_1_result.webp?updatedAt=1778240800773",
    "cost": {
      "Frost": 1
    },
    "attach": {
      "attack": 1,
      "health": 1
    }
  },
  {
    "id": "sand_waterfall",
    "name": "Sand Waterfall",
    "type": "Location",
    "elements": [
      "Dark"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Siphon"
    ],
    "text": "An endless pour into the abyss.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/An_underwater_waterfall_of_sand_pouring_into_a_dark_bottomles_d80ccad2-df25-48fa-9c03-39b45dd44849_1_result.webp?updatedAt=1778240800585",
    "cost": {
      "Dark": 1
    },
    "locEffect": "ATK_ALL"
  },
  {
    "id": "sardine_vortex",
    "name": "Sardine Vortex",
    "type": "Event",
    "elements": [
      "Light"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Purge"
    ],
    "text": "A confusing swirl of silver. Purge target Unit: strip its Items, statuses and buffs.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_swirling_vortex_of_silver_sardines_reflecting_a_rainbow_of__82698eaa-eab8-4737-9089-dda2b0feb203_0_result.webp?updatedAt=1778240800351",
    "cost": {
      "Light": 1
    },
    "effect": {
      "action": "purge",
      "target": "unit",
      "text": "Purge target Unit: strip its Items, statuses and buffs."
    }
  },
  {
    "id": "sparkling_meadow",
    "name": "Sparkling Meadow",
    "type": "Location",
    "elements": [
      "Chaos"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Feedback"
    ],
    "text": "A peaceful place to rest.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/An_underwater_meadow_of_seagrass_with_tiny_sparkling_bubbles__1a968cfe-29a8-4199-8b3d-16a3532f6df4_3_result.webp?updatedAt=1778240800190",
    "cost": {
      "Chaos": 1
    },
    "locEffect": "SCORCH_ALL"
  },
  {
    "id": "copper_nautilus",
    "name": "Copper Nautilus",
    "type": "Unit",
    "elements": [
      "Order"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A sturdy survivor.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_nautilus_with_a_metallic_copper_shell_and_glowing_blue_tent_76bea100-9c9e-4434-9b17-564e72c4b19a_1_result.webp?updatedAt=1778240800219",
    "cost": {
      "Order": 1,
      "Generic": 2
    },
    "attack": 2,
    "health": 4
  },
  {
    "id": "victorian_helmet",
    "name": "Victorian Helmet",
    "type": "Item",
    "elements": [
      "Nature"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Burden 1"
    ],
    "text": "A relic of surface explorers.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_rusted_Victorian_diving_helmet_overgrown_with_iridescent_ba_573ec635-6a35-46a9-a6be-f0ac4390534d_1_result.webp?updatedAt=1778240799919",
    "cost": {
      "Nature": 1
    },
    "attach": {
      "attack": 1,
      "health": 1
    }
  },
  {
    "id": "submerged_temple",
    "name": "Submerged Temple",
    "type": "Location",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Boost 1"
    ],
    "text": "A place of ancient power.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/An_archaeological_excavation_of_a_submerged_Greek_temple_usin_5b9f3f1a-c9c2-4d6a-954a-3151433c6576_1_result.webp?updatedAt=1778240799802",
    "cost": {
      "Tech": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "obsidian_dice",
    "name": "Obsidian Dice",
    "type": "Item",
    "elements": [
      "Flame"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Burden 1"
    ],
    "text": "Roll for your life.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_set_of_obsidian_dice_the_pips_glowing_red_resting_on_a_velv_6a03eb4e-ecd9-423e-804f-b6127e0e331d_0_result.webp?updatedAt=1778240799806",
    "cost": {
      "Flame": 1
    },
    "attach": {
      "attack": 1,
      "health": 1
    }
  },
  {
    "id": "glass_squid",
    "name": "Glass Squid",
    "type": "Unit",
    "elements": [
      "Frost"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "Invisible to most predators.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_collection_of_Glass_Squid_that_look_like_floating_bubbles_f_ac07fc79-3803-449a-9501-7b53a385c909_1_result.webp?updatedAt=1778240799662",
    "cost": {
      "Frost": 1,
      "Generic": 1
    },
    "attack": 1,
    "health": 3
  },
  {
    "id": "neon_moray",
    "name": "Neon Moray",
    "type": "Unit",
    "elements": [
      "Dark"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A bright flash before the bite.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_moray_eel_with_neon_green_stripes_coiled_inside_a_rusted_ir_f356cf5c-2a00-48ee-a89a-71a0c13f8b8c_1_result.webp?updatedAt=1778240799285",
    "cost": {
      "Dark": 1,
      "Generic": 2
    },
    "attack": 2,
    "health": 4
  },
  {
    "id": "galleon_shipwreck",
    "name": "Galleon Shipwreck",
    "type": "Location",
    "elements": [
      "Light"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Fix Light"
    ],
    "text": "A treasure trove for scavengers.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_submerged_shipwreck_of_a_galleon_its_wooden_hull_replaced_b_86b3e7ed-4783-4768-ab30-5cedd8eda8b1_1_result.webp?updatedAt=1778240799180",
    "cost": {
      "Light": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "handed_squid",
    "name": "Handed Squid",
    "type": "Unit",
    "elements": [
      "Chaos"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A bizarre mutation.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_giant_squid_whose_tentacles_end_in_human-like_hands_made_of_8b1c21e2-a054-446e-b7c2-0ab9ad0dc62f_0_result.webp?updatedAt=1778240799210",
    "cost": {
      "Chaos": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 2
  },
  {
    "id": "legendary_diver",
    "name": "Legendary Diver",
    "type": "Leader",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Legendary",
    "set": "Blue Coral",
    "keywords": [
      "Command 2",
      "Ward 2",
      "Boost 1"
    ],
    "text": "He has seen the bottom of the world.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_legendary_diver_in_a_highly_modified_heavy_brass_and_steel__d425f53e-5d8e-4cd2-b28b-a12ad45e3c7b_3_result.webp?updatedAt=1778240799013",
    "health": 35,
    "attack": 3
  },
  {
    "id": "crystalline_flower",
    "name": "Crystalline Flower",
    "type": "Charm",
    "elements": [
      "Nature"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Ward 1"
    ],
    "text": "A fragile beauty.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_crystalline_flower_growing_out_of_a_rusted_anchor_chain._--_6de8e75d-5a4d-45d3-82e1-2b93c3d66a5c_2_result.webp?updatedAt=1778240798701",
    "cost": {
      "Nature": 1
    },
    "duration": 1
  },
  {
    "id": "frosted_isopod",
    "name": "Frosted Isopod",
    "type": "Unit",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A scavenger of the deep.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_giant_isopod_with_a_shell_made_of_frosted_glass._--chaos_5__a965bed8-cd1c-424a-bf93-31c200ea8c08_3_result.webp?updatedAt=1778240798591",
    "cost": {
      "Tech": 1,
      "Generic": 1
    },
    "attack": 1,
    "health": 3
  },
  {
    "id": "sphere_pufferfish",
    "name": "Sphere Pufferfish",
    "type": "Unit",
    "elements": [
      "Flame"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A perfect defense.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_pufferfish_inflated_into_a_perfect_sphere_covered_in_glowin_d1e65d5c-79dd-4c11-af71-96107c8ccfb4_2_result.webp?updatedAt=1778240797876",
    "cost": {
      "Flame": 1
    },
    "attack": 1,
    "health": 1
  },
  {
    "id": "porcelain_lobster",
    "name": "Porcelain Lobster",
    "type": "Unit",
    "elements": [
      "Frost"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "Delicate but sharp.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_lobster_with_a_shell_that_looks_like_cracked_porcelain_with_d43c7ea8-610b-429c-8f2e-d58014ecbf4a_1_result.webp?updatedAt=1778240797832",
    "cost": {
      "Frost": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 1
  },
  {
    "id": "black_smoker",
    "name": "Black Smoker",
    "type": "Location",
    "elements": [
      "Dark"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Siphon"
    ],
    "text": "A source of heat and life.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_hydrothermal_vent_black_smoker_spewing_dark_minerals_that_t_aa5a8b5e-9869-403c-94d2-7d5dd2d1ad1e_0_result.webp?updatedAt=1778240797163",
    "cost": {
      "Dark": 1
    },
    "locEffect": "ATK_ALL"
  },
  {
    "id": "emerald_turtle",
    "name": "Emerald Turtle",
    "type": "Unit",
    "elements": [
      "Light"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A slow and steady traveler.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_majestic_sea_turtle_with_a_shell_made_of_polished_emerald_a_8871346a-f40b-41c2-bf76-001b8daf79fe_3_result.webp?updatedAt=1778240795581",
    "cost": {
      "Light": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "butterflyfish_school",
    "name": "Butterflyfish School",
    "type": "Unit",
    "elements": [
      "Chaos"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A flash of color in the blue.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_school_of_iridescent_butterflyfish_weaving_through_a_forest_80e33cfd-cc51-49b2-bd3d-14c20badfe48_1_result.webp?updatedAt=1778240795323",
    "cost": {
      "Chaos": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "blue_ringed_octopus",
    "name": "Blue-Ringed Octopus",
    "type": "Unit",
    "elements": [
      "Order"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "Small, but deadly.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_macro_shot_of_a_blue-ringed_octopus_resting_on_a_bed_of_gol_26ea0a68-b2ac-4604-b779-5da434b941e6_0_result.webp?updatedAt=1778240794552",
    "cost": {
      "Order": 1,
      "Generic": 1
    },
    "attack": 1,
    "health": 3
  },
  {
    "id": "mandarin_dragonet",
    "name": "Mandarin Dragonet",
    "type": "Unit",
    "elements": [
      "Nature"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A psychedelic display.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_vibrant_mandarin_dragonet_fish_displaying_its_psychedelic_o_aebdb5b0-cb9b-4260-b4a9-a4a45200020f_1_result.webp?updatedAt=1778240794407",
    "cost": {
      "Nature": 1,
      "Generic": 2
    },
    "attack": 2,
    "health": 4
  },
  {
    "id": "pulsating_clam",
    "name": "Pulsating Clam",
    "type": "Unit",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "A rhythm of the sea.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_massive_clam_with_a_pulsating_iridescent_purple_mantle_and__8b5df861-d469-4daf-b0a5-6d575c9019a5_3_result.webp?updatedAt=1778240794311",
    "cost": {
      "Tech": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 1
  },
  {
    "id": "glass_shrimp",
    "name": "Glass Shrimp",
    "type": "Unit",
    "elements": [
      "Flame"
    ],
    "rarity": "Common",
    "set": "Blue Coral",
    "keywords": [
      "Blitz"
    ],
    "text": "Almost invisible to the eye.",
    "image": "https://ik.imagekit.io/zusyw2yie/midjourney_session/A_transparent_glass_shrimp_perched_on_a_branch_of_translucent_d5120657-8f8a-462f-ba6a-ca3a8f57d23e_1_result.webp?updatedAt=1778240793914",
    "cost": {
      "Flame": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 1
  },
  {
    "id": "smokeveil_striketeam",
    "name": "Smokeveil Striketeam",
    "type": "Unit",
    "elements": [
      "Tech",
      "Dark"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Blitz"
    ],
    "text": "They arrive with the smoke and leave with your secrets.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Multiple_hidden_ninjas_leaping_out_of_smoke_with_katanas._--n_ff05b7ac-5cb3-4400-8e09-e04889e09af9_2.png?updatedAt=1783333969035",
    "cost": {
      "Tech": 1,
      "Dark": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 3
  },
  {
    "id": "kinetix_blacksite_cavern",
    "name": "Kinetix Blacksite Cavern",
    "type": "Location",
    "elements": [
      "Tech",
      "Dark"
    ],
    "rarity": "Uncommon",
    "set": "Crimson Circuit",
    "keywords": [
      "Discord"
    ],
    "text": "What Kinetix hides underground, the underground keeps.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Secure_cavern_hiding_secret_Kinetix_operations._--chaos_5_--a_2925d666-027b-4487-9478-f46c8e4fe9ca_3.png?updatedAt=1783333969030",
    "cost": {
      "Tech": 1,
      "Dark": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "nanite_purge_protocol",
    "name": "Nanite Purge Protocol",
    "type": "Event",
    "elements": [
      "Tech"
    ],
    "rarity": "Uncommon",
    "set": "Crimson Circuit",
    "keywords": [
      "Purge",
      "Rummage 1"
    ],
    "text": "Purge a target of all modifications. Rummage 1: draw 1, then discard 1 at random.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Initiates_massive_nanite_purge._--chaos_5_--ar_43_--raw_--sre_9f950050-e05b-4f65-aebd-4e09503206c7_1.png?updatedAt=1783333968991",
    "cost": {
      "Tech": 1,
      "Generic": 1
    },
    "effect": {
      "action": "purge",
      "target": "unit"
    }
  },
  {
    "id": "magma_phase_infiltrator",
    "name": "Magma-Phase Infiltrator",
    "type": "Unit",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Rare",
    "set": "Crimson Circuit",
    "keywords": [
      "Lurk",
      "Taint 1"
    ],
    "text": "Rock is only a suggestion to someone made of heat.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Invisible_ninja_phasing_through_volcanic_rock._--chaos_5_--ar_33c7dee6-82a0-4adb-9300-8eb9285e4db4_1.png?updatedAt=1783333969054",
    "cost": {
      "Flame": 1,
      "Chaos": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 3
  },
  {
    "id": "cinder_mite",
    "name": "Cinder Mite",
    "type": "Unit",
    "elements": [
      "Flame"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Blitz",
      "Brittle"
    ],
    "text": "Built to explode. Twice, if possible.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Exploding_volcanic_insectoid_drone._--ar_43_--raw_--sref_2208_347f8ece-8999-4015-89f0-96e0b1e590ca_2.png?updatedAt=1783333968994",
    "cost": {
      "Flame": 1
    },
    "attack": 2,
    "health": 1
  },
  {
    "id": "obsidian_bore_site",
    "name": "Obsidian Bore Site",
    "type": "Location",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Symmetric",
      "Glacier 1"
    ],
    "text": "Lava cooled to glass; ambition cooled to schedule.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Industrial_drill_mining_dark_volcanic_glass_structures._--no__de75d842-f735-4879-a407-af20d6756bf8_1.png?updatedAt=1783333969094",
    "cost": {
      "Frost": 1,
      "Tech": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "crimson_vector_commander",
    "name": "Crimson Vector Commander",
    "type": "Leader",
    "elements": [
      "Flame",
      "Order"
    ],
    "rarity": "Mythic",
    "set": "Crimson Circuit",
    "keywords": [
      "Command 2",
      "Ward 2",
      "Boost 1"
    ],
    "text": "Her orders arrive at the speed of an eruption.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Crimson-armored_commander_overlooking_a_lava_pit._--chaos_5_-_c9144cb0-c6ac-4520-b9bb-5d988f91fca1_0.png?updatedAt=1783333969026",
    "health": 35,
    "attack": 3
  },
  {
    "id": "ashhound_pack",
    "name": "Ashhound Pack",
    "type": "Unit",
    "elements": [
      "Tech",
      "Dark"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Blitz",
      "Overdrive"
    ],
    "text": "They run twice as fast as anything alive. They are not alive.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Pack_of_fast_smoky_phantom_dogs._--chaos_5_--ar_43_--raw_--sr_ff08bc25-4e13-4beb-92af-7f0512e3a651_2.png?updatedAt=1783333969033",
    "cost": {
      "Tech": 1,
      "Dark": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 3
  },
  {
    "id": "magma_conduit_network",
    "name": "Magma Conduit Network",
    "type": "Location",
    "elements": [
      "Flame"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Confluence 1"
    ],
    "text": "The mountain's blood, rerouted through payroll.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Interconnected_steel_pipes_carrying_glowing_red_lava._--chaos_dd903156-78fc-405c-946c-9f1f662b05fe_0.png?updatedAt=1783333968998",
    "cost": {
      "Flame": 1,
      "Generic": 1
    },
    "locEffect": "ATK_ALL"
  },
  {
    "id": "fissure_gas_bunker",
    "name": "Fissure Gas Bunker",
    "type": "Location",
    "elements": [
      "Order"
    ],
    "rarity": "Uncommon",
    "set": "Crimson Circuit",
    "keywords": [
      "Symmetric",
      "Codex 1"
    ],
    "text": "Regulation thickness: enough to outlive the mountain.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Military_bunker_positioned_near_yellow_gas_fissures._--chaos__9ea3e1ec-e63b-4b8f-a99c-ffb804fc91ae_3.png?updatedAt=1783333969041",
    "cost": {
      "Order": 1,
      "Generic": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "volcanic_nanite_core",
    "name": "Volcanic Nanite Core",
    "type": "Item",
    "elements": [
      "Tech"
    ],
    "rarity": "Legendary",
    "set": "Crimson Circuit",
    "keywords": [
      "Overcharge 2"
    ],
    "text": "Unlimited power, invoiced nightly.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Ultimate_volcanic_nanite_power_source._--ar_43_--raw_--sref_2_910511a1-5832-45e9-9236-abf8e0e80b40_2.png?updatedAt=1783333969058",
    "cost": {
      "Tech": 1,
      "Generic": 2
    },
    "attach": {
      "attack": 2,
      "health": 2
    }
  },
  {
    "id": "micro_drone_immolation",
    "name": "Micro-Drone Immolation",
    "type": "Event",
    "elements": [
      "Flame"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Scorch 2"
    ],
    "text": "Scorch 2: the swarm keeps burning long after it lands.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Countless_glowing_red_micro-drones_burning_enemy._--chaos_5_-_1d47d727-49d9-43f3-a18e-39d3ffe2492a_1.png?updatedAt=1783333969066",
    "cost": {
      "Flame": 1,
      "Generic": 1
    },
    "effect": {
      "action": "scorch",
      "value": 2,
      "target": "unit"
    }
  },
  {
    "id": "kunoichi_of_the_magma_rings",
    "name": "Kunoichi of the Magma Rings",
    "type": "Unit",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Super-Rare",
    "set": "Crimson Circuit",
    "keywords": [
      "Blitz",
      "Inferno"
    ],
    "text": "Every strike she lands sets the whole line alight.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Female_Ninja_Commands_the_kinetic_magma_rings._--ar_43_--raw__4084f947-0b0a-46f6-8e8b-6e6e71a2d3fe_3.png?updatedAt=1783333969075",
    "cost": {
      "Flame": 2,
      "Chaos": 1,
      "Generic": 1
    },
    "attack": 4,
    "health": 3
  },
  {
    "id": "heart_of_the_thermal_grid",
    "name": "Heart of the Thermal Grid",
    "type": "Location",
    "elements": [
      "Flame"
    ],
    "rarity": "Rare",
    "set": "Crimson Circuit",
    "keywords": [
      "Boost 1",
      "Valor 1"
    ],
    "text": "The city breathes when it beats.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Heart_of_the_thermal_grid._--ar_43_--raw_--sref_2208496562_36_01ba5ff2-545c-4aa1-8a1d-b42be9ab1524_1.png?updatedAt=1783333969063",
    "cost": {
      "Flame": 1,
      "Generic": 2
    },
    "locEffect": "ATK_ALL"
  },
  {
    "id": "nanite_culture_lab",
    "name": "Nanite Culture Lab",
    "type": "Location",
    "elements": [
      "Tech"
    ],
    "rarity": "Rare",
    "set": "Crimson Circuit",
    "keywords": [
      "Hatchling 1",
      "Flourish 1"
    ],
    "text": "The vats never sleep, and neither does what grows in them.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/High-tech_laboratory_filled_with_glowing_green_vats._--no_tex_d0613563-9572-4410-894b-2be2576d98ac_0.png?updatedAt=1783333969044",
    "cost": {
      "Tech": 1,
      "Generic": 2
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "magma_ring_adept",
    "name": "Magma Ring Adept",
    "type": "Unit",
    "elements": [
      "Flame"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Vengeance 2"
    ],
    "text": "Strike him and the rings answer.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Commands_the_kinetic_magma_rings._--ar_43_--raw_--sref_220849_0be2b56f-5615-4700-b49d-bdab0d5b5eb2_3.png?updatedAt=1783333968951",
    "cost": {
      "Flame": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 3
  },
  {
    "id": "absolute_eruption",
    "name": "Absolute Eruption",
    "type": "Event",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Legendary",
    "set": "Crimson Circuit",
    "keywords": [
      "Wildcast 3"
    ],
    "text": "Wildcast 3: deals 2 damage to 3 unique random battlefield targets.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Absolute_volcanic_energy_eruption._--ar_43_--raw_--sref_22084_d9f16813-c068-490b-9e4a-5abd193f8a4e_2.png?updatedAt=1783333968955",
    "cost": {
      "Flame": 2,
      "Chaos": 1,
      "Generic": 2
    },
    "effect": {
      "action": "damage",
      "value": 2,
      "target": "unit"
    }
  },
  {
    "id": "caldera_harvest_works",
    "name": "Caldera Harvest Works",
    "type": "Location",
    "elements": [
      "Tech"
    ],
    "rarity": "Super-Rare",
    "set": "Crimson Circuit",
    "keywords": [
      "Symmetric",
      "Confluence 2"
    ],
    "text": "The volcano pays dividends to whoever dares collect.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/A_massive_industrial_energy-harvesting_facility_built_directl_bc94866f-69c5-4e5b-9dfc-eea5026f3f22_3.png?updatedAt=1783333968957",
    "cost": {
      "Tech": 1,
      "Generic": 2
    },
    "locEffect": "ATK_ALL"
  },
  {
    "id": "consuming_ash_cloud",
    "name": "Consuming Ash Cloud",
    "type": "Event",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Freeze"
    ],
    "text": "Freeze: smothered in ash, the target cannot act until its controller's next turn ends.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Massive_ash_cloud_consuming_the_landscape._--chaos_5_--ar_43__818954ab-3d44-4fe8-9c84-32f997eb350c_3.png?updatedAt=1783333969049",
    "cost": {
      "Flame": 1,
      "Chaos": 1,
      "Generic": 1
    },
    "effect": {
      "action": "freeze",
      "target": "unit"
    }
  },
  {
    "id": "kinetic_overflow",
    "name": "Kinetic Overflow",
    "type": "Event",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Heal 2"
    ],
    "text": "Heal 3: surplus current, routed back into the one who commands it.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Ninja_Generates_endless_kinetic_current._--chaos_5_--ar_43_--_fdff127f-65fd-454f-9cf5-ec4c3084c3d9_1.png?updatedAt=1783333969056",
    "cost": {
      "Tech": 1,
      "Generic": 1
    },
    "effect": {
      "action": "heal",
      "value": 2
    }
  },
  {
    "id": "symbiotic_scan_swarm",
    "name": "Symbiotic Scan-Swarm",
    "type": "Charm",
    "elements": [
      "Dark",
      "Nature"
    ],
    "rarity": "Uncommon",
    "set": "Crimson Circuit",
    "keywords": [
      "Photosynthesis"
    ],
    "text": "It maps the caverns and feeds on what it finds.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Tiny_metallic_insect_swarm_scanning_dark_caverns._--chaos_5_-_3476861c-8815-48bd-b547-3f0d287cf3ea_0.png?updatedAt=1783333969036",
    "cost": {
      "Dark": 1,
      "Nature": 1
    },
    "duration": 3
  },
  {
    "id": "tectonic_rift",
    "name": "Tectonic Rift",
    "type": "Event",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Rare",
    "set": "Crimson Circuit",
    "keywords": [
      "Obliterate"
    ],
    "text": "Obliterate: the ground simply stops agreeing to hold them.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Ground_splitting_apart_showing_bright_lava_underneath._--no_t_99f5673d-3557-4c49-9e9a-0e9a70f5b302_0.png?updatedAt=1783333968996",
    "cost": {
      "Flame": 2,
      "Chaos": 1,
      "Generic": 2
    },
    "effect": {
      "action": "obliterate",
      "target": "unit"
    }
  },
  {
    "id": "nanite_division_marshal",
    "name": "Nanite Division Marshal",
    "type": "Unit",
    "elements": [
      "Order"
    ],
    "rarity": "Super-Rare",
    "set": "Crimson Circuit",
    "keywords": [
      "Guard",
      "Armor 1"
    ],
    "text": "A billion machines, one salute.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Specialized_leader_commanding_armored_nanite_divisions._--cha_5ac2c09c-bb9b-41c2-9f2e-d69a6b2098bd_1.png?updatedAt=1783333969088",
    "cost": {
      "Order": 2,
      "Generic": 2
    },
    "attack": 2,
    "health": 5
  },
  {
    "id": "shinobi_operations_base",
    "name": "Shinobi Operations Base",
    "type": "Location",
    "elements": [
      "Dark",
      "Tech"
    ],
    "rarity": "Uncommon",
    "set": "Crimson Circuit",
    "keywords": [
      "Inspire 1"
    ],
    "text": "Recruits enter. Weapons leave.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/High-tech_ninja_operations_base._--ar_43_--raw_--sref_2208496_86434ad5-db02-4b77-86f8-dd45bd7a089d_1.png?updatedAt=1783333969028",
    "cost": {
      "Dark": 1,
      "Tech": 1
    },
    "locEffect": "ATK_ALL"
  },
  {
    "id": "shatterline",
    "name": "Shatterline",
    "type": "Event",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Efficient 2"
    ],
    "text": "Efficient 2: the breach is open \u2014 the next Unit you deploy this turn costs 2 less. Deals 1 damage.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Explosive_energy_crack_shattering_solid_rock._--chaos_5_--ar__0599db95-7f40-451e-b15e-63c460039fdd_1.png?updatedAt=1783333969017",
    "cost": {
      "Flame": 1,
      "Generic": 1
    },
    "effect": {
      "action": "damage",
      "value": 1,
      "target": "unit"
    }
  },
  {
    "id": "pyroproof_vanguard",
    "name": "Pyroproof Vanguard",
    "type": "Unit",
    "elements": [
      "Flame",
      "Order"
    ],
    "rarity": "Uncommon",
    "set": "Crimson Circuit",
    "keywords": [
      "Guard",
      "Armor 2"
    ],
    "text": "The lava moved around him. So did the war.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Heavy_armored_ninja_impervious_to_heat._--chaos_5_--ar_43_--r_fd7ce4bd-17bc-4a37-94ec-3158c1bde894_1.png?updatedAt=1783333969053",
    "cost": {
      "Flame": 1,
      "Order": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 3
  },
  {
    "id": "ash_shaper_mystic",
    "name": "Ash-Shaper Mystic",
    "type": "Unit",
    "elements": [
      "Flame",
      "Chaos"
    ],
    "rarity": "Rare",
    "set": "Crimson Circuit",
    "keywords": [
      "Taint 2"
    ],
    "text": "What his ash touches, the world finishes.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Sorcerer-ninja_shaping_burning_ash_swarms._--chaos_5_--ar_43__0ff0a5b9-7d1f-4c7e-93a7-226265bf0f1f_1.png?updatedAt=1783333969038",
    "cost": {
      "Flame": 1,
      "Chaos": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 3
  },
  {
    "id": "perpetual_dynamo",
    "name": "Perpetual Dynamo",
    "type": "Charm",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Sync 1"
    ],
    "text": "Every deployment feeds the current; the current feeds the next.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Generates_endless_kinetic_current._--chaos_5_--ar_43_--raw_--_e152a325-58a9-46a0-bec3-6ca458c0ec53_0.png?updatedAt=1783333969031",
    "cost": {
      "Tech": 1,
      "Generic": 1
    },
    "duration": 3
  },
  {
    "id": "violet_haze_kunoichi",
    "name": "Violet Haze Kunoichi",
    "type": "Unit",
    "elements": [
      "Tech",
      "Dark"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Lurk",
      "Wither 1"
    ],
    "text": "The smoke remembers her shape long after she's gone.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Masked_female_ninja_walking_through_thick_purple_smoke._--cha_bd6de1fe-4d0c-4642-a6fd-3908c1102e61_0.png?updatedAt=1783333969061",
    "cost": {
      "Tech": 1,
      "Dark": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 2
  },
  {
    "id": "skydark_locust_host",
    "name": "Skydark Locust Host",
    "type": "Unit",
    "elements": [
      "Tech",
      "Dark"
    ],
    "rarity": "Uncommon",
    "set": "Crimson Circuit",
    "keywords": [
      "Phalanx 1"
    ],
    "text": "One locust is a glitch. A billion are a weather system.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Massive_mechanical_swarm_darkens_the_flat_purple_sky._--no_te_ec7cabcb-1477-4a94-9d1f-aa21c75d7afb_1.png?updatedAt=1783333968987",
    "cost": {
      "Tech": 1,
      "Dark": 1,
      "Generic": 2
    },
    "attack": 3,
    "health": 4
  },
  {
    "id": "locust_veil",
    "name": "Locust Veil",
    "type": "Event",
    "elements": [
      "Tech"
    ],
    "rarity": "Uncommon",
    "set": "Crimson Circuit",
    "keywords": [
      "Manifest 2"
    ],
    "text": "Manifest: the cloud condenses into a 2/2 swarm token.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Billions_of_sharp_vector-rendered_mechanical_locusts_clouding_0d54c5d8-8fae-4e64-bd53-ec98fca13ed3_0.png?updatedAt=1783333968945",
    "cost": {
      "Tech": 1,
      "Generic": 2
    },
    "effect": {
      "action": "manifest",
      "value": 2
    }
  },
  {
    "id": "nanite_shock_trooper",
    "name": "Nanite Shock Trooper",
    "type": "Unit",
    "elements": [
      "Tech",
      "Dark"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Armor 1",
      "Vengeance 1"
    ],
    "text": "Standard issue: plating, protocol, payback.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Heavy_armor_nanite_ninja_shock_trooper._--ar_43_--raw_--sref__2a759665-9d96-4337-bd2a-35f9349db400_0.png?updatedAt=1783333969097",
    "cost": {
      "Tech": 1,
      "Dark": 1
    },
    "attack": 2,
    "health": 2
  },
  {
    "id": "neon_phantom_assassin",
    "name": "Neon Phantom Assassin",
    "type": "Unit",
    "elements": [
      "Tech",
      "Dark"
    ],
    "rarity": "Rare",
    "set": "Crimson Circuit",
    "keywords": [
      "Lurk",
      "Solitary 2"
    ],
    "text": "Backup would only get in the way.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Invisible_neon_shadow_assassin._--chaos_5_--ar_43_--raw_--sre_7345f2eb-2761-45d4-957a-cb8c73b46e5a_2.png?updatedAt=1783333969012",
    "cost": {
      "Tech": 1,
      "Dark": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 2
  },
  {
    "id": "molten_camo_weave",
    "name": "Molten Camo Weave",
    "type": "Item",
    "elements": [
      "Flame"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Armor 1"
    ],
    "text": "Dress for the terrain you want to disappear into.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Ninja_Camouflage_gear_utilizing_molten_environment_colors._--_c3073159-f89c-4bf9-9341-e6f68c215272_1.png?updatedAt=1783333968982",
    "cost": {
      "Flame": 1,
      "Generic": 1
    },
    "attach": {
      "attack": 0,
      "health": 2
    }
  },
  {
    "id": "hive_power_cell",
    "name": "Hive Power Cell",
    "type": "Item",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Overcharge 1"
    ],
    "text": "Concentrated appetite in a bottle.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Concentrated_power_source_for_nanite_hives._--chaos_5_--ar_43_101eca08-185a-46c7-82af-a028eac8f693_2.png?updatedAt=1783333968947",
    "cost": {
      "Tech": 1
    },
    "attach": {
      "attack": 1,
      "health": 1
    }
  },
  {
    "id": "kinetic_storage_gauntlet",
    "name": "Kinetic Storage Gauntlet",
    "type": "Item",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Surge"
    ],
    "text": "Every blow you land is a deposit.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/High-tech_metal_glove_glowing_with_stored_energy._--no_text_w_76e853bc-0374-4637-8ff1-ea4a9c78ee56_1.png?updatedAt=1783333968989",
    "cost": {
      "Tech": 1,
      "Generic": 1
    },
    "attach": {
      "attack": 1,
      "health": 1
    }
  },
  {
    "id": "bladetail_symbiont",
    "name": "Bladetail Symbiont",
    "type": "Unit",
    "elements": [
      "Tech",
      "Dark"
    ],
    "rarity": "Uncommon",
    "set": "Crimson Circuit",
    "keywords": [
      "Pierce",
      "Overdrive"
    ],
    "text": "The tail has its own opinion about when the fight is over.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/A_biomechanical_ninja_unit_utilizing_a_segmented_bladed_tail._0ecbd9d3-094b-4057-b6a7-b6127a575f35_3.png?updatedAt=1783333968962",
    "cost": {
      "Tech": 1,
      "Dark": 1,
      "Generic": 1
    },
    "attack": 3,
    "health": 2
  },
  {
    "id": "vector_blade_captain",
    "name": "Vector Blade Captain",
    "type": "Unit",
    "elements": [
      "Order"
    ],
    "rarity": "Uncommon",
    "set": "Crimson Circuit",
    "keywords": [
      "Blitz",
      "Reap"
    ],
    "text": "The blade renders; the captain collects.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Vector_ninja_captain_with_glowing_green_blade._--chaos_5_--ar_a2a668dc-416c-4da3-8df1-99746a033a3e_0.png?updatedAt=1783333969006",
    "cost": {
      "Order": 1,
      "Generic": 2
    },
    "attack": 3,
    "health": 3
  },
  {
    "id": "apex_nanite_shinobi",
    "name": "Apex Nanite Shinobi",
    "type": "Leader",
    "elements": [
      "Tech",
      "Dark"
    ],
    "rarity": "Mythic",
    "set": "Crimson Circuit",
    "keywords": [
      "Command 2",
      "Ward 2",
      "Sustain 1"
    ],
    "text": "He is not wearing the swarm. The swarm is wearing him.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/ultimate_nanite-integrated_shinobi._--ar_43_--raw_--sref_2208_1ef2a9f4-aba7-4094-8f2c-f658dca2886f_2.png?updatedAt=1783333969071",
    "health": 33,
    "attack": 3
  },
  {
    "id": "obsidian_golem",
    "name": "Obsidian Golem",
    "type": "Unit",
    "elements": [
      "Frost",
      "Tech"
    ],
    "rarity": "Uncommon",
    "set": "Crimson Circuit",
    "keywords": [
      "Armor 2",
      "Brittle"
    ],
    "text": "Hard as glass. Exactly as glass.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Crystallized_rock_soldier_with_sharp_vector_edges._--no_text__a422b5d2-6288-4413-bf94-ade6c6d2100f_2.png?updatedAt=1783333969016",
    "cost": {
      "Frost": 1,
      "Tech": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 5
  },
  {
    "id": "overseer_optic",
    "name": "Overseer Optic",
    "type": "Unit",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Feedback"
    ],
    "text": "It sees your spell before you finish casting it.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Floating_mechanical_eye_emitting_bright_red_laser._--chaos_5__c33828d5-f8d3-401c-830a-c074b68c445f_1.png?updatedAt=1783333969008",
    "cost": {
      "Tech": 1
    },
    "attack": 1,
    "health": 2
  },
  {
    "id": "kinetix_enforcer",
    "name": "Kinetix Enforcer",
    "type": "Unit",
    "elements": [
      "Tech",
      "Dark"
    ],
    "rarity": "Uncommon",
    "set": "Crimson Circuit",
    "keywords": [
      "Guard",
      "Ward 1"
    ],
    "text": "The contract says protect. The armor says try me.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/A_high-contrast_character_profile._Sharp_black_cyber-armor_wi_67967b76-6fc1-4c6a-97c4-f6007cd06c70_0.png?updatedAt=1783333968949",
    "cost": {
      "Tech": 1,
      "Dark": 1,
      "Generic": 1
    },
    "attack": 2,
    "health": 4
  },
  {
    "id": "kinetic_siphon_swarm",
    "name": "Kinetic Siphon Swarm",
    "type": "Charm",
    "elements": [
      "Dark",
      "Tech"
    ],
    "rarity": "Rare",
    "set": "Crimson Circuit",
    "keywords": [
      "Decay 1"
    ],
    "text": "Decay 1: it drinks the motion out of everything they field.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Swarm_Drains_kinetic_energy_instantly._--ar_43_--raw_--sref_2_080e2c82-4605-4624-b485-9489582867a9_0.png?updatedAt=1783333969010",
    "cost": {
      "Dark": 1,
      "Tech": 1,
      "Generic": 1
    },
    "duration": 2
  },
  {
    "id": "barrier_projection_field",
    "name": "Barrier Projection Field",
    "type": "Charm",
    "elements": [
      "Light",
      "Order"
    ],
    "rarity": "Rare",
    "set": "Crimson Circuit",
    "keywords": [
      "Beacon 1"
    ],
    "text": "A wall of light, folded to pocket size.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Compact_device_projecting_flat_red_protective_barrier._--no_t_6e57d670-bfff-4e8f-a04e-801fddca8ac6_2.png?updatedAt=1783333969065",
    "cost": {
      "Light": 1,
      "Order": 1
    },
    "duration": 2
  },
  {
    "id": "kinetic_anchor_monolith",
    "name": "Kinetic Anchor Monolith",
    "type": "Location",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Fix Tech"
    ],
    "text": "It does one thing: it does not move.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/A_monolithic_triangular_technical_device_anchoring_kinetic_tr_cf1eb229-330e-4806-930d-9bae0bb56aea_1.png?updatedAt=1783333968939",
    "cost": {
      "Tech": 1,
      "Generic": 1
    },
    "locEffect": "HP_ALL"
  },
  {
    "id": "kinetic_piercer",
    "name": "Kinetic Piercer",
    "type": "Item",
    "elements": [
      "Flame"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Pierce"
    ],
    "text": "It doesn't stop at the first thing it hits.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Piercing_ninja_weapon_--chaos_5_--ar_43_--raw_--sref_22084965_b7d23660-c9f0-4299-9796-b2bb3dcec398_1.png?updatedAt=1783333969014",
    "cost": {
      "Flame": 1,
      "Generic": 1
    },
    "attach": {
      "attack": 2,
      "health": 0
    }
  },
  {
    "id": "resonant_shuriken",
    "name": "Resonant Shuriken",
    "type": "Item",
    "elements": [
      "Tech"
    ],
    "rarity": "Common",
    "set": "Crimson Circuit",
    "keywords": [
      "Glitch"
    ],
    "text": "You hear it twice: once going in, once in your dreams.",
    "image": "https://ik.imagekit.io/zusyw2yie/SET2/Sharp_throwing_star_emitting_sound_waves._--no_text_words_--c_2010384a-a332-4ab5-87c7-441b9fc6892e_1.png?updatedAt=1783333968992",
    "cost": {
      "Tech": 1,
      "Generic": 1
    },
    "attach": {
      "attack": 1,
      "health": 1
    }
  }
] as CardTemplate[];
