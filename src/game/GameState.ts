// ─── GameState (No Phaser imports) ───
// Central state machine for a single round of Wagon Bones.
// Owns the round lifecycle: DRAW → ROLL → SCORE → DAY_END → (repeat or ROUND_END).
// Emits callbacks so the rendering layer can react to state changes.

import {
  RoundState, GameConfig, DEFAULT_CONFIG,
  HandResult, ScoreResult, GameEventType, GameEventCallback, HandType,
} from './types';
import {
  rollDice, detectBestHand, scoreHand,
} from './DiceSystem';
import { getPlayerState } from './PlayerState';
import { applyEquipmentEffects, getConfigModifiers, processEndOfRound } from './EquipmentEffects';

export class GameState {
  config: GameConfig;
  state: RoundState;
  private listeners: Map<GameEventType, GameEventCallback[]> = new Map();

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  // ─── Event System ───

  on(event: GameEventType, cb: GameEventCallback): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(cb);
  }

  off(event: GameEventType, cb: GameEventCallback): void {
    const cbs = this.listeners.get(event);
    if (cbs) {
      const idx = cbs.indexOf(cb);
      if (idx !== -1) cbs.splice(idx, 1);
    }
  }

  private emit(event: GameEventType, data?: unknown): void {
    const cbs = this.listeners.get(event);
    if (cbs) cbs.forEach(cb => cb(data));
  }

  // ─── Initialization ───

  private createInitialState(): RoundState {
    // All available (non-spent) dice go into the hand
    const player = getPlayerState();
    const hand = [...player.availableDice].sort(() => Math.random() - 0.5);
    return {
      phase: 'SELECT',
      day: 1,
      rerollsRemaining: this.config.maxRerolls,
      totalMiles: 0,
      spent: [...player.spentDice],
      hand,
      selectedForRoll: [],
      rolledDice: [],
      selectedForScore: [],
    };
  }

  startRound(config?: Partial<GameConfig>): void {
    if (config) this.config = { ...this.config, ...config };

    // Apply equipment config modifiers (rerolls)
    const player = getPlayerState();
    const mods = getConfigModifiers(player.equipment);
    this.config = {
      ...this.config,
      maxRerolls: DEFAULT_CONFIG.maxRerolls + mods.rerollsBonus,
    };

    this.state = this.createInitialState();
    this.emit('phase-change', this.state.phase);
    this.emit('hand-updated', this.state.hand);
  }

  // ─── SELECT Phase ───
  // No discards — player simply picks up to 5 dice from hand to roll.

  // ─── Transition to ROLL Phase ───

  /** Player confirms hand selection and moves to ROLL. Selects which dice to roll. */
  selectForRoll(diceIds: string[]): boolean {
    if (this.state.phase !== 'SELECT') return false;
    if (diceIds.length < 1 || diceIds.length > this.config.rollSize) return false;

    const selected = this.state.hand.filter(d => diceIds.includes(d.id));
    if (selected.length !== diceIds.length) return false;

    this.state.selectedForRoll = selected;
    this.state.phase = 'ROLL';

    // Roll them
    this.state.rolledDice = rollDice(selected);
    this.emit('phase-change', this.state.phase);
    this.emit('dice-rolled', this.state.rolledDice);
    return true;
  }

  // ─── ROLL Phase ───

  /** Re-roll specific dice during the ROLL phase. */
  reroll(diceIds: string[]): boolean {
    if (this.state.phase !== 'ROLL') return false;
    if (diceIds.length === 0) return false;
    if (this.state.rerollsRemaining <= 0) return false;

    this.state.rolledDice = this.state.rolledDice.map(d => {
      if (diceIds.includes(d.id)) {
        return { ...d, pips: Math.ceil(Math.random() * 6) };
      }
      return d;
    });

    this.state.rerollsRemaining--;
    this.emit('reroll-updated', this.state.rerollsRemaining);
    this.emit('dice-rolled', this.state.rolledDice);
    return true;
  }

  // ─── Transition to SCORE Phase ───

  /** Select which of the rolled dice to score. */
  selectForScore(diceIds: string[]): boolean {
    if (this.state.phase !== 'ROLL') return false;
    if (diceIds.length < 1 || diceIds.length > this.config.rollSize) return false;

    const selected = this.state.rolledDice.filter(d => diceIds.includes(d.id));
    if (selected.length !== diceIds.length) return false;

    this.state.selectedForScore = selected;
    this.state.phase = 'SCORE';
    this.emit('phase-change', this.state.phase);
    return true;
  }

  // ─── SCORE Phase ───

  /** Calculate score and advance to DAY_END. Returns the score result. */
  calculateScore(): ScoreResult | null {
    if (this.state.phase !== 'SCORE') return null;
    if (this.state.selectedForScore.length === 0) return null;

    const handResult: HandResult = detectBestHand(this.state.selectedForScore);
    console.log('[SCORE] Step 0: Hand detected:', handResult.name, '| baseMiles:', handResult.baseMiles, '| baseMult:', handResult.baseMult);
    console.log('[SCORE] Scoring dice:', this.state.selectedForScore.map(d => `${d.id}(pips:${d.pips}, aura:${d.aura}, enh:${d.enhancement})`).join(', '));

    // Apply hand level scaling before scoring
    const player = getPlayerState();
    const handType = handResult.type as HandType;
    const stats = player.getHandStats(handType);

    // Each level above 1 adds milesPerLevel/multPerLevel from trail guide data
    const levelBonus = stats.level - 1;
    const leveledResult = {
      ...handResult,
      baseMiles: handResult.baseMiles + stats.milesPerLevel * levelBonus,
      baseMult: handResult.baseMult + stats.multPerLevel * levelBonus,
    };
    if (levelBonus > 0) {
      console.log('[SCORE] Hand level:', stats.level, '| +miles/lvl:', stats.milesPerLevel * levelBonus, '| +mult/lvl:', stats.multPerLevel * levelBonus);
    }
    console.log('[SCORE] After leveling: baseMiles:', leveledResult.baseMiles, '| baseMult:', leveledResult.baseMult);

    const baseResult = scoreHand(leveledResult, player.equipment);
    console.log('[SCORE] After scoreHand: totalPips:', baseResult.totalPips, '| mult:', baseResult.mult, '| miles:', baseResult.miles);

    // Apply equipment effects
    console.log('[SCORE] Equipment:', player.equipment.map(e => `${e.def.name}(${e.def.effectType}, aura:${e.def.aura?.id ?? 'none'})`).join(', ') || 'none');
    const result = applyEquipmentEffects(baseResult, player.equipment, {
      handResult: leveledResult,
      scoringDice: this.state.selectedForScore,
      rerollsRemaining: this.state.rerollsRemaining,
      equipmentCount: player.equipment.length,
    });

    console.log('[SCORE] Final result: miles:', result.miles, '| mult:', result.mult);

    // Record hand played
    player.recordHandPlayed(handType);

    this.state.totalMiles += result.miles;
    this.state.phase = 'DAY_END';
    this.emit('score-calculated', result);
    this.emit('phase-change', this.state.phase);
    return result;
  }

  // ─── DAY_END ───

  /** Advance to next day or end the round. */
  endDay(): 'next-day' | 'won' | 'lost' {
    if (this.state.phase !== 'DAY_END') return 'lost';

    // Process end-of-round equipment effects (money, destruction)
    const player = getPlayerState();
    const endEffects = processEndOfRound(player.equipment);
    if (endEffects.moneyEarned > 0) {
      player.economy.earn(endEffects.moneyEarned);
    }
    // Destroy risky equipment (iterate in reverse to keep indices valid)
    for (const idx of endEffects.destroyedIndices.sort((a, b) => b - a)) {
      player.equipment.splice(idx, 1);
    }

    // Mark rolled dice as spent (persists across rounds).
    // Returns true if all dice were spent and an auto-refresh occurred.
    const rolledIds = this.state.selectedForRoll.map(d => d.id);
    player.markDiceSpent(rolledIds);

    if (this.state.totalMiles >= this.config.targetMiles) {
      this.state.phase = 'ROUND_END';
      this.emit('round-won', { totalMiles: this.state.totalMiles, target: this.config.targetMiles });
      this.emit('phase-change', this.state.phase);
      return 'won';
    }

    if (this.state.day >= this.config.maxDays) {
      this.state.phase = 'ROUND_END';
      this.emit('round-lost', { totalMiles: this.state.totalMiles, target: this.config.targetMiles });
      this.emit('phase-change', this.state.phase);
      return 'lost';
    }

    // Next day — draw fresh dice
    this.state.day++;

    // Hand = all currently available (non-spent) dice
    this.state.hand = [...player.availableDice].sort(() => Math.random() - 0.5);
    this.state.spent = [...player.spentDice];
    this.state.selectedForRoll = [];
    this.state.rolledDice = [];
    this.state.selectedForScore = [];

    // Reset re-rolls for the new day
    this.state.rerollsRemaining = this.config.maxRerolls;

    this.state.phase = 'SELECT';
    this.emit('day-ended', { day: this.state.day });
    this.emit('phase-change', this.state.phase);
    this.emit('hand-updated', this.state.hand);
    return 'next-day';
  }

  // ─── Refresh Spent Dice ───

  /** Check if the player needs to refresh before the SELECT phase can proceed.
   *  Returns null if no prompt needed, or an object describing the options. */
  getRefreshPrompt(): { availableCount: number; refreshCost: number; canAfford: boolean; freeIfUsed: boolean } | null {
    const player = getPlayerState();
    const available = player.availableDice.length;
    if (available >= this.config.rollSize) return null; // enough dice, no prompt needed

    const cost = player.refreshCost;
    // If using the remaining dice would exhaust the pool, refresh is free
    const freeIfUsed = available + player.spentDiceIds.size >= player.dice.length;
    return {
      availableCount: available,
      refreshCost: cost,
      canAfford: player.economy.balance >= cost,
      freeIfUsed,
    };
  }

  /** Use remaining dice and get a free refresh (marks all available as spent, then auto-refreshes). */
  useRemainingAndRefresh(): void {
    const player = getPlayerState();
    // Mark all currently available dice as spent to trigger auto-refresh
    const availableIds = player.availableDice.map(d => d.id);
    player.markDiceSpent(availableIds); // will auto-clear since all are now spent

    // Rebuild hand from the full pool
    this.state.hand = [...player.availableDice].sort(() => Math.random() - 0.5);
    this.state.spent = [];
    this.emit('spent-refreshed', { cost: 0 });
    this.emit('hand-updated', this.state.hand);
  }

  /** Pay money to refresh all spent dice back into the available pool.
   *  Cost = number of currently available (non-spent) dice.
   *  Can be called during SELECT phase. Returns false if can't afford or nothing to refresh. */
  refreshSpentDice(): boolean {
    const player = getPlayerState();
    if (!player.refreshSpentDice()) return false;

    // Rebuild hand from the full available pool
    this.state.hand = [...player.availableDice].sort(() => Math.random() - 0.5);
    this.state.spent = [];
    this.emit('spent-refreshed', { cost: player.refreshCost });
    this.emit('hand-updated', this.state.hand);
    return true;
  }
}
