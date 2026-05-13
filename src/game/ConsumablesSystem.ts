// ─── Consumables System (No Phaser imports) ───
// Defines consumable card types, instances, and generation helpers.
// Consumables are one-time-use cards (supply cards, trail guides, frontier encounters)
// held in the consumable bar. They can be used, sold, or reordered.

import type { ItemAura } from './ItemsSystem';
import type { DiceSelectionConfig } from './DiceSelectionSystem';
import type { InstantEffect } from './BoosterPackSystem';
import { HandType } from './types';

export type ConsumableCategory = 'supply' | 'trail_guide' | 'frontier';

/** Returns the texture key prefix used when loading/displaying a consumable category's image.
 *  Trail guide IDs already include `tg_`, so their prefix is empty. */
export function getConsumableTexturePrefix(category: ConsumableCategory): string {
  switch (category) {
    case 'supply':
      return 'supply_';
    case 'trail_guide':
      return ''; // IDs are already prefixed (e.g. tg_high_value)
    case 'frontier':
      return 'fe_';
  }
}

export interface ConsumableDef {
  id: string;
  name: string;
  description: string;
  category: ConsumableCategory;
  cost: number;
  aura?: ItemAura | null;
  instantEffect?: InstantEffect;
  diceSelection?: DiceSelectionConfig;
  /** For trail guides — which hand type they upgrade */
  handType?: string;
}

export interface ConsumableInstance {
  def: ConsumableDef;
  sellValue: number;
}

// ─── Generation Helpers ───

import supplyCardsData from '../data/supply_cards.json';
import trailGuidesData from '../data/trail_guides.json';
import frontierEncountersData from '../data/frontier_encounters.json';
import { DiceSelectionEffectType, DiceSelectionEffectParams } from './DiceSelectionSystem';

const SUPPLY_CARDS = supplyCardsData;
const TRAIL_GUIDES = trailGuidesData;
const FRONTIER_ENCOUNTERS = frontierEncountersData;

/** Create a ConsumableDef from a supply card JSON entry */
export function createSupplyConsumableDef(
  cardData: (typeof SUPPLY_CARDS)[number],
  aura?: ItemAura | null,
): ConsumableDef {
  const def: ConsumableDef = {
    id: cardData.id,
    name: cardData.name,
    description: cardData.description,
    category: 'supply',
    cost: 3,
    aura: aura ?? null,
  };
  if ('instantEffect' in cardData && cardData.instantEffect) {
    def.instantEffect = cardData.instantEffect as InstantEffect;
  }
  if ('diceSelection' in cardData && cardData.diceSelection) {
    const ds = cardData.diceSelection as {
      drawCount: number;
      pickCount: number;
      effectType: string;
      effectParams: Record<string, unknown>;
    };
    def.diceSelection = {
      drawCount: ds.drawCount,
      pickCount: ds.pickCount,
      effectType: ds.effectType as DiceSelectionEffectType,
      effectParams: ds.effectParams as DiceSelectionEffectParams,
      cardName: cardData.name,
      description: cardData.description,
      skippable: true,
    };
  }
  return def;
}

/** Create a ConsumableDef from a trail guide JSON entry */
export function createTrailGuideConsumableDef(
  tgData: (typeof TRAIL_GUIDES)[number],
  aura?: ItemAura | null,
): ConsumableDef {
  return {
    id: tgData.id,
    name: tgData.name,
    description: tgData.description,
    category: 'trail_guide',
    cost: 3,
    aura: aura ?? null,
    handType: tgData.handType,
  };
}

/** Create a ConsumableDef from a frontier encounter JSON entry */
export function createFrontierConsumableDef(
  feData: (typeof FRONTIER_ENCOUNTERS)[number],
  aura?: ItemAura | null,
): ConsumableDef {
  const def: ConsumableDef = {
    id: feData.id,
    name: feData.name,
    description: feData.description,
    category: 'frontier',
    cost: 4,
    aura: aura ?? null,
  };
  if ('instantEffect' in feData && feData.instantEffect) {
    def.instantEffect = feData.instantEffect as InstantEffect;
  }
  if ('diceSelection' in feData && feData.diceSelection) {
    const ds = feData.diceSelection as {
      drawCount: number;
      pickCount: number;
      effectType: string;
      effectParams: Record<string, unknown>;
    };
    def.diceSelection = {
      drawCount: ds.drawCount,
      pickCount: ds.pickCount,
      effectType: ds.effectType as DiceSelectionEffectType,
      effectParams: ds.effectParams as DiceSelectionEffectParams,
      cardName: feData.name,
      description: feData.description,
      skippable: true,
    };
  }
  return def;
}

/** Create a ConsumableInstance from a def */
export function createConsumableInstance(def: ConsumableDef): ConsumableInstance {
  return {
    def,
    sellValue: Math.max(1, Math.floor(def.cost / 2)),
  };
}

/** Get a random supply card def */
export function getRandomSupplyDef(aura?: ItemAura | null): ConsumableDef {
  const card = SUPPLY_CARDS[Math.floor(Math.random() * SUPPLY_CARDS.length)];
  return createSupplyConsumableDef(card, aura);
}

/** Get a random trail guide def */
export function getRandomTrailGuideDef(aura?: ItemAura | null): ConsumableDef {
  const tg = TRAIL_GUIDES[Math.floor(Math.random() * TRAIL_GUIDES.length)];
  return createTrailGuideConsumableDef(tg, aura);
}

/** Get a random frontier encounter def */
export function getRandomFrontierDef(aura?: ItemAura | null): ConsumableDef {
  const fe = FRONTIER_ENCOUNTERS[Math.floor(Math.random() * FRONTIER_ENCOUNTERS.length)];
  return createFrontierConsumableDef(fe, aura);
}

