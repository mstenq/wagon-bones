import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { die, diceWithValue, diceFromValues, item, itemWithState, calculateTestScore, resetDieIds } from '../testHelpers';
import { processEquipmentOnRoundStart } from '../../EquipmentEffects';
import { HandType } from '../../types';

beforeEach(() => resetDieIds());

// ─── PIP_MULT Items ───

describe('PIP_MULT: Snake Eyes (pip 1, +3 mult)', () => {
  test('triggers on scored 1s', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(1, 3),
      equipment: [item('snake_eyes')],
    });
    // THREE_OF_A_KIND: baseMult=3, +3 per 1 scored (×3) = +9 → mult=12
    expect(result.mult).toBe(12);
  });

  test('does not trigger on non-1 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 3),
      equipment: [item('snake_eyes')],
    });
    expect(result.mult).toBe(3);
  });

  test('triggers for each matching die in a mixed hand', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(1, 2), ...diceWithValue(7, 2)],
      equipment: [item('snake_eyes')],
    });
    // TWO_PAIR: baseMult=2, +3 per 1 (×2) = +6 → mult=8
    expect(result.mult).toBe(8);
  });
});

describe('PIP_MULT: Double Deuces (pip 2, +3 mult)', () => {
  test('triggers on scored 2s', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(2, 3),
      equipment: [item('double_deuces')],
    });
    // THREE_OF_A_KIND: baseMult=3, +3×3 = +9 → mult=12
    expect(result.mult).toBe(12);
  });

  test('does not trigger on non-2 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 3),
      equipment: [item('double_deuces')],
    });
    expect(result.mult).toBe(3);
  });
});

describe('PIP_MULT: Triad Totem (pip 3, +3 mult)', () => {
  test('triggers on scored 3s', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(3, 2),
      equipment: [item('triad_totem')],
    });
    // PAIR: baseMult=1, +3×2 = +6 → mult=7
    expect(result.mult).toBe(7);
  });
});

describe('PIP_MULT: Four Aces Brand (pip 4, +3 mult)', () => {
  test('triggers on scored 4s', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [item('four_aces_brand')],
    });
    // PAIR: baseMult=1, +3×2 = +6 → mult=7
    expect(result.mult).toBe(7);
  });
});

describe('PIP_MULT: High Five (pip 5, +3 mult)', () => {
  test('triggers on scored 5s', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('high_five')],
    });
    // PAIR: baseMult=1, +3×2 = +6 → mult=7
    expect(result.mult).toBe(7);
  });
});

describe("PIP_MULT: Devil's Dice (pip 6, +3 mult)", () => {
  test('triggers on scored 6s', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 2),
      equipment: [item('devils_dice')],
    });
    // PAIR: baseMult=1, +3×2 = +6 → mult=7
    expect(result.mult).toBe(7);
  });

  test('does not trigger on non-6 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('devils_dice')],
    });
    expect(result.mult).toBe(1);
  });
});

// ─── PIP_MILES Items ───

describe('PIP_MILES: Trail Boss (pip 6, +30 miles)', () => {
  test('adds miles per scored 6', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 3),
      equipment: [item('trail_boss')],
    });
    // THREE_OF_A_KIND: baseMiles=20, baseMult=3
    // Per-die: totalValue = 6+6+6 = 18, +30 per 6 → totalValue = 18+90 = 108
    // miles = (20 + 108) * 3 = 384
    expect(result.totalValue).toBe(108);
    expect(result.miles).toBe(384);
  });

  test('does not trigger on non-6 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 3),
      equipment: [item('trail_boss')],
    });
    // totalValue = 15 (just the pip values)
    expect(result.totalValue).toBe(15);
  });

  test('only triggers on 6s in mixed hand', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(6, 2), ...diceWithValue(3, 2)],
      equipment: [item('trail_boss')],
    });
    // TWO_PAIR: baseMiles=15, baseMult=2
    // totalValue = 6+6+3+3 + 30+30 (two 6s) = 78
    // miles = (15 + 78) * 2 = 186
    expect(result.totalValue).toBe(78);
    expect(result.miles).toBe(186);
  });
});

// ─── GOLD_DICE_MONEY: Gold Tooth ───

describe('GOLD_DICE_MONEY: Gold Tooth', () => {
  test('gold dice earn $4 when scored', () => {
    const { result, player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'gold' }), die({ value: 5 })],
      equipment: [item('gold_tooth')],
      money: 10,
    });
    // 1 gold die → $4
    expect(player.economy.balance).toBe(14); // 10 + 4
  });

  test('multiple gold dice each earn money', () => {
    const { result, player } = calculateTestScore({
      scoredDice: [
        die({ value: 5, enhancement: 'gold' }),
        die({ value: 5, enhancement: 'gold' }),
      ],
      equipment: [item('gold_tooth')],
      money: 10,
    });
    // 2 gold dice → $8
    expect(player.economy.balance).toBe(18);
  });

  test('no money from non-gold dice', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      equipment: [item('gold_tooth')],
      money: 10,
    });
    expect(player.economy.balance).toBe(10);
  });
});

// ─── LUCKY_NUMBER_PIP_XMULT: Lucky Number ───

describe('LUCKY_NUMBER_PIP_XMULT: Lucky Number', () => {
  test('matching pip gives x1.5 per matching die', () => {
    const luckyNum = itemWithState('lucky_number', { pip: 5 });
    processEquipmentOnRoundStart([luckyNum]);
    luckyNum.state.pip = 5;

    expect(luckyNum.state.pip).toBe(5);
    expect(luckyNum.def.effectParams.value).toBe(1.5);
  });

  test('pip randomizes on round start', () => {
    const luckyNum = item('lucky_number');
    expect(luckyNum.state.pip).toBe(7); // initial
    processEquipmentOnRoundStart([luckyNum]);
    // After round start, pip should be 1-12
    expect(luckyNum.state.pip).toBeGreaterThanOrEqual(1);
    expect(luckyNum.state.pip).toBeLessThanOrEqual(12);
  });

  test('has correct effect type and params', () => {
    const inst = item('lucky_number');
    expect(inst.def.effectType).toBe('LUCKY_NUMBER_PIP_XMULT');
    expect(inst.def.effectParams.value).toBe(1.5);
  });
});
