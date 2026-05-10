// ─── Dice System (No Phaser imports) ───
// Handles dice creation, rolling, pouch management, hand detection, and scoring.

import { Die, HandType, HandResult, HandDefinition, ScoreResult } from './types';
import handsData from '../data/hands.json';

const HAND_TABLE: HandDefinition[] = handsData as HandDefinition[];

let nextDieId = 0;

// ─── Dice Creation ───

export function createDie(overrides?: Partial<Die>): Die {
  return {
    id: `die_${nextDieId++}`,
    pips: Math.ceil(Math.random() * 6),
    enhancement: null,
    sidePips: [null, null, null, null, null, null],
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
  return { ...die, pips: Math.ceil(Math.random() * 6) };
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
    freq.set(d.pips, (freq.get(d.pips) || 0) + 1);
  }
  return freq;
}

function findLongestStraight(dice: Die[]): number[] {
  const unique = [...new Set(dice.map(d => d.pips))].sort((a, b) => a - b);
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
  return HAND_TABLE.find(h => h.type === type)!;
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
    const scoringDice = dice.filter(d => straightSet.has(d.pips));
    // Take only one die per pip value
    const used = new Set<number>();
    const uniqueDice = scoringDice.filter(d => {
      if (used.has(d.pips)) return false;
      used.add(d.pips);
      return true;
    });
    return buildResult(HandType.FIVE_STRAIGHT, uniqueDice.slice(0, 5));
  }

  // Four of a kind
  if (counts[0] >= 4) {
    const pip = [...freq.entries()].find(([, c]) => c >= 4)![0];
    const scoring = dice.filter(d => d.pips === pip).slice(0, 4);
    return buildResult(HandType.FOUR_OF_A_KIND, scoring);
  }

  // Full house (3 + 2)
  if (counts[0] >= 3 && counts[1] >= 2) {
    const threePip = [...freq.entries()].find(([, c]) => c >= 3)![0];
    const twoPip = [...freq.entries()].find(([p, c]) => c >= 2 && p !== threePip)![0];
    const scoring = [
      ...dice.filter(d => d.pips === threePip).slice(0, 3),
      ...dice.filter(d => d.pips === twoPip).slice(0, 2),
    ];
    return buildResult(HandType.FULL_HOUSE, scoring);
  }

  // Four straight
  if (straight.length >= 4) {
    const straightSet = new Set(straight.slice(0, 4));
    const used = new Set<number>();
    const scoringDice = dice.filter(d => {
      if (!straightSet.has(d.pips) || used.has(d.pips)) return false;
      used.add(d.pips);
      return true;
    });
    return buildResult(HandType.FOUR_STRAIGHT, scoringDice.slice(0, 4));
  }

  // Three of a kind
  if (counts[0] >= 3) {
    const pip = [...freq.entries()].find(([, c]) => c >= 3)![0];
    return buildResult(HandType.THREE_OF_A_KIND, dice.filter(d => d.pips === pip).slice(0, 3));
  }

  // Three straight
  if (straight.length >= 3) {
    const straightSet = new Set(straight.slice(0, 3));
    const used = new Set<number>();
    const scoringDice = dice.filter(d => {
      if (!straightSet.has(d.pips) || used.has(d.pips)) return false;
      used.add(d.pips);
      return true;
    });
    return buildResult(HandType.THREE_STRAIGHT, scoringDice.slice(0, 3));
  }

  // Two pair
  if (counts[0] >= 2 && counts[1] >= 2) {
    const pairs = [...freq.entries()].filter(([, c]) => c >= 2).map(([p]) => p);
    const scoring = [
      ...dice.filter(d => d.pips === pairs[0]).slice(0, 2),
      ...dice.filter(d => d.pips === pairs[1]).slice(0, 2),
    ];
    return buildResult(HandType.TWO_PAIR, scoring);
  }

  // Pair
  if (counts[0] >= 2) {
    const pip = [...freq.entries()].find(([, c]) => c >= 2)![0];
    return buildResult(HandType.PAIR, dice.filter(d => d.pips === pip).slice(0, 2));
  }

  // High value — best single die
  const best = [...dice].sort((a, b) => b.pips - a.pips);
  return buildResult(HandType.HIGH_VALUE, [best[0]]);
}

// ─── Scoring ───

/**
 * Calculate score for a played hand.
 * miles = (handBaseMiles + sum of scoring dice pips) × handBaseMult
 */
export function scoreHand(handResult: HandResult): ScoreResult {
  const totalPips = handResult.scoringDice.reduce((sum, d) => sum + d.pips, 0);
  const mult = handResult.baseMult;
  const miles = (handResult.baseMiles + totalPips) * mult;
  return { handResult, totalPips, miles, mult };
}
