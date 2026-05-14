import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { die, diceWithValue, item, itemWithState, setupGame, calculateTestScore, resetDieIds } from '../testHelpers';
import {
  processEndOfRound,
  getConfigModifiers,
  getScoredRetriggerCount,
  findDeathPrevention,
  getDayModifiers,
  processEquipmentOnDayEnd,
  processEquipmentOnDiceSpent,
} from '../../EquipmentEffects';

beforeEach(() => resetDieIds());

// ─── MODIFY_REROLLS: Spare Holster ───

describe('MODIFY_REROLLS: Spare Holster (+1 reroll)', () => {
  test('adds +1 to max rerolls via config modifier', () => {
    const equip = [item('spare_holster')];
    const mods = getConfigModifiers(equip);
    expect(mods.rerollsBonus).toBe(1);
  });

  test('stacks with multiple spare holsters', () => {
    const equip = [item('spare_holster'), item('spare_holster')];
    const mods = getConfigModifiers(equip);
    expect(mods.rerollsBonus).toBe(2);
  });

  test('reflected in game config after startRound', () => {
    const { game } = setupGame({
      equipment: [item('spare_holster')],
    });
    game.startRound();
    // Default maxRerolls=6, +1 from spare_holster = 7
    expect(game.config.maxRerolls).toBe(7);
    expect(game.state.rerollsRemaining).toBe(7);
  });
});

// ─── END_ROUND_MONEY: Payday ───

describe('END_ROUND_MONEY: Payday ($4 at end of round)', () => {
  test('reports $4 money earned at end of round', () => {
    const equip = [item('payday')];
    const result = processEndOfRound(equip);
    expect(result.moneyEarned).toBe(4);
  });

  test('stacks with multiple paydays', () => {
    const equip = [item('payday'), item('payday')];
    const result = processEndOfRound(equip);
    expect(result.moneyEarned).toBe(8);
  });

  test('does not destroy the item', () => {
    const equip = [item('payday')];
    const result = processEndOfRound(equip);
    expect(result.destroyedIndices).toEqual([]);
  });
});

// ─── REFRESH_SPENT_DICE: Extra Saddlebag ───
// This effect is handled by the UI/game flow, not by scoring.
// We test that the item exists and has correct effect type.

describe('REFRESH_SPENT_DICE: Extra Saddlebag', () => {
  test('has correct effect type and params', () => {
    const equip = item('extra_saddlebag');
    expect(equip.def.effectType).toBe('REFRESH_SPENT_DICE');
    expect(equip.def.effectParams.value).toBe(1);
  });
});

// ─── SCORED_RETRIGGER_TIMED: War Drums ───

describe('SCORED_RETRIGGER_TIMED: War Drums', () => {
  test('retrigger count is 1 when days remaining > 0', () => {
    const inst = item('war_drums');
    expect(getScoredRetriggerCount([inst])).toBe(1);
  });

  test('retrigger count is 0 when expired', () => {
    const inst = itemWithState('war_drums', { daysRemaining: 0 });
    expect(getScoredRetriggerCount([inst])).toBe(0);
  });

  test('days decrement on day end', () => {
    const inst = item('war_drums');
    expect(inst.state.daysRemaining).toBe(10);
    processEquipmentOnDayEnd([inst]);
    expect(inst.state.daysRemaining).toBe(9);
  });

  test('does not go below 0', () => {
    const inst = itemWithState('war_drums', { daysRemaining: 1 });
    processEquipmentOnDayEnd([inst]);
    expect(inst.state.daysRemaining).toBe(0);
    processEquipmentOnDayEnd([inst]);
    expect(inst.state.daysRemaining).toBe(0);
  });
});

// ─── PREVENT_DEATH: Guardian Totem ───

describe('PREVENT_DEATH: Guardian Totem', () => {
  test('prevents death when miles >= 25% of target', () => {
    const inst = item('guardian_totem');
    const idx = findDeathPrevention([inst], 100, 400); // 100 >= 400*0.25
    expect(idx).toBe(0);
  });

  test('does not prevent death below threshold', () => {
    const inst = item('guardian_totem');
    const idx = findDeathPrevention([inst], 50, 400); // 50 < 100
    expect(idx).toBe(-1);
  });

  test('exactly at threshold', () => {
    const inst = item('guardian_totem');
    const idx = findDeathPrevention([inst], 100, 400); // 100 = 400*0.25
    expect(idx).toBe(0);
  });
});

// ─── AUTO_REFRESH_REDUCE_DAYS: Stagecoach ───

describe('AUTO_REFRESH_REDUCE_DAYS: Stagecoach', () => {
  test('reduces days by 1', () => {
    const inst = item('stagecoach');
    const { daysPenalty } = getDayModifiers([inst]);
    expect(daysPenalty).toBe(1);
  });

  test('stacks with multiple stagecoaches', () => {
    const { daysPenalty } = getDayModifiers([item('stagecoach'), item('stagecoach')]);
    expect(daysPenalty).toBe(2);
  });

  test('no penalty without stagecoach', () => {
    const { daysPenalty } = getDayModifiers([item('horseshoe')]);
    expect(daysPenalty).toBe(0);
  });
});

// ─── ROUND_START_ADD_DICE: Mystery Crate ───

describe('ROUND_START_ADD_DICE: Mystery Crate', () => {
  test('has correct effect type', () => {
    const inst = item('mystery_crate');
    expect(inst.def.effectType).toBe('ROUND_START_ADD_DICE');
  });
});

// ─── ENHANCED_SPENT_MILES_GAIN: Bone Collector ───

describe('ENHANCED_SPENT_MILES_GAIN: Bone Collector', () => {
  test('starts at +0 miles', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('bone_collector')],
    });
    // No accumulated miles → just base
    expect(result.miles).toBe(20); // (10+10)*1
  });

  test('gains +3 miles per enhanced die spent', () => {
    const inst = item('bone_collector');
    const enhancedDice = [die({ value: 5, enhancement: 'bone' }), die({ value: 3, enhancement: 'wooden' })];
    processEquipmentOnDiceSpent([inst], enhancedDice);
    expect(inst.state.miles).toBe(6); // 2 enhanced × 3
  });

  test('ignores non-enhanced dice', () => {
    const inst = item('bone_collector');
    const plainDice = [die({ value: 5 }), die({ value: 3 })];
    processEquipmentOnDiceSpent([inst], plainDice);
    expect(inst.state.miles).toBe(0);
  });

  test('accumulated miles applied during scoring', () => {
    const inst = item('bone_collector');
    inst.state.miles = 15; // simulate 5 enhanced dice spent

    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMiles=10, totalValue=10, +15 bonusMiles
    // finalMiles = (10 + 10 + 15) * 1 = 35
    expect(result.miles).toBe(35);
  });
});
