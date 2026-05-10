// ─── Booster Pack System (No Phaser imports) ───
// Defines pack types, tiers, weighted selection, and content generation.

import { Die, PipEffect } from './types';
import { createDie } from './DiceSystem';
import { generateShopStock, EquipmentDef } from './ItemsSystem';
import { DiceSelectionConfig, DiceSelectionEffectType, DiceSelectionEffectParams, pickRandomAura } from './DiceSelectionSystem';
import packsData from '../data/packs.json';
import supplyCardsData from '../data/supply_cards.json';
import trailGuidesData from '../data/trail_guides.json';
import frontierEncountersData from '../data/frontier_encounters.json';
import diceEnhancementsData from '../data/dice_enhancements.json';
import pipEnhancementsData from '../data/pip_enhancements.json';

const ENHANCEMENT_INFO = new Map(diceEnhancementsData.map(e => [e.id, e]));
const PIP_ENHANCEMENT_INFO = new Map(pipEnhancementsData.map(p => [p.id, p]));

// ─── Pip Effect Definitions (derived from frontier encounters) ───

interface PipEffectDef {
  pipEffect: PipEffect;
  sideCount: number;
}

/** Extract ADD_PIP_EFFECT definitions from frontier encounters as source of truth */
function getPipEffectDefs(): PipEffectDef[] {
  const defs: PipEffectDef[] = [];
  const seen = new Set<string>();
  for (const fe of frontierEncountersData) {
    if ('diceSelection' in fe && fe.diceSelection) {
      const ds = fe.diceSelection as { effectType: string; effectParams: { pipEffect?: string; sideCount?: number } };
      if (ds.effectType === 'ADD_PIP_EFFECT' && ds.effectParams.pipEffect && !seen.has(ds.effectParams.pipEffect)) {
        seen.add(ds.effectParams.pipEffect);
        defs.push({
          pipEffect: ds.effectParams.pipEffect as PipEffect,
          sideCount: ds.effectParams.sideCount ?? 1,
        });
      }
    }
  }
  return defs;
}

const PIP_EFFECT_DEFS = getPipEffectDefs();
const PIP_EFFECT_CHANCE = 0.08; // 8% chance per effect per die
const AURA_CHANCE = 0.50;      // 50% chance for aura (high for testing)

/** Randomly apply pip effects to a die. Each effect has a low chance to trigger.
 *  The same effect is never applied twice. If not enough empty sides, skip that effect. */
function applyRandomPipEffects(die: Die): void {
  // Shuffle effects so priority is random
  const shuffled = [...PIP_EFFECT_DEFS].sort(() => Math.random() - 0.5);

  for (const def of shuffled) {
    if (Math.random() >= PIP_EFFECT_CHANCE) continue;

    // Check if this pip effect is already on the die
    if (die.sidePips.some(p => p === def.pipEffect)) continue;

    // Count available (empty) sides
    const emptyIndices: number[] = [];
    for (let i = 0; i < 6; i++) {
      if (die.sidePips[i] === null) emptyIndices.push(i);
    }

    // Need enough empty sides for the full effect
    if (emptyIndices.length < def.sideCount) continue;

    // Pick random empty sides to apply to
    const picked = emptyIndices.sort(() => Math.random() - 0.5).slice(0, def.sideCount);
    for (const idx of picked) {
      die.sidePips[idx] = def.pipEffect;
    }
  }
}

// ─── Types ───

export type PackCategory = 'dice' | 'supply' | 'trail_guide' | 'frontier' | 'equipment';
export type PackTier = 'normal' | 'jumbo' | 'mega';

export interface PackDefinition {
  category: PackCategory;
  tier: PackTier;
  name: string;
  cost: number;
  totalCards: number;   // how many cards/items shown
  pickCount: number;    // how many the player can choose
  weight: number;       // spawn weight
  color: number;        // display color
}

export interface InstantEffect {
  type: string;                // CREATE_DICE, DOUBLE_MONEY, TRADE_EQUIPMENT, etc.
  enhancement?: string;        // for CREATE_DICE
  count?: number;              // for CREATE_DICE
  maxGain?: number;            // for DOUBLE_MONEY, TRADE_EQUIPMENT
}

/** A generated item inside an opened pack */
export interface PackItem {
  id: string;
  name: string;
  description: string;
  category: PackCategory;
  // Actual content payload
  die?: Die;
  equipmentDef?: EquipmentDef;
  supplyCardId?: string;
  trailGuideId?: string;
  frontierEncounterId?: string;
  diceSelection?: DiceSelectionConfig;  // if present, using this card launches dice selection
  instantEffect?: InstantEffect;        // if present, effect is applied immediately on confirm
}

/** A pack instance ready to buy in the shop */
export interface PackInstance {
  def: PackDefinition;
  id: string;
}

// ─── Pack Definitions (loaded from JSON) ───

const PACK_DEFS: PackDefinition[] = packsData.map(p => ({
  ...p,
  category: p.category as PackCategory,
  tier: p.tier as PackTier,
  color: parseInt(p.color),
}));

let nextPackId = 0;

// ─── Shop Generation ───

