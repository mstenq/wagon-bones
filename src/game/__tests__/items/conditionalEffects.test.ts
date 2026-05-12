import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { die, diceWithValue, item, calculateTestScore, resetDieIds } from '../testHelpers';
import { HandType } from '../../types';

beforeEach(() => resetDieIds());

// ─── CONDITIONAL_MULT Items ───

describe('CONDITIONAL_MULT: Last Stand (scored ≤3 dice, +20 mult)', () => {
  test('activates when scoring 1 die', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 10 })],
      equipment: [item('last_stand')],
    });
    // HIGH_VALUE: baseMult=1, +20 = 21
    expect(result.mult).toBe(21);
  });

  test('activates when scoring 2 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('last_stand')],
    });
    // PAIR: baseMult=1, +20 = 21
    expect(result.mult).toBe(21);
  });

  test('activates when scoring 3 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 3),
      equipment: [item('last_stand')],
    });
    // THREE_OF_A_KIND: baseMult=3, +20 = 23
    expect(result.mult).toBe(23);
  });

  test('does NOT activate when scoring 4 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 4),
      equipment: [item('last_stand')],
    });
    // FOUR_OF_A_KIND: baseMult=5, no bonus
    expect(result.mult).toBe(5);
  });

  test('does NOT activate when scoring 5 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 5),
      equipment: [item('last_stand')],
    });
    // FIVE_OF_A_KIND: baseMult=6, no bonus
    expect(result.mult).toBe(6);
  });
});

describe('CONDITIONAL_MULT: Stubborn Mule (no rerolls, +15 mult)', () => {
  test('activates when 0 rerolls remaining', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('stubborn_mule')],
      rerollsRemaining: 0,
    });
    // PAIR: baseMult=1, +15 = 16
    expect(result.mult).toBe(16);
  });

  test('does NOT activate when rerolls remain', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('stubborn_mule')],
      rerollsRemaining: 1,
    });
    // PAIR: baseMult=1, no bonus
    expect(result.mult).toBe(1);
  });

  test('does NOT activate with default rerolls (2)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('stubborn_mule')],
    });
    expect(result.mult).toBe(1);
  });
});

// ─── MILES_PER_UNUSED_REROLL Items ───

describe('MILES_PER_UNUSED_REROLL: Trail Rations (+30 miles per reroll)', () => {
  test('adds miles per unused reroll', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('trail_rations')],
      rerollsRemaining: 2,
    });
    // PAIR: baseMiles=10, baseMult=1, totalValue=10
    // +30 * 2 = +60 bonusMiles
    // miles = (10 + 10 + 60) * 1 = 80
    expect(result.miles).toBe(80);
  });

  test('0 rerolls = 0 bonus miles', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('trail_rations')],
      rerollsRemaining: 0,
    });
    // PAIR: baseMiles=10, totalValue=10, +0
    // miles = (10 + 10 + 0) * 1 = 20
    expect(result.miles).toBe(20);
  });

  test('scales with more rerolls', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('trail_rations')],
      rerollsRemaining: 3,
    });
    // +30 * 3 = +90
    // miles = (10 + 10 + 90) * 1 = 110
    expect(result.miles).toBe(110);
  });
});

// ─── MULT_PER_EQUIPMENT Items ───

describe('MULT_PER_EQUIPMENT: Toolbelt (+3 mult per equipment)', () => {
  test('counts itself (1 equipment)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('toolbelt')],
    });
    // PAIR: baseMult=1, +3 * 1 = +3 → mult=4
    expect(result.mult).toBe(4);
  });

  test('counts all equipment', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('toolbelt'), item('horseshoe'), item('horseshoe')],
    });
    // PAIR: baseMult=1
    // toolbelt: +3 * 3 = +9
    // horseshoe×2: +4+4 = +8
    // mult = 1 + 9 + 8 = 18
    expect(result.mult).toBe(18);
  });

  test('multiple toolbelts stack', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('toolbelt'), item('toolbelt')],
    });
    // PAIR: baseMult=1
    // Each toolbelt: +3 * 2 = +6
    // Total: 1 + 6 + 6 = 13
    expect(result.mult).toBe(13);
  });
});

// ─── MILES_PER_DOLLAR: Money Wagon ───

describe('MILES_PER_DOLLAR: Money Wagon', () => {
  test('adds +2 miles per dollar', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('money_wagon')],
      money: 10,
    });
    // PAIR: baseMiles=10, baseMult=1, totalValue=10
    // +2 * 10 = +20 bonusMiles
    // finalMiles = (10 + 10 + 20) * 1 = 40
    expect(result.miles).toBe(40);
  });

  test('scales with higher balance', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('money_wagon')],
      money: 50,
    });
    // +2 * 50 = +100 bonusMiles
    // finalMiles = (10 + 10 + 100) * 1 = 120
    expect(result.miles).toBe(120);
  });

  test('zero money = zero bonus', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('money_wagon')],
      money: 0,
    });
    // finalMiles = (10 + 10 + 0) * 1 = 20
    expect(result.miles).toBe(20);
  });
});
