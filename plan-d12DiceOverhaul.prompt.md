# Plan: D12 Dice Overhaul — Pips to Numbers, Stickers Replace Per-Side Effects

Convert the dice from 6-sided pip-based dice with per-side effects to 12-sided number-based dice with whole-die "sticker" effects (like Balatro seals). This removes `sidePips`, changes rendering from dot pips to numbers (1–12), converts `ADD_PIP_EFFECT` encounters to `ADD_STICKER`, removes the 6-face preview and indicator dots, and updates all rolling/scoring for 1–12 range. Players now roll 8 dice and select 5 to score.

---

## Phase 1: Core Data Model

1. **Update `Die` type** in `src/game/types.ts` — rename `pips` → `value` (1–12), remove `sidePips: PipEffect[]`, add `sticker: DiceSticker` (whole-die effect), remove `PipEffect` type, add `DiceSticker` type. Add `scoreSize: number` to `GameConfig` (default 5).
2. **Update `DiceSystem.ts`** — `createDie()` default value range 1–12, remove `sidePips` default, add `sticker: null`; `rollDie()`/`rollDice()` range → 1–12; `scoreHand()` and `detectBestHand()` rename `die.pips` → `die.value`
3. **Update roll/score sizing: Roll 8, Score up to 5** — Change `GAMEPLAY.ROLL_SIZE` from 5 → 8 in `Constants.ts` (how many dice drawn from pouch and rolled). Add `GAMEPLAY.SCORE_SIZE: 5` (max dice player selects to score from the 8 rolled). Update `GameState.ts`: `reroll()` range → 1–12; `selectForScore()` validates against `scoreSize` (was `rollSize`); `selectForRoll()` validates against `rollSize` (now 8). Game flow stays SELECT → ROLL → SCORE but now you roll 8 and pick 5 to score.
4. **Update `PlayerState.ts`** — `handSize` default should match new `ROLL_SIZE` (8). `createPouch()` delegates to `createDie()` which handles the new defaults.

## Phase 2: Sticker System (replaces per-side pip effects)

5. **Rework `pip_enhancements.json`** — remove `sideCount`, update descriptions to whole-die effects (e.g. "When this die scores, earn $3"), keep same 4 sticker IDs
6. **Update `DiceSelectionSystem.ts`** — `ADD_PIP_EFFECT` → `ADD_STICKER`; remove `pipEffect`/`sideCount` from params, add `sticker`; replace `applyAddPipEffect()` with `applyAddSticker()` that just sets `original.sticker = sticker`; update `applyClone()` to copy `sticker` instead of `sidePips`
7. **Update `frontier_encounters.json`** — all 4 `ADD_PIP_EFFECT` entries → `ADD_STICKER` with `"sticker": "..."` param, remove `sideCount`, update descriptions
8. **Update `BoosterPackSystem.ts`** — remove `applyRandomPipEffects()`, `getPipEffectDefs()`, `describePipEffects()`; replace with simple random sticker chance; remove `pip_enhancements` import

## Phase 3: UI Changes

9. **Overhaul `DiceSprite.ts`** — remove `PIP_POSITIONS`, draw centered number text (1–12) instead of dots; remove `drawPipIndicators()` (6 indicator boxes below die); remove `drawMiniDieFace()` and 2×3 grid from tooltip; add sticker icon in corner of front face if `die.sticker` is set; simplify tooltip to show enhancement + aura + sticker name
10. **Update `RollAnimation.ts`** — tumble random range → 1–12, `die.pips` → `die.value`
11. **Update `ScoreAnimation.ts`** — `die.pips` → `die.value` in `getTriggeredEquipForDie()`
12. **Update `BoosterPackScene.ts`** — remove `sidePips` iteration and pip count display from dice cards; remove `PIP_INFO` import
13. **Update `GameScene.ts`** — `getDiceGroupKey()`: replace `sidePipsKey` with `die.sticker`; `die.pips` → `die.value`; update UI layout to accommodate 8 rolled dice and 5 scoring slots

## Phase 4: Equipment & Boss Updates

14. **Update `items.ts`** — `PIP_MULT`/`PIP_MILES` items (snake_eyes, double_deuces, etc.) rename `die.pips` checks → `die.value`; keep existing items for values 1–6 (they become niche on d12, can add 7–12 items later); `PARITY` items work unchanged
15. **Update `EquipmentEffects.ts`** — `die.pips` → `die.value` in all effect checks
16. **Update `bosses.json`** — `DISABLE_PIPS` → `DISABLE_VALUES`, update descriptions ("even/odd pips" → "even/odd values")
17. **Update `dice_enhancements.json`** — descriptions: "pips" → "value" (loaded: "one chosen value", stone: "shows no value")

## Phase 5: Cleanup

18. **Remove dead code** — `PipEffect` type, `PIP_POSITIONS`, `PIP_RADIUS`/`INDICATOR_SIZE`/`INDICATOR_GAP` from Constants, dead imports
19. **Update game overview docs** — rename "pips" → "values", document sticker system, roll 8/score 5 flow *(low priority)*

---

## Key Decisions

- **Rename `pips` → `value`** throughout for clarity since "pips" implies dots
- **Roll 8, Score 5** — players now roll 8 dice and choose up to 5 to score, adding more strategic choice
- **Stickers are mutually exclusive** per die (like Balatro seals) — applying a new one replaces the old
- **Keep existing PIP_MULT/PIP_MILES equipment for values 1–6** — they become niche but functional on d12; 7–12 items are future work
- **`loaded` enhancement still works** — "doubles odds of rolling a specific value" on a d12
- **The 6-face preview is fully removed**, not adapted to 12 faces — sticker concept makes per-face preview irrelevant

## Verification

1. `tsc --noEmit` — full type check passes
2. Roll 8 dice → verify 8 d12 dice appear with numbers 1–12
3. Select 5 of 8 to score → verify scoring uses `die.value`, hand detection works with 1–12 range
4. Frontier encounter sticker → applies to whole die, visible as icon
5. Tooltip shows enhancement + sticker, no 6-face grid
6. Boss: the_ghost_town → even values disabled correctly
7. Equipment triggers (PIP_MULT on value 1–6) still fire correctly