// ─── Dice System (No Phaser imports) ───
// Handles dice creation, rolling, pouch management, hand detection, and scoring.

import { Die, HandType, HandResult, HandDefinition, ScoreResult } from './types';
import handsData from '../data/hands.json';
import { getPlayerState } from './PlayerState';
import type { EquipmentInstance } from './ItemsSystem';
import { getScoredRetriggerCount, processEquipmentOnLuckyTrigger } from './EquipmentEffects';
import { getRandomSupplyDef, createConsumableInstance } from './ConsumablesSystem';

const HAND_TABLE: HandDefinition[] = handsData as HandDefinition[];

let nextDieId = 0;

// ─── Dice Creation ───

export function createDie(overrides?: Partial<Die>): Die {
  return {
    id: `die_${nextDieId++}`,
    value: Math.ceil(Math.random() * 12),
    enhancement: null,
    sticker: null,
    aura: null,
    isGrimy: false,
    ...overrides,
  };
}

export function createPouch(count: number): Die[] {
  return Array.from({ length: count }, () => createDie());
}

// ─── Rolling ───

export function rollDie(die: Die): Die {
  return { ...die, value: Math.ceil(Math.random() * 12) };
}

export function rollDice(dice: Die[]): Die[] {
  return dice.map(rollDie);
}

// ─── Pouch Management ───

export function drawFromPouch(pouch: Die[], count: number): { drawn: Die[]; remaining: Die[] } {
  const shuffled = [...pouch].sort(() => Math.random() - 0.5);
  return {
    drawn: shuffled.slice(0, count),
    remaining: shuffled.slice(count),
  };
}

export function returnToPouch(pouch: Die[], dice: Die[]): Die[] {
  return [...pouch, ...dice];
}

// ─── Hand Detection ───

function getFrequencies(dice: Die[]): Map<number, number> {
  const freq = new Map<number, number>();
  for (const d of dice) {
    freq.set(d.value, (freq.get(d.value) || 0) + 1);
  }
  return freq;
}

function findLongestStraight(dice: Die[]): number[] {
  const unique = [...new Set(dice.map((d) => d.value))].sort((a, b) => a - b);
  let best: number[] = [];
  let current: number[] = [unique[0]];

  for (let i = 1; i < unique.length; i++) {
    if (unique[i] === unique[i - 1] + 1) {
      current.push(unique[i]);
    } else {
      if (current.length > best.length) best = current;
      current = [unique[i]];
    }
  }
  if (current.length > best.length) best = current;
  return best;
}

function getHandDef(type: HandType): HandDefinition {
  return HAND_TABLE.find((h) => h.type === type)!;
}

function buildResult(type: HandType, scoringDice: Die[]): HandResult {
  const def = getHandDef(type);
  return { type, name: def.name, baseMiles: def.baseMiles, baseMult: def.baseMult, rank: def.rank, scoringDice };
}

/**
 * Detect the best hand from 1-5 dice.
 * Returns the highest-ranking hand that matches.
 */
export function detectBestHand(dice: Die[]): HandResult {
  if (dice.length === 0) {
    return buildResult(HandType.HIGH_VALUE, []);
  }

  const freq = getFrequencies(dice);
  const counts = [...freq.values()].sort((a, b) => b - a);
  const straight = findLongestStraight(dice);

  // Five of a kind
  if (counts[0] >= 5) {
    return buildResult(HandType.FIVE_OF_A_KIND, dice.slice(0, 5));
  }

  // Five straight
  if (straight.length >= 5) {
    const straightSet = new Set(straight.slice(0, 5));
    const scoringDice = dice.filter((d) => straightSet.has(d.value));
    // Take only one die per value
    const used = new Set<number>();
    const uniqueDice = scoringDice.filter((d) => {
      if (used.has(d.value)) return false;
      used.add(d.value);
      return true;
    });
    return buildResult(HandType.FIVE_STRAIGHT, uniqueDice.slice(0, 5));
  }

  // Four of a kind
  if (counts[0] >= 4) {
    const pip = [...freq.entries()].find(([, c]) => c >= 4)![0];
    const scoring = dice.filter((d) => d.value === pip).slice(0, 4);
    return buildResult(HandType.FOUR_OF_A_KIND, scoring);
  }

  // Full house (3 + 2)
  if (counts[0] >= 3 && counts[1] >= 2) {
    const threePip = [...freq.entries()].find(([, c]) => c >= 3)![0];
    const twoPip = [...freq.entries()].find(([p, c]) => c >= 2 && p !== threePip)![0];
    const scoring = [
      ...dice.filter((d) => d.value === threePip).slice(0, 3),
      ...dice.filter((d) => d.value === twoPip).slice(0, 2),
    ];
    return buildResult(HandType.FULL_HOUSE, scoring);
  }

  // Four straight
  if (straight.length >= 4) {
    const straightSet = new Set(straight.slice(0, 4));
    const used = new Set<number>();
    const scoringDice = dice.filter((d) => {
      if (!straightSet.has(d.value) || used.has(d.value)) return false;
      used.add(d.value);
      return true;
    });
    return buildResult(HandType.FOUR_STRAIGHT, scoringDice.slice(0, 4));
  }

  // Three of a kind
  if (counts[0] >= 3) {
    const pip = [...freq.entries()].find(([, c]) => c >= 3)![0];
    return buildResult(HandType.THREE_OF_A_KIND, dice.filter((d) => d.value === pip).slice(0, 3));
  }

  // Two pair
  if (counts[0] >= 2 && counts[1] >= 2) {
    const pairs = [...freq.entries()].filter(([, c]) => c >= 2).map(([p]) => p);
    const scoring = [
      ...dice.filter((d) => d.value === pairs[0]).slice(0, 2),
      ...dice.filter((d) => d.value === pairs[1]).slice(0, 2),
    ];
    return buildResult(HandType.TWO_PAIR, scoring);
  }

  // Pair
  if (counts[0] >= 2) {
    const pip = [...freq.entries()].find(([, c]) => c >= 2)![0];
    return buildResult(HandType.PAIR, dice.filter((d) => d.value === pip).slice(0, 2));
  }

  // High value — best single die
  const best = [...dice].sort((a, b) => b.value - a.value);
  return buildResult(HandType.HIGH_VALUE, [best[0]]);
}

