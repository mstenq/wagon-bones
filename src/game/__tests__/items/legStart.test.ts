import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { die, diceWithValue, item, itemWithState, setupGame, calculateTestScore, resetDieIds } from '../testHelpers';
import { processEquipmentOnLegStart, processEquipmentAfterHandScored } from '../../EquipmentEffects';
import { HandType } from '../../types';

beforeEach(() => resetDieIds());

// ─── LEG_START_DESTROY_RIGHT: Funeral Pyre ───

describe('LEG_START_DESTROY_RIGHT: Funeral Pyre', () => {
  test('destroys right neighbor and gains mult', () => {
    const pyre = itemWithState('funeral_pyre', { mult: 0 });
    const neighbor = item('horseshoe'); // sellValue is floor(cost/2)
    const neighborSellValue = neighbor.sellValue;

    const result = processEquipmentOnLegStart([pyre, neighbor]);
    expect(result.destroyedIndices).toEqual([1]);
    expect(pyre.state.mult).toBe(neighborSellValue * 2);
  });

  test('does not destroy if no right neighbor', () => {
    const pyre = itemWithState('funeral_pyre', { mult: 0 });
    const result = processEquipmentOnLegStart([pyre]);
    expect(result.destroyedIndices).toEqual([]);
    expect(pyre.state.mult).toBe(0);
  });

  test('accumulates mult across legs', () => {
    const pyre = itemWithState('funeral_pyre', { mult: 10 });
    const neighbor = item('horseshoe');
    const neighborSellValue = neighbor.sellValue;

    processEquipmentOnLegStart([pyre, neighbor]);
    expect(pyre.state.mult).toBe(10 + neighborSellValue * 2);
  });

  test('applies accumulated mult as bonusMult in scoring', () => {
    const pyre = itemWithState('funeral_pyre', { mult: 15 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [pyre],
    });
    // PAIR: baseMult=1, +15 bonusMult from funeral_pyre state
    expect(result.mult).toBe(16);
  });
});

// ─── LEG_START_ADD_STONE: Quarry Stone ───

describe('LEG_START_ADD_STONE: Quarry Stone', () => {
  test('reports stone dice to add', () => {
    const quarry = item('quarry_stone');
    const result = processEquipmentOnLegStart([quarry]);
    expect(result.stoneDiceToAdd).toBe(1);
  });

  test('multiple quarry stones stack', () => {
    const result = processEquipmentOnLegStart([item('quarry_stone'), item('quarry_stone')]);
    expect(result.stoneDiceToAdd).toBe(2);
  });

  test('adds stone dice on leg advance', () => {
    const { player } = setupGame({ equipment: [item('quarry_stone')] });
    const initialDiceCount = player.dice.length;
    // Set up to advance to a new leg (round 3 → next leg)
    player.round = 3; // ROUNDS_PER_LEG is 3
    player.advanceRound();
    // Should have added 1 stone die
    expect(player.dice.length).toBe(initialDiceCount + 1);
    const addedDie = player.dice[player.dice.length - 1];
    expect(addedDie.enhancement).toBe('stone');
    expect(addedDie.value).toBe(0);
  });
});

// ─── LEG_START_XMULT_DESTROY: Haunted Totem ───

describe('LEG_START_XMULT_DESTROY: Haunted Totem', () => {
  test('gains x0.5 mult on leg start', () => {
    const totem = item('haunted_totem');
    const other = item('horseshoe');
    processEquipmentOnLegStart([totem, other]);
    expect(totem.state.xMult).toBeCloseTo(1.5, 5);
  });

  test('destroys a random other equipment on leg start', () => {
    const totem = item('haunted_totem');
    const other = item('horseshoe');
    const result = processEquipmentOnLegStart([totem, other]);
    expect(result.destroyedIndices).toContain(1);
  });

  test('does not destroy itself', () => {
    const totem = item('haunted_totem');
    const result = processEquipmentOnLegStart([totem]);
    expect(result.destroyedIndices).not.toContain(0);
  });

  test('accumulated xMult applies during scoring', () => {
    const totem = itemWithState('haunted_totem', { xMult: 2 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [totem],
    });
    // PAIR: baseMult=1, x2 from totem = 2
    expect(result.mult).toBe(2);
  });

  test('stacks across multiple legs', () => {
    const totem = item('haunted_totem');
    const other1 = item('horseshoe');
    const other2 = item('dynamite');
    processEquipmentOnLegStart([totem, other1, other2]);
    // xMult should be 1.5 after first leg
    expect(totem.state.xMult).toBeCloseTo(1.5, 5);

    // Second leg with remaining equipment
    processEquipmentOnLegStart([totem, other2]);
    expect(totem.state.xMult).toBeCloseTo(2.0, 5);
  });
});

// ─── LEG_START_CREATE_EQUIPMENT: Junk Dealer ───

