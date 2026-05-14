import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import { die, diceFromValues, setupGame, resetDieIds } from './testHelpers';
import { resetPlayerState, getPlayerState } from '../PlayerState';

beforeEach(() => {
  resetDieIds();
});

describe('spent dice persistence', () => {
  test('spent dice persist across rounds (advanceRound does not clear)', () => {
    const player = resetPlayerState();
    player.dice = diceFromValues([1, 2, 3, 4, 5, 6, 7, 8]);

    // Spend some dice
    player.markDiceSpent([player.dice[0].id, player.dice[1].id]);
    expect(player.spentDiceIds.size).toBe(2);
    expect(player.availableDice.length).toBe(6);

    // Advance round — spent dice should NOT be cleared
    player.advanceRound();

    expect(player.spentDiceIds.size).toBe(2);
    expect(player.availableDice.length).toBe(6);
    expect(player.spentDice.length).toBe(2);
  });

  test('spent dice persist across multiple rounds', () => {
    const player = resetPlayerState();
    player.dice = diceFromValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // Round 1: spend 2 dice
    player.markDiceSpent([player.dice[0].id, player.dice[1].id]);
    expect(player.spentDiceIds.size).toBe(2);
    player.advanceRound();

    // Round 2: spend 2 more dice
    player.markDiceSpent([player.dice[2].id, player.dice[3].id]);
    expect(player.spentDiceIds.size).toBe(4);
    player.advanceRound();

    // Round 3: all 4 should still be spent
    expect(player.spentDiceIds.size).toBe(4);
    expect(player.availableDice.length).toBe(6);
  });

  test('spent dice persist across leg transitions', () => {
    const player = resetPlayerState();
    player.dice = diceFromValues([1, 2, 3, 4, 5, 6]);
    player.round = 3; // last round of leg

    player.markDiceSpent([player.dice[0].id]);
    expect(player.spentDiceIds.size).toBe(1);

    // This should advance to next leg (round 3 → leg++)
    player.advanceRound();

    expect(player.leg).toBe(2);
    expect(player.round).toBe(1);
    // Spent dice still persist
    expect(player.spentDiceIds.size).toBe(1);
    expect(player.availableDice.length).toBe(5);
  });

  test('spent dice carry into new round initial state', () => {
    const testDice = diceFromValues([1, 2, 3, 4, 5, 6, 7, 8]);
    const { game, player } = setupGame({ dice: testDice });

    // Manually mark some dice as spent
    player.markDiceSpent([player.dice[0].id, player.dice[1].id, player.dice[2].id]);
    expect(player.spentDiceIds.size).toBe(3);

    // Advance round (simulating a won round)
    player.advanceRound();

    // Start a new round — initial state should reflect spent dice
    game.startRound();
    expect(game.state.spent.length).toBe(3);
    expect(game.state.hand.length).toBe(5); // 8 - 3 spent = 5 available
  });

  test('auto-refresh triggers when all dice are spent', () => {
    const player = resetPlayerState();
    player.dice = diceFromValues([1, 2, 3]);

    // Spending all dice triggers auto-refresh
    const refreshed = player.markDiceSpent([player.dice[0].id, player.dice[1].id, player.dice[2].id]);
    expect(refreshed).toBe(true);
    expect(player.spentDiceIds.size).toBe(0);
    expect(player.availableDice.length).toBe(3);
  });

  test('manual refresh clears spent dice when paid for', () => {
    const player = resetPlayerState();
    player.dice = diceFromValues([1, 2, 3, 4, 5, 6]);
    player.economy.setBalance(10);

    player.markDiceSpent([player.dice[0].id, player.dice[1].id]);
    expect(player.spentDiceIds.size).toBe(2);

    // Manual refresh costs = number of available dice (4)
    const success = player.refreshSpentDice();
    expect(success).toBe(true);
    expect(player.spentDiceIds.size).toBe(0);
    expect(player.economy.balance).toBe(6); // 10 - 4 available dice cost
  });

  test('spent dice persist within days of a round', () => {
    const testDice = diceFromValues([1, 2, 3, 4, 5, 6, 7, 8]);
    const { game, player } = setupGame({ dice: testDice });

    game.startRound();

    // Simulate scoring: manually spend some dice
    player.markDiceSpent([player.dice[0].id, player.dice[1].id]);
    expect(player.spentDiceIds.size).toBe(2);

    // Verify available dice reflect spent state
    expect(player.availableDice.length).toBe(6);
    expect(player.spentDice.length).toBe(2);
  });

  test('new round hand only contains non-spent dice and allows rolling', () => {
    const testDice = diceFromValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const { game, player } = setupGame({ dice: testDice, handSize: 5 });

    // Spend 3 dice (simulating previous round usage)
    player.markDiceSpent([player.dice[0].id, player.dice[1].id, player.dice[2].id]);
    expect(player.spentDiceIds.size).toBe(3);

    // Advance round and start new one
    player.advanceRound();
    game.startRound();

    // Hand should only have the 7 available dice
    expect(game.state.hand.length).toBe(7);
    expect(game.state.spent.length).toBe(3);

    // Should be able to select up to handSize (5) dice from the 7 available
    const idsToRoll = game.state.hand.slice(0, 5).map((d) => d.id);
    const success = game.selectForRoll(idsToRoll);
    expect(success).toBe(true);
    expect(game.state.phase).toBe('ROLL');
  });
});
