// ─── GameScene ───
// Main round scene. Creates a GameState instance, subscribes to state changes,
// renders DRAW/ROLL/SCORE phases, dispatches player actions.
// Balatro-inspired layout: sidebar left, equipment top, dice center, pouch bottom-right.

import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { GameState } from '../../game/GameState';
import { Die, ScoreResult, HandType } from '../../game/types';
import { getPlayerState } from '../../game/PlayerState';
import { COLORS, TEXT_COLORS, FONTS, UI, GAMEPLAY, ANIM } from '../../game/Constants';
import { DiceSprite } from '../ui/DiceSprite';
import { Button } from '../ui/Button';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import { ConsumableBar } from '../ui/ConsumableBar';
import { ConsumableInstance, executeConsumableEffect } from '../../game/ConsumablesSystem';
import { DiceSelectionConfig, applyDiceSelectionEffect } from '../../game/DiceSelectionSystem';
import { DicePouch } from '../ui/DicePouch';
import { createLayout } from '../ui/SceneLayout';
import { playRollAnimation } from '../animations/RollAnimation';
import { playScoreAnimation } from '../animations/ScoreAnimation';

const DICE_SPACING = UI.DICE_SPACING;

interface DiceStackData {
  key: string;
  dice: Die[];
  sprites: DiceSprite[];
  countText: Phaser.GameObjects.Text;
  addBtn: Button | null;
  targetX: number;
}

export class GameScene extends Scene {
  private gameState: GameState;
  private sidebar: Sidebar;
  private equipBar: EquipmentBar;
  private consumableBar: ConsumableBar;
  private dicePouch: DicePouch;

  /** Dynamic roll size that respects permits and trail event penalties */
  private get maxSelectForRoll(): number {
    return this.gameState.config.rollSize;
  }

  // Layout helpers
  private contentCX: number = 0;
  private sidebarW: number = 0;

  // Dice sprites
  private handSprites: DiceSprite[] = [];
  private rollSprites: DiceSprite[] = [];

  // Dice stacking (SELECT phase)
  private availableStacks: DiceStackData[] = [];
  private playAreaSprites: DiceSprite[] = [];
  private playAreaY: number = 0;
  private availableY: number = 0;

  // Buttons
  private readyBtn: Button;
  private rollBtn: Button;
  private rerollBtn: Button;
  private scoreBtn: Button;
  private continueBtn: Button;

  // Instruction text
  private instructionText: Phaser.GameObjects.Text;

  // Track selections
  private selectedHandIds: Set<string> = new Set();
  private forcedDiceIds: Set<string> = new Set();
  private lockedDiceIds: Set<string> = new Set();

  // Lock icons
  private lockIcons: Phaser.GameObjects.Text[] = [];

  // Sort controls
  private sortOrder: 'asc' | 'desc' = 'asc';
  private sortAscBtn: Button;
  private sortDescBtn: Button;

  // Animation lock
  private animating: boolean = false;

  // Drag-to-reorder (play area)
  private draggingSprite: DiceSprite | null = null;
  private wasDragging: boolean = false;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;
  private dragPrevX: number = 0;
  private dragVelocityX: number = 0;

  // Refresh prompt overlay
  private refreshOverlay: Phaser.GameObjects.Container | null = null;

  // Consumable targeting mode (inline dice selection for consumables like coffee_tin)
  private consumableTargeting: DiceSelectionConfig | null = null;
  private consumableTargetIds: Set<string> = new Set();
  private consumableConfirmBtn: Button | null = null;
  private consumableCancelBtn: Button | null = null;
  private savedInstructionText: string = '';
  private savedLockedDiceIds: Set<string> = new Set();

  constructor() {
    super('Game');
  }

