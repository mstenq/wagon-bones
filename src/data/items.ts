// ─── Equipment Item Definitions ───
// Each item defines its hint display as a function returning styled segments.
// Segments are rendered below the card image in the equipment bar.

// ─── Hint System Types ───

/** Visual style for a hint segment */
export type HintStyle =
  | 'miles' // blue text — distance/miles values
  | 'mult' // red rounded-rect background, white text — multiplier chips
  | 'xmult' // red rounded-rect background, white text — xMult values
  | 'odds' // green text — probability displays like "1 in 6"
  | 'inactive' // gray text — "Inactive" when condition not met
  | 'condition' // amber text — activation requirement label
  | 'active' // bright green text — "Active!" when condition is met
  | 'money' // gold text — dollar amounts
  | 'text' // default light text — plain labels
  | 'aura_fire' // fire aura label (orange-red)
  | 'aura_icy' // icy aura label (cyan)
  | 'aura_holy'; // holy aura label (golden-white)

/** A single styled text chunk in a hint line */
export interface HintSegment {
  text: string;
  style: HintStyle;
}

import type { GameState } from '../game/GameState';
import type { PlayerState } from '../game/PlayerState';
import { HandType } from '../game/types';

/** Raw item definition shape (matches the old JSON + hintDisplay) */
export interface ItemDef {
  id: string;
  name: string;
  cost: number;
  rarity: string;
  description: string;
  effectType: string;
  effectParams: Record<string, unknown>;
  initialState?: Record<string, number>;
  hintDisplay: (game: GameState | null, player: PlayerState) => HintSegment[][];
}

// ─── Helper constructors for readability ───
const miles = (text: string): HintSegment => ({ text, style: 'miles' });
const mult = (text: string): HintSegment => ({ text, style: 'mult' });
const odds = (text: string): HintSegment => ({ text, style: 'odds' });
const inactive = (text: string): HintSegment => ({ text, style: 'inactive' });
const condition = (text: string): HintSegment => ({ text, style: 'condition' });
const active = (text: string): HintSegment => ({ text, style: 'active' });
const money = (text: string): HintSegment => ({ text, style: 'money' });
const text = (t: string): HintSegment => ({ text: t, style: 'text' });

// ─── Hand type display names ───
const HAND_NAMES: Record<HandType, string> = {
  [HandType.PAIR]: 'Pair',
  [HandType.TWO_PAIR]: 'Two Pair',
  [HandType.THREE_OF_A_KIND]: '3 of a Kind',
  [HandType.FOUR_OF_A_KIND]: '4 of a Kind',
  [HandType.FOUR_STRAIGHT]: '4 Straight',
  [HandType.FULL_HOUSE]: 'Full House',
  [HandType.FIVE_OF_A_KIND]: '5 of a Kind',
  [HandType.FIVE_STRAIGHT]: '5 Straight',
  [HandType.HIGH_VALUE]: 'High Value',
};

/** Check if a played hand type contains the required hand type */
type HandsWithContainment = Extract<
  HandType,
  | HandType.FIVE_OF_A_KIND
  | HandType.FOUR_OF_A_KIND
  | HandType.FULL_HOUSE
  | HandType.THREE_OF_A_KIND
  | HandType.TWO_PAIR
  | HandType.FIVE_STRAIGHT
  | HandType.FOUR_STRAIGHT
>;
function handContains(played: HandType | null, required: HandType): boolean {
  if (!played) return false;
  const CONTAINMENT: Record<HandsWithContainment, HandType[]> = {
    FIVE_OF_A_KIND: [HandType.FIVE_OF_A_KIND, HandType.THREE_OF_A_KIND, HandType.PAIR, HandType.FOUR_OF_A_KIND],
    FOUR_OF_A_KIND: [HandType.THREE_OF_A_KIND, HandType.PAIR, HandType.TWO_PAIR],
    FULL_HOUSE: [HandType.THREE_OF_A_KIND, HandType.PAIR, HandType.TWO_PAIR],
    THREE_OF_A_KIND: [HandType.PAIR],
    TWO_PAIR: [HandType.PAIR],
    FIVE_STRAIGHT: [HandType.FOUR_STRAIGHT,],
    FOUR_STRAIGHT: [],
  };
  if (played === required) return true;
  return CONTAINMENT[played as HandsWithContainment]?.includes(required) ?? false;
}

// ─── Item Definitions ───

