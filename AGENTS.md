# Wagon Bones — AI Agent Instructions

## Project Overview

Balatro-inspired dice roguelike set on the Oregon Trail. Roll d12 dice, build hands, collect equipment, and travel 8 frontier legs. Built with **Phaser 4 + SolidJS + Vite + TypeScript** using **bun** as the package manager.

## Quick Commands

| Task | Command |
|------|---------|
| Dev server | `bun run dev` |
| Build | `bun run build` |
| Tests | `bun test` |
| Single test | `bun test src/game/__tests__/items/myTest.test.ts` |
| Format | `bun run format` |

**Never use `npm`, `npx`, or `yarn`.** Use `bun` / `bunx` exclusively.

## Architecture

```
src/game/          # Pure game logic (NO Phaser imports)
src/phaser/        # Rendering layer (scenes, UI, animations)
src/data/          # JSON data + items.ts definitions
```

### Key Separation Rule

**Game logic files (`src/game/`) must NEVER import from Phaser.** They are pure TypeScript. The Phaser layer subscribes to state changes and renders them.

### Core Systems (src/game/)

| File | Purpose |
|------|---------|
| `GameState.ts` | Round state machine: SELECT→ROLL→SCORE→DAY_END→ROUND_END |
| `PlayerState.ts` | Persistent cross-scene singleton (money, dice, equipment, progression) |
| `DiceSystem.ts` | Dice creation, rolling, hand detection, scoring |
| `EquipmentEffects.ts` | Applies equipment effects during scoring and round lifecycle |
| `ItemsSystem.ts` | Equipment definitions, shop stock generation, auras |
| `Economy.ts` | Money tracking |
| `Constants.ts` | ALL magic numbers, colors, fonts, layout values — change here, not in logic |
| `EventBus.ts` | Singleton EventEmitter with `Events` constants (`domain:action` naming) |
| `types.ts` | Core types (Die, HandType, ScoreResult, ScoreAnimEvent, etc.) |

### Phaser Layer (src/phaser/)

| Directory | Purpose |
|-----------|---------|
| `scenes/` | Game screens (GameScene, ShopScene, TrailEventScene, etc.) |
| `ui/` | Reusable components (DiceSprite, ItemCard, Button, Sidebar, etc.) |
| `animations/` | Score, roll, and hand upgrade animations |

### Data Layer (src/data/)

- `items.ts` — **Sole source** for equipment definitions (includes `hintDisplay` functions)
- JSON files — hands, professions, trail guides, supplies, frontier encounters, bosses, etc.

## Key Patterns

### Score Animation (Event-Driven)

Game logic emits `ScoreAnimEvent[]` during scoring. The Phaser layer plays them back — **no logic duplication**.

To add animation for a new effect:
1. In game logic (`DiceSystem.ts` or `EquipmentEffects.ts`), push to `animEvents[]` next to the scoring code
2. Done. `ScoreAnimation.ts` plays back whatever events exist in the array.

### Equipment Effects

Equipment is defined in `src/data/items.ts` with an `effectType` string and `effectParams` object. Effects are applied by a large switch statement in `EquipmentEffects.ts`. To add a new equipment item:
1. Add definition to `src/data/items.ts`
2. Add effect handling in the appropriate function in `EquipmentEffects.ts`
3. Push `animEvents` for visual feedback
4. Add test in `src/game/__tests__/items/`

### Hint Display System

Equipment cards show dynamic colored hints via `hintDisplay(game, player) => HintSegment[][]`. Styles: `miles` (blue), `mult` (red), `odds` (green), `inactive` (gray), `condition` (amber), `active` (green), `money` (gold), `text` (default).

### Singletons

- `PlayerState` — accessed via `getPlayerState()`, reset via `resetPlayerState()`
- `GameState` — instantiated per round, not global
- `EventBus` — global singleton for cross-system events

### Scene Lifecycle

- Scenes clean up resize listeners in `shutdown`
- Use `EventBus.emit(Events.SCENE_READY, this)` at end of `create()`
- Shared layout via `createLayout()` in `SceneLayout.ts`

### Constants

Colors, fonts, sizing, gameplay values — all in `Constants.ts`. Import from there, never hardcode.

## Testing

- Framework: **bun:test** (Jest-compatible API)
- Test helpers: `src/game/__tests__/testHelpers.ts` — provides `setupGame()`, `calculateTestScore()`, `item()`, `die()`, etc.
- Setup file: `src/game/__tests__/setup.ts` (suppresses console.log)
- Pattern: Test game logic only (pure functions), not Phaser rendering

## Game Design Documentation

See these files for game mechanics and planned features:
- [README.md](README.md) — Overview and hand types
- [GAME_OVERVIEW.md](GAME_OVERVIEW.md) — Core mechanics
- [GAME_EQUIPMENT_OVERVIEW.md](GAME_EQUIPMENT_OVERVIEW.md) — All equipment items by phase
- [GAME_DICE_OVERVIEW.md](GAME_DICE_OVERVIEW.md) — Dice enhancements and auras
- [GAME_BOSS_OVERVIEW.md](GAME_BOSS_OVERVIEW.md) — Boss encounters
- [GAME_SUPPLY_CARD_OVERVIEW.md](GAME_SUPPLY_CARD_OVERVIEW.md) — Supply cards
- [GAME_TRAIL_GUIDE_OVERVIEW.md](GAME_TRAIL_GUIDE_OVERVIEW.md) — Trail guides
- [GAME_PERMITS_OVERVIEW.md](GAME_PERMITS_OVERVIEW.md) — Permits system
- [GAME_FRONTIER_ENCOUNTER_OVERVIEW.md](GAME_FRONTIER_ENCOUNTER_OVERVIEW.md) — Frontier encounters

## Skills

This project has custom skills in `.agents/skills/`:
- `phaser` — Phaser 4 game development patterns and conventions
- `particles` — Phaser 4 particle effects
- `sprites-and-images` — Sprite/Image game objects
- `v4-new-features` — Phaser 4 new features (Filters, RenderNodes, etc.)
- `game-designer` — Visual polish and game feel improvements
- `game-ui-design` — Game UI/UX design expertise