  create() {
    // Initialize game state only on first create (not on relayout)
    if (!this.gameState) {
      const player = getPlayerState();
      this.gameState = new GameState({ targetMiles: player.targetMiles });
      this.gameState.startRound();
      // Clear forced/selected state from previous round (scene instance is reused)
      this.forcedDiceIds = new Set();
      this.selectedHandIds = new Set();
    }

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.gameState = null!;
    });

    this.setupDragHandlers();
    this.buildLayout();
  }

  private buildLayout(): void {
    const { height } = this.scale;

    const layout = createLayout(this, { bgKey: 'bg_1' });
    this.sidebar = layout.sidebar;
    this.equipBar = layout.equipBar;
    this.consumableBar = layout.consumableBar;
    this.dicePouch = layout.dicePouch;
    this.sidebarW = layout.sidebarW;
    this.contentCX = layout.contentCX;

    // Refresh displays when equipment is sold from the bar
    this.equipBar.on('equipment-changed', () => {
      this.sidebar.refreshMoney();
      this.dicePouch.refresh();
    });

    // Refresh displays when consumables change
    this.consumableBar.on('consumable-changed', () => {
      this.sidebar.refreshMoney();
      this.dicePouch.refresh();
    });

    // Rebuild hand when dice are refreshed from the pouch modal
    this.dicePouch.on('dice-refreshed', () => {
      this.sidebar.refreshMoney();
      if (this.gameState.state.phase === 'SELECT') {
        // Rebuild hand from freshly available dice
        const player = getPlayerState();
        this.gameState.state.hand = [...player.availableDice].sort(() => Math.random() - 0.5);
        this.gameState.state.spent = [...player.spentDice];
        this.forcedDiceIds.clear();
        this.selectedHandIds.clear();
        this.enterDrawPhase();
      }
    });

    // Execute consumable effect when used
    this.consumableBar.on('consumable-used', (consumed: ConsumableInstance) => {
      this.handleConsumableUsed(consumed);
    });

    // Instruction text
    this.instructionText = this.add
      .text(this.contentCX, height - 60, '', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '16px',
        color: TEXT_COLORS.SECONDARY,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(50);

    // Create buttons (all hidden initially)
    const btnY = height - 30;
    this.readyBtn = new Button(this, this.contentCX, btnY, 'Roll Selected', 200, 40).onClick(() =>
      this.onReadyToRoll(),
    );
    this.rollBtn = new Button(this, this.contentCX, btnY, 'Roll!', 160, 40).onClick(() => this.onRoll());
    this.rerollBtn = new Button(this, this.contentCX - 110, btnY, 'Re-roll All', 200, 40).onClick(() =>
      this.onReroll(),
    );
    this.scoreBtn = new Button(this, this.contentCX + 110, btnY, 'Score Hand', 160, 40).onClick(() => this.onScore());
    this.continueBtn = new Button(this, this.contentCX, btnY, 'Continue', 160, 40).onClick(() => this.onContinue());

    // Sort buttons (small, positioned above the main buttons)
    const sortY = btnY - 50;
    this.sortAscBtn = new Button(this, this.contentCX - 50, sortY, '↑ Low', 80, 28).onClick(() =>
      this.setSortOrder('asc'),
    );
    this.sortDescBtn = new Button(this, this.contentCX + 50, sortY, '↓ High', 80, 28).onClick(() =>
      this.setSortOrder('desc'),
    );

    this.hideAllButtons();

    // Re-enter current phase
    this.enterCurrentPhase();

    EventBus.emit(Events.SCENE_READY, this);
  }

  private enterCurrentPhase(): void {
    const phase = this.gameState.state.phase;
    if (phase === 'SELECT') {
      this.enterDrawPhase();
    } else if (phase === 'ROLL') {
      this.enterRollPhaseLayout();
    } else if (phase === 'SCORE' || phase === 'DAY_END') {
      this.enterRollPhaseLayout();
      // Auto-advance on DAY_END (scoring already handled)
      if (phase === 'DAY_END') {
        this.onContinue();
      }
    } else {
      this.enterDrawPhase();
    }
    this.updateHUD();
  }

  private onResize(): void {
    // Preserve game state, destroy all display objects, rebuild layout
    this.handSprites = [];
    this.rollSprites = [];
    this.availableStacks = [];
    this.playAreaSprites = [];
    this.refreshOverlay = null;
    this.children.removeAll(true);
    this.buildLayout();
  }

  // ─── Phase Rendering ───

  private enterDrawPhase(): void {
    this.clearSprites();
    this.selectedHandIds.clear();
    // Note: forcedDiceIds is set by callers (onContinue, refresh prompt) — don't clear here
    this.hideAllButtons();
    this.sidebar.clearHandDisplay();
    this.sidebar.updateData({ milesBase: 0, mult: 0 });

    // Check if we need a refresh prompt (available dice < rollSize)
    const prompt = this.gameState.getRefreshPrompt();
    if (prompt) {
      this.showRefreshPrompt(prompt);
      return;
    }

    this.enterDrawPhaseLayout();
  }

  /** Show the actual SELECT phase UI (called after refresh prompt is resolved or not needed) */
  private enterDrawPhaseLayout(): void {
    this.destroyRefreshOverlay();

    const { height } = this.scale;
    this.playAreaY = height * UI.ROLL_Y_RATIO;
    this.availableY = height * UI.HAND_Y_RATIO;

    const hand = this.gameState.state.hand;

    // Ensure forced dice are in selectedHandIds
    for (const id of this.forcedDiceIds) {
      this.selectedHandIds.add(id);
    }

    // Separate selected (in play area) from available (in stacks)
    const selectedDice: Die[] = [];
    const availableDice: Die[] = [];
    for (const die of hand) {
      if (this.selectedHandIds.has(die.id)) {
        selectedDice.push(die);
      } else {
        availableDice.push(die);
      }
    }

    // Place selected dice in play area
    for (const die of selectedDice) {
      const sprite = new DiceSprite(this, this.contentCX, this.playAreaY, die);
      sprite.setDepth(20);
      if (this.forcedDiceIds.has(die.id)) {
        sprite.setForced(true);
      }
      this.setupPlayAreaSprite(sprite);
      this.playAreaSprites.push(sprite);
    }

    // Group available dice by visual identity
    const groups = new Map<string, Die[]>();
    for (const die of availableDice) {
      const key = this.getDiceGroupKey(die);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(die);
    }

    // Create stacks
    this.availableStacks = [];
    for (const [key, dice] of groups) {
      const countText = this.add
        .text(0, this.availableY + 44, '', {
          fontFamily: FONTS.PRIMARY,
          fontSize: '14px',
          color: TEXT_COLORS.SECONDARY,
        })
        .setOrigin(0.5)
        .setDepth(15);

      const stack: DiceStackData = { key, dice: [...dice], sprites: [], countText, addBtn: null, targetX: 0 };
      this.availableStacks.push(stack);
    }

    // Layout and render
    this.layoutStacks();
    this.renderAllStacks();
    this.repositionPlayArea(false);

    // Show roll button
    this.readyBtn.setVisible(true);
    this.updateDrawButtons();

    const remaining = hand.length;
    const spent = this.gameState.state.spent.length;
    const required = Math.min(this.maxSelectForRoll, remaining);
    this.instructionText.setText(`Select ${required} dice to roll (${spent} dice spent, ${remaining} available)`);

    this.updateHUD();
  }

  private enterRollPhase(): void {
    this.clearSprites();
    this.lockedDiceIds.clear();
    this.hideAllButtons();

    // Create sprites for rolled dice
    const rolled = this.gameState.state.rolledDice;
    this.rollSprites = this.createDiceRow(rolled, this.scale.height * UI.ROLL_Y_RATIO);
    this.createLockIcons();

    // Play roll animation
    this.animating = true;
    playRollAnimation(this, this.rollSprites, rolled, () => {
      this.animating = false;
      this.sortAndRepositionDice();
      this.setupRollSpriteInteraction();

      this.rerollBtn.setVisible(true);
      this.scoreBtn.setVisible(true);
      this.showSortButtons();
      this.updateRollButtons();

      this.instructionText.setText('Lock dice you want to keep, then re-roll the rest');
    });

    this.updateHUD();
  }

  /** Shared: wire up click handlers on roll sprites (click to lock/unlock, drag to reorder) */
  private setupRollSpriteInteraction(): void {
    for (let i = 0; i < this.rollSprites.length; i++) {
      const sprite = this.rollSprites[i];
      this.input.setDraggable(sprite);

      sprite.on('pointerdown', () => {
        this.wasDragging = false;
      });

      sprite.on('pointerup', () => {
        if (this.wasDragging || this.animating) return;

        // Consumable targeting mode takes over click behavior
        if (this.consumableTargeting) {
          this.onConsumableTargetClick(sprite);
          return;
        }

        const id = sprite.dieData.id;
        const lockIdx = this.rollSprites.indexOf(sprite);
        const lockIcon = this.lockIcons[lockIdx];
        if (this.lockedDiceIds.has(id)) {
          this.lockedDiceIds.delete(id);
          sprite.setSelected(false);
          if (lockIcon) lockIcon.setVisible(false);
          this.sound.play('sfx_card_slide2', { volume: 0.25 });
        } else {
          this.lockedDiceIds.add(id);
          sprite.setSelected(true);
          if (lockIcon) lockIcon.setVisible(true);
          this.sound.play('sfx_highlight1', { volume: 0.3 });
        }
        this.updateRollButtons();
      });
    }
  }

  /** Create lock icons below each roll sprite (hidden initially) */
  private createLockIcons(): void {
    this.clearLockIcons();
    for (const sprite of this.rollSprites) {
      const lockIcon = this.add
        .text(sprite.x, sprite.y + 46, '🔒', {
          fontSize: '14px',
        })
        .setOrigin(0.5)
        .setDepth(11)
        .setVisible(false);
      this.lockIcons.push(lockIcon);
    }
  }

  /** Destroy all lock icons */
  private clearLockIcons(): void {
    for (const icon of this.lockIcons) icon.destroy();
    this.lockIcons = [];
  }

  /** Layout-only version for resize: shows rolled dice without replaying animation */
  private enterRollPhaseLayout(): void {
    this.clearSprites();
    this.lockedDiceIds.clear();
    this.hideAllButtons();

    const rolled = this.gameState.state.rolledDice;
    this.rollSprites = this.createDiceRow(rolled, this.scale.height * UI.ROLL_Y_RATIO);
    this.createLockIcons();
    this.setupRollSpriteInteraction();

    this.rerollBtn.setVisible(true);
    this.scoreBtn.setVisible(true);
    this.showSortButtons();
    this.sortAndRepositionDice();
    this.updateRollButtons();

    this.instructionText.setText('Lock dice you want to keep, then re-roll the rest');
    this.updateHUD();
  }

  private enterScorePhase(result: ScoreResult): void {
    this.hideAllButtons();
    this.clearLockIcons();

    // Show hand name and level in sidebar
    const player = getPlayerState();
    const handType = result.handResult.type as HandType;
    const stats = player.getHandStats(handType);
    this.sidebar.updateData({
      title: 'SCORING',
      handName: result.handResult.name,
      handLevel: stats.level,
    });

    // Store round score before this hand for the animation
    const roundScoreBefore = this.gameState.state.totalMiles - result.miles;
    result.roundScoreBefore = roundScoreBefore;
    result.rerollsRemaining = this.gameState.state.rerollsRemaining;

    // Play sequential scoring animation
    this.animating = true;
    playScoreAnimation({
      scene: this,
      diceSprites: this.rollSprites,
      result,
      sidebar: this.sidebar,
      equipBar: this.equipBar,
      consumableBar: this.consumableBar,
      equipment: player.equipment,
      lockedDiceIds: new Set(this.lockedDiceIds),
      contentCX: this.contentCX,
      onComplete: () => {
        this.animating = false;
        this.instructionText.setText('');

        // Auto-advance: clear hand display and go to next day/win/lose
        this.sidebar.clearHandDisplay();
        this.time.delayedCall(600, () => {
          this.onContinue();
        });
      },
    });
  }

  // ─── Player Actions ───

  private onReadyToRoll(): void {
    console.log('[DEBUG] onReadyToRoll called, animating:', this.animating);
    if (this.animating) { console.log('[DEBUG] BLOCKED by animating flag'); return; }
    const ids = [...this.selectedHandIds];
    const required = Math.min(this.maxSelectForRoll, this.gameState.state.hand.length);
    console.log('[DEBUG] selectedHandIds:', ids.length, 'required:', required, 'ids:', ids);

    if (ids.length !== required) {
      console.log('[DEBUG] BLOCKED: ids.length !== required');
      this.instructionText.setText(`Select exactly ${required} dice to roll`);
      return;
    }

    const success = this.gameState.selectForRoll(ids);
    console.log('[DEBUG] selectForRoll result:', success);
    if (success) {
      this.enterRollPhase();
    }
  }

  private onRoll(): void {
    // Not used in current flow — roll happens on selectForRoll
  }

  private onReroll(): void {
    if (this.animating) return;

    // Re-roll all dice that are NOT locked
    const allIds = this.gameState.state.rolledDice.map((d) => d.id);
    const idsToReroll = allIds.filter((id) => !this.lockedDiceIds.has(id));
    if (idsToReroll.length === 0) return;

    const success = this.gameState.reroll(idsToReroll);
    if (success) {
      this.animating = true;
      const rerolledSprites = this.rollSprites.filter((s) => idsToReroll.includes(s.dieData.id));
      const rolled = this.gameState.state.rolledDice;

      playRollAnimation(
        this,
        rerolledSprites,
        rerolledSprites.map((s) => {
          return rolled.find((d) => d.id === s.dieData.id)!;
        }),
        () => {
          this.animating = false;
          for (const sprite of this.rollSprites) {
            const updated = rolled.find((d) => d.id === sprite.dieData.id);
            if (updated) sprite.setDieData(updated);
          }
          this.sortAndRepositionDice();
          this.updateRollButtons();
        },
      );

      this.updateHUD();
    }
  }

  private onScore(): void {
    if (this.animating) return;
    const ids = this.gameState.state.rolledDice.filter((d) => this.lockedDiceIds.has(d.id)).map((d) => d.id);
    if (ids.length === 0) return;

    const success = this.gameState.selectForScore(ids);
    if (!success) return;

    const result = this.gameState.calculateScore();
    if (result) {
      this.enterScorePhase(result);
    }
  }

  private onContinue(): void {
    if (this.animating) return;

    // Compute unscored dice IDs before endDay clears state
    const scoredIds = new Set(this.gameState.state.selectedForScore.map((d) => d.id));
    const unscoredIds = this.gameState.state.selectedForRoll.filter((d) => !scoredIds.has(d.id)).map((d) => d.id);

    // Gold dice held in hand earn $3 each (before payout so interest sees updated balance)
    const goldHeldCount = this.gameState.state.selectedForRoll.filter(
      (d) => !scoredIds.has(d.id) && d.enhancement === 'gold',
    ).length;

    const outcome = this.gameState.endDay();

    if (outcome === 'won') {
      this.sound.play('sfx_win', { volume: 0.6 });
      const player = getPlayerState();
      if (goldHeldCount > 0) player.economy.earn(goldHeldCount * 3);
      const daysRemaining = this.gameState.config.maxDays - this.gameState.state.day;
      const rerollsRemaining = this.gameState.state.rerollsRemaining;
      this.scene.start('Payout', {
        totalMiles: this.gameState.state.totalMiles,
        targetMiles: this.gameState.config.targetMiles,
        daysRemaining,
        rerollsRemaining,
        leg: player.leg,
        round: player.round,
        isVictory: player.isBossRound && player.leg === GAMEPLAY.LEGS,
      });
    } else if (outcome === 'lost') {
      this.sound.play('sfx_negative', { volume: 0.5 });
      const player = getPlayerState();
      this.scene.start('GameOver', {
        won: false,
        victory: false,
        totalMiles: this.gameState.state.totalMiles,
        targetMiles: this.gameState.config.targetMiles,
        leg: player.leg,
        round: player.round,
      });
    } else {
      // Next day — force unscored dice to be selected
      this.forcedDiceIds = new Set(unscoredIds);
      this.enterDrawPhase();
    }
  }

  // ─── Helpers ───

  private createDiceRow(dice: Die[], y: number): DiceSprite[] {
    const sprites: DiceSprite[] = [];
    const totalWidth = (dice.length - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;

    for (let i = 0; i < dice.length; i++) {
      const arc = this.getArcOffset(i, dice.length);
      const sprite = new DiceSprite(this, startX + i * DICE_SPACING, y + arc.y, dice[i]);
      sprite.rotation = arc.rotation;
      sprite.setDepth(10);
      sprites.push(sprite);
    }
    return sprites;
  }

  private clearSprites(): void {
    for (const s of this.handSprites) s.destroy();
    for (const s of this.rollSprites) s.destroy();
    for (const stack of this.availableStacks) {
      for (const s of stack.sprites) s.destroy();
      stack.countText.destroy();
      if (stack.addBtn) stack.addBtn.destroy();
    }
    for (const s of this.playAreaSprites) s.destroy();
    this.clearLockIcons();
    this.handSprites = [];
    this.rollSprites = [];
    this.availableStacks = [];
    this.playAreaSprites = [];
  }

  private hideAllButtons(): void {
    this.readyBtn.setVisible(false);
    this.rollBtn.setVisible(false);
    this.rerollBtn.setVisible(false);
    this.scoreBtn.setVisible(false);
    this.continueBtn.setVisible(false);
    this.sortAscBtn.setVisible(false);
    this.sortDescBtn.setVisible(false);
  }

  private updateDrawButtons(): void {
    const selCount = this.selectedHandIds.size;
    const required = Math.min(this.maxSelectForRoll, this.gameState.state.hand.length);
    console.log('[DEBUG] updateDrawButtons: selCount:', selCount, 'required:', required, 'handLength:', this.gameState.state.hand.length, 'animating:', this.animating);

    if (selCount === required) {
      this.readyBtn.setText(`Roll ${selCount} Dice`);
      this.readyBtn.setEnabled(true);
    } else if (selCount > required) {
      this.readyBtn.setText(`Too Many (max ${required})`);
      this.readyBtn.setEnabled(false);
    } else {
      this.readyBtn.setText(`${selCount}/${required} Dice Selected`);
      this.readyBtn.setEnabled(false);
    }

    // Refresh add buttons on all stacks
    this.refreshAllAddButtons();
  }

  private updateRollButtons(): void {
    const lockedCount = this.lockedDiceIds.size;
    const totalCount = this.gameState.state.rolledDice.length;
    const rerollCount = totalCount - lockedCount;
    const hasRerolls = this.gameState.state.rerollsRemaining > 0;

    this.rerollBtn.setEnabled(rerollCount > 0 && hasRerolls);
    this.rerollBtn.setText(
      hasRerolls
        ? lockedCount === 0
          ? `Re-roll All (${this.gameState.state.rerollsRemaining} remaining)`
          : `Re-roll ${rerollCount} (${this.gameState.state.rerollsRemaining} remaining)`
        : 'No Re-rolls',
    );

    this.scoreBtn.setEnabled(lockedCount > 0);
    this.scoreBtn.setText(lockedCount > 0 ? `Score ${lockedCount} Dice` : 'Lock Dice to Score');
  }

  /** Sort roll sprites by die value and reposition them with lock icons */
  private sortAndRepositionDice(): void {
    const cmp =
      this.sortOrder === 'asc'
        ? (a: DiceSprite, b: DiceSprite) => a.dieData.value - b.dieData.value
        : (a: DiceSprite, b: DiceSprite) => b.dieData.value - a.dieData.value;
    this.rollSprites.sort(cmp);

    const rollY = this.scale.height * UI.ROLL_Y_RATIO;
    const totalWidth = (this.rollSprites.length - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;
    for (let i = 0; i < this.rollSprites.length; i++) {
      const sprite = this.rollSprites[i];
      const arc = this.getArcOffset(i, this.rollSprites.length);
      const targetX = startX + i * DICE_SPACING;
      const targetY = rollY + arc.y;

      this.tweens.add({
        targets: sprite,
        x: targetX,
        y: targetY,
        rotation: arc.rotation,
        duration: 250,
        ease: 'Power2',
      });

      // Animate lock icon position
      if (this.lockIcons[i]) {
        this.tweens.add({
          targets: this.lockIcons[i],
          x: targetX,
          y: targetY + 46,
          duration: 250,
          ease: 'Power2',
        });
        this.lockIcons[i].setVisible(this.lockedDiceIds.has(sprite.dieData.id));
      }
    }
  }

  private setSortOrder(order: 'asc' | 'desc'): void {
    this.sortOrder = order;
    this.sortAndRepositionDice();
    this.updateSortButtonStyles();
  }

  private showSortButtons(): void {
    this.sortAscBtn.setVisible(true);
    this.sortDescBtn.setVisible(true);
    this.updateSortButtonStyles();
  }

  private updateSortButtonStyles(): void {
    this.sortAscBtn.setEnabled(this.sortOrder !== 'asc');
    this.sortDescBtn.setEnabled(this.sortOrder !== 'desc');
  }

  private updateHUD(): void {
    const s = this.gameState.state;
    const player = getPlayerState();
    const boss = player.currentBoss;
    this.sidebar.updateData({
      title: boss
        ? boss.name
        : s.phase === 'SELECT'
          ? 'SELECT DICE'
          : s.phase === 'ROLL'
            ? 'ROLL PHASE'
            : s.phase === 'SCORE'
              ? 'SCORING'
              : s.phase === 'DAY_END'
                ? 'DAY COMPLETE'
                : 'GAME',
      roundScore: s.totalMiles,
      milesBase: 0,
      mult: 0,
      daysRemaining: this.gameState.config.maxDays - s.day + 1,
      maxDays: this.gameState.config.maxDays,
      rerolls: s.rerollsRemaining,
      maxRerolls: this.gameState.config.maxRerolls,
      leg: player.leg,
      totalLegs: GAMEPLAY.LEGS,
      round: player.round,
      totalRounds: GAMEPLAY.ROUNDS_PER_LEG,
      targetMiles: this.gameState.config.targetMiles,
    });
    if (this.dicePouch) this.dicePouch.refresh();
    if (this.equipBar) {
      this.equipBar.refresh();
      this.equipBar.updateHints(this.gameState, player);
    }
  }

  // ─── Refresh Prompt ───

  private showRefreshPrompt(prompt: {
    availableCount: number;
    refreshCost: number;
    canAfford: boolean;
    freeIfUsed: boolean;
  }): void {
    this.destroyRefreshOverlay();
    const { width, height } = this.scale;

    this.refreshOverlay = this.add.container(0, 0).setDepth(100);

    // Dim background (content area only)
    const dimBg = this.add.graphics();
    dimBg.fillStyle(0x000000, 0.6);
    dimBg.fillRect(this.sidebarW, 0, width - this.sidebarW, height);
    this.refreshOverlay.add(dimBg);

    // Panel
    const panelW = 440;
    const panelH = 200;
    const cx = this.contentCX;
    const panelX = cx - panelW / 2;
    const panelY = height / 2 - panelH / 2;
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.BG_PANEL, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
    panel.lineStyle(2, COLORS.PANEL_BORDER, 1);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 12);
    this.refreshOverlay.add(panel);

    // Title
    const title = this.add
      .text(cx, panelY + 30, 'Not Enough Dice!', {
        fontFamily: FONTS.HEADING,
        fontSize: '22px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5);
    this.refreshOverlay.add(title);

    // Description
    const desc = this.add
      .text(
        cx,
        panelY + 60,
        `You only have ${prompt.availableCount} dice available (need ${this.gameState.config.rollSize})`,
        {
          fontFamily: FONTS.PRIMARY,
          fontSize: '14px',
          color: TEXT_COLORS.SECONDARY,
          align: 'center',
        },
      )
      .setOrigin(0.5);
    this.refreshOverlay.add(desc);

    // Option 1: Use remaining and refresh for free
    if (prompt.freeIfUsed) {
      const freeBtn = new Button(
        this,
        cx,
        panelY + 110,
        `Use remaining ${prompt.availableCount} dice & refresh for free`,
        380,
        40,
      ).onClick(() => {
        const player = getPlayerState();
        const remainingIds = player.availableDice.map((d) => d.id);
        this.gameState.useRemainingAndRefresh();
        // Keep any existing forced dice and add remaining pre-refresh dice
        for (const id of remainingIds) this.forcedDiceIds.add(id);
        this.destroyRefreshOverlay();
        this.enterDrawPhaseLayout();
      });
      freeBtn.setDepth(101);
      this.refreshOverlay.add(freeBtn);
    }

    // Option 2: Pay to refresh now
    const costLabel = prompt.refreshCost === 0 ? 'Refresh for free' : `Spend $${prompt.refreshCost} to refresh now`;
    const payBtn = new Button(this, cx, panelY + 160, costLabel, 380, 40).onClick(() => {
      const success = this.gameState.refreshSpentDice();
      if (success) {
        this.destroyRefreshOverlay();
        this.enterDrawPhase();
      }
    });
    payBtn.setEnabled(prompt.canAfford);
    payBtn.setDepth(101);
    this.refreshOverlay.add(payBtn);

    this.updateHUD();
  }

  private destroyRefreshOverlay(): void {
    if (this.refreshOverlay) {
      this.refreshOverlay.destroy();
      this.refreshOverlay = null;
    }
  }

  // ─── Dice Stacking & Play Area ───

  /** Generate a grouping key for dice with the same properties (ignoring current face value) */
  private getDiceGroupKey(die: Die): string {
    return `${die.enhancement || ''}|${die.aura || ''}|${die.sticker || ''}|${die.isGrimy}`;
  }

  /** Calculate target X positions for all non-empty stacks */
  private layoutStacks(): void {
    const visibleStacks = this.availableStacks.filter((s) => s.dice.length > 0);
    const spacing = DICE_SPACING + 16;
    const totalWidth = Math.max(0, visibleStacks.length - 1) * spacing;
    const startX = this.contentCX - totalWidth / 2;

    for (let i = 0; i < visibleStacks.length; i++) {
      visibleStacks[i].targetX = startX + i * spacing;
    }
  }

  /** Render all stacks at their target positions */
  private renderAllStacks(): void {
    for (const stack of this.availableStacks) {
      this.renderStack(stack);
    }
  }

  /** Render a single stack's sprites at its targetX */
  private renderStack(stack: DiceStackData): void {
    // Destroy old sprites
    for (const s of stack.sprites) s.destroy();
    stack.sprites = [];

    if (stack.dice.length === 0) {
      stack.countText.setVisible(false);
      return;
    }

    const maxVisible = Math.min(stack.dice.length, 3);
    const representativeDie = stack.dice[0]; // All visually identical

    // Stacking offsets for depth effect
    const rotations = maxVisible === 1 ? [0] : maxVisible === 2 ? [-0.07, 0.03] : [-0.07, 0.04, -0.01];
    const yOffsets = maxVisible === 1 ? [0] : maxVisible === 2 ? [5, 0] : [8, 4, 0];
    const xOffsets = maxVisible === 1 ? [0] : maxVisible === 2 ? [-2, 0] : [-3, 1, 0];

    for (let i = 0; i < maxVisible; i++) {
      const sprite = new DiceSprite(
        this,
        stack.targetX + xOffsets[i],
        this.availableY + yOffsets[i],
        representativeDie,
      );
      sprite.setRotation(rotations[i]);
      sprite.setDepth(10 + i);

      if (i < maxVisible - 1) {
        sprite.disableInteractive();
        sprite.setAlpha(0.55 + i * 0.15);
      }

      stack.sprites.push(sprite);
    }

    // Wire click on top sprite
    const topSprite = stack.sprites[stack.sprites.length - 1];
    topSprite.on('pointerdown', () => this.onStackDiceClick(stack));

    // Update count text
    stack.countText.setText(`\u00d7${stack.dice.length}`);
    stack.countText.setX(stack.targetX);
    stack.countText.setY(this.availableY + 44);
    stack.countText.setVisible(stack.dice.length > 1);

    // Add "Add X" button below the stack
    if (stack.addBtn) {
      stack.addBtn.destroy();
      stack.addBtn = null;
    }
    const remaining = this.maxSelectForRoll - this.selectedHandIds.size;
    if (remaining > 0 && stack.dice.length > 0) {
      const addCount = Math.min(remaining, stack.dice.length);
      stack.addBtn = new Button(
        this,
        stack.targetX,
        this.availableY + (stack.dice.length > 1 ? 72 : 56),
        `Add ${addCount}`,
        72,
        28,
      );
      stack.addBtn.setDepth(15);
      // Smaller font for this button
      (stack.addBtn as any).label?.setFontSize?.(13);
      stack.addBtn.onClick(() => this.onAddAllClick(stack));
    }
  }

  /** Animate all stacks' existing sprites to their targetX positions */
  private animateStacksToTargets(): void {
    for (const stack of this.availableStacks) {
      if (stack.dice.length === 0 || stack.sprites.length === 0) continue;
      const topSprite = stack.sprites[stack.sprites.length - 1];
      const deltaX = stack.targetX - topSprite.x;
      for (const sprite of stack.sprites) {
        this.tweens.add({
          targets: sprite,
          x: sprite.x + deltaX,
          duration: 200,
          ease: 'Power2',
        });
      }
      this.tweens.add({
        targets: stack.countText,
        x: stack.targetX,
        duration: 200,
        ease: 'Power2',
      });
      if (stack.addBtn) {
        this.tweens.add({
          targets: stack.addBtn,
          x: stack.targetX,
          duration: 200,
          ease: 'Power2',
        });
      }
    }
  }

  /** Calculate X positions for dice in the play area */
  private getPlayAreaXPositions(count: number): number[] {
    if (count === 0) return [];
    const totalWidth = (count - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;
    return Array.from({ length: count }, (_, i) => startX + i * DICE_SPACING);
  }

  /** Reposition play area sprites */
  private repositionPlayArea(animated: boolean): void {
    const positions = this.getPlayAreaXPositions(this.playAreaSprites.length);
    for (let i = 0; i < this.playAreaSprites.length; i++) {
      const arc = this.getArcOffset(i, this.playAreaSprites.length);
      if (animated) {
        this.tweens.add({
          targets: this.playAreaSprites[i],
          x: positions[i],
          y: this.playAreaY + arc.y,
          rotation: arc.rotation,
          duration: 200,
          ease: 'Power2',
        });
      } else {
        this.playAreaSprites[i].setPosition(positions[i], this.playAreaY + arc.y);
        this.playAreaSprites[i].rotation = arc.rotation;
      }
    }
  }

  /** Handle clicking a stack to send a die to the play area */
  private onStackDiceClick(stack: DiceStackData): void {
    console.log('[DEBUG] onStackDiceClick: animating:', this.animating, 'selectedCount:', this.selectedHandIds.size, 'stackKey:', stack.key, 'stackDice:', stack.dice.length);
    if (this.animating) { console.log('[DEBUG] BLOCKED by animating flag'); return; }
    if (this.selectedHandIds.size >= this.maxSelectForRoll) { console.log('[DEBUG] BLOCKED: max selected'); return; }

    // Sound
    this.sound.play('sfx_card_slide1', { volume: 0.4 });

    // Pop a die from the stack
    const die = stack.dice.pop()!;
    this.selectedHandIds.add(die.id);

    // Get position of top sprite before refresh
    const topSprite = stack.sprites[stack.sprites.length - 1];
    const fromX = topSprite.x;
    const fromY = topSprite.y;

    // Refresh stack visuals at current position
    this.renderStack(stack);

    // If stack is now empty, recalculate and animate remaining stacks
    if (stack.dice.length === 0) {
      this.layoutStacks();
      this.animateStacksToTargets();
    }

    // Create play area sprite at stack position
    const newSprite = new DiceSprite(this, fromX, fromY, die);
    newSprite.setDepth(20);
    this.playAreaSprites.push(newSprite);
    this.setupPlayAreaSprite(newSprite);

    // Calculate target positions
    const positions = this.getPlayAreaXPositions(this.playAreaSprites.length);
    const targetIdx = this.playAreaSprites.length - 1;

    // Animate new sprite to play area
    this.animating = true;
    const newArc = this.getArcOffset(targetIdx, this.playAreaSprites.length);
    this.tweens.add({
      targets: newSprite,
      x: positions[targetIdx],
      y: this.playAreaY + newArc.y,
      rotation: newArc.rotation,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.animating = false;
      },
    });

    // Reposition existing play area sprites to accommodate
    for (let i = 0; i < this.playAreaSprites.length - 1; i++) {
      const arc = this.getArcOffset(i, this.playAreaSprites.length);
      this.tweens.add({
        targets: this.playAreaSprites[i],
        x: positions[i],
        y: this.playAreaY + arc.y,
        rotation: arc.rotation,
        duration: 200,
        ease: 'Power2',
      });
    }

    this.updateDrawButtons();
  }

  /** Handle clicking "Add X" to send multiple dice from a stack to the play area */
  private onAddAllClick(stack: DiceStackData): void {
    if (this.animating) return;
    const remaining = this.maxSelectForRoll - this.selectedHandIds.size;
    if (remaining <= 0) return;

    const addCount = Math.min(remaining, stack.dice.length);
    if (addCount === 0) return;

    // Pop dice from stack
    const diceToAdd = stack.dice.splice(stack.dice.length - addCount, addCount);
    for (const die of diceToAdd) {
      this.selectedHandIds.add(die.id);
    }

    // Get position of top sprite before refresh
    const fromX = stack.targetX;
    const fromY = this.availableY;

    // Refresh stack visuals
    this.renderStack(stack);
    if (stack.dice.length === 0) {
      this.layoutStacks();
      this.animateStacksToTargets();
    }

    // Create play area sprites and animate them
    this.animating = true;
    let completed = 0;
    const total = diceToAdd.length;

    for (let i = 0; i < diceToAdd.length; i++) {
      const die = diceToAdd[i];
      const newSprite = new DiceSprite(this, fromX, fromY, die);
      newSprite.setDepth(20);
      this.playAreaSprites.push(newSprite);
      this.setupPlayAreaSprite(newSprite);
    }

    // Animate all to final positions
    const positions = this.getPlayAreaXPositions(this.playAreaSprites.length);
    for (let i = 0; i < this.playAreaSprites.length; i++) {
      const sprite = this.playAreaSprites[i];
      const arc = this.getArcOffset(i, this.playAreaSprites.length);
      this.tweens.add({
        targets: sprite,
        x: positions[i],
        y: this.playAreaY + arc.y,
        rotation: arc.rotation,
        duration: 300,
        ease: 'Back.easeOut',
        delay: i >= this.playAreaSprites.length - total ? (i - (this.playAreaSprites.length - total)) * 40 : 0,
        onComplete: () => {
          completed++;
          if (completed >= this.playAreaSprites.length) {
            this.animating = false;
          }
        },
      });
    }

    this.updateDrawButtons();
  }

  /** Refresh the add buttons on all stacks to reflect current remaining slots */
  private refreshAllAddButtons(): void {
    for (const stack of this.availableStacks) {
      if (stack.addBtn) {
        stack.addBtn.destroy();
        stack.addBtn = null;
      }
      const remaining = this.maxSelectForRoll - this.selectedHandIds.size;
      if (remaining > 0 && stack.dice.length > 0) {
        const addCount = Math.min(remaining, stack.dice.length);
        stack.addBtn = new Button(
          this,
          stack.targetX,
          this.availableY + (stack.dice.length > 1 ? 72 : 56),
          `Add ${addCount}`,
          72,
          28,
        );
        stack.addBtn.setDepth(15);
        stack.addBtn.onClick(() => this.onAddAllClick(stack));
      }
    }
  }

  /** Handle clicking a die in the play area to send it back to a stack */
  private onPlayAreaDiceClick(sprite: DiceSprite): void {
    console.log('[DEBUG] onPlayAreaDiceClick: animating:', this.animating, 'dieId:', sprite.dieData.id);
    if (this.animating) { console.log('[DEBUG] BLOCKED by animating flag'); return; }
    const die = sprite.dieData;

    // Can't remove forced dice
    if (this.forcedDiceIds.has(die.id)) return;

    // Sound
    this.sound.play('sfx_card_slide2', { volume: 0.35 });

    // Remove from play area
    const idx = this.playAreaSprites.indexOf(sprite);
    if (idx === -1) return;
    this.playAreaSprites.splice(idx, 1);
    this.selectedHandIds.delete(die.id);

    // Find or create the matching stack
    const key = this.getDiceGroupKey(die);
    let stack = this.availableStacks.find((s) => s.key === key);

    if (!stack) {
      const countText = this.add
        .text(0, this.availableY + 44, '', {
          fontFamily: FONTS.PRIMARY,
          fontSize: '14px',
          color: TEXT_COLORS.SECONDARY,
        })
        .setOrigin(0.5)
        .setDepth(15);
      stack = { key, dice: [], sprites: [], countText, addBtn: null, targetX: 0 };
      this.availableStacks.push(stack);
    }

    // Push die back to stack
    stack.dice.push(die);

    // Recalculate stack positions
    this.layoutStacks();

    // Animate sprite to stack target
    this.animating = true;
    const targetStack = stack;
    this.tweens.add({
      targets: sprite,
      x: targetStack.targetX,
      y: this.availableY,
      rotation: 0,
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        sprite.destroy();
        this.renderStack(targetStack);
        this.animating = false;
      },
    });

    // Animate other stacks to new positions
    this.animateStacksToTargets();

    // Reposition play area
    const positions = this.getPlayAreaXPositions(this.playAreaSprites.length);
    for (let i = 0; i < this.playAreaSprites.length; i++) {
      const arc = this.getArcOffset(i, this.playAreaSprites.length);
      this.tweens.add({
        targets: this.playAreaSprites[i],
        x: positions[i],
        y: this.playAreaY + arc.y,
        rotation: arc.rotation,
        duration: 200,
        ease: 'Power2',
      });
    }

    this.updateDrawButtons();
  }

  // ─── Drag-to-Reorder (Play Area) ───

  /** Get the active draggable sprite list (play area in SELECT, roll sprites in ROLL) */
  private getDraggableList(): DiceSprite[] | null {
    if (this.playAreaSprites.length > 0 && this.gameState.state.phase === 'SELECT') return this.playAreaSprites;
    if (this.rollSprites.length > 0) return this.rollSprites;
    return null;
  }

  /** Get the row Y and position calculator for the active draggable list */
  private getDraggableRowY(): number {
    const phase = this.gameState.state.phase;
    if (phase === 'SELECT') return this.playAreaY;
    return this.scale.height * UI.ROLL_Y_RATIO;
  }

  /** Get X positions for a row of count dice */
  private getRowXPositions(count: number): number[] {
    if (count === 0) return [];
    const totalWidth = (count - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;
    return Array.from({ length: count }, (_, i) => startX + i * DICE_SPACING);
  }

  /** Get Balatro-style arc Y offset and rotation for a die at index i in a row of count */
  private getArcOffset(i: number, count: number): { y: number; rotation: number } {
    if (count <= 1) return { y: 0, rotation: 0 };
    const t = i / (count - 1) - 0.5; // -0.5 to 0.5
    const y = -UI.DICE_ARC_HEIGHT * (1 - 4 * t * t); // negative = up, parabola peak at center
    const rotation = t * UI.DICE_ARC_ROTATION * 2; // fan out from center
    return { y, rotation };
  }

  private setupDragHandlers(): void {
    this.input.dragDistanceThreshold = 8;

    this.input.on('dragstart', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (this.animating) return;
      const sprite = gameObject as DiceSprite;
      const list = this.getDraggableList();
      if (!list || list.indexOf(sprite) === -1) return;

      this.draggingSprite = sprite;
      this.wasDragging = true;
      this.dragOffsetX = pointer.worldX - sprite.x;
      this.dragOffsetY = pointer.worldY - sprite.y;
      this.dragPrevX = pointer.worldX;
      this.dragVelocityX = 0;

      // Hide tooltip during drag
      sprite.emit('pointerout');
      DiceSprite.suppressTooltips = true;

      sprite.setDepth(30);
      sprite.scaleX = 1.1;
      sprite.scaleY = 1.1;
    });

    this.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!this.draggingSprite || gameObject !== this.draggingSprite) return;
      const list = this.getDraggableList();
      if (!list) return;

      // Track velocity for momentum swing
      const dx = pointer.worldX - this.dragPrevX;
      this.dragVelocityX = this.dragVelocityX * ANIM.CARD_DRAG_SWING_DAMPING + dx * (1 - ANIM.CARD_DRAG_SWING_DAMPING);
      this.dragPrevX = pointer.worldX;

      // Apply swing rotation
      const swing = Phaser.Math.Clamp(
        this.dragVelocityX * ANIM.CARD_DRAG_SWING_FACTOR,
        -ANIM.CARD_DRAG_SWING_MAX,
        ANIM.CARD_DRAG_SWING_MAX,
      );
      this.draggingSprite.rotation = swing;

      // Follow pointer with offset
      this.draggingSprite.x = pointer.worldX - this.dragOffsetX;
      this.draggingSprite.y = pointer.worldY - this.dragOffsetY + ANIM.CARD_DRAG_LIFT_Y;

      // Calculate which slot the dragged sprite should occupy
      const positions = this.getRowXPositions(list.length);
      let newIndex = 0;
      let minDist = Infinity;
      for (let i = 0; i < positions.length; i++) {
        const dist = Math.abs(this.draggingSprite.x - positions[i]);
        if (dist < minDist) {
          minDist = dist;
          newIndex = i;
        }
      }

      const currentIndex = list.indexOf(this.draggingSprite);
      if (newIndex !== currentIndex) {
        list.splice(currentIndex, 1);
        list.splice(newIndex, 0, this.draggingSprite);

        // Animate non-dragged sprites to their new slots
        const rowY = this.getDraggableRowY();
        for (let i = 0; i < list.length; i++) {
          if (list[i] === this.draggingSprite) continue;
          const arc = this.getArcOffset(i, list.length);
          this.tweens.add({
            targets: list[i],
            x: positions[i],
            y: rowY + arc.y,
            rotation: arc.rotation,
            duration: 150,
            ease: 'Power2',
          });
        }

        // Move lock icons with roll sprites
        if (list === this.rollSprites) {
          this.repositionLockIcons(positions);
        }
      }
    });

    this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!this.draggingSprite || gameObject !== this.draggingSprite) return;
      const list = this.getDraggableList();
      if (!list) return;

      const sprite = this.draggingSprite;
      const finalVelocity = this.dragVelocityX;
      sprite.setDepth(list === this.rollSprites ? 10 : 20);
      this.draggingSprite = null;
      this.dragVelocityX = 0;
      DiceSprite.suppressTooltips = false;

      // Spring settle with overshoot like equipment cards
      const positions = this.getRowXPositions(list.length);
      const idx = list.indexOf(sprite);
      const rowY = this.getDraggableRowY();
      const arc = this.getArcOffset(idx, list.length);

      const overshoot = Phaser.Math.Clamp(
        finalVelocity * ANIM.CARD_DRAG_SWING_FACTOR * 2,
        -ANIM.CARD_DRAG_SWING_MAX,
        ANIM.CARD_DRAG_SWING_MAX,
      );
      const dur = ANIM.CARD_DRAG_SETTLE_DURATION;

      this.tweens.chain({
        targets: sprite,
        tweens: [
          {
            x: positions[idx],
            y: rowY + arc.y,
            rotation: overshoot + arc.rotation,
            scaleX: 1,
            scaleY: 1,
            duration: dur * 0.3,
            ease: 'Sine.easeOut',
          },
          {
            rotation: -overshoot * 0.4 + arc.rotation,
            duration: dur * 0.25,
            ease: 'Sine.easeInOut',
          },
          {
            rotation: overshoot * 0.1 + arc.rotation,
            duration: dur * 0.2,
            ease: 'Sine.easeInOut',
          },
          {
            rotation: arc.rotation,
            duration: dur * 0.25,
            ease: 'Sine.easeIn',
          },
        ],
      });

      if (list === this.rollSprites) {
        this.repositionLockIcons(positions);
        // Sync game state order to match visual drag order so held-in-hand scoring respects it
        this.gameState.state.rolledDice = this.rollSprites.map((s) => s.dieData);
      }
    });
  }

  /** Reposition lock icons to match current rollSprites order */
  private repositionLockIcons(positions: number[]): void {
    // Rebuild lock icons to match the new sprite order
    const lockStates = this.rollSprites.map((s) => this.lockedDiceIds.has(s.dieData.id));
    const rollY = this.scale.height * UI.ROLL_Y_RATIO;
    for (let i = 0; i < this.lockIcons.length; i++) {
      const icon = this.lockIcons[i];
      if (i < positions.length) {
        const arc = this.getArcOffset(i, this.rollSprites.length);
        this.tweens.add({
          targets: icon,
          x: positions[i],
          y: rollY + arc.y + 46,
          duration: 150,
          ease: 'Power2',
        });
        icon.setVisible(lockStates[i]);
      }
    }
  }

  /** Wire up a play area sprite for drag-to-reorder and click-to-remove */
  private setupPlayAreaSprite(sprite: DiceSprite): void {
    this.input.setDraggable(sprite);

    sprite.on('pointerdown', () => {
      this.wasDragging = false;
    });

    sprite.on('pointerup', () => {
      if (this.wasDragging) return;

      // Consumable targeting mode takes over click behavior
      if (this.consumableTargeting) {
        this.onConsumableTargetClick(sprite);
        return;
      }

      this.onPlayAreaDiceClick(sprite);
    });
  }

  private handleConsumableUsed(consumed: ConsumableInstance): void {
    const player = getPlayerState();
    const result = executeConsumableEffect(consumed, player);

    this.sidebar.refreshMoney();
    this.equipBar.refresh();
    this.consumableBar.refresh();
    this.dicePouch.refresh();

    if (!result.success && result.failReason) {
      const text = this.add
        .text(this.contentCX, this.consumableBar.y, result.failReason, {
          fontFamily: 'sans-serif',
          fontSize: '24px',
          color: '#fff',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(1000);
      this.sound.play('sfx_cancel', { volume: 0.5 });
      this.tweens.add({
        targets: text,
        y: text.y - 15,
        alpha: 0,
        duration: 2000,
        ease: 'Power2',
        onComplete: () => text.destroy(),
      });
    }

    if (result.diceSelection) {
      this.enterConsumableTargeting(result.diceSelection);
    }
  }

  // ─── Consumable Targeting Mode ───
  // When a consumable with diceSelection is used, we enter a targeting mode
  // where the player selects dice from the visible roll/play area to apply the effect.

  private enterConsumableTargeting(config: DiceSelectionConfig): void {
    this.consumableTargeting = config;
    this.consumableTargetIds = new Set();

    // Save current state so we can restore
    this.savedInstructionText = this.instructionText.text;
    this.savedLockedDiceIds = new Set(this.lockedDiceIds);

    // Clear existing lock selections — we repurpose selection for targeting
    this.lockedDiceIds.clear();
    for (let i = 0; i < this.rollSprites.length; i++) {
      this.rollSprites[i].setSelected(false);
      if (this.lockIcons[i]) this.lockIcons[i].setVisible(false);
    }

    // Hide normal game buttons
    this.hideAllButtons();

    // Show targeting UI
    const btnY = this.scale.height - 30;

    // For BUMP_VALUE, show two confirm buttons (+1 / -1)
    if (config.effectType === 'BUMP_VALUE') {
      this.consumableConfirmBtn = new Button(this, this.contentCX - 70, btnY, '+1 Up', 120, 40);
      this.consumableConfirmBtn.setEnabled(false);
      this.consumableConfirmBtn.onClick(() => {
        config.effectParams.bumpDirection = 'up';
        this.applyConsumableTargeting();
      });

      this.consumableCancelBtn = new Button(this, this.contentCX + 70, btnY, '-1 Down', 120, 40);
      this.consumableCancelBtn.onClick(() => {
        config.effectParams.bumpDirection = 'down';
        this.applyConsumableTargeting();
      });
      (this.consumableCancelBtn as Button).setEnabled(false);
    } else {
      this.consumableConfirmBtn = new Button(this, this.contentCX - 80, btnY, 'Apply', 140, 40);
      this.consumableConfirmBtn.setEnabled(false);
      this.consumableConfirmBtn.onClick(() => this.applyConsumableTargeting());

      this.consumableCancelBtn = new Button(this, this.contentCX + 80, btnY, 'Cancel', 120, 40);
      this.consumableCancelBtn.onClick(() => this.cancelConsumableTargeting());
    }

    this.updateConsumableTargetingText();
  }

  /** Get the dice sprites currently visible for targeting */
  private getTargetableDice(): { sprites: DiceSprite[]; dice: Die[] } {
    const phase = this.gameState.state.phase;
    if (phase === 'ROLL' && this.rollSprites.length > 0) {
      return {
        sprites: this.rollSprites,
        dice: this.gameState.state.rolledDice,
      };
    }
    if (phase === 'SELECT' && this.playAreaSprites.length > 0) {
      return {
        sprites: this.playAreaSprites,
        dice: this.playAreaSprites.map((s) => s.dieData),
      };
    }
    // Fallback — roll sprites if available
    if (this.rollSprites.length > 0) {
      return {
        sprites: this.rollSprites,
        dice: this.gameState.state.rolledDice,
      };
    }
    return { sprites: [], dice: [] };
  }

  /** Called when a die is clicked during consumable targeting mode */
  private onConsumableTargetClick(sprite: DiceSprite): void {
    if (!this.consumableTargeting) return;
    const id = sprite.dieData.id;
    const required = this.consumableTargeting.pickCount;

    if (this.consumableTargetIds.has(id)) {
      // Deselect
      this.consumableTargetIds.delete(id);
      sprite.setSelected(false);
      this.sound.play('sfx_card_slide2', { volume: 0.25 });
    } else if (this.consumableTargetIds.size < required) {
      // Select
      this.consumableTargetIds.add(id);
      sprite.setSelected(true);
      this.sound.play('sfx_highlight1', { volume: 0.3 });
    }

    const enough = this.consumableTargetIds.size === required;
    if (this.consumableConfirmBtn) this.consumableConfirmBtn.setEnabled(enough);
    // For BUMP_VALUE, the cancel button is actually the -1 Down button
    if (this.consumableTargeting.effectType === 'BUMP_VALUE' && this.consumableCancelBtn) {
      (this.consumableCancelBtn as Button).setEnabled(enough);
    }
    this.updateConsumableTargetingText();
  }

  private updateConsumableTargetingText(): void {
    if (!this.consumableTargeting) return;
    const required = this.consumableTargeting.pickCount;
    const selected = this.consumableTargetIds.size;
    const remaining = required - selected;
    const name = this.consumableTargeting.cardName || 'Effect';
    if (remaining > 0) {
      this.instructionText.setText(`${name}: Select ${remaining} more dice`);
    } else {
      this.instructionText.setText(`${name}: Ready! Click Apply`);
    }
  }

  private applyConsumableTargeting(): void {
    if (!this.consumableTargeting) return;
    const required = this.consumableTargeting.pickCount;
    if (this.consumableTargetIds.size !== required) return;

    // Get the actual dice objects from the targetable set
    const { dice } = this.getTargetableDice();
    const selectedDice = dice.filter((d) => this.consumableTargetIds.has(d.id));

    // Apply the effect
    const resultMsg = applyDiceSelectionEffect(this.consumableTargeting, selectedDice);

    // Save affected IDs before exit clears them
    const affectedIds = new Set(this.consumableTargetIds);

    // Show result feedback
    const text = this.add
      .text(this.contentCX, this.scale.height * UI.ROLL_Y_RATIO - 60, resultMsg, {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: '#66ff66',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1000);
    this.tweens.add({
      targets: text,
      y: text.y - 30,
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });

    this.exitConsumableTargeting();

    // Refresh dice visuals — update only affected sprites to reflect changes
    this.refreshDiceSpritesAfterEffect(affectedIds);
  }

  private cancelConsumableTargeting(): void {
    this.exitConsumableTargeting();
  }

  private exitConsumableTargeting(): void {
    // Cleanup targeting UI
    if (this.consumableConfirmBtn) {
      this.consumableConfirmBtn.destroy();
      this.consumableConfirmBtn = null;
    }
    if (this.consumableCancelBtn) {
      this.consumableCancelBtn.destroy();
      this.consumableCancelBtn = null;
    }

    // Clear targeting selections
    const { sprites } = this.getTargetableDice();
    for (const s of sprites) {
      s.setSelected(false);
    }

    this.consumableTargeting = null;
    this.consumableTargetIds.clear();

    // Restore saved state
    this.lockedDiceIds = new Set(this.savedLockedDiceIds);
    this.instructionText.setText(this.savedInstructionText);

    // Restore lock icon visuals and selected state
    for (let i = 0; i < this.rollSprites.length; i++) {
      const id = this.rollSprites[i].dieData.id;
      const isLocked = this.lockedDiceIds.has(id);
      this.rollSprites[i].setSelected(isLocked);
      if (this.lockIcons[i]) this.lockIcons[i].setVisible(isLocked);
    }

    // Restore game buttons for current phase
    const phase = this.gameState.state.phase;
    if (phase === 'ROLL') {
      this.rerollBtn.setVisible(true);
      this.scoreBtn.setVisible(true);
      this.showSortButtons();
      this.updateRollButtons();
    } else if (phase === 'SELECT') {
      this.readyBtn.setVisible(true);
      this.updateDrawButtons();
    }

    // Refresh UI
    this.sidebar.refreshMoney();
    this.equipBar.refresh();
    this.consumableBar.refresh();
    this.dicePouch.refresh();
  }

  /** Refresh dice sprites in-place after a consumable effect changes dice data */
  private refreshDiceSpritesAfterEffect(affectedIds: Set<string>): void {
    const player = getPlayerState();

    // Update roll sprites if in ROLL phase — only update affected dice
    for (const sprite of this.rollSprites) {
      if (!affectedIds.has(sprite.dieData.id)) continue;
      const updated = player.dice.find((d) => d.id === sprite.dieData.id);
      if (updated) {
        // Preserve rolled value for non-value effects; for BUMP_VALUE, use the new value from player.dice
        sprite.setDieData({ ...sprite.dieData, ...updated, value: updated.value });
      }
    }

    // Update rolledDice in game state to match — only affected dice
    for (let i = 0; i < this.gameState.state.rolledDice.length; i++) {
      const rd = this.gameState.state.rolledDice[i];
      if (!affectedIds.has(rd.id)) continue;
      const updated = player.dice.find((d) => d.id === rd.id);
      if (updated) {
        this.gameState.state.rolledDice[i] = { ...rd, ...updated, value: updated.value };
      }
    }

    // Update play area sprites if in SELECT phase
    for (const sprite of this.playAreaSprites) {
      if (!affectedIds.has(sprite.dieData.id)) continue;
      const updated = player.dice.find((d) => d.id === sprite.dieData.id);
      if (updated) {
        sprite.setDieData({ ...sprite.dieData, ...updated, value: updated.value });
      }
    }

    this.dicePouch.refresh();
  }
}
