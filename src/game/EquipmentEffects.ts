// ─── Equipment Effects (No Phaser imports) ───
// Applies owned equipment effects to scoring and config.

import { Die, HandType, HandResult, ScoreResult } from './types';
import { EquipmentInstance } from './ItemsSystem';

export interface ScoringContext {
  handResult: HandResult;
  scoringDice: Die[];
  heldDice: Die[];           // dice rolled but not scored (held in hand)
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
        console.log(`  [equip] ${equip.def.name}: ADD_MULT +${p.value} (bonusMult: ${bonusMult})`);
        break;

      case 'ADD_MULT_RISKY':
        // Same as ADD_MULT during scoring; destruction handled at round end
        bonusMult += p.value as number;
        break;

      // PIP_MULT, PIP_MILES, PARITY_MULT, PARITY_MILES are handled per-die in scoreHand (step 3)

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

    // Apply item aura bonuses
    if (equip.def.aura) {
      switch (equip.def.aura.id) {
        case 'fire':
          bonusMult += 10;
          console.log(`  [equip] ${equip.def.name} FIRE aura: +10 mult (bonusMult: ${bonusMult})`);
          break;
        case 'icy':
          bonusMiles += 50;
          console.log(`  [equip] ${equip.def.name} ICY aura: +50 miles (bonusMiles: ${bonusMiles})`);
          break;
        // holy (xMult) is applied after additive bonuses below
        // ghost is not a scoring effect
      }
    }
  }

  console.log(`  [equip] Step 4 totals: bonusMiles: ${bonusMiles}, bonusMult: ${bonusMult}`);

  const totalValue = baseResult.totalValue;
  const baseMiles = baseResult.handResult.baseMiles;
  let finalMult = baseResult.mult + bonusMult;

  // Apply holy aura xMult (multiplicative, applied last)
  for (const equip of equipment) {
    if (equip.def.aura?.id === 'holy') {
      finalMult = finalMult * 1.5;
      console.log(`  [equip] ${equip.def.name} HOLY aura: x1.5 mult (finalMult: ${finalMult})`);
    }
  }

  const finalMiles = (baseMiles + totalValue + bonusMiles) * finalMult;
  console.log(`  [equip] Final: (${baseMiles} base + ${totalValue} value + ${bonusMiles} bonusMiles) * ${finalMult} = ${finalMiles} miles`);

  return {
    handResult: baseResult.handResult,
    totalValue,
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

// ─── Held-in-Hand Processing (Step 4) ───

export interface HeldAnimStep {
  dieId: string;
  type: 'mult' | 'xmult' | 'money';
  value: number;
  source: string;        // e.g. 'STEEL', equipment name
  equipIndex?: number;   // index in equipment array (for wiggle)
}

interface HeldInHandResult {
  bonusMult: number;
  xMult: number;
  moneyEarned: number;
  animSteps: HeldAnimStep[];
}

/**
 * Process held-in-hand abilities for dice that were rolled but not scored.
 * Sequence per die (left to right): steel enhancement → equipment triggers → retriggers.
 * Retriggers: red_bullet sticker first, then Double Down equipment.
 */
export function processHeldInHand(
  heldDice: Die[],
  equipment: EquipmentInstance[],
): HeldInHandResult {
  let bonusMult = 0;
  let xMult = 1;
  let moneyEarned = 0;
  const animSteps: HeldAnimStep[] = [];

  // Count retriggers from Double Down equipment
  const doubleDownCount = equipment.filter(e => e.def.effectType === 'HELD_RETRIGGER').length;

  // Find the lowest held die value for Bottom Dollar
  const lowestValue = heldDice.length > 0
    ? Math.min(...heldDice.map(d => d.value))
    : 0;

  console.log('[SCORE] Step 4: Held-in-hand abilities');
  console.log(`  [held] Held dice: ${heldDice.map(d => `${d.id}(value:${d.value}, enh:${d.enhancement}, sticker:${d.sticker})`).join(', ') || 'none'}`);

  for (const die of heldDice) {
    // Calculate how many times this die triggers:
    // 1 base + red_bullet sticker retrigger + Double Down retriggers
    const hasRedBullet = die.sticker === 'red_bullet';
    const triggers = 1 + (hasRedBullet ? 1 : 0) + doubleDownCount;

    for (let t = 0; t < triggers; t++) {
      const triggerLabel = t === 0 ? '' : ` (retrigger ${t})`;

      // Steel enhancement: x1.5 mult per trigger
      if (die.enhancement === 'steel') {
        xMult *= 1.5;
        animSteps.push({ dieId: die.id, type: 'xmult', value: 1.5, source: 'STEEL' });
        console.log(`  [held] Die ${die.id}${triggerLabel}: STEEL x1.5 mult (xMult: ${xMult})`);
      }

      // Equipment triggers on held dice
      for (let eIdx = 0; eIdx < equipment.length; eIdx++) {
        const equip = equipment[eIdx];
        const { effectType, effectParams } = equip.def;
        const p = effectParams as Record<string, unknown>;

        switch (effectType) {
          case 'HELD_LOWEST_MULT':
            // Bottom Dollar: adds double the rank of the lowest held die to mult
            if (die.value === lowestValue) {
              bonusMult += lowestValue * 2;
              animSteps.push({ dieId: die.id, type: 'mult', value: lowestValue * 2, source: equip.def.name, equipIndex: eIdx });
              console.log(`  [held] Die ${die.id}${triggerLabel} → ${equip.def.name}: +${lowestValue * 2} mult (bonusMult: ${bonusMult})`);
            }
            break;

          case 'HELD_PIP_XMULT':
            // Ace in the Hole: each matching pip gives xMult
            if (die.value === (p.pip as number)) {
              xMult *= p.value as number;
              animSteps.push({ dieId: die.id, type: 'xmult', value: p.value as number, source: equip.def.name, equipIndex: eIdx });
              console.log(`  [held] Die ${die.id}${triggerLabel} → ${equip.def.name}: x${p.value} mult (xMult: ${xMult})`);
            }
            break;

          case 'HELD_PIP_MULT':
            // The Eleventh Crossing: each matching pip gives +mult
            if (die.value === (p.pip as number)) {
              bonusMult += p.value as number;
              animSteps.push({ dieId: die.id, type: 'mult', value: p.value as number, source: equip.def.name, equipIndex: eIdx });
              console.log(`  [held] Die ${die.id}${triggerLabel} → ${equip.def.name}: +${p.value} mult (bonusMult: ${bonusMult})`);
            }
            break;

          case 'HELD_ENHANCED_MONEY':
            // Prospector's Pouch: each enhanced die has chance to give money
            if (die.enhancement !== null) {
              const [num, den] = p.chance as [number, number];
              if (Math.random() < num / den) {
                moneyEarned += p.value as number;
                animSteps.push({ dieId: die.id, type: 'money', value: p.value as number, source: equip.def.name, equipIndex: eIdx });
                console.log(`  [held] Die ${die.id}${triggerLabel} → ${equip.def.name}: +$${p.value} (total: $${moneyEarned})`);
              }
            }
            break;
        }
      }
    }
  }

  console.log(`  [held] Totals: bonusMult: ${bonusMult}, xMult: ${xMult}, money: $${moneyEarned}`);
  return { bonusMult, xMult, moneyEarned, animSteps };
}

// ─── Helpers ───

/** Check if the played hand type matches or contains the required type.
 *  e.g. FULL_HOUSE contains PAIR and THREE_OF_A_KIND */
function handTypeMatches(played: HandType, required: string): boolean {
  if (played === required) return true;

  // A full house contains pair, three of a kind, and two pair
  if (played === HandType.FULL_HOUSE) {
    if (required === HandType.PAIR || required === HandType.THREE_OF_A_KIND || required === HandType.TWO_PAIR) return true;
  }
  // Two pair contains pair
  if (played === HandType.TWO_PAIR && required === HandType.PAIR) return true;
  // Three of a kind contains pair
  if (played === HandType.THREE_OF_A_KIND && required === HandType.PAIR) return true;
  // Four of a kind contains three of a kind, pair, and two pair
  if (played === HandType.FOUR_OF_A_KIND) {
    if (required === HandType.THREE_OF_A_KIND || required === HandType.PAIR) return true;
  }
  // Five of a kind contains four, three, pair, two pair, full house
  if (played === HandType.FIVE_OF_A_KIND) {
    if (required === HandType.FOUR_OF_A_KIND || required === HandType.THREE_OF_A_KIND || required === HandType.PAIR || required === HandType.TWO_PAIR || required === HandType.FULL_HOUSE) return true;
  }
  // Five straight contains four straight and three straight
  if (played === HandType.FIVE_STRAIGHT) {
    if (required === HandType.FOUR_STRAIGHT || required === HandType.THREE_STRAIGHT) return true;
  }
  // Four straight contains three straight
  if (played === HandType.FOUR_STRAIGHT && required === HandType.THREE_STRAIGHT) return true;

  return false;
}