// ─── Scoring ───

/**
 * Calculate score for a played hand.
 * miles = (handBaseMiles + sum of scoring dice values) × handBaseMult
 */
export function scoreHand(handResult: HandResult, equipment: EquipmentInstance[]): ScoreResult {
  let totalValue = 0;
  let bonusMult = 0;
  let xMult = 1;
  const player = getPlayerState();

  console.log('  [scoreHand] Step 3: Per-die scoring');
  // Step 3: Per-die scoring (left to right)
  for (const die of handResult.scoringDice) {
    // red_bullet sticker: trigger this die twice
    const triggers = die.sticker === 'red_bullet' ? 2 : 1;
    for (let t = 0; t < triggers; t++) {
      const triggerLabel = t > 0 ? ' (retrigger)' : '';

      // Base effect — value as miles (stone dice have 0 value but add 50 miles)
      if (die.enhancement === 'stone') {
        totalValue += 50;
        console.log(`  [scoreHand]   Die ${die.id}${triggerLabel}: STONE +50 miles (total: ${totalValue})`);
      } else {
        totalValue += die.value;
        console.log(`  [scoreHand]   Die ${die.id}${triggerLabel}: +${die.value} value (total: ${totalValue})`);
      }

      // Dice enhancement effects
      switch (die.enhancement) {
        case 'bone':
          bonusMult += 4;
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} BONE: +4 mult (bonusMult: ${bonusMult})`);
          break;
        case 'wooden':
          totalValue += 10;
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} WOODEN: +10 miles (totalValue: ${totalValue})`);
          break;
        // gold: no scoring bonus — earns money only when held in hand at end of round
        case 'diamond':
          xMult *= 2;
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} DIAMOND: x2 mult (xMult: ${xMult})`);
          // TODO: 25% chance of cracking
          break;
        case 'lucky': {
          if (Math.random() < 1 / 5) {
            bonusMult += 20;
            console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} LUCKY: hit +20 mult! (bonusMult: ${bonusMult})`);
            processEquipmentOnLuckyTrigger(equipment);
          }
          if (Math.random() < 1 / 15) {
            player.economy.earn(20);
            console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} LUCKY: hit $20!`);
            processEquipmentOnLuckyTrigger(equipment);
          }
          break;
        }
      
      }

      // Dice aura effects
      switch (die.aura) {
        case 'fire':
          bonusMult += 10;
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} FIRE aura: +10 mult (bonusMult: ${bonusMult})`);
          break;
        case 'icy':
          totalValue += 50;
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} ICY aura: +50 miles (totalValue: ${totalValue})`);
          break;
        case 'holy':
          xMult *= 1.5;
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} HOLY aura: x1.5 (xMult: ${xMult})`);
          break;
      }

      // Sticker effects (scored dice)
      if (die.sticker === 'purple_flower') {
        const supplyDef = getRandomSupplyDef();
        // Force add — bypass slot limit for sticker rewards
        player.consumables.push(createConsumableInstance(supplyDef));
        console.log(
          `  [scoreHand]   Die ${die.id}${triggerLabel} STICKER purple_flower: granted supply card '${supplyDef.name}'`,
        );
      }

      if (die.sticker === 'golden_dollar') {
        player.economy.earn(3);
        console.log(
          `  [scoreHand]   Die ${die.id}${triggerLabel} STICKER golden_dollar: +$3`,
        );
      }

      // 'On scored' equipment — items that trigger per matching die (left to right)
      for (const equip of equipment) {
        const { effectType, effectParams } = equip.def;
        const p = effectParams as Record<string, unknown>;

        switch (effectType) {
          case 'PIP_MULT':
            if (die.value === (p.pip as number)) {
              bonusMult += p.value as number;
              console.log(
                `  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +${p.value} mult (bonusMult: ${bonusMult})`,
              );
            }
            break;
          case 'PIP_MILES':
            if (die.value === (p.pip as number)) {
              totalValue += p.value as number;
              console.log(
                `  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +${p.value} miles (totalValue: ${totalValue})`,
              );
            }
            break;
          case 'PARITY_MULT':
            if (matchesParity(die.value, p.parity as string)) {
              bonusMult += p.value as number;
              console.log(
                `  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +${p.value} mult (bonusMult: ${bonusMult})`,
              );
            }
            break;
          case 'PARITY_MILES':
            if (matchesParity(die.value, p.parity as string)) {
              totalValue += p.value as number;
              console.log(
                `  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +${p.value} miles (totalValue: ${totalValue})`,
              );
            }
            break;
          case 'GOLD_DICE_MONEY':
            // Gold Tooth: gold enhancement dice earn money when scored
            if (die.enhancement === 'gold') {
              player.economy.earn(p.value as number);
              console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +$${p.value}`);
            }
            break;
          case 'LUCKY_NUMBER_PIP_XMULT':
            // Lucky Number: matching pip gives xMult
            if (die.value === (equip.state.pip ?? 0)) {
              xMult *= p.value as number;
              console.log(
                `  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: x${p.value} (lucky number ${equip.state.pip})`,
              );
            }
            break;
        }
      }
    } // end retrigger loop
  }

  // War Drums retrigger: if active, process all scored dice again
  const retriggerCount = getScoredRetriggerCount(equipment);
  if (retriggerCount > 0) {
    console.log(`  [scoreHand] War Drums retrigger (${retriggerCount}x)`);
    for (let r = 0; r < retriggerCount; r++) {
      for (const die of handResult.scoringDice) {
        if (die.enhancement === 'stone') {
          totalValue += 50;
        } else {
          totalValue += die.value;
        }
        // Re-apply dice enhancement effects
        switch (die.enhancement) {
          case 'bone':
            bonusMult += 4;
            break;
          case 'wooden':
            totalValue += 10;
            break;
          case 'diamond':
            xMult *= 2;
            break;
          case 'lucky': {
            if (Math.random() < 1 / 5) {
              bonusMult += 20;
              processEquipmentOnLuckyTrigger(equipment);
            }
            if (Math.random() < 1 / 15) {
              player.economy.earn(20);
              processEquipmentOnLuckyTrigger(equipment);
            }
            break;
          }
        }
        // Re-apply dice aura effects
        switch (die.aura) {
          case 'fire':
            bonusMult += 10;
            break;
          case 'icy':
            totalValue += 50;
            break;
          case 'holy':
            xMult *= 1.5;
            break;
        }
        // Re-apply sticker effects
        if (die.sticker === 'purple_flower') {
          const supplyDef = getRandomSupplyDef();
          player.consumables.push(createConsumableInstance(supplyDef));
        }
        // Re-apply per-die equipment effects
        for (const equip of equipment) {
          const { effectType, effectParams } = equip.def;
          const p = effectParams as Record<string, unknown>;
          switch (effectType) {
            case 'PIP_MULT':
              if (die.value === (p.pip as number)) bonusMult += p.value as number;
              break;
            case 'PIP_MILES':
              if (die.value === (p.pip as number)) totalValue += p.value as number;
              break;
            case 'PARITY_MULT':
              if (matchesParity(die.value, p.parity as string)) bonusMult += p.value as number;
              break;
            case 'PARITY_MILES':
              if (matchesParity(die.value, p.parity as string)) totalValue += p.value as number;
              break;
            case 'GOLD_DICE_MONEY':
              if (die.enhancement === 'gold') player.economy.earn(p.value as number);
              break;
            case 'LUCKY_NUMBER_PIP_XMULT':
              if (die.value === (equip.state.pip ?? 0)) xMult *= p.value as number;
              break;
          }
        }
      }
    }
  }

  const mult = (handResult.baseMult + bonusMult) * xMult;
  const miles = (handResult.baseMiles + totalValue) * mult;
  console.log(
    `  [scoreHand] Result: (${handResult.baseMiles} baseMiles + ${totalValue} value) * (${handResult.baseMult} baseMult + ${bonusMult} bonus) * ${xMult} xMult = ${miles} miles (mult: ${mult})`,
  );
  return { handResult, totalValue, miles, mult };
}

function matchesParity(value: number, parity: string): boolean {
  if (parity === 'even') return value % 2 === 0;
  if (parity === 'odd') return value % 2 !== 0;
  return false;
}
