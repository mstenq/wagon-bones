// ─── GameScene ───
// Main round scene. Creates a GameState instance, subscribes to state changes,
// renders DRAW/ROLL/SCORE phases, dispatches player actions.
// Balatro-inspired layout: sidebar left, equipment top, dice center, pouch bottom-right.

import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { GameState } from '../../game/GameState';
import { Die, ScoreResult, HandType } from '../../game/types';
import { getPlayerState } from '../../game/PlayerState';
import { COLORS, TEXT_COLORS, FONTS, UI, GAMEPLAY } from '../../game/Constants';
import { DiceSprite } from '../ui/DiceSprite';
import { Button } from '../ui/Button';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import { DicePouch } from '../ui/DicePouch';
import { DicePouchModal } from '../ui/DicePouchModal';
import { JourneyInfoModal } from '../ui/JourneyInfoModal';
import { OptionsModal } from '../ui/OptionsModal';
import { playRollAnimation } from '../animations/RollAnimation';
import { playScoreAnimation } from '../animations/ScoreAnimation';

const DICE_SPACING = UI.DICE_SPACING;
const MAX_SELECT_FOR_ROLL = GAMEPLAY.ROLL_SIZE;

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
  private dicePouch: DicePouch;

  // Layout helpers
  private contentX: number = 0;
  private contentW: number = 0;
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

  // Animation lock
  private animating: boolean = false;

  // Drag-to-reorder (play area)
  private draggingSprite: DiceSprite | null = null;
  private wasDragging: boolean = false;

  // Refresh prompt overlay
  private refreshOverlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Game');
  }

  create() {
    // Initialize game state only on first create (not on relayout)
    if (!this.gameState) {
      this.gameState = new GameState();
      this.gameState.startRound();
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
    const { width, height } = this.scale;

    // Background image (cover/fill - no stretching)
    const bg = this.add.image(width / 2, height / 2, 'bg_1');
    const scaleX = width / bg.width;
    const scaleY = height / bg.height;
    const scale = Math.max(scaleX, scaleY);
    bg.setScale(scale);

    // ─── Sidebar ───
    this.sidebarW = Math.floor(width * UI.SIDEBAR_WIDTH_RATIO);
    this.sidebar = new Sidebar(this, this.sidebarW, height);
    this.sidebar.setJourneyInfoCallback(() => {
      new JourneyInfoModal(this, this.sidebarW, width - this.sidebarW, height);
    });
    this.sidebar.setOptionsCallback(() => {
      new OptionsModal(this, this.sidebarW, width - this.sidebarW, height);
    });

    // Content area metrics
    this.contentX = this.sidebarW + UI.FELT_PADDING;
    this.contentW = width - this.sidebarW - UI.FELT_PADDING * 2;
    this.contentCX = this.sidebarW + (width - this.sidebarW) / 2;

    // Game table felt area (right of sidebar)
    const felt = this.add.graphics();
    felt.fillStyle(COLORS.BG_FELT, UI.FELT_ALPHA);
    felt.fillRoundedRect(this.sidebarW, 0, width - this.sidebarW, height, 0);

    // ─── Equipment bar (top) ───
    const equipBarH = UI.EQUIP_BAR_HEIGHT;
    this.equipBar = new EquipmentBar(this, this.contentX, 8, this.contentW, equipBarH);

    // Instruction text
    this.instructionText = this.add.text(this.contentCX, height - 60, '', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '16px',
      color: TEXT_COLORS.SECONDARY,
      align: 'center',
    }).setOrigin(0.5).setDepth(50);

    // Create buttons (all hidden initially)
    const btnY = height - 30;
    this.readyBtn = new Button(this, this.contentCX, btnY, 'Roll Selected', 200, 40).onClick(() => this.onReadyToRoll());
    this.rollBtn = new Button(this, this.contentCX, btnY, 'Roll!', 160, 40).onClick(() => this.onRoll());
    this.rerollBtn = new Button(this, this.contentCX - 110, btnY, 'Re-roll All', 180, 40).onClick(() => this.onReroll());
    this.scoreBtn = new Button(this, this.contentCX + 110, btnY, 'Score Hand', 160, 40).onClick(() => this.onScore());
    this.continueBtn = new Button(this, this.contentCX, btnY, 'Continue', 160, 40).onClick(() => this.onContinue());

    this.hideAllButtons();

    // ─── Dice Pouch (bottom-right) ───
    this.dicePouch = new DicePouch(this, width - UI.POUCH_MARGIN - UI.POUCH_SIZE, height - UI.POUCH_MARGIN - UI.POUCH_SIZE);
    this.dicePouch.setClickCallback(() => {
      new DicePouchModal(this, this.sidebarW, width - this.sidebarW, height);
    });

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
    this.forcedDiceIds.clear();
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
      const countText = this.add.text(0, this.availableY + 44, '', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '14px',
        color: TEXT_COLORS.SECONDARY,
      }).setOrigin(0.5).setDepth(15);

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
    this.instructionText.setText(
      `Select up to ${MAX_SELECT_FOR_ROLL} dice to roll (${spent} dice spent, ${remaining} available)`
    );

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
      this.setupRollSpriteInteraction();

      this.rerollBtn.setVisible(true);
      this.scoreBtn.setVisible(true);
      this.updateRollButtons();

      this.instructionText.setText(
        'Lock dice you want to keep, then re-roll the rest'
      );
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
      const lockIcon = this.add.text(sprite.x, sprite.y + 46, '🔒', {
        fontSize: '14px',
      }).setOrigin(0.5).setDepth(11).setVisible(false);
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
    this.updateRollButtons();

    this.instructionText.setText(
      'Lock dice you want to keep, then re-roll the rest'
    );
    this.updateHUD();
  }

  private enterScorePhase(result: ScoreResult): void {
    this.hideAllButtons();

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
    (result as any)._roundScoreBefore = roundScoreBefore;
    (result as any)._rerollsRemaining = this.gameState.state.rerollsRemaining;

    // Play sequential scoring animation
    this.animating = true;
    playScoreAnimation({
      scene: this,
      diceSprites: this.rollSprites,
      result,
      sidebar: this.sidebar,
      equipBar: this.equipBar,
      equipment: player.equipment,
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
    if (this.animating) return;
    let ids = [...this.selectedHandIds];

    // If no dice selected, auto-select first 5
    if (ids.length === 0) {
      ids = this.gameState.state.hand.slice(0, MAX_SELECT_FOR_ROLL).map(d => d.id);
    }

    if (ids.length > MAX_SELECT_FOR_ROLL) {
      this.instructionText.setText(`Select at most ${MAX_SELECT_FOR_ROLL} dice to roll`);
      return;
    }

    const success = this.gameState.selectForRoll(ids);
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
    const allIds = this.gameState.state.rolledDice.map(d => d.id);
    const idsToReroll = allIds.filter(id => !this.lockedDiceIds.has(id));
    if (idsToReroll.length === 0) return;

    const success = this.gameState.reroll(idsToReroll);
    if (success) {
      this.animating = true;
      const rerolledSprites = this.rollSprites.filter(s => idsToReroll.includes(s.dieData.id));
      const rolled = this.gameState.state.rolledDice;

      playRollAnimation(this, rerolledSprites, rerolledSprites.map(s => {
        return rolled.find(d => d.id === s.dieData.id)!;
      }), () => {
        this.animating = false;
        for (const sprite of this.rollSprites) {
          const updated = rolled.find(d => d.id === sprite.dieData.id);
          if (updated) sprite.setDieData(updated);
        }
        this.updateRollButtons();
      });

      this.updateHUD();
    }
  }

  private onScore(): void {
    if (this.animating) return;
    const ids = this.gameState.state.rolledDice.map(d => d.id);

    const success = this.gameState.selectForScore(ids);
    if (!success) return;

    const result = this.gameState.calculateScore();
    if (result) {
      this.enterScorePhase(result);
    }
  }

  private onContinue(): void {
    if (this.animating) return;
    const outcome = this.gameState.endDay();

    if (outcome === 'won') {
      this.sound.play('sfx_win', { volume: 0.6 });
      this.scene.start('GameOver', {
        won: true,
        totalMiles: this.gameState.state.totalMiles,
        targetMiles: this.gameState.config.targetMiles,
      });
    } else if (outcome === 'lost') {
      this.sound.play('sfx_explosion', { volume: 0.5 });
      this.scene.start('GameOver', {
        won: false,
        totalMiles: this.gameState.state.totalMiles,
        targetMiles: this.gameState.config.targetMiles,
      });
    } else {
      // Next day
      this.enterDrawPhase();
    }
  }

  // ─── Helpers ───

  private createDiceRow(dice: Die[], y: number): DiceSprite[] {
    const sprites: DiceSprite[] = [];
    const totalWidth = (dice.length - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;

    for (let i = 0; i < dice.length; i++) {
      const sprite = new DiceSprite(this, startX + i * DICE_SPACING, y, dice[i]);
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
  }

  private updateDrawButtons(): void {
    const selCount = this.selectedHandIds.size;

    // Ready is always available — can auto-select
    this.readyBtn.setEnabled(true);
    if (selCount > 0 && selCount <= MAX_SELECT_FOR_ROLL) {
      this.readyBtn.setText(`Roll ${selCount} Dice`);
    } else if (selCount > MAX_SELECT_FOR_ROLL) {
      this.readyBtn.setText(`Too Many (max ${MAX_SELECT_FOR_ROLL})`);
      this.readyBtn.setEnabled(false);
    } else {
      this.readyBtn.setText('Roll 5 Dice');
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
        ? (lockedCount === 0
          ? `Re-roll All (${this.gameState.state.rerollsRemaining} left)`
          : `Re-roll ${rerollCount} (${this.gameState.state.rerollsRemaining} left)`)
        : 'No Re-rolls'
    );

    this.scoreBtn.setEnabled(true);
    this.scoreBtn.setText('Score Hand');
  }

  private updateHUD(): void {
    const s = this.gameState.state;
    const player = getPlayerState();
    this.sidebar.updateData({
      title: s.phase === 'SELECT' ? 'SELECT DICE' : s.phase === 'ROLL' ? 'ROLL PHASE' : s.phase === 'SCORE' ? 'SCORING' : s.phase === 'DAY_END' ? 'DAY COMPLETE' : 'GAME',
      roundScore: s.totalMiles,
      milesBase: 0,
      mult: 0,
      daysRemaining: this.gameState.config.maxDays - s.day + 1,
      maxDays: this.gameState.config.maxDays,
      rerolls: s.rerollsRemaining,
      maxRerolls: this.gameState.config.maxRerolls,
      leg: player.leg,
      totalLegs: 8,
      targetMiles: this.gameState.config.targetMiles,
    });
    if (this.dicePouch) this.dicePouch.refresh();
    if (this.equipBar) this.equipBar.refresh();
  }

  // ─── Refresh Prompt ───

  private showRefreshPrompt(prompt: { availableCount: number; refreshCost: number; canAfford: boolean; freeIfUsed: boolean }): void {
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
    const title = this.add.text(cx, panelY + 30, 'Not Enough Dice!', {
      fontFamily: FONTS.HEADING,
      fontSize: '22px',
      color: TEXT_COLORS.GOLD,
      align: 'center',
    }).setOrigin(0.5);
    this.refreshOverlay.add(title);

    // Description
    const desc = this.add.text(cx, panelY + 60, `You only have ${prompt.availableCount} dice available (need ${this.gameState.config.rollSize})`, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '14px',
      color: TEXT_COLORS.SECONDARY,
      align: 'center',
    }).setOrigin(0.5);
    this.refreshOverlay.add(desc);

    // Option 1: Use remaining and refresh for free
    if (prompt.freeIfUsed) {
      const freeBtn = new Button(this, cx, panelY + 110, `Use remaining ${prompt.availableCount} dice & refresh for free`, 380, 40)
        .onClick(() => {
          const player = getPlayerState();
          const remainingIds = player.availableDice.map(d => d.id);
          this.gameState.useRemainingAndRefresh();
          this.forcedDiceIds = new Set(remainingIds);
          this.destroyRefreshOverlay();
          this.enterDrawPhaseLayout();
        });
      freeBtn.setDepth(101);
      this.refreshOverlay.add(freeBtn);
    }

    // Option 2: Pay to refresh now
    const costLabel = prompt.refreshCost === 0 ? 'Refresh for free' : `Spend $${prompt.refreshCost} to refresh now`;
    const payBtn = new Button(this, cx, panelY + 160, costLabel, 380, 40)
      .onClick(() => {
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
    const sidePipsKey = die.sidePips ? die.sidePips.join(',') : '';
    return `${die.enhancement || ''}|${die.aura || ''}|${sidePipsKey}|${die.isGrimy}`;
  }

  /** Calculate target X positions for all non-empty stacks */
  private layoutStacks(): void {
    const visibleStacks = this.availableStacks.filter(s => s.dice.length > 0);
    const spacing = DICE_SPACING + 16;
    const totalWidth = Math.max(0, (visibleStacks.length - 1)) * spacing;
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
    const rotations = maxVisible === 1 ? [0]
      : maxVisible === 2 ? [-0.07, 0.03]
      : [-0.07, 0.04, -0.01];
    const yOffsets = maxVisible === 1 ? [0]
      : maxVisible === 2 ? [5, 0]
      : [8, 4, 0];
    const xOffsets = maxVisible === 1 ? [0]
      : maxVisible === 2 ? [-2, 0]
      : [-3, 1, 0];

    for (let i = 0; i < maxVisible; i++) {
      const sprite = new DiceSprite(
        this,
        stack.targetX + xOffsets[i],
        this.availableY + yOffsets[i],
        representativeDie
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
    if (stack.addBtn) { stack.addBtn.destroy(); stack.addBtn = null; }
    const remaining = MAX_SELECT_FOR_ROLL - this.selectedHandIds.size;
    if (remaining > 0 && stack.dice.length > 0) {
      const addCount = Math.min(remaining, stack.dice.length);
      stack.addBtn = new Button(this, stack.targetX, this.availableY + (stack.dice.length > 1 ? 72 : 56), `Add ${addCount}`, 72, 28);
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
      if (animated) {
        this.tweens.add({
          targets: this.playAreaSprites[i],
          x: positions[i],
          y: this.playAreaY,
          duration: 200,
          ease: 'Power2',
        });
      } else {
        this.playAreaSprites[i].setPosition(positions[i], this.playAreaY);
      }
    }
  }

  /** Handle clicking a stack to send a die to the play area */
  private onStackDiceClick(stack: DiceStackData): void {
    if (this.animating) return;
    if (this.selectedHandIds.size >= MAX_SELECT_FOR_ROLL) return;

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
    this.tweens.add({
      targets: newSprite,
      x: positions[targetIdx],
      y: this.playAreaY,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.animating = false;
      }
    });

    // Reposition existing play area sprites to accommodate
    for (let i = 0; i < this.playAreaSprites.length - 1; i++) {
      this.tweens.add({
        targets: this.playAreaSprites[i],
        x: positions[i],
        duration: 200,
        ease: 'Power2',
      });
    }

    this.updateDrawButtons();
  }

  /** Handle clicking "Add X" to send multiple dice from a stack to the play area */
  private onAddAllClick(stack: DiceStackData): void {
    if (this.animating) return;
    const remaining = MAX_SELECT_FOR_ROLL - this.selectedHandIds.size;
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
      this.tweens.add({
        targets: sprite,
        x: positions[i],
        y: this.playAreaY,
        duration: 300,
        ease: 'Back.easeOut',
        delay: i >= this.playAreaSprites.length - total ? (i - (this.playAreaSprites.length - total)) * 40 : 0,
        onComplete: () => {
          completed++;
          if (completed >= this.playAreaSprites.length) {
            this.animating = false;
          }
        }
      });
    }

    this.updateDrawButtons();
  }

  /** Refresh the add buttons on all stacks to reflect current remaining slots */
  private refreshAllAddButtons(): void {
    for (const stack of this.availableStacks) {
      if (stack.addBtn) { stack.addBtn.destroy(); stack.addBtn = null; }
      const remaining = MAX_SELECT_FOR_ROLL - this.selectedHandIds.size;
      if (remaining > 0 && stack.dice.length > 0) {
        const addCount = Math.min(remaining, stack.dice.length);
        stack.addBtn = new Button(this, stack.targetX, this.availableY + (stack.dice.length > 1 ? 72 : 56), `Add ${addCount}`, 72, 28);
        stack.addBtn.setDepth(15);
        stack.addBtn.onClick(() => this.onAddAllClick(stack));
      }
    }
  }

  /** Handle clicking a die in the play area to send it back to a stack */
  private onPlayAreaDiceClick(sprite: DiceSprite): void {
    if (this.animating) return;
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
    let stack = this.availableStacks.find(s => s.key === key);

    if (!stack) {
      const countText = this.add.text(0, this.availableY + 44, '', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '14px',
        color: TEXT_COLORS.SECONDARY,
      }).setOrigin(0.5).setDepth(15);
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
      }
    });

    // Animate other stacks to new positions
    this.animateStacksToTargets();

    // Reposition play area
    const positions = this.getPlayAreaXPositions(this.playAreaSprites.length);
    for (let i = 0; i < this.playAreaSprites.length; i++) {
      this.tweens.add({
        targets: this.playAreaSprites[i],
        x: positions[i],
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

  private setupDragHandlers(): void {
    this.input.dragDistanceThreshold = 8;

    this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (this.animating) return;
      const sprite = gameObject as DiceSprite;
      const list = this.getDraggableList();
      if (!list || list.indexOf(sprite) === -1) return;

      this.draggingSprite = sprite;
      this.wasDragging = true;
      sprite.setDepth(30);
    });

    this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number) => {
      if (!this.draggingSprite || gameObject !== this.draggingSprite) return;
      const list = this.getDraggableList();
      if (!list) return;

      this.draggingSprite.x = dragX;

      // Calculate which slot the dragged sprite should occupy
      const positions = this.getRowXPositions(list.length);
      let newIndex = 0;
      let minDist = Infinity;
      for (let i = 0; i < positions.length; i++) {
        const dist = Math.abs(dragX - positions[i]);
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
        for (let i = 0; i < list.length; i++) {
          if (list[i] === this.draggingSprite) continue;
          this.tweens.add({
            targets: list[i],
            x: positions[i],
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
      sprite.setDepth(list === this.rollSprites ? 10 : 20);
      this.draggingSprite = null;

      // Snap to final position
      const positions = this.getRowXPositions(list.length);
      const idx = list.indexOf(sprite);
      const rowY = this.getDraggableRowY();
      this.tweens.add({
        targets: sprite,
        x: positions[idx],
        y: rowY,
        duration: 150,
        ease: 'Power2',
      });

      if (list === this.rollSprites) {
        this.repositionLockIcons(positions);
      }
    });
  }

  /** Reposition lock icons to match current rollSprites order */
  private repositionLockIcons(positions: number[]): void {
    // Rebuild lock icons to match the new sprite order
    const lockStates = this.rollSprites.map(s => this.lockedDiceIds.has(s.dieData.id));
    for (let i = 0; i < this.lockIcons.length; i++) {
      const icon = this.lockIcons[i];
      if (i < positions.length) {
        this.tweens.add({
          targets: icon,
          x: positions[i],
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
      this.onPlayAreaDiceClick(sprite);
    });
  }

}
