import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { die, diceWithValue, diceFromValues, item, calculateTestScore, resetDieIds } from '../testHelpers';
import { processEquipmentOnHandPlayed } from '../../EquipmentEffects';
import { HandType } from '../../types';

beforeEach(() => resetDieIds());

// ─── HAND_MULT Items ───

describe('HAND_MULT: Wedding Ring (pair, +8)', () => {
  test('activates on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 2),
      equipment: [item('wedding_ring')],
    });
    // PAIR: baseMult=1, +8 = 9
    expect(result.mult).toBe(9);
  });

  test('activates on full house (contains pair)', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(3, 3), ...diceWithValue(7, 2)],
      equipment: [item('wedding_ring')],
    });
    // FULL_HOUSE: baseMult=4, +8 = 12
    expect(result.mult).toBe(12);
  });

  test('activates on three of a kind (contains pair)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 3),
      equipment: [item('wedding_ring')],
    });
    // THREE_OF_A_KIND: baseMult=3, +8 = 11
    expect(result.mult).toBe(11);
  });

  test('does not activate on high value', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 10 })],
      equipment: [item('wedding_ring')],
    });
    expect(result.mult).toBe(1);
  });

  test('does not activate on straight', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([4, 5, 6, 7]),
      equipment: [item('wedding_ring')],
    });
    // FOUR_STRAIGHT: baseMult=1, no pair → no bonus
    expect(result.mult).toBe(1);
  });
});

describe('HAND_MULT: Town Choir (three of a kind, +12)', () => {
  test('activates on three of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 3),
      equipment: [item('town_choir')],
    });
    // THREE_OF_A_KIND: baseMult=3, +12 = 15
    expect(result.mult).toBe(15);
  });

  test('activates on full house (contains three of a kind)', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(4, 3), ...diceWithValue(9, 2)],
      equipment: [item('town_choir')],
    });
    // FULL_HOUSE: baseMult=4, +12 = 16
    expect(result.mult).toBe(16);
  });

  test('activates on four of a kind (contains three of a kind)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 4),
      equipment: [item('town_choir')],
    });
    // FOUR_OF_A_KIND: baseMult=5, +12 = 17
    expect(result.mult).toBe(17);
  });

  test('does not activate on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [item('town_choir')],
    });
    // PAIR: baseMult=1, no three of a kind → no bonus
    expect(result.mult).toBe(1);
  });
});

describe('HAND_MULT: Deputy Brothers (two pair, +10)', () => {
  test('activates on two pair', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(3, 2), ...diceWithValue(8, 2)],
      equipment: [item('deputy_brothers')],
    });
    // TWO_PAIR: baseMult=2, +10 = 12
    expect(result.mult).toBe(12);
  });

  test('activates on full house (contains two pair)', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(3, 3), ...diceWithValue(8, 2)],
      equipment: [item('deputy_brothers')],
    });
    // FULL_HOUSE: baseMult=4, +10 = 14
    expect(result.mult).toBe(14);
  });

  test('does not activate on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 2),
      equipment: [item('deputy_brothers')],
    });
    expect(result.mult).toBe(1);
  });
});

describe('HAND_MULT: Trail Markers (three straight, +6)', () => {

  test('activates on four straight (contains three straight)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([3, 4, 5, 6]),
      equipment: [item('trail_markers')],
    });
    // FOUR_STRAIGHT: baseMult=3, +6 = 9
    expect(result.mult).toBe(9);
  });

  test('activates on five straight (contains three straight)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([2, 3, 4, 5, 6]),
      equipment: [item('trail_markers')],
    });
    // FIVE_STRAIGHT: baseMult=6, +6 = 12
    expect(result.mult).toBe(12);
  });

  test('does not activate on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [item('trail_markers')],
    });
    expect(result.mult).toBe(1);
  });
});

// ─── HAND_MILES Items ───

describe('HAND_MILES: Work Boots (pair, +50 miles)', () => {
  test('adds miles on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('work_boots')],
    });
    // PAIR: baseMiles=10, baseMult=1, totalValue=10
    // Equipment: +50 bonusMiles
    // finalMiles = (10 + 10 + 50) * 1 = 70
    expect(result.miles).toBe(70);
  });

  test('activates on full house (contains pair)', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(5, 3), ...diceWithValue(8, 2)],
      equipment: [item('work_boots')],
    });
    // FULL_HOUSE: baseMiles=25, baseMult=4, totalValue=31
    // +50 bonusMiles
    // finalMiles = (25 + 31 + 50) * 4 = 424
    expect(result.miles).toBe(424);
  });

  test('does not activate on high value', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 10 })],
      equipment: [item('work_boots')],
    });
    // HIGH_VALUE: baseMiles=5, totalValue=10, no bonus
    // miles = (5 + 10 + 0) * 1 = 15
    expect(result.miles).toBe(15);
  });
});

describe('HAND_MILES: Buffalo Stampede (three of a kind, +100 miles)', () => {
  test('adds miles on three of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 3),
      equipment: [item('buffalo_stampede')],
    });
    // THREE_OF_A_KIND: baseMiles=20, baseMult=3, totalValue=12
    // +100 bonusMiles
    // finalMiles = (20 + 12 + 100) * 3 = 396
    expect(result.miles).toBe(396);
  });

  test('activates on four of a kind (contains three of a kind)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 4),
      equipment: [item('buffalo_stampede')],
    });
    // FOUR_OF_A_KIND: baseMiles=40, baseMult=5, totalValue=16
    // +100 bonusMiles
    // finalMiles = (40 + 16 + 100) * 5 = 780
    expect(result.miles).toBe(780);
  });

  test('does not activate on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [item('buffalo_stampede')],
    });
    // PAIR: baseMiles=10, totalValue=8, no bonus
    // miles = (10 + 8 + 0) * 1 = 18
    expect(result.miles).toBe(18);
  });
});

// ─── HAND_MULT_GAIN: Card Counter ───

describe('HAND_MULT_GAIN: Card Counter', () => {
  test('starts at +0 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('card_counter')],
    });
    expect(result.mult).toBe(1);
  });

  test('gains +2 mult when two pair is played', () => {
    const inst = item('card_counter');
    processEquipmentOnHandPlayed([inst], HandType.TWO_PAIR);
    expect(inst.state.mult).toBe(2);
  });

  test('gains mult from full house (contains two pair)', () => {
    const inst = item('card_counter');
    processEquipmentOnHandPlayed([inst], HandType.FULL_HOUSE);
    expect(inst.state.mult).toBe(2);
  });

  test('does NOT gain from pair (does not contain two pair)', () => {
    const inst = item('card_counter');
    processEquipmentOnHandPlayed([inst], HandType.PAIR);
    expect(inst.state.mult).toBe(0);
  });

  test('accumulates over multiple hands', () => {
    const inst = item('card_counter');
    processEquipmentOnHandPlayed([inst], HandType.TWO_PAIR);
    processEquipmentOnHandPlayed([inst], HandType.TWO_PAIR);
    processEquipmentOnHandPlayed([inst], HandType.TWO_PAIR);
    expect(inst.state.mult).toBe(6);

    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1 + 6 = 7
    expect(result.mult).toBe(7);
  });
});
