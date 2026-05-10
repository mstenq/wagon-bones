import { GAMEPLAY } from './Constants';

export type PhaseState = 'SELECT' | 'ROLL' | 'SCORE' | 'DAY_END' | 'ROUND_END';

export enum HandType {
  HIGH_VALUE = 'HIGH_VALUE',
  PAIR = 'PAIR',
  TWO_PAIR = 'TWO_PAIR',
  THREE_STRAIGHT = 'THREE_STRAIGHT',
  THREE_OF_A_KIND = 'THREE_OF_A_KIND',
  FOUR_STRAIGHT = 'FOUR_STRAIGHT',
  FULL_HOUSE = 'FULL_HOUSE',
  FOUR_OF_A_KIND = 'FOUR_OF_A_KIND',
  FIVE_STRAIGHT = 'FIVE_STRAIGHT',
  FIVE_OF_A_KIND = 'FIVE_OF_A_KIND',
}

export interface HandStats {
  level: number;        // starts at 1, increased by trail guide cards
  timesPlayed: number;
  milesPerLevel: number; // miles added per level (from trail guide data)
  multPerLevel: number;  // mult added per level (from trail guide data)
}

export type DiceEnhancement =
  | 'bone' | 'lucky' | 'wooden' | 'iron'
  | 'gold' | 'loaded' | 'diamond' | 'stone' | 'blurry'
  | null;

export type PipEffect =
  | 'purple_flower' | 'red_bullet' | 'golden_dollar' | 'blue_diamond'
  | null;

export type DiceAura =
  | 'holy' | 'fire' | 'icy'
  | null;

export interface Die {
  id: string;
  pips: number;          // 1-6, or 0 for stone dice
  enhancement: DiceEnhancement;
  sidePips: PipEffect[];  // length 6, one per side (index 0 = side showing 1 pip, etc.)
  aura: DiceAura;
  isGrimy: boolean;      // face hidden until selected
}

export interface HandDefinition {
  type: string;
  name: string;
  baseMiles: number;
  baseMult: number;
  rank: number;
}

export interface HandResult {
  type: HandType;
  name: string;
  baseMiles: number;
  baseMult: number;
  rank: number;
  scoringDice: Die[];    // the dice that form the hand
}

export interface ScoreResult {
  handResult: HandResult;
  totalPips: number;     // sum of scoring dice pips (base miles from dice)
  miles: number;         // (handBaseMiles + totalPips) * mult
  mult: number;
}

export interface GameConfig {
  maxDays: number;
  maxRerolls: number;      // re-rolls per day (resets each day)
  rollSize: number;       // dice selected for rolling (default 5)
  targetMiles: number;    // miles to beat this leg
}

export const DEFAULT_CONFIG: GameConfig = {
  maxDays: GAMEPLAY.MAX_DAYS,
  maxRerolls: GAMEPLAY.MAX_REROLLS,
  rollSize: GAMEPLAY.ROLL_SIZE,
  targetMiles: GAMEPLAY.TARGET_MILES,
};

export interface RoundState {
  phase: PhaseState;
  day: number;
  rerollsRemaining: number;
  totalMiles: number;
  spent: Die[];            // dice already used this cycle (persist across days)
  hand: Die[];             // all available dice shown in SELECT phase
  selectedForRoll: Die[];
  rolledDice: Die[];       // dice after rolling
  selectedForScore: Die[];
}

export type GameEventType =
  | 'phase-change'
  | 'hand-updated'
  | 'dice-rolled'
  | 'score-calculated'
  | 'day-ended'
  | 'round-won'
  | 'round-lost'
  | 'reroll-updated'
  | 'spent-refreshed';

export type GameEventCallback = (data?: unknown) => void;
