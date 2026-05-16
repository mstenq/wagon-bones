// ─── Equipment Effects (No Phaser imports) ───
// Applies owned equipment effects to scoring and config.

import { Die, HandType, HandResult, ScoreResult, ScoreAnimEvent } from './types';
import { EquipmentInstance } from './ItemsSystem';

export interface ScoringContext {
  handResult: HandResult;
  scoringDice: Die[];
  heldDice: Die[]; // dice rolled but not scored (held in hand)
  rerollsRemaining: number;
  equipmentCount: number;
  playerBalance: number; // current money
  currentDay: number; // current day in the round (1-based)
  maxDays: number; // max days this round
  allDice?: Die[]; // all dice in player's collection (for Iron Furnace, etc.)
}

/**
 * Apply all equipment effects to a base score result.
 * Returns a new ScoreResult with bonuses applied.
 */
export function applyEquipmentEffects(
  baseResult: ScoreResult,
  equipment: EquipmentInstance[],
  context: ScoringContext,
  animEvents: ScoreAnimEvent[] = [],
): ScoreResult {
  let bonusMiles = 0;
  let bonusMult = 0;

  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i];
    const { effectType, effectParams } = equip.def;
    const p = effectParams as Record<string, unknown>;

    switch (effectType) {
      case 'ADD_MULT':
        bonusMult += p.value as number;
        animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: p.value as number });
        console.log(`  [equip] ${equip.def.name}: ADD_MULT +${p.value} (bonusMult: ${bonusMult})`);
        break;

      case 'ADD_MULT_RISKY':
        bonusMult += p.value as number;
        animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: p.value as number });
        break;

      case 'HAND_MULT':
        if (handTypeMatches(context.handResult.type, p.handType as string)) {
          bonusMult += p.value as number;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: p.value as number });
        }
        break;

      case 'HAND_MILES':
        if (handTypeMatches(context.handResult.type, p.handType as string)) {
          bonusMiles += p.value as number;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: p.value as number });
        }
        break;

      case 'MILES_PER_UNUSED_REROLL': {
        const total = (p.value as number) * context.rerollsRemaining;
        if (total > 0) {
          bonusMiles += total;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: total });
        }
        break;
      }

      case 'CONDITIONAL_MULT': {
        const condition = p.condition as string;
        let met = false;
        if (condition === 'SCORED_DICE_LTE') {
          met = context.scoringDice.length <= (p.threshold as number);
        } else if (condition === 'NO_REROLLS') {
          met = context.rerollsRemaining === 0;
        }
        if (met) {
          bonusMult += p.value as number;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: p.value as number });
        }
        break;
      }

      case 'MULT_PER_EQUIPMENT': {
        const total = (p.value as number) * context.equipmentCount;
        if (total > 0) {
          bonusMult += total;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: total });
        }
        break;
      }

      case 'MILES_PER_DOLLAR': {
        const milesGain = (p.value as number) * context.playerBalance;
        if (milesGain > 0) {
          bonusMiles += milesGain;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: milesGain });
        }
        console.log(
          `  [equip] ${equip.def.name}: +${milesGain} miles ($${context.playerBalance} × ${p.value}) (bonusMiles: ${bonusMiles})`,
        );
        break;
      }

      case 'SELL_VALUE_AS_MULT': {
        let totalSellValue = 0;
        for (const other of equipment) {
          if (other !== equip) totalSellValue += other.sellValue;
        }
        if (totalSellValue > 0) {
          bonusMult += totalSellValue;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: totalSellValue });
        }
        console.log(`  [equip] ${equip.def.name}: +${totalSellValue} mult (sell values) (bonusMult: ${bonusMult})`);
        break;
      }

      case 'STATEFUL_ADD_MULT': {
        const val = equip.state.mult ?? 0;
        if (val > 0) {
          bonusMult += val;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
        }
        console.log(`  [equip] ${equip.def.name}: +${val} mult (stateful) (bonusMult: ${bonusMult})`);
        break;
      }

      case 'DECAYING_MULT': {
        const val = equip.state.mult ?? 0;
        if (val > 0) {
          bonusMult += val;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
        }
        console.log(`  [equip] ${equip.def.name}: +${val} mult (decaying) (bonusMult: ${bonusMult})`);
        break;
      }

      case 'HAND_MULT_GAIN': {
        const val = equip.state.mult ?? 0;
        if (val > 0) {
          bonusMult += val;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
        }
        console.log(
          `  [equip] ${equip.def.name}: +${val} mult (accumulated) (bonusMult: ${bonusMult})`,
        );
        break;
      }

      case 'SHOP_REROLL_MULT_GAIN': {
        const val = equip.state.mult ?? 0;
        if (val > 0) {
          bonusMult += val;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
        }
        console.log(
          `  [equip] ${equip.def.name}: +${val} mult (reroll gains) (bonusMult: ${bonusMult})`,
        );
        break;
      }

      case 'ENHANCED_SPENT_MILES_GAIN': {
        const val = equip.state.miles ?? 0;
        if (val > 0) {
          bonusMiles += val;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: val });
        }
        console.log(
          `  [equip] ${equip.def.name}: +${val} miles (accumulated) (bonusMiles: ${bonusMiles})`,
        );
        break;
      }

      case 'RANDOM_MULT': {
        const min = p.min as number;
        const max = p.max as number;
        const roll = Math.floor(Math.random() * (max - min + 1)) + min;
        bonusMult += roll;
        animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: roll });
        console.log(`  [equip] ${equip.def.name}: +${roll} mult (random ${min}-${max}) (bonusMult: ${bonusMult})`);
        break;
      }

      case 'LEG_START_DESTROY_RIGHT': {
        const val = equip.state.mult ?? 0;
        if (val > 0) {
          bonusMult += val;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
        }
        console.log(`  [equip] ${equip.def.name}: +${val} mult (accumulated) (bonusMult: ${bonusMult})`);
        break;
      }

      case 'LUCKY_TRIGGER_XMULT':
      case 'SELL_XMULT_GAIN':
        // These are xMult effects, handled in the xMult pass below
        break;
    }

    // Apply item aura bonuses
    if (equip.def.aura) {
      switch (equip.def.aura.id) {
        case 'fire':
          bonusMult += 10;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: 10 });
          console.log(`  [equip] ${equip.def.name} FIRE aura: +10 mult (bonusMult: ${bonusMult})`);
          break;
        case 'icy':
          bonusMiles += 50;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: 50 });
          console.log(`  [equip] ${equip.def.name} ICY aura: +50 miles (bonusMiles: ${bonusMiles})`);
          break;
      }
    }
  }

  console.log(`  [equip] Step 4 totals: bonusMiles: ${bonusMiles}, bonusMult: ${bonusMult}`);

  const totalValue = baseResult.totalValue;
  const baseMiles = baseResult.handResult.baseMiles;
  let finalMult = baseResult.mult + bonusMult;

  // Apply holy aura xMult (multiplicative, applied last)
  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i];
    if (equip.def.aura?.id === 'holy') {
      finalMult = finalMult * 1.5;
      animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: 1.5 });
      console.log(`  [equip] ${equip.def.name} HOLY aura: x1.5 mult (finalMult: ${finalMult})`);
    }
  }

  // Apply equipment xMult effects (multiplicative, after additives + auras)
  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i];
    const { effectType } = equip.def;

    switch (effectType) {
      case 'UNCOMMON_EQUIP_XMULT': {
        const uncommonCount = equipment.filter((e) => e.def.rarity === 'uncommon').length;
        if (uncommonCount > 0) {
          const xVal = Math.pow(1.5, uncommonCount);
          finalMult *= xVal;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xVal });
          console.log(`  [equip] ${equip.def.name}: x1.5 × ${uncommonCount} uncommon items (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'FINAL_DAY_XMULT': {
        const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
        if (context.currentDay >= context.maxDays) {
          finalMult *= xVal;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xVal });
          console.log(
            `  [equip] ${equip.def.name}: x${xVal} (final day ${context.currentDay}/${context.maxDays}) (finalMult: ${finalMult})`,
          );
        } else {
          console.log(`  [equip] ${equip.def.name}: inactive (day ${context.currentDay}/${context.maxDays})`);
        }
        break;
      }
      case 'STATEFUL_XMULT': {
        const xm = equip.state.xMult ?? 1;
        if (xm !== 1) {
          finalMult *= xm;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xm });
          console.log(`  [equip] ${equip.def.name}: x${xm} (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'LUCKY_TRIGGER_XMULT':
      case 'SELL_XMULT_GAIN': {
        const xm = equip.state.xMult ?? 1;
        if (xm !== 1) {
          finalMult *= xm;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xm });
          console.log(`  [equip] ${equip.def.name}: x${xm} (finalMult: ${finalMult})`);
        } else {
          console.log(`  [equip] ${equip.def.name}: x1 (no bonus yet)`);
        }
        break;
      }
      case 'DECAYING_XMULT': {
        const xm = equip.state.xMult ?? 1;
        if (xm > 0 && xm !== 1) {
          finalMult *= xm;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xm });
          console.log(`  [equip] ${equip.def.name}: x${xm} (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'EVERY_NTH_HAND_XMULT': {
        const n = (equip.def.effectParams as Record<string, unknown>).n as number;
        const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
        const hands = equip.state.handsPlayed ?? 0;
        if (hands > 0 && hands % n === 0) {
          finalMult *= xVal;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xVal });
          console.log(`  [equip] ${equip.def.name}: x${xVal} (hand #${hands}, every ${n}th) (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'ENHANCEMENT_COUNT_XMULT': {
        const enhancement = (equip.def.effectParams as Record<string, unknown>).enhancement as string;
        const perValue = (equip.def.effectParams as Record<string, unknown>).value as number;
        const allDice = context.allDice ?? [];
        const enhCount = allDice.filter((d) => d.enhancement === enhancement).length;
        if (enhCount > 0) {
          const xVal = 1 + enhCount * perValue;
          finalMult *= xVal;
          animEvents.push({ phase: 'independent', target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xVal });
          console.log(`  [equip] ${equip.def.name}: x${xVal.toFixed(1)} (${enhCount} ${enhancement} dice) (finalMult: ${finalMult})`);
        }
        break;
      }
    }
  }

  const finalMiles = (baseMiles + totalValue + bonusMiles) * finalMult;
  console.log(
    `  [equip] Final: (${baseMiles} base + ${totalValue} value + ${bonusMiles} bonusMiles) * ${finalMult} = ${finalMiles} miles`,
  );

  return {
    handResult: baseResult.handResult,
    totalValue,
    miles: finalMiles,
    mult: finalMult,
    animEvents: baseResult.animEvents.concat(animEvents),
  };
}