const items: ItemDef[] = [
  {
    id: 'horseshoe',
    name: 'Horseshoe',
    cost: 2,
    rarity: 'common',
    description: '+4 mult',
    effectType: 'ADD_MULT',
    effectParams: { value: 4 },
    hintDisplay: () => [[mult('+4')]],
  },
  {
    id: 'snake_eyes',
    name: 'Snake Eyes',
    cost: 5,
    rarity: 'common',
    description: 'Scored 1s give +3 mult',
    effectType: 'PIP_MULT',
    effectParams: { pip: 1, value: 3 },
    hintDisplay: () => [[mult('+3'), condition('per 1')]],
  },
  {
    id: 'double_deuces',
    name: 'Double Deuces',
    cost: 5,
    rarity: 'common',
    description: 'Scored 2s give +3 mult',
    effectType: 'PIP_MULT',
    effectParams: { pip: 2, value: 3 },
    hintDisplay: () => [[mult('+3'), condition('per 2')]],
  },
  {
    id: 'triad_totem',
    name: 'Triad Totem',
    cost: 5,
    rarity: 'common',
    description: 'Scored 3s give +3 mult',
    effectType: 'PIP_MULT',
    effectParams: { pip: 3, value: 3 },
    hintDisplay: () => [[mult('+3'), condition('per 3')]],
  },
  {
    id: 'four_aces_brand',
    name: 'Four Aces Brand',
    cost: 5,
    rarity: 'common',
    description: 'Scored 4s give +3 mult',
    effectType: 'PIP_MULT',
    effectParams: { pip: 4, value: 3 },
    hintDisplay: () => [[mult('+3'), condition('per 4')]],
  },
  {
    id: 'high_five',
    name: 'High Five',
    cost: 5,
    rarity: 'common',
    description: 'Scored 5s give +3 mult',
    effectType: 'PIP_MULT',
    effectParams: { pip: 5, value: 3 },
    hintDisplay: () => [[mult('+3'), condition('per 5')]],
  },
  {
    id: 'devils_dice',
    name: "Devil's Dice",
    cost: 5,
    rarity: 'common',
    description: 'Scored 6s give +3 mult',
    effectType: 'PIP_MULT',
    effectParams: { pip: 6, value: 3 },
    hintDisplay: () => [[mult('+3'), condition('per 6')]],
  },
  {
    id: 'wedding_ring',
    name: 'Wedding Ring',
    cost: 3,
    rarity: 'common',
    description: 'If played hand contains a pair +8 mult',
    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.PAIR, value: 8 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.PAIR))
        return [[mult('+8'), condition(HAND_NAMES.PAIR)], [active('Active!')]];
      return [[mult('+8'), condition(HAND_NAMES.PAIR)], [inactive('Inactive')]];
    },
  },
  {
    id: 'town_choir',
    name: 'Town Choir',
    cost: 4,
    rarity: 'common',
    description: 'If played hand contains three of a kind +12 mult',
    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.THREE_OF_A_KIND, value: 12 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.THREE_OF_A_KIND))
        return [[mult('+12'), condition(HAND_NAMES.THREE_OF_A_KIND)], [active('Active!')]];
      return [[mult('+12'), condition(HAND_NAMES.THREE_OF_A_KIND)], [inactive('Inactive')]];
    },
  },
  {
    id: 'deputy_brothers',
    name: 'Deputy Brothers',
    cost: 4,
    rarity: 'common',
    description: 'If played hand contains two pair +10 mult',
    effectType: 'HAND_MULT',
    effectParams: { handType: HandType.TWO_PAIR, value: 10 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.TWO_PAIR))
        return [[mult('+10'), condition(HAND_NAMES.TWO_PAIR)], [active('Active!')]];
      return [[mult('+10'), condition(HAND_NAMES.TWO_PAIR)], [inactive('Inactive')]];
    },
  },
  {
    id: 'work_boots',
    name: 'Work Boots',
    cost: 3,
    rarity: 'common',
    description: 'If played hand contains pair +50 miles',
    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.PAIR, value: 50 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.PAIR))
        return [[miles('+50'), condition(HAND_NAMES.PAIR)], [active('Active!')]];
      return [[miles('+50'), condition(HAND_NAMES.PAIR)], [inactive('Inactive')]];
    },
  },
  {
    id: 'buffalo_stampede',
    name: 'Buffalo Stampede',
    cost: 4,
    rarity: 'common',
    description: 'If played hand contains three of a kind +100 miles',
    effectType: 'HAND_MILES',
    effectParams: { handType: HandType.THREE_OF_A_KIND, value: 100 },
    hintDisplay: (game) => {
      if (game && handContains(game.state.currentHandType, HandType.THREE_OF_A_KIND))
        return [[miles('+100'), condition(HAND_NAMES.THREE_OF_A_KIND)], [active('Active!')]];
      return [[miles('+100'), condition(HAND_NAMES.THREE_OF_A_KIND)], [inactive('Inactive')]];
    },
  },
  {
    id: 'trail_rations',
    name: 'Trail Rations',
    cost: 5,
    rarity: 'uncommon',
    description: '+30 miles per unused re-roll',
    effectType: 'MILES_PER_UNUSED_REROLL',
    effectParams: { value: 30 },
    hintDisplay: (game) => {
      const rerolls = game?.state.rerollsRemaining ?? 0;
      const total = rerolls * 30;
      if (total > 0) return [[miles(`+${total}`), text('mi')]];
      return [[inactive(`+0`), text(' mi')]];
    },
  },
  {
    id: 'last_stand',
    name: 'Last Stand',
    cost: 5,
    rarity: 'uncommon',
    description: '+20 mult if 3 or fewer dice are scored',
    effectType: 'CONDITIONAL_MULT',
    effectParams: { condition: 'SCORED_DICE_LTE', threshold: 3, value: 20 },
    hintDisplay: (game) => {
      console.log(game);
      const diceCount = game?.state.rolledDice?.length ?? 0;
      if (diceCount > 0 && diceCount <= 3) return [[mult('+20'), condition('3 or less dice')], [active('Active!')]];
      return [[mult('+20'), condition('3 or less dice')], [inactive('Inactive')]];
    },
  },
  {
    id: 'stubborn_mule',
    name: 'Stubborn Mule',
    cost: 5,
    rarity: 'uncommon',
    description: '+15 mult when 0 re-rolls remaining',
    effectType: 'CONDITIONAL_MULT',
    effectParams: { condition: 'NO_REROLLS', value: 15 },
    hintDisplay: (game) => {
      if (!game) return [[mult('+15'), condition('No rerolls')]];
      if (game.state.rerollsRemaining === 0)
        return [[mult('+15'), condition(`${game.state.rerollsRemaining}/0 rerolls`)], [active('Active!')]];
      return [[mult('+15'), condition(`${game.state.rerollsRemaining}/0 rerolls`)], [inactive('Inactive')]];
    },
  },
  {
    id: 'toolbelt',
    name: 'Toolbelt',
    cost: 4,
    rarity: 'common',
    description: '+3 mult for each piece of equipment',
    effectType: 'MULT_PER_EQUIPMENT',
    effectParams: { value: 3 },
    hintDisplay: (_game, player) => {
      const total = player.equipment.length * 3;
      return [[mult(`+${total}`)]];
    },
  },
  {
    id: 'trail_boss',
    name: 'Trail Boss',
    cost: 4,
    rarity: 'common',
    description: 'Sixes add +30 miles when scored',
    effectType: 'PIP_MILES',
    effectParams: { pip: 6, value: 30 },
    hintDisplay: () => [[miles('+30'), condition('per 6')]],
  },
  {
    id: 'even_odds',
    name: 'Even Odds',
    cost: 4,
    rarity: 'common',
    description: '+4 mult when an even value is scored',
    effectType: 'PARITY_MULT',
    effectParams: { parity: 'even', value: 4 },
    hintDisplay: () => [[mult('+4'), condition('per even')]],
  },
  {
    id: 'odd_fellow',
    name: 'Odd Fellow',
    cost: 4,
    rarity: 'common',
    description: '+31 miles when an odd value is scored',
    effectType: 'PARITY_MILES',
    effectParams: { parity: 'odd', value: 31 },
    hintDisplay: () => [[miles('+31'), condition('per odd')]],
  },
  {
    id: 'dynamite',
    name: 'Dynamite',
    cost: 5,
    rarity: 'uncommon',
    description: '+15 mult. 1 in 6 chance to be destroyed at end of round.',
    effectType: 'ADD_MULT_RISKY',
    effectParams: { value: 15, destroyChance: [1, 6] },
    hintDisplay: () => [[mult('+15'), odds('1 in 6')]],
  },
  {
    id: 'extra_saddlebag',
    name: 'Extra Saddlebag',
    cost: 4,
    rarity: 'common',
    description: 'Refresh your spent dice for free 1 time a round',
    effectType: 'REFRESH_SPENT_DICE',
    effectParams: { value: 1 },
    hintDisplay: () => [[active('Available!')]],
  },
  {
    id: 'spare_holster',
    name: 'Spare Holster',
    cost: 4,
    rarity: 'common',
    description: '+1 re-roll per day',
    effectType: 'MODIFY_REROLLS',
    effectParams: { value: 1 },
    hintDisplay: () => [[active('+1 reroll')]],
  },
  {
    id: 'payday',
    name: 'Payday',
    cost: 6,
    rarity: 'uncommon',
    description: 'Earn $4 at end of round',
    effectType: 'END_ROUND_MONEY',
    effectParams: { value: 4 },
    hintDisplay: () => [[money('+$4')]],
  },

  // ─── Held-in-Hand Items ───
  {
    id: 'double_down',
    name: 'Double Down',
    cost: 5,
    rarity: 'uncommon',
    description: 'Retrigger all held-in-hand abilities',
    effectType: 'HELD_RETRIGGER',
    effectParams: { value: 1 },
    hintDisplay: () => [[text('Retrigger'), condition('held dice')]],
  },
  {
    id: 'bottom_dollar',
    name: 'Bottom Dollar',
    cost: 5,
    rarity: 'uncommon',
    description: 'Adds double the rank of lowest held-in-hand die to mult',
    effectType: 'HELD_LOWEST_MULT',
    effectParams: {},
    hintDisplay: (game) => {
      const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
      if (held.length > 0) {
        const lowest = Math.min(...held.map((d) => d.value));
        return [[mult(`+${lowest * 2}`), condition('lowest held')]];
      }
      return [[mult('+?'), condition('lowest held')]];
    },
  },
  {
    id: 'ace_in_the_hole',
    name: 'Ace in the Hole',
    cost: 8,
    rarity: 'rare',
    description: 'Each 1 held in hand gives x1.5 mult',
    effectType: 'HELD_PIP_XMULT',
    effectParams: { pip: 1, value: 1.5 },
    hintDisplay: (game) => {
      const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
      const count = held.filter((d) => d.value === 1).length;
      if (count > 0) return [[mult(`x${1.5 ** count}`), condition(`${count}x 1s held`)]];
      return [[mult('x1.5'), condition('per 1 held')], [inactive('Inactive')]];
    },
  },
  {
    id: 'prospectors_pouch',
    name: "Prospector's Pouch",
    cost: 6,
    rarity: 'uncommon',
    description: 'Each enhanced die held in hand has a 1 in 2 chance to give $1',
    effectType: 'HELD_ENHANCED_MONEY',
    effectParams: { chance: [1, 2], value: 1 },
    hintDisplay: (game) => {
      const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
      const enhanced = held.filter((d) => d.enhancement !== null).length;
      if (enhanced > 0) return [[money(`$1`), odds('1 in 2'), condition(`${enhanced} enhanced`)]];
      return [[money('$1'), odds('1 in 2'), condition('enhanced held')]];
    },
  },
  {
    id: 'eleventh_crossing',
    name: 'The Eleventh Crossing',
    cost: 5,
    rarity: 'uncommon',
    description: 'Each 11 held in hand gives +11 mult',
    effectType: 'HELD_PIP_MULT',
    effectParams: { pip: 11, value: 11 },
    hintDisplay: (game) => {
      const held = game?.state.rolledDice?.filter((d) => !game.state.selectedForScore.some((s) => s.id === d.id)) ?? [];
      const count = held.filter((d) => d.value === 11).length;
      if (count > 0) return [[mult(`+${count * 11}`), condition(`${count}x 11s held`)]];
      return [[mult('+11'), condition('per 11 held')], [inactive('Inactive')]];
    },
  },

  // ─── Phase 2 Items ───
  {
    id: 'rabbits_foot',
    name: "Rabbit's Foot",
    cost: 6,
    rarity: 'uncommon',
    description: 'Item gains x0.25 for every lucky dice trigger',
    effectType: 'LUCKY_TRIGGER_XMULT',
    effectParams: { value: 0.25 },
    initialState: { xMult: 1 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'rabbits_foot');
      const xm = equip?.state.xMult ?? 1;
      return [[mult(`x${xm.toFixed(2)}`)]];
    },
  },
  {
    id: 'collectors_case',
    name: "Collector's Case",
    cost: 8,
    rarity: 'rare',
    description: 'Uncommon equipment each give x1.5 mult',
    effectType: 'UNCOMMON_EQUIP_XMULT',
    effectParams: {},
    hintDisplay: (_game, player) => {
      const count = player.equipment.filter((e) => e.def.rarity === 'uncommon').length;
      if (count > 0) return [[mult(`x${(1.5 ** count).toFixed(2)}`), condition(`${count} uncommon`)]];
      return [[mult('x1.5'), condition('per uncommon')], [inactive('None')]];
    },
  },
  {
    id: 'money_wagon',
    name: 'Money Wagon',
    cost: 6,
    rarity: 'uncommon',
    description: '+2 miles for every $1 you have',
    effectType: 'MILES_PER_DOLLAR',
    effectParams: { value: 2 },
    hintDisplay: (_game, player) => {
      const total = player.economy.balance * 2;
      return [[miles(`+${total}`), text('mi')]];
    },
  },
  {
    id: 'bargain_bin',
    name: 'Bargain Bin',
    cost: 6,
    rarity: 'uncommon',
    description: 'Item gains +2 mult per reroll in the shop',
    effectType: 'SHOP_REROLL_MULT_GAIN',
    effectParams: { value: 2 },
    initialState: { mult: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'bargain_bin');
      const m = equip?.state.mult ?? 0;
      return [[mult(`+${m}`)]];
    },
  },
  {
    id: 'fading_memory',
    name: 'Fading Memory',
    cost: 5,
    rarity: 'uncommon',
    description: '+20 mult, -4 mult per round played, removed after 5 rounds',
    effectType: 'DECAYING_MULT',
    effectParams: { decayPerRound: 4, maxRounds: 5 },
    initialState: { mult: 20, roundsPlayed: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'fading_memory');
      const m = equip?.state.mult ?? 20;
      const rounds = equip?.state.roundsPlayed ?? 0;
      return [[mult(`+${m}`), condition(`${5 - rounds} rounds left`)]];
    },
  },
  {
    id: 'card_counter',
    name: 'Card Counter',
    cost: 6,
    rarity: 'uncommon',
    description: 'Item gains +2 mult if played hand contains 2 pair',
    effectType: 'HAND_MULT_GAIN',
    effectParams: { handType: HandType.TWO_PAIR, value: 2 },
    initialState: { mult: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'card_counter');
      const m = equip?.state.mult ?? 0;
      return [[mult(`+${m}`), condition(HAND_NAMES.TWO_PAIR)]];
    },
  },
  {
    id: 'lucky_number',
    name: 'Lucky Number',
    cost: 8,
    rarity: 'rare',
    description: 'Each played [number changes each round] gives x1.5 mult when scored',
    effectType: 'LUCKY_NUMBER_PIP_XMULT',
    effectParams: { value: 1.5 },
    initialState: { pip: 7 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'lucky_number');
      const pip = equip?.state.pip ?? '?';
      return [[mult('x1.5'), condition(`per ${pip}`)]];
    },
  },
  {
    id: 'worn_deck',
    name: 'Worn Deck',
    cost: 6,
    rarity: 'uncommon',
    description: 'x2 Mult. Loses x0.01 mult per dice re-rolled',
    effectType: 'DECAYING_XMULT',
    effectParams: { decayPerDie: 0.01 },
    initialState: { xMult: 2 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'worn_deck');
      const xm = equip?.state.xMult ?? 2;
      return [[mult(`x${xm.toFixed(2)}`)]];
    },
  },
  {
    id: 'war_drums',
    name: 'War Drums',
    cost: 6,
    rarity: 'uncommon',
    description: 'Retrigger all dice played for the next 10 days of travel',
    effectType: 'SCORED_RETRIGGER_TIMED',
    effectParams: {},
    initialState: { daysRemaining: 10 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'war_drums');
      const days = equip?.state.daysRemaining ?? 0;
      if (days > 0) return [[active(`${days} days left`)]];
      return [[inactive('Expired')]];
    },
  },
  {
    id: 'bone_collector',
    name: 'Bone Collector',
    cost: 6,
    rarity: 'uncommon',
    description: 'Gains +3 miles per each enhanced dice that is spent',
    effectType: 'ENHANCED_SPENT_MILES_GAIN',
    effectParams: { value: 3 },
    initialState: { miles: 0 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'bone_collector');
      const m = equip?.state.miles ?? 0;
      return [[miles(`+${m}`)]];
    },
  },
  {
    id: 'snake_oil_ledger',
    name: 'Snake Oil Ledger',
    cost: 9,
    rarity: 'rare',
    description: 'Item gains x0.25 mult for each card sold. Resets when boss is defeated.',
    effectType: 'SELL_XMULT_GAIN',
    effectParams: { value: 0.25 },
    initialState: { xMult: 1 },
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'snake_oil_ledger');
      const xm = equip?.state.xMult ?? 1;
      return [[mult(`x${xm.toFixed(2)}`)]];
    },
  },
  {
    id: 'gold_tooth',
    name: 'Gold Tooth',
    cost: 4,
    rarity: 'common',
    description: 'Played gold dice earn $4',
    effectType: 'GOLD_DICE_MONEY',
    effectParams: { value: 4 },
    hintDisplay: () => [[money('+$4'), condition('per gold')]],
  },
  {
    id: 'guardian_totem',
    name: 'Guardian Totem',
    cost: 5,
    rarity: 'uncommon',
    description: 'Prevents death if miles travelled is at least 25% of required distance. Card is destroyed if used.',
    effectType: 'PREVENT_DEATH',
    effectParams: { threshold: 0.25 },
    hintDisplay: () => [[active('Protected')]],
  },
  {
    id: 'high_noon',
    name: 'High Noon',
    cost: 6,
    rarity: 'uncommon',
    description: 'x3 mult on final day of round',
    effectType: 'FINAL_DAY_XMULT',
    effectParams: { value: 3 },
    hintDisplay: (game) => {
      if (game && game.state.day >= game.config.maxDays) return [[mult('x3')], [active('Active!')]];
      return [[mult('x3'), condition('final day')], [inactive('Inactive')]];
    },
  },
  {
    id: 'desperado',
    name: 'Desperado',
    cost: 4,
    rarity: 'common',
    description: 'Add the sell value of all other owned equipment as mult',
    effectType: 'SELL_VALUE_AS_MULT',
    effectParams: {},
    hintDisplay: (_game, player) => {
      const equip = player.equipment.find((e) => e.def.id === 'desperado');
      let total = 0;
      for (const e of player.equipment) {
        if (e !== equip) total += e.sellValue;
      }
      return [[mult(`+${total}`)]];
    },
  },
  {
    id: 'stagecoach',
    name: 'Stagecoach',
    cost: 6,
    rarity: 'uncommon',
    description: 'Dice are automatically refreshed when supply reaches 50% or below. -1 day per round.',
    effectType: 'AUTO_REFRESH_REDUCE_DAYS',
    effectParams: { daysPenalty: 1 },
    hintDisplay: () => [[active('Auto-refresh'), condition('-1 day')]],
  },
  {
    id: 'mystery_crate',
    name: 'Mystery Crate',
    cost: 6,
    rarity: 'uncommon',
    description: 'Add a dice at the start of each round with a random sticker',
    effectType: 'ROUND_START_ADD_DICE',
    effectParams: {},
    hintDisplay: () => [[active('+1 die'), condition('round start')]],
  },
  {
    id: 'spare_wagon_parts',
    name: 'Spare Wagon Parts',
    cost: 5,
    rarity: 'uncommon',
    description: 'Negates one wagon-damage trail event, then destroys itself. +4 mult.',
    effectType: 'ADD_MULT',
    effectParams: { value: 4 },
    hintDisplay: () => [[mult('+4'), text(' mult')], [text('Negates wagon damage')]],
  },
  {
    id: 'scouts_spyglass',
    name: "Scout's Spyglass",
    cost: 6,
    rarity: 'uncommon',
    description: 'See the next trail event before it happens. Skip it for $3. +25 miles.',
    effectType: 'NONE',
    effectParams: {},
    hintDisplay: () => [[miles('+25'), text(' miles')], [text('Preview trail events')]],
  },
  {
    id: 'providence',
    name: 'Providence',
    cost: 20,
    rarity: 'legendary',
    description: 'All negative effects from trail events are prevented. Divine favor intervenes.',
    effectType: 'NONE',
    effectParams: {},
    hintDisplay: () => [[active('Negates'), text(' all negative trail events')]],
  },
];

export default items;