/** Get a supply card def by id */
export function getSupplyDefById(id: string, aura?: ItemAura | null): ConsumableDef | null {
  const card = SUPPLY_CARDS.find((c) => c.id === id);
  if (!card) return null;
  return createSupplyConsumableDef(card, aura);
}

/** Get a trail guide def by id */
export function getTrailGuideDefById(id: string, aura?: ItemAura | null): ConsumableDef | null {
  const tg = TRAIL_GUIDES.find((t) => t.id === id);
  if (!tg) return null;
  return createTrailGuideConsumableDef(tg, aura);
}

// ─── Shop Generation ───

/** Generate random consumable cards for the shop.
 *  Picks from supply cards and trail guides (frontier only if enabled). */
export function generateShopConsumables(count: number, options?: { includeFrontier?: boolean }): ConsumableDef[] {
  const pool: ConsumableDef[] = [];

  // Add all supply cards to pool
  for (const card of SUPPLY_CARDS) {
    pool.push(createSupplyConsumableDef(card));
  }

  // Add all trail guides
  for (const tg of TRAIL_GUIDES) {
    pool.push(createTrailGuideConsumableDef(tg));
  }

  // Add frontier encounters if enabled (Demon Hunter)
  if (options?.includeFrontier) {
    for (const fe of FRONTIER_ENCOUNTERS) {
      pool.push(createFrontierConsumableDef(fe));
    }
  }

  // Shuffle and pick
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ─── Use Execution (non-Phaser logic) ───

import { createDie } from './DiceSystem';
import { generateRandomEquipment, createEquipmentInstance } from './ItemsSystem';
import type { DiceEnhancement } from './types';
import type { PlayerState } from './PlayerState';

export interface UseConsumableResult {
  /** Whether the effect was applied successfully */
  success: boolean;
  /** If the consumable requires a dice selection scene, this config is set */
  diceSelection?: DiceSelectionConfig;
  /** Number of consumables created (for feedback) */
  consumablesCreated?: number;
  /** Reason for failure */
  failReason?: string;
}

/**
 * Execute a consumable's game-logic effect (non-Phaser).
 * Returns a result indicating what happened so the scene can animate/chain appropriately.
 */
export function executeConsumableEffect(consumed: ConsumableInstance, player: PlayerState): UseConsumableResult {
  const def = consumed.def;

  // ─── Trail guide → upgrade hand level ───
  if (def.category === 'trail_guide' && def.handType) {
    player.upgradeHandLevel(def.handType as HandType);
    return { success: true };
  }

  // ─── Dice selection cards (shallow_grave, mirage, etc.) ───
  if (def.diceSelection) {
    return { success: true, diceSelection: def.diceSelection };
  }

  // ─── Instant effects ───
  if (def.instantEffect) {
    return applyConsumableInstantEffect(def.instantEffect, player);
  }

  // ─── Supply cards that create other consumables ───
  switch (def.id) {
    case 'doctor': {
      // Creates 2 medicine consumables
      const medicineDef = getSupplyDefById('medicine');
      if (!medicineDef) return { success: true, consumablesCreated: 0 };
      let created = 0;
      for (let i = 0; i < 2; i++) {
        if (player.addConsumable(medicineDef)) created++;
      }
      return { success: true, consumablesCreated: created };
    }
    case 'compass': {
      // Creates 2 random trail guide consumables
      let created = 0;
      for (let i = 0; i < 2; i++) {
        const tgDef = getRandomTrailGuideDef();
        if (player.addConsumable(tgDef)) created++;
      }
      return { success: true, consumablesCreated: created };
    }
    case 'supply_cache': {
      // Creates 2 random supply consumables
      let created = 0;
      for (let i = 0; i < 2; i++) {
        const sDef = getRandomSupplyDef();
        if (player.addConsumable(sDef)) created++;
      }
      return { success: true, consumablesCreated: created };
    }
    case 'second_helpings': {
      // Creates last used consumable (excludes itself)
      if (!player.lastUsedConsumable || player.lastUsedConsumable.id === 'second_helpings') {
        return { success: false, failReason: 'No previous consumable used!' };
      }
      if (player.addConsumable(player.lastUsedConsumable)) {
        return { success: true, consumablesCreated: 1 };
      }
      return { success: false, failReason: 'No space!' };
    }
    case 'bless': {
      // 1 in 4 chance to bless equipment with aura — stub for now
      return { success: true };
    }
  }

  // Fallback — no known effect
  return { success: true };
}

function applyConsumableInstantEffect(effect: InstantEffect, player: PlayerState): UseConsumableResult {
  switch (effect.type) {
    case 'CREATE_DICE': {
      const count = effect.count ?? 1;
      const enhancement = (effect.enhancement ?? null) as DiceEnhancement;
      for (let i = 0; i < count; i++) {
        player.addDie(createDie({ enhancement }));
      }
      return { success: true };
    }
    case 'DOUBLE_MONEY': {
      const gain = Math.min(player.economy.balance, effect.maxGain ?? 20);
      player.economy.earn(gain);
      return { success: true };
    }
    case 'TRADE_EQUIPMENT': {
      const totalValue = player.equipment.reduce((sum, eq) => sum + eq.sellValue, 0);
      const gain = Math.min(totalValue, effect.maxGain ?? 50);
      player.economy.earn(gain);
      return { success: true };
    }
    case 'CREATE_EQUIPMENT': {
      if (player.equipmentSlotsFree > 0) {
        const def = generateRandomEquipment({
          rarity: effect.rarity,
          excludeRarity: effect.excludeRarity,
        });
        player.equipment.push(createEquipmentInstance(def));
      }
      if (effect.setMoneyZero) {
        player.economy.spend(player.economy.balance);
      }
      return { success: true };
    }
    default:
      return { success: true };
  }
}