/**
 * Get config modifications from equipment (hand size, rerolls).
 */
export function getConfigModifiers(equipment: EquipmentInstance[]): {
  rerollsBonus: number;
  freeShopRerolls: number;
} {
  let rerollsBonus = 0;
  let freeShopRerolls = 0;

  for (const equip of equipment) {
    const { effectType, effectParams } = equip.def;
    const p = effectParams as Record<string, unknown>;

    if (effectType === 'MODIFY_REROLLS') {
      rerollsBonus += p.value as number;
    }
    if (effectType === 'FREE_SHOP_REROLL') {
      freeShopRerolls += p.value as number;
    }
  }

  return { rerollsBonus, freeShopRerolls };
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

interface HeldInHandResult {
  bonusMult: number;
  xMult: number;
  moneyEarned: number;
  trailGuidesForHand: number; // blue_moon sticker: how many trail guides to grant for scored hand
  animEvents: ScoreAnimEvent[];
}

/**
 * Process held-in-hand abilities for dice that were rolled but not scored.
 * Sequence per die (left to right): steel enhancement → equipment triggers → retriggers.
 * Retriggers: red_bullet sticker first, then Double Down equipment.
 */
export function processHeldInHand(heldDice: Die[], equipment: EquipmentInstance[]): HeldInHandResult {
  let bonusMult = 0;
  let xMult = 1;
  let moneyEarned = 0;
  let trailGuidesForHand = 0;
  const animEvents: ScoreAnimEvent[] = [];

  // Count retriggers from Double Down equipment
  const doubleDownCount = equipment.filter((e) => e.def.effectType === 'HELD_RETRIGGER').length;

  // Find the lowest held die value for Bottom Dollar
  const lowestValue = heldDice.length > 0 ? Math.min(...heldDice.map((d) => d.value)) : 0;

  console.log('[SCORE] Step 4: Held-in-hand abilities');
  console.log(
    `  [held] Held dice: ${heldDice.map((d) => `${d.id}(value:${d.value}, enh:${d.enhancement}, sticker:${d.sticker})`).join(', ') || 'none'}`,
  );

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
        animEvents.push({ phase: 'held', target: { kind: 'die', dieId: die.id }, popupType: 'xmult', value: 1.5 });
        console.log(`  [held] Die ${die.id}${triggerLabel}: STEEL x1.5 mult (xMult: ${xMult})`);
      }

      // Sticker effects on held dice
      if (die.sticker === 'blue_moon') {
        trailGuidesForHand++;
        console.log(`  [held] Die ${die.id}${triggerLabel}: BLUE_MOON +1 trail guide for scored hand`);
      }

      // Equipment triggers on held dice
      for (let eIdx = 0; eIdx < equipment.length; eIdx++) {
        const equip = equipment[eIdx];
        const { effectType, effectParams } = equip.def;
        const p = effectParams as Record<string, unknown>;

        switch (effectType) {
          case 'HELD_LOWEST_MULT':
            if (die.value === lowestValue && die === heldDice.find((d) => d.value === lowestValue)) {
              bonusMult += lowestValue * 2;
              animEvents.push({ phase: 'held', target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'mult', value: lowestValue * 2 });
              console.log(
                `  [held] Die ${die.id}${triggerLabel} → ${equip.def.name}: +${lowestValue * 2} mult (bonusMult: ${bonusMult})`,
              );
            }
            break;

          case 'HELD_PIP_XMULT':
            if (die.value === (p.pip as number)) {
              xMult *= p.value as number;
              animEvents.push({ phase: 'held', target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'xmult', value: p.value as number });
              console.log(
                `  [held] Die ${die.id}${triggerLabel} → ${equip.def.name}: x${p.value} mult (xMult: ${xMult})`,
              );
            }
            break;

          case 'HELD_PIP_MULT':
            if (die.value === (p.pip as number)) {
              bonusMult += p.value as number;
              animEvents.push({ phase: 'held', target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'mult', value: p.value as number });
              console.log(
                `  [held] Die ${die.id}${triggerLabel} → ${equip.def.name}: +${p.value} mult (bonusMult: ${bonusMult})`,
              );
            }
            break;

          case 'HELD_ENHANCED_MONEY':
            if (die.enhancement !== null) {
              const [num, den] = p.chance as [number, number];
              if (Math.random() < num / den) {
                moneyEarned += p.value as number;
                animEvents.push({ phase: 'held', target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'money', value: p.value as number });
                console.log(
                  `  [held] Die ${die.id}${triggerLabel} → ${equip.def.name}: +$${p.value} (total: $${moneyEarned})`,
                );
              }
            }
            break;
        }
      }
    }
  }

  console.log(
    `  [held] Totals: bonusMult: ${bonusMult}, xMult: ${xMult}, money: $${moneyEarned}, trailGuides: ${trailGuidesForHand}`,
  );
  return { bonusMult, xMult, moneyEarned, trailGuidesForHand, animEvents };
}

