import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { diceWithValue, item, itemWithState, calculateTestScore, resetDieIds } from '../testHelpers';
import {
  processEquipmentOnLuckyTrigger,
  processEquipmentOnSell,
  processEquipmentOnBossDefeat,
  processEquipmentOnReroll,
} from '../../EquipmentEffects';

beforeEach(() => resetDieIds());

// ─── LUCKY_TRIGGER_XMULT: Rabbit's Foot ───

describe("LUCKY_TRIGGER_XMULT: Rabbit's Foot", () => {
  test('starts at x1 (no bonus)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('rabbits_foot')],
    });
    // x1 means no change
    expect(result.mult).toBe(1);
  });

  test('gains x0.25 per lucky trigger', () => {
    const inst = item('rabbits_foot');
    // Simulate 2 lucky triggers
    processEquipmentOnLuckyTrigger([inst]);
    processEquipmentOnLuckyTrigger([inst]);
    expect(inst.state.xMult).toBeCloseTo(1.5, 5);

    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1, x1.5 from rabbit's foot
    expect(result.mult).toBeCloseTo(1.5, 5);
  });

  test('accumulates over many triggers', () => {
    const inst = item('rabbits_foot');
    for (let i = 0; i < 4; i++) processEquipmentOnLuckyTrigger([inst]);
    // 1 + 4*0.25 = 2.0
    expect(inst.state.xMult).toBeCloseTo(2.0, 5);
  });
});

// ─── UNCOMMON_EQUIP_XMULT: Collector's Case ───

describe("UNCOMMON_EQUIP_XMULT: Collector's Case", () => {
  test('x1.5 per uncommon equipment', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('collectors_case'), item('dynamite')], // dynamite is uncommon
    });
    // collectors_case rarity = 'rare', dynamite rarity = 'uncommon'
    // 1 uncommon → x1.5
    // finalMult = (1 + 15) * 1.5 = 24
    expect(result.mult).toBe(24);
  });

  test('multiplies for each uncommon item', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('collectors_case'), item('dynamite'), item('trail_rations')],
    });
    // Both dynamite and trail_rations are uncommon → 2 uncommon
    // baseMult=1, dynamite: +15
    // x1.5^2 = x2.25
    expect(result.mult).toBeCloseTo(16 * 2.25, 5);
  });

  test('no bonus with zero uncommon', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('collectors_case'), item('horseshoe')], // horseshoe is common
    });
    // baseMult=1, horseshoe: +4 = 5
    // 0 uncommon → no xMult
    expect(result.mult).toBe(5);
  });
});

// ─── DECAYING_XMULT: Worn Deck ───

describe('DECAYING_XMULT: Worn Deck', () => {
  test('starts at x2', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('worn_deck')],
    });
    // PAIR: baseMult=1, x2 = 2
    expect(result.mult).toBe(2);
  });

  test('loses x0.01 per die rerolled', () => {
    const inst = item('worn_deck');
    processEquipmentOnReroll([inst], 3); // reroll 3 dice
    expect(inst.state.xMult).toBeCloseTo(1.97, 5);
  });

  test('decays over many rerolls', () => {
    const inst = item('worn_deck');
    processEquipmentOnReroll([inst], 5);
    processEquipmentOnReroll([inst], 5);
    // 10 total dice rerolled: 2 - 10*0.01 = 1.90
    expect(inst.state.xMult).toBeCloseTo(1.9, 5);

    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    expect(result.mult).toBeCloseTo(1.9, 5);
  });

  test('does not go below 0', () => {
    const inst = item('worn_deck');
    processEquipmentOnReroll([inst], 300); // way too many
    expect(inst.state.xMult).toBe(0);
  });
});

// ─── SELL_XMULT_GAIN: Snake Oil Ledger ───

describe('SELL_XMULT_GAIN: Snake Oil Ledger', () => {
  test('starts at x1 (no bonus)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('snake_oil_ledger')],
    });
    expect(result.mult).toBe(1);
  });

  test('gains x0.25 per sell', () => {
    const inst = item('snake_oil_ledger');
    processEquipmentOnSell([inst]);
    expect(inst.state.xMult).toBeCloseTo(1.25, 5);

    processEquipmentOnSell([inst]);
    expect(inst.state.xMult).toBeCloseTo(1.5, 5);
  });

  test('accumulated xMult applied during scoring', () => {
    const inst = item('snake_oil_ledger');
    inst.state.xMult = 2.0; // simulate 4 sells

    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1, x2.0 → 2.0
    expect(result.mult).toBeCloseTo(2.0, 5);
  });

  test('resets on boss defeat', () => {
    const inst = item('snake_oil_ledger');
    processEquipmentOnSell([inst]);
    processEquipmentOnSell([inst]);
    expect(inst.state.xMult).toBeCloseTo(1.5, 5);

    processEquipmentOnBossDefeat([inst]);
    expect(inst.state.xMult).toBe(1);
  });
});

// ─── FINAL_DAY_XMULT: High Noon ───

describe('FINAL_DAY_XMULT: High Noon', () => {
  test('x3 mult on final day', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('high_noon')],
      currentDay: 4,
      maxDays: 4,
    });
    // PAIR: baseMult=1, x3 on final day
    expect(result.mult).toBe(3);
  });

  test('no bonus on non-final day', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('high_noon')],
      currentDay: 2,
      maxDays: 4,
    });
    expect(result.mult).toBe(1);
  });

  test('works when maxDays is 1', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('high_noon')],
      currentDay: 1,
      maxDays: 1,
    });
    expect(result.mult).toBe(3);
  });
});