/** Pick N random packs using weighted selection */
export function generateShopPacks(count: number = 2): PackInstance[] {
  const totalWeight = PACK_DEFS.reduce((sum, d) => sum + d.weight, 0);
  const packs: PackInstance[] = [];

  for (let i = 0; i < count; i++) {
    let roll = Math.random() * totalWeight;
    let picked = PACK_DEFS[0];
    for (const def of PACK_DEFS) {
      roll -= def.weight;
      if (roll <= 0) { picked = def; break; }
    }
    packs.push({ def: picked, id: `pack_${nextPackId++}` });
  }

  return packs;
}

// ─── Content Generation ───

// Card data loaded from JSON
const SUPPLY_CARDS = supplyCardsData;
const TRAIL_GUIDES = trailGuidesData;
const FRONTIER_ENCOUNTERS = frontierEncountersData;

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

/** Generate the contents of a pack when it's opened */
export function generatePackContents(def: PackDefinition): PackItem[] {
  switch (def.category) {
    case 'dice':
      return generateDicePackContents(def.totalCards);
    case 'supply':
      return generateSupplyPackContents(def.totalCards);
    case 'trail_guide':
      return generateTrailGuidePackContents(def.totalCards);
    case 'frontier':
      return generateFrontierPackContents(def.totalCards);
    case 'equipment':
      return generateEquipmentPackContents(def.totalCards);
  }
}

function generateDicePackContents(count: number): PackItem[] {
  const items: PackItem[] = [];
  const enhancements = ['bone', 'lucky', 'wooden', 'iron', 'gold', 'loaded', 'blurry', null, null, null] as const;

  for (let i = 0; i < count; i++) {
    const enhancement = enhancements[Math.floor(Math.random() * enhancements.length)];
    const die = createDie({ enhancement: enhancement as Die['enhancement'] });
    applyRandomPipEffects(die);

    // Random aura chance
    if (Math.random() < AURA_CHANCE) {
      die.aura = pickRandomAura();
    }

    const enhInfo = enhancement ? ENHANCEMENT_INFO.get(enhancement) : null;
    const enhName = enhInfo ? enhInfo.name : 'Standard';
    const descParts = [enhInfo ? enhInfo.description : 'Standard dice'];
    for (const [pip, count] of describePipEffects(die)) {
      const info = PIP_ENHANCEMENT_INFO.get(pip);
      if (info) descParts.push(`${count}× ${info.name}`);
    }

    items.push({
      id: die.id,
      name: enhName,
      description: descParts.join('\n'),
      category: 'dice',
      die,
    });
  }
  return items;
}

function describePipEffects(die: Die): Map<string, number> {
  const counts = new Map<string, number>();
  for (const pip of die.sidePips) {
    if (pip) counts.set(pip, (counts.get(pip) || 0) + 1);
  }
  return counts;
}

function generateSupplyPackContents(count: number): PackItem[] {
  return pickRandom(SUPPLY_CARDS, count).map(s => {
    const item: PackItem = {
      id: s.id + '_' + Math.random().toString(36).slice(2, 6),
      name: s.name,
      description: s.description,
      category: 'supply' as PackCategory,
      supplyCardId: s.id,
    };
    if ('diceSelection' in s && s.diceSelection) {
      const ds = s.diceSelection as { drawCount: number; pickCount: number; effectType: string; effectParams: Record<string, unknown> };
      item.diceSelection = {
        drawCount: ds.drawCount,
        pickCount: ds.pickCount,
        effectType: ds.effectType as DiceSelectionEffectType,
        effectParams: ds.effectParams as DiceSelectionEffectParams,
        cardName: s.name,
        description: s.description,
        skippable: true,
      };
    }
    if ('instantEffect' in s && s.instantEffect) {
      item.instantEffect = s.instantEffect as InstantEffect;
    }
    return item;
  });
}

function generateTrailGuidePackContents(count: number): PackItem[] {
  return pickRandom(TRAIL_GUIDES, count).map(tg => ({
    id: tg.id + '_' + Math.random().toString(36).slice(2, 6),
    name: tg.name,
    description: tg.description,
    category: 'trail_guide' as PackCategory,
    trailGuideId: tg.id,
  }));
}

function generateFrontierPackContents(count: number): PackItem[] {
  return pickRandom(FRONTIER_ENCOUNTERS, count).map(fe => {
    const item: PackItem = {
      id: fe.id + '_' + Math.random().toString(36).slice(2, 6),
      name: fe.name,
      description: fe.description,
      category: 'frontier' as PackCategory,
      frontierEncounterId: fe.id,
    };
    if ('diceSelection' in fe && fe.diceSelection) {
      const ds = fe.diceSelection as { drawCount: number; pickCount: number; effectType: string; effectParams: Record<string, unknown> };
      item.diceSelection = {
        drawCount: ds.drawCount,
        pickCount: ds.pickCount,
        effectType: ds.effectType as DiceSelectionEffectType,
        effectParams: ds.effectParams as DiceSelectionEffectParams,
        cardName: fe.name,
        description: fe.description,
        skippable: true,
      };
    }
    return item;
  });
}

function generateEquipmentPackContents(count: number): PackItem[] {
  const defs = generateShopStock(count);
  return defs.map(def => ({
    id: def.id + '_' + Math.random().toString(36).slice(2, 6),
    name: def.name,
    description: def.description,
    category: 'equipment' as PackCategory,
    equipmentDef: def,
  }));
}
