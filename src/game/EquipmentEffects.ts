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
  playerBalance: number;     // current money
  currentDay: number;        // current day in the round (1-based)
  maxDays: number;           // max days this round
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

      case 'MILES_PER_DOLLAR': {
        const milesGain = (p.value as number) * context.playerBalance;
        bonusMiles += milesGain;
        console.log(`  [equip] ${equip.def.name}: +${milesGain} miles ($${context.playerBalance} × ${p.value}) (bonusMiles: ${bonusMiles})`);
        break;
      }

      case 'SELL_VALUE_AS_MULT': {
        // Add sell value of ALL OTHER equipment as mult
        let totalSellValue = 0;
        for (const other of equipment) {
          if (other !== equip) totalSellValue += other.sellValue;
        }
        bonusMult += totalSellValue;
        console.log(`  [equip] ${equip.def.name}: +${totalSellValue} mult (sell values) (bonusMult: ${bonusMult})`);
        break;
      }

      case 'STATEFUL_ADD_MULT':
        // Uses accumulated state.mult value
        bonusMult += equip.state.mult ?? 0;
        console.log(`  [equip] ${equip.def.name}: +${equip.state.mult ?? 0} mult (stateful) (bonusMult: ${bonusMult})`);
        break;

      case 'DECAYING_MULT':
        // Uses state.mult which decreases over time
        bonusMult += equip.state.mult ?? 0;
        console.log(`  [equip] ${equip.def.name}: +${equip.state.mult ?? 0} mult (decaying) (bonusMult: ${bonusMult})`);
        break;

      case 'HAND_MULT_GAIN':
        // Card Counter: uses accumulated state.mult
        bonusMult += equip.state.mult ?? 0;
        console.log(`  [equip] ${equip.def.name}: +${equip.state.mult ?? 0} mult (accumulated) (bonusMult: ${bonusMult})`);
        break;

      case 'SHOP_REROLL_MULT_GAIN':
        // Bargain Bin: uses accumulated state.mult
        bonusMult += equip.state.mult ?? 0;
        console.log(`  [equip] ${equip.def.name}: +${equip.state.mult ?? 0} mult (reroll gains) (bonusMult: ${bonusMult})`);
        break;

      case 'ENHANCED_SPENT_MILES_GAIN':
        // Bone Collector: uses accumulated state.miles
        bonusMiles += equip.state.miles ?? 0;
        console.log(`  [equip] ${equip.def.name}: +${equip.state.miles ?? 0} miles (accumulated) (bonusMiles: ${bonusMiles})`);
        break;

      case 'LUCKY_TRIGGER_XMULT':
      case 'SELL_XMULT_GAIN':
        // These are xMult effects, handled in the xMult pass below
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

  // Apply equipment xMult effects (multiplicative, after additives + auras)
  for (const equip of equipment) {
    const { effectType } = equip.def;

    switch (effectType) {
      case 'UNCOMMON_EQUIP_XMULT': {
        // x1.5 per uncommon equipment
        const uncommonCount = equipment.filter(e => e.def.rarity === 'uncommon').length;
        for (let i = 0; i < uncommonCount; i++) {
          finalMult *= 1.5;
        }
        if (uncommonCount > 0) {
          console.log(`  [equip] ${equip.def.name}: x1.5 × ${uncommonCount} uncommon items (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'FINAL_DAY_XMULT': {
        // x3 mult on final day of round
        const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
        if (context.currentDay >= context.maxDays) {
          finalMult *= xVal;
          console.log(`  [equip] ${equip.def.name}: x${xVal} (final day ${context.currentDay}/${context.maxDays}) (finalMult: ${finalMult})`);
        } else {
          console.log(`  [equip] ${equip.def.name}: inactive (day ${context.currentDay}/${context.maxDays})`);
        }
        break;
      }
      case 'STATEFUL_XMULT':
        // Uses accumulated state.xMult
        if ((equip.state.xMult ?? 1) !== 1) {
          finalMult *= equip.state.xMult;
          console.log(`  [equip] ${equip.def.name}: x${equip.state.xMult} (finalMult: ${finalMult})`);
        }
        break;
      case 'LUCKY_TRIGGER_XMULT':
      case 'SELL_XMULT_GAIN':
        // Rabbit's Foot / Snake Oil Ledger: accumulated xMult
        if ((equip.state.xMult ?? 1) !== 1) {
          finalMult *= equip.state.xMult;
          console.log(`  [equip] ${equip.def.name}: x${equip.state.xMult} (finalMult: ${finalMult})`);
        } else {
          console.log(`  [equip] ${equip.def.name}: x1 (no bonus yet)`);
        }
        break;
      case 'DECAYING_XMULT':
        // Uses state.xMult which decreases over time
        if ((equip.state.xMult ?? 1) > 0) {
          finalMult *= equip.state.xMult;
          console.log(`  [equip] ${equip.def.name}: x${equip.state.xMult} (finalMult: ${finalMult})`);
        }
        break;
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

// ─── Equipment State Update Functions ───

/** Called after a hand is scored. Updates stateful equipment based on the hand type played. */
export function processEquipmentOnHandPlayed(equipment: EquipmentInstance[], handType: HandType): void {
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'HAND_MULT_GAIN':
        // Card Counter: gains +mult if hand contains required type
        if (handTypeMatches(handType, equip.def.effectParams.handType as string)) {
          equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.value as number);
        }
        break;
    }
  }
}

/** Called when the player rerolls dice. Updates stateful equipment. */
export function processEquipmentOnReroll(equipment: EquipmentInstance[], diceCount: number): void {
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'DECAYING_XMULT':
        // Worn Deck: loses xMult per die rerolled
        equip.state.xMult = Math.max(0, (equip.state.xMult ?? 1) - (equip.def.effectParams.decayPerDie as number) * diceCount);
        break;
    }
  }
}

/** Called when the player rerolls the shop. */
export function processEquipmentOnShopReroll(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'SHOP_REROLL_MULT_GAIN':
        // Bargain Bin: gains +mult per shop reroll
        equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.value as number);
        break;
    }
  }
}

/** Called when the player sells equipment. */
export function processEquipmentOnSell(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'SELL_XMULT_GAIN':
        // Snake Oil Ledger: gains xMult per card sold
        equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.value as number);
        break;
    }
  }
}

/** Called when a boss is defeated. Resets specific equipment state. */
export function processEquipmentOnBossDefeat(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'SELL_XMULT_GAIN':
        // Snake Oil Ledger: resets on boss defeat
        equip.state.xMult = 1;
        break;
    }
  }
}

/** Called when enhanced dice are spent. Updates Bone Collector. */
export function processEquipmentOnDiceSpent(equipment: EquipmentInstance[], spentDice: Die[]): void {
  const enhancedCount = spentDice.filter(d => d.enhancement !== null).length;
  if (enhancedCount === 0) return;
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'ENHANCED_SPENT_MILES_GAIN':
        // Bone Collector: gains miles per enhanced dice spent
        equip.state.miles = (equip.state.miles ?? 0) + (equip.def.effectParams.value as number) * enhancedCount;
        break;
    }
  }
}

/** Called when a lucky die triggers (mult or money). Updates Rabbit's Foot. */
export function processEquipmentOnLuckyTrigger(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'LUCKY_TRIGGER_XMULT':
        // Rabbit's Foot: gains xMult per lucky trigger
        equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.value as number);
        break;
    }
  }
}

/** Called at the start of each round. Updates/removes decaying equipment.
 *  Returns indices of equipment to remove. */
export function processEquipmentOnRoundStart(equipment: EquipmentInstance[]): { destroyedIndices: number[] } {
  const destroyedIndices: number[] = [];
  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i];
    switch (equip.def.effectType) {
      case 'DECAYING_MULT': {
        // Fading Memory: -4 mult per round, removed after 5 rounds
        const decay = equip.def.effectParams.decayPerRound as number;
        equip.state.mult = (equip.state.mult ?? 0) - decay;
        equip.state.roundsPlayed = (equip.state.roundsPlayed ?? 0) + 1;
        if (equip.state.roundsPlayed >= (equip.def.effectParams.maxRounds as number)) {
          destroyedIndices.push(i);
        }
        break;
      }
      case 'LUCKY_NUMBER_PIP_XMULT':
        // Lucky Number: randomize pip each round
        equip.state.pip = Math.ceil(Math.random() * 12);
        break;
      case 'SCORED_RETRIGGER_TIMED':
        // War Drums: decrement days remaining
        if (equip.state.daysRemaining !== undefined && equip.state.daysRemaining > 0) {
          // don't decrement here, decrement per day in processEquipmentOnDayEnd
        }
        break;
    }
  }
  return { destroyedIndices };
}

/** Called at the end of each day. Updates War Drums counter. */
export function processEquipmentOnDayEnd(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    if (equip.def.effectType === 'SCORED_RETRIGGER_TIMED') {
      if ((equip.state.daysRemaining ?? 0) > 0) {
        equip.state.daysRemaining--;
      }
    }
  }
}

/** Check if any equipment has active scored-dice retrigger effect. */
export function getScoredRetriggerCount(equipment: EquipmentInstance[]): number {
  let count = 0;
  for (const equip of equipment) {
    if (equip.def.effectType === 'SCORED_RETRIGGER_TIMED' && (equip.state.daysRemaining ?? 0) > 0) {
      count++;
    }
  }
  return count;
}

/** Check if any equipment prevents death. Returns the index of the first one found, or -1. */
export function findDeathPrevention(equipment: EquipmentInstance[], totalMiles: number, targetMiles: number): number {
  for (let i = 0; i < equipment.length; i++) {
    if (equipment[i].def.effectType === 'PREVENT_DEATH') {
      const threshold = (equipment[i].def.effectParams.threshold as number) ?? 0.25;
      if (totalMiles >= targetMiles * threshold) {
        return i;
      }
    }
  }
  return -1;
}

/** Get config modifiers that affect days (e.g. Stagecoach -1 day). */
export function getDayModifiers(equipment: EquipmentInstance[]): { daysPenalty: number } {
  let daysPenalty = 0;
  for (const equip of equipment) {
    if (equip.def.effectType === 'AUTO_REFRESH_REDUCE_DAYS') {
      daysPenalty += (equip.def.effectParams.daysPenalty as number) ?? 1;
    }
  }
  return { daysPenalty };
}
