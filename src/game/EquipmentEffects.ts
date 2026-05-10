// ─── Equipment Effects (No Phaser imports) ───
// Applies owned equipment effects to scoring and config.

import { Die, HandType, HandResult, ScoreResult } from './types';
import { EquipmentInstance } from './ItemsSystem';

export interface ScoringContext {
  handResult: HandResult;
  scoringDice: Die[];
  rerollsRemaining: number;
  equipmentCount: number;
}

/**
 * Apply all equipment effects to a base score result.
 * Returns a new ScoreResult with bonuses applied.
 */
export function applyEquipmentEffects(
  baseResult: ScoreResult,
  equipment: EquipmentInstance[],
  context: ScoringContext
): ScoreResult {
  let bonusMiles = 0;
  let bonusMult = 0;

  for (const equip of equipment) {
    const { effectType, effectParams } = equip.def;
    const p = effectParams as Record<string, unknown>;

    switch (effectType) {
      case 'ADD_MULT':
        bonusMult += p.value as number;
        break;

      case 'ADD_MULT_RISKY':
        // Same as ADD_MULT during scoring; destruction handled at round end
        bonusMult += p.value as number;
        break;

      case 'PIP_MULT':
        // +mult for each scored die matching a specific pip
        for (const die of context.scoringDice) {
          if (die.pips === (p.pip as number)) {
            bonusMult += p.value as number;
          }
        }
        break;

      case 'HAND_MULT':
        // +mult if hand type contains the specified type
        if (handTypeMatches(context.handResult.type, p.handType as string)) {
          bonusMult += p.value as number;
        }
        break;

      case 'HAND_MILES':
        // +miles if hand type contains the specified type
        if (handTypeMatches(context.handResult.type, p.handType as string)) {
          bonusMiles += p.value as number;
        }
        break;

      case 'PIP_MILES':
        // +miles for each scored die matching a specific pip
        for (const die of context.scoringDice) {
          if (die.pips === (p.pip as number)) {
            bonusMiles += p.value as number;
          }
        }
        break;

      case 'PARITY_MULT':
        // +mult per scored die with matching parity
        for (const die of context.scoringDice) {
          if (matchesParity(die.pips, p.parity as string)) {
            bonusMult += p.value as number;
          }
        }
        break;

      case 'PARITY_MILES':
        // +miles per scored die with matching parity
        for (const die of context.scoringDice) {
          if (matchesParity(die.pips, p.parity as string)) {
            bonusMiles += p.value as number;
          }
        }
        break;

      case 'MILES_PER_UNUSED_REROLL':
        bonusMiles += (p.value as number) * context.rerollsRemaining;
        break;

      case 'CONDITIONAL_MULT': {
        const condition = p.condition as string;
        let met = false;
        if (condition === 'SCORED_DICE_LTE') {
          met = context.scoringDice.length <= (p.threshold as number);
        } else if (condition === 'NO_REROLLS') {
          met = context.rerollsRemaining === 0;
        }
        if (met) bonusMult += p.value as number;
        break;
      }

      case 'MULT_PER_EQUIPMENT':
        bonusMult += (p.value as number) * context.equipmentCount;
        break;

      // Config-modifying effects (MODIFY_HAND_SIZE, MODIFY_REROLLS) and
      // end-of-round effects (END_ROUND_MONEY) are not applied during scoring.
    }
  }

  const totalPips = baseResult.totalPips;
  const baseMiles = baseResult.handResult.baseMiles;
  const finalMult = baseResult.handResult.baseMult + bonusMult;
  const finalMiles = (baseMiles + totalPips + bonusMiles) * finalMult;

  return {
    handResult: baseResult.handResult,
    totalPips,
    miles: finalMiles,
    mult: finalMult,
  };
}

/**
 * Get config modifications from equipment (hand size, rerolls).
 */
export function getConfigModifiers(equipment: EquipmentInstance[]): {
  rerollsBonus: number;
} {
  let rerollsBonus = 0;

  for (const equip of equipment) {
    const { effectType, effectParams } = equip.def;
    const p = effectParams as Record<string, unknown>;

    if (effectType === 'MODIFY_REROLLS') {
      rerollsBonus += p.value as number;
    }
  }

  return { rerollsBonus };
}

/**
 * Process end-of-round effects. Returns money earned and equipment to destroy.
 */
export function processEndOfRound(equipment: EquipmentInstance[]): {
  moneyEarned: number;
  destroyedIndices: number[];
} {
  let moneyEarned = 0;
  const destroyedIndices: number[] = [];

  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i];
    const { effectType, effectParams } = equip.def;
    const p = effectParams as Record<string, unknown>;

    if (effectType === 'END_ROUND_MONEY') {
      moneyEarned += p.value as number;
    }

    if (effectType === 'ADD_MULT_RISKY') {
      const [num, den] = p.destroyChance as [number, number];
      if (Math.random() < num / den) {
        destroyedIndices.push(i);
      }
    }
  }

  return { moneyEarned, destroyedIndices };
}

// ─── Helpers ───

/** Check if the played hand type matches or contains the required type.
 *  e.g. FULL_HOUSE contains PAIR and THREE_OF_A_KIND */
function handTypeMatches(played: HandType, required: string): boolean {
  if (played === required) return true;

  // A full house contains both a pair and three of a kind
  if (played === HandType.FULL_HOUSE) {
    if (required === HandType.PAIR || required === HandType.THREE_OF_A_KIND) return true;
  }
  // Two pair contains pair
  if (played === HandType.TWO_PAIR && required === HandType.PAIR) return true;
  // Four of a kind contains three of a kind and pair
  if (played === HandType.FOUR_OF_A_KIND) {
    if (required === HandType.THREE_OF_A_KIND || required === HandType.PAIR) return true;
  }
  // Five of a kind contains four, three, pair
  if (played === HandType.FIVE_OF_A_KIND) {
    if (required === HandType.FOUR_OF_A_KIND || required === HandType.THREE_OF_A_KIND || required === HandType.PAIR) return true;
  }
  // Five straight contains four straight and three straight
  if (played === HandType.FIVE_STRAIGHT) {
    if (required === HandType.FOUR_STRAIGHT || required === HandType.THREE_STRAIGHT) return true;
  }
  // Four straight contains three straight
  if (played === HandType.FOUR_STRAIGHT && required === HandType.THREE_STRAIGHT) return true;

  return false;
}

function matchesParity(pips: number, parity: string): boolean {
  if (parity === 'even') return pips % 2 === 0;
  if (parity === 'odd') return pips % 2 !== 0;
  return false;
}
