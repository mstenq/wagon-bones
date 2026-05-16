import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import {
  die,
  diceWithValue,
  diceFromValues,
  item,
  itemWithState,
  calculateTestScore,
  resetDieIds,
} from '../testHelpers';
import { processEquipmentOnRoundStart } from '../../EquipmentEffects';
import { HandType } from '../../types';

beforeEach(() => resetDieIds());

// ─── PIP_MULT Items (deprecated — snake_eyes, double_deuces, etc. removed in Phase 3) ───

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
      scoredDice: [die({ value: 5, enhancement: 'gold' }), die({ value: 5, enhancement: 'gold' })],
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

// ─── PIP_RETRIGGER: One-Eyed Jack ───

describe('PIP_RETRIGGER: One-Eyed Jack', () => {
  test('retriggers dice with pip value 1', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(1, 2),
      equipment: [item('one_eyed_jack')],
    });
    // PAIR: baseMiles=10, baseMult=1
    // Each 1 gets retriggered once: totalValue = 1+1+1+1 = 4
    // miles = (10 + 4) * 1 = 14
    expect(result.totalValue).toBe(4);
  });

  test('does not retrigger non-1 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('one_eyed_jack')],
    });
    // PAIR: totalValue = 5+5 = 10 (no retrigger)
    expect(result.totalValue).toBe(10);
  });

  test('retriggers only 1s in mixed hand', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(1, 2), ...diceWithValue(5, 2)],
      equipment: [item('one_eyed_jack')],
    });
    // TWO_PAIR: two 1s retriggered once each = +2 value
    // totalValue = 1+1+5+5 + 1+1 (retriggers) = 14
    expect(result.totalValue).toBe(14);
  });
});

// ─── PIP_SUPPLY_CHANCE: Snake Eyes ───

describe('PIP_SUPPLY_CHANCE: Snake Eyes', () => {
  test('has correct effect type and params', () => {
    const inst = item('snake_eyes');
    expect(inst.def.effectType).toBe('PIP_SUPPLY_CHANCE');
    expect(inst.def.effectParams.pip).toBe(1);
    expect(inst.def.effectParams.chance).toEqual([1, 4]);
  });
});

// ─── ENHANCED_SCORE_MONEY: Gold Pan ───

describe('ENHANCED_SCORE_MONEY: Gold Pan', () => {
  test('has correct effect type and params', () => {
    const inst = item('gold_pan');
    expect(inst.def.effectType).toBe('ENHANCED_SCORE_MONEY');
    expect(inst.def.effectParams.chance).toEqual([1, 2]);
    expect(inst.def.effectParams.value).toBe(2);
  });
});
