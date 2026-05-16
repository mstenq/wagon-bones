import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { die, diceWithValue, item, itemWithState, setupGame, calculateTestScore, resetDieIds } from '../testHelpers';
import { processEquipmentOnLegStart } from '../../EquipmentEffects';

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
