// ─── Dice Selection System (No Phaser imports) ───
// Handles the common pattern: draw N dice from player pool, player picks some, apply effect.
// Used by supply cards (mirage, shallow_grave) and frontier encounters (gold_rush, etc.).

import { Die, DiceAura, PipEffect } from './types';
import { getPlayerState } from './PlayerState';
import diceAurasData from '../data/dice_auras.json';

// ─── Effect Types ───

export type DiceSelectionEffectType =
  | 'DESTROY'           // shallow_grave: destroy selected dice
  | 'COPY'              // seeing_double: duplicate selected die
  | 'ADD_PIP_EFFECT'    // gold_rush, snake_oil, spirit_guide, deputize
  | 'CLONE'             // mirage: left die becomes a copy of right die
  | 'APPLY_AURA';       // spirit_shaman: apply a random aura

export interface DiceSelectionEffectParams {
  pipEffect?: PipEffect;      // for ADD_PIP_EFFECT
  sideCount?: number;          // how many sides to color (for ADD_PIP_EFFECT)
  copyCount?: number;          // how many copies (for COPY)
  aura?: DiceAura;             // for APPLY_AURA (if null, picks random)
}

export interface DiceSelectionConfig {
  drawCount: number;           // how many dice to show (typically 5)
  pickCount: number;           // how many the player selects
  effectType: DiceSelectionEffectType;
  effectParams: DiceSelectionEffectParams;
  cardName: string;            // for display
  description: string;         // for display
  skippable: boolean;          // can the player skip without picking?
}

export interface DiceSelectionState {
  config: DiceSelectionConfig;
  drawnDice: Die[];            // the dice shown to the player
  selectedIds: string[];       // currently selected dice IDs
}

// ─── Drawing Dice ───

/**
 * Draw dice from the player's pool.
 * Uses active (non-spent) dice first, then shuffles spent dice if needed.
 * Returns copies (not references) so originals stay in pool.
 */
export function drawDiceForSelection(count: number): Die[] {
  const player = getPlayerState();
  const pool = [...player.dice].sort(() => Math.random() - 0.5);
  return pool.slice(0, Math.min(count, pool.length)).map(d => ({ ...d }));
}

// ─── Applying Effects ───

/**
 * Apply the selected effect to the player's actual dice.
 * Returns a description of what happened.
 */
export function applyDiceSelectionEffect(
  config: DiceSelectionConfig,
  selectedDice: Die[],
): string {
  const player = getPlayerState();

  switch (config.effectType) {
    case 'DESTROY':
      return applyDestroy(player, selectedDice);
    case 'COPY':
      return applyCopy(player, selectedDice, config.effectParams.copyCount ?? 2);
    case 'ADD_PIP_EFFECT':
      return applyAddPipEffect(
        player,
        selectedDice,
        config.effectParams.pipEffect!,
        config.effectParams.sideCount ?? 1,
      );
    case 'CLONE':
      return applyClone(player, selectedDice);
    case 'APPLY_AURA':
      return applyAura(player, selectedDice, config.effectParams.aura ?? null);
  }
}

function applyDestroy(player: ReturnType<typeof getPlayerState>, selectedDice: Die[]): string {
  const ids = new Set(selectedDice.map(d => d.id));
  const before = player.dice.length;
  player.dice = player.dice.filter(d => !ids.has(d.id));
  const removed = before - player.dice.length;
  return `Destroyed ${removed} dice`;
}

function applyCopy(
  player: ReturnType<typeof getPlayerState>,
  selectedDice: Die[],
  copyCount: number,
): string {
  const die = selectedDice[0];
  if (!die) return 'No die selected';
  const original = player.dice.find(d => d.id === die.id);
  if (!original) return 'Die not found';
  for (let i = 0; i < copyCount; i++) {
    player.addDie({ ...original });
  }
  return `Created ${copyCount} copies`;
}

function applyAddPipEffect(
  player: ReturnType<typeof getPlayerState>,
  selectedDice: Die[],
  pipEffect: PipEffect,
  sideCount: number,
): string {
  const die = selectedDice[0];
  if (!die) return 'No die selected';
  const original = player.dice.find(d => d.id === die.id);
  if (!original) return 'Die not found';

  // Pick random sides that don't already have this effect
  const availableSides = original.sidePips
    .map((eff, i) => ({ eff, side: i }))
    .filter(s => s.eff !== pipEffect);

  const shuffled = availableSides.sort(() => Math.random() - 0.5);
  const toColor = shuffled.slice(0, Math.min(sideCount, shuffled.length));

  for (const s of toColor) {
    original.sidePips[s.side] = pipEffect;
  }
  return `Added ${pipEffect} to ${toColor.length} side(s)`;
}

function applyClone(
  player: ReturnType<typeof getPlayerState>,
  selectedDice: Die[],
): string {
  if (selectedDice.length < 2) return 'Select 2 dice';
  const left = player.dice.find(d => d.id === selectedDice[0].id);
  const right = player.dice.find(d => d.id === selectedDice[1].id);
  if (!left || !right) return 'Dice not found';

  // Left becomes a copy of right (keep left's id)
  left.pips = right.pips;
  left.enhancement = right.enhancement;
  left.sidePips = [...right.sidePips];
  left.aura = right.aura;
  left.isGrimy = right.isGrimy;

  return `Cloned ${right.enhancement ?? 'standard'} die`;
}

// ─── Aura ───

/** Weighted random aura: 10% holy, 30% fire, 60% icy */
export function pickRandomAura(): DiceAura {
  const roll = Math.random();
  if (roll < 0.10) return 'holy';
  if (roll < 0.40) return 'fire';
  return 'icy';
}

function applyAura(
  player: ReturnType<typeof getPlayerState>,
  selectedDice: Die[],
  aura: DiceAura,
): string {
  const die = selectedDice[0];
  if (!die) return 'No die selected';
  const original = player.dice.find(d => d.id === die.id);
  if (!original) return 'Die not found';

  const chosenAura = aura ?? pickRandomAura();
  original.aura = chosenAura;

  const info = diceAurasData.find(a => a.id === chosenAura);
  const auraName = info ? info.name : chosenAura;
  return `Applied ${auraName} aura`;
}
