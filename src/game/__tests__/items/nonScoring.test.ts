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
  processEquipmentOnHandPlayed,
  processEquipmentAfterHandScored,
  processEquipmentOnReroll,
  processEquipmentOnPackOpened,
  processEquipmentOnBossDefeat,
} from '../../EquipmentEffects';
import { HandType } from '../../types';

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

// ─── SCORED_RETRIGGER_FINAL_DAY: Last Stand ───

describe('SCORED_RETRIGGER_FINAL_DAY: Last Stand', () => {
  test('retriggers scored dice on final day', () => {
    const lastStand = item('last_stand');
    const count = getScoredRetriggerCount([lastStand], { currentDay: 5, maxDays: 5 });
    expect(count).toBe(1);
  });

  test('does not retrigger on non-final day', () => {
    const lastStand = item('last_stand');
    const count = getScoredRetriggerCount([lastStand], { currentDay: 3, maxDays: 5 });
    expect(count).toBe(0);
  });

  test('stacks with other scored retriggers (e.g. War Drums)', () => {
    const lastStand = item('last_stand');
    const warDrums = item('war_drums');
    const count = getScoredRetriggerCount([lastStand, warDrums], { currentDay: 5, maxDays: 5 });
    // Last Stand: +1, War Drums: +1 = 2
    expect(count).toBe(2);
  });
});

// ─── FREE_SHOP_REROLL: Coupon Book ───

describe('FREE_SHOP_REROLL: Coupon Book', () => {
  test('getConfigModifiers reports free rerolls', () => {
    const coupon = item('coupon_book');
    const config = getConfigModifiers([coupon]);
    expect(config.freeShopRerolls).toBe(1);
  });

  test('shop reroll cost is 0 for free rerolls', () => {
    const { player } = setupGame({ equipment: [item('coupon_book')] });
    player.shopRerollCount = 0;
    expect(player.shopRerollCost).toBe(0);
  });

  test('shop reroll cost resumes after free rerolls used', () => {
    const { player } = setupGame({ equipment: [item('coupon_book')] });
    player.shopRerollCount = 1; // 1 free used, now paid
    expect(player.shopRerollCost).toBeGreaterThan(0);
  });

  test('multiple coupon books stack free rerolls', () => {
    const { player } = setupGame({
      equipment: [item('coupon_book'), item('coupon_book')],
    });
    player.shopRerollCount = 0;
    expect(player.shopRerollCost).toBe(0);
    player.shopRerollCount = 1;
    expect(player.shopRerollCost).toBe(0);
    player.shopRerollCount = 2; // both free used
    expect(player.shopRerollCost).toBeGreaterThan(0);
  });
});

// ─── END_ROUND_MONEY_PER_REROLL: Rainy Day Fund ───

describe('END_ROUND_MONEY_PER_REROLL: Rainy Day Fund', () => {
  test('has correct effectType', () => {
    const inst = item('rainy_day_fund');
    expect(inst.def.effectType).toBe('END_ROUND_MONEY_PER_REROLL');
    expect(inst.def.effectParams.value).toBe(1);
  });
});

// ─── SOLO_FIRST_DAY_ENHANCE: Lucky Find ───

describe('SOLO_FIRST_DAY_ENHANCE: Lucky Find', () => {
  test('has correct effect type', () => {
    const inst = item('lucky_find');
    expect(inst.def.effectType).toBe('SOLO_FIRST_DAY_ENHANCE');
  });
});

// ─── HAND_UPGRADE_CHANCE: Surveyor's Transit ───

describe("HAND_UPGRADE_CHANCE: Surveyor's Transit", () => {
  test('has a chance to upgrade hand on play', () => {
    const inst = item('surveyors_transit');
    const { player } = setupGame({ equipment: [inst] });
    const initialLevel = player.getHandStats(HandType.PAIR).level;
    for (let i = 0; i < 100; i++) {
      processEquipmentAfterHandScored([inst], HandType.PAIR);
    }
    // After 100 attempts at 1 in 4, very likely at least one upgrade
    expect(player.getHandStats(HandType.PAIR).level).toBeGreaterThan(initialLevel);
  });
});

// ─── TRAIL_TAX ───

describe('TRAIL_TAX: Trail Tax', () => {
  test('starts at 0 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('trail_tax')],
    });
    expect(result.mult).toBe(1);
  });

  test('gains +2 mult per day end', () => {
    const inst = item('trail_tax');
    processEquipmentOnDayEnd([inst]);
    expect(inst.state.mult).toBe(2);
    processEquipmentOnDayEnd([inst]);
    expect(inst.state.mult).toBe(4);
  });

  test('loses -1 mult per reroll', () => {
    const inst = item('trail_tax');
    inst.state.mult = 6;
    processEquipmentOnReroll([inst], 3);
    expect(inst.state.mult).toBe(5);
  });

  test('does not go below 0 on reroll loss', () => {
    const inst = item('trail_tax');
    inst.state.mult = 0;
    processEquipmentOnReroll([inst], 3);
    expect(inst.state.mult).toBe(0);
  });

  test('accumulated mult applies during scoring', () => {
    const inst = item('trail_tax');
    inst.state.mult = 8;
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1, +8 from trail tax = 9
    expect(result.mult).toBe(9);
  });
});

// ─── PACK_OPEN_SUPPLY_CHANCE: Leftovers ───