describe('LEG_START_CREATE_EQUIPMENT: Junk Dealer', () => {
  test('reports 2 equipment to create on leg start', () => {
    const junk = item('junk_dealer');
    const result = processEquipmentOnLegStart([junk]);
    expect(result.equipmentToCreate).toBe(2);
    expect(result.equipmentCreateRarity).toBe('common');
  });

  test('multiple junk dealers stack', () => {
    const result = processEquipmentOnLegStart([item('junk_dealer'), item('junk_dealer')]);
    expect(result.equipmentToCreate).toBe(4);
  });

  test('creates equipment on leg advance if slots available', () => {
    const { player } = setupGame({
      equipment: [item('junk_dealer')],
      maxEquipmentSlots: 10,
    });
    const initialEquipCount = player.equipment.length;
    // Advance past the current leg (round 3 → next leg)
    player.round = 3;
    player.advanceRound();
    // Should have created 2 new common equipment
    expect(player.equipment.length).toBeGreaterThanOrEqual(initialEquipCount + 2);
  });

  test('does not exceed max equipment slots', () => {
    const { player } = setupGame({
      equipment: [item('junk_dealer')],
      maxEquipmentSlots: 2, // already 1 used, can only add 1 more
    });
    player.round = 3;
    player.advanceRound();
    // Should only have added 1 (capped by slots)
    expect(player.usedEquipmentSlots).toBeLessThanOrEqual(2);
  });
});

// ─── LEG_START_SELL_VALUE: Antique Revolver ───

describe('LEG_START_SELL_VALUE: Antique Revolver', () => {
  test('gains $3 sell value on leg start', () => {
    const revolver = item('antique_revolver');
    const initialSellValue = revolver.sellValue;
    processEquipmentOnLegStart([revolver]);
    expect(revolver.sellValue).toBe(initialSellValue + 3);
  });

  test('accumulates across multiple legs', () => {
    const revolver = item('antique_revolver');
    const initialSellValue = revolver.sellValue;
    processEquipmentOnLegStart([revolver]);
    processEquipmentOnLegStart([revolver]);
    expect(revolver.sellValue).toBe(initialSellValue + 6);
  });

  test('sell value increases are preserved', () => {
    const { player } = setupGame({ equipment: [item('antique_revolver')] });
    const initialSellValue = player.equipment[0].sellValue;
    player.round = 3;
    player.advanceRound();
    expect(player.equipment[0].sellValue).toBe(initialSellValue + 3);
  });
});

// ─── LEG_START_DAYS_NO_REROLLS: Hardtack ───

describe('LEG_START_DAYS_NO_REROLLS: Hardtack', () => {
  test('reports +3 days bonus on leg start', () => {
    const hardtack = item('hardtack');
    const result = processEquipmentOnLegStart([hardtack]);
    expect(result.daysBonus).toBe(3);
    expect(result.loseAllRerolls).toBe(true);
  });

  test('applies day bonus via trailEventModifiers on leg advance', () => {
    const { player } = setupGame({ equipment: [item('hardtack')] });
    player.round = 3;
    player.advanceRound();
    // dayPenalty should be -3 (negative penalty = bonus)
    expect(player.trailEventModifiers.dayPenalty).toBe(-3);
  });

  test('loses all rerolls on leg advance', () => {
    const { player } = setupGame({ equipment: [item('hardtack')] });
    player.round = 3;
    player.advanceRound();
    expect(player.trailEventModifiers.loseAllRerolls).toBe(true);
    expect(player.effectiveRerolls).toBe(0);
  });
});

// ─── LOW_MONEY_SUPPLY: Emergency Supplies ───

describe('LOW_MONEY_SUPPLY: Emergency Supplies', () => {
  test('creates supply card when balance <= $4', () => {
    const inst = item('emergency_supplies');
    const { player } = setupGame({ equipment: [inst], money: 3 });
    const initialConsumables = player.consumables.length;
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    expect(player.consumables.length).toBe(initialConsumables + 1);
  });

  test('does NOT create supply card when balance > $4', () => {
    const inst = item('emergency_supplies');
    const { player } = setupGame({ equipment: [inst], money: 10 });
    const initialConsumables = player.consumables.length;
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    expect(player.consumables.length).toBe(initialConsumables);
  });

  test('creates supply card at exactly $4', () => {
    const inst = item('emergency_supplies');
    const { player } = setupGame({ equipment: [inst], money: 4 });
    const initialConsumables = player.consumables.length;
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    expect(player.consumables.length).toBe(initialConsumables + 1);
  });

  test('created card is a supply category', () => {
    const inst = item('emergency_supplies');
    const { player } = setupGame({ equipment: [inst], money: 2 });
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    const lastConsumable = player.consumables[player.consumables.length - 1];
    expect(lastConsumable.def.category).toBe('supply');
  });
});