// ─── Helpers ───

/** Check if the played hand type matches or contains the required type.
 *  e.g. FULL_HOUSE contains PAIR and THREE_OF_A_KIND */
function handTypeMatches(played: HandType, required: string): boolean {
  if (played === required) return true;

  // A full house contains pair, three of a kind, and two pair
  if (played === HandType.FULL_HOUSE) {
    if (required === HandType.PAIR || required === HandType.THREE_OF_A_KIND || required === HandType.TWO_PAIR)
      return true;
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
    if (
      required === HandType.FOUR_OF_A_KIND ||
      required === HandType.THREE_OF_A_KIND ||
      required === HandType.PAIR ||
      required === HandType.TWO_PAIR ||
      required === HandType.FULL_HOUSE
    )
      return true;
  }
  // Five straight contains four straight and three straight
  if (played === HandType.FIVE_STRAIGHT) {
    if (required === HandType.FOUR_STRAIGHT) return true;
  }

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
      case 'EVERY_NTH_HAND_XMULT':
        // Six Shooter: track hands played
        equip.state.handsPlayed = (equip.state.handsPlayed ?? 0) + 1;
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
        equip.state.xMult = Math.max(
          0,
          (equip.state.xMult ?? 1) - (equip.def.effectParams.decayPerDie as number) * diceCount,
        );
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
  const enhancedCount = spentDice.filter((d) => d.enhancement !== null).length;
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
export function getScoredRetriggerCount(equipment: EquipmentInstance[], context?: { currentDay: number; maxDays: number }): number {
  let count = 0;
  for (const equip of equipment) {
    if (equip.def.effectType === 'SCORED_RETRIGGER_TIMED' && (equip.state.daysRemaining ?? 0) > 0) {
      count++;
    }
    if (equip.def.effectType === 'SCORED_RETRIGGER_FINAL_DAY' && context && context.currentDay >= context.maxDays) {
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

/** Called when a new leg starts. Processes Funeral Pyre (destroy right neighbor) and Quarry Stone (add stone die).
 *  Returns indices of equipment to destroy and dice to add. */
export function processEquipmentOnLegStart(equipment: EquipmentInstance[]): {
  destroyedIndices: number[];
  stoneDiceToAdd: number;
} {
  const destroyedIndices: number[] = [];
  let stoneDiceToAdd = 0;

  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i];

    if (equip.def.effectType === 'LEG_START_DESTROY_RIGHT') {
      // Funeral Pyre: destroy equipment to the right and gain double sell value as mult
      const rightIdx = i + 1;
      if (rightIdx < equipment.length && !destroyedIndices.includes(rightIdx)) {
        const rightEquip = equipment[rightIdx];
        equip.state.mult = (equip.state.mult ?? 0) + rightEquip.sellValue * 2;
        destroyedIndices.push(rightIdx);
      }
    }

    if (equip.def.effectType === 'LEG_START_ADD_STONE') {
      stoneDiceToAdd++;
    }
  }

  return { destroyedIndices, stoneDiceToAdd };
}