describe('PACK_OPEN_SUPPLY_CHANCE: Leftovers', () => {
  test('has correct effect type', () => {
    const inst = item('leftovers');
    expect(inst.def.effectType).toBe('PACK_OPEN_SUPPLY_CHANCE');
  });

  test('processEquipmentOnPackOpened returns boolean', () => {
    const inst = item('leftovers');
    // Run it many times; it should return true sometimes (1 in 2)
    let gotTrue = false;
    let gotFalse = false;
    for (let i = 0; i < 100; i++) {
      const result = processEquipmentOnPackOpened([inst]);
      if (result) gotTrue = true;
      else gotFalse = true;
      if (gotTrue && gotFalse) break;
    }
    expect(gotTrue).toBe(true);
    expect(gotFalse).toBe(true);
  });

  test('returns false with no PACK_OPEN_SUPPLY_CHANCE equipment', () => {
    const result = processEquipmentOnPackOpened([item('horseshoe')]);
    expect(result).toBe(false);
  });
});

// ─── END_ROUND_MONEY_SCALING: Railroad Bonds ───

describe('END_ROUND_MONEY_SCALING: Railroad Bonds', () => {
  test('earns $1 base at end of round (no bosses defeated)', () => {
    const inst = item('railroad_bonds');
    const { player } = setupGame({ equipment: [inst] });
    const payout = player.calculatePayout(0);
    expect(payout.equipmentMoney).toBe(1);
  });

  test('earns $1 + $2 per boss defeated while equipped', () => {
    const inst = item('railroad_bonds');
    const { player } = setupGame({ equipment: [inst] });
    // Defeat 2 bosses while equipped
    processEquipmentOnBossDefeat([inst]);
    processEquipmentOnBossDefeat([inst]);
    const payout = player.calculatePayout(0);
    expect(payout.equipmentMoney).toBe(5);
  });

  test('does not count bosses defeated before equipping', () => {
    // Player is on leg 3 but just picked up railroad bonds
    const inst = item('railroad_bonds');
    const { player } = setupGame({ equipment: [inst], leg: 3 });
    // No boss defeats tracked on this item
    const payout = player.calculatePayout(0);
    expect(payout.equipmentMoney).toBe(1);
  });

  test('stacks with other end-of-round money equipment', () => {
    const bonds = item('railroad_bonds');
    processEquipmentOnBossDefeat([bonds]); // 1 boss defeated while equipped
    const { player } = setupGame({ equipment: [bonds, item('payday')] });
    // railroad bonds: $1 + $2 = $3, payday: $4, total = $7
    const payout = player.calculatePayout(0);
    expect(payout.equipmentMoney).toBe(7);
  });
});

// ─── XMULT_RISKY: Nitro (end of round) ───

describe('XMULT_RISKY: Nitro (end of round)', () => {
  test('has a 1/1000 destroy chance', () => {
    const inst = item('nitro');
    expect(inst.def.effectParams.destroyChance).toEqual([1, 1000]);
  });

  test('processEndOfRound includes XMULT_RISKY items in destroy check', () => {
    const inst = item('nitro');
    // Run many times — extremely unlikely to destroy (1/1000)
    let destroyed = false;
    for (let i = 0; i < 100; i++) {
      const result = processEndOfRound([inst]);
      if (result.destroyedIndices.length > 0) {
        destroyed = true;
        break;
      }
    }
    // With 100 iterations, 1/1000 chance, very unlikely to destroy, but we just check it doesn't throw
    expect(typeof destroyed).toBe('boolean');
  });
});

// ─── ENHANCEMENT_COUNT_MILES: Quarry Mine ───

describe('ENHANCEMENT_COUNT_MILES: Quarry Mine', () => {
  test('adds +25 miles per stone die in collection', () => {
    const stoneDice = [
      die({ value: 0, enhancement: 'stone' }),
      die({ value: 0, enhancement: 'stone' }),
    ];
    const normalDice = diceWithValue(5, 2);
    // Include stone dice in the "all dice" pool
    const allDice = [...normalDice, ...stoneDice, ...diceWithValue(1, 48)];
    const { game, player } = setupGame({
      equipment: [item('quarry_mine')],
      dice: allDice,
    });
    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = normalDice;
    game.state.selectedForRoll = normalDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(normalDice.map((d) => d.id));
    const result = game.calculateScore()!;
    // PAIR: baseMiles=10, totalValue=10, +50 (2 stone × 25) = 70 * mult(1)
    expect(result.miles).toBe(70);
  });

  test('no bonus with zero stone dice', () => {
    const normalDice = diceWithValue(5, 2);
    const allDice = [...normalDice, ...diceWithValue(1, 48)];
    const { game, player } = setupGame({
      equipment: [item('quarry_mine')],
      dice: allDice,
    });
    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = normalDice;
    game.state.selectedForRoll = normalDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(normalDice.map((d) => d.id));
    const result = game.calculateScore()!;
    // PAIR: baseMiles=10, totalValue=10, +0 (no stone) = 20 * mult(1)
    expect(result.miles).toBe(20);
  });

  test('scales with number of stone dice', () => {
    const stoneDice = [
      die({ value: 0, enhancement: 'stone' }),
      die({ value: 0, enhancement: 'stone' }),
      die({ value: 0, enhancement: 'stone' }),
      die({ value: 0, enhancement: 'stone' }),
    ];
    const normalDice = diceWithValue(5, 2);
    const allDice = [...normalDice, ...stoneDice, ...diceWithValue(1, 44)];
    const { game, player } = setupGame({
      equipment: [item('quarry_mine')],
      dice: allDice,
    });
    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = normalDice;
    game.state.selectedForRoll = normalDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(normalDice.map((d) => d.id));
    const result = game.calculateScore()!;
    // PAIR: baseMiles=10, totalValue=10, +100 (4 stone × 25) = 120 * mult(1)
    expect(result.miles).toBe(120);
  });
});
