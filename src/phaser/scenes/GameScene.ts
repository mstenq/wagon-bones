// ─── GameScene ───
// Main round scene. Creates a GameState instance, subscribes to state changes,
// renders DRAW/ROLL/SCORE phases, dispatches player actions.

import { Scene } from 'phaser';
import { EventBus } from '../../game/EventBus';
import { GameState } from '../../game/GameState';
import { Die, ScoreResult } from '../../game/types';
import { getPlayerState } from '../../game/PlayerState';
import { DiceSprite } from '../ui/DiceSprite';
import { Button } from '../ui/Button';
import { HUD } from '../ui/HUD';
import { HandDisplay } from '../ui/HandDisplay';
import { ItemCard } from '../ui/ItemCard';
import { playRollAnimation } from '../animations/RollAnimation';
import { playScoreAnimation } from '../animations/ScoreAnimation';

const HAND_Y_RATIO = 0.65;   // y position of dice in hand (proportion of height)
const ROLL_Y_RATIO = 0.46;   // y position of dice during roll/score
const DICE_SPACING = 80;
const MAX_SELECT_FOR_ROLL = 5;

export class GameScene extends Scene {
  private gameState: GameState;
  private hud: HUD;
  private handDisplay: HandDisplay;
  private scoreMilesText: Phaser.GameObjects.Text;

  // Dice sprites
  private handSprites: DiceSprite[] = [];
  private rollSprites: DiceSprite[] = [];

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

  // Equipment display
  private equipmentContainer: Phaser.GameObjects.Container;

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

    // Game table felt area
    const felt = this.add.graphics();
    felt.fillStyle(0x2a4a2a, 0.4);
    felt.fillRoundedRect(40, 70, width - 80, height - 140, 16);

    // HUD
    this.hud = new HUD(this);

    // Hand display (for score results)
    this.handDisplay = new HandDisplay(this, width / 2, height * 0.26);

    // Score miles floating text
    this.scoreMilesText = this.add.text(width / 2, height * 0.36, '', {
      fontFamily: 'Arial Black',
      fontSize: '36px',
      color: '#44ff44',
      align: 'center',
    }).setOrigin(0.5).setVisible(false).setDepth(50);

    // Instruction text
    this.instructionText = this.add.text(width / 2, height * 0.86, '', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#cccccc',
      align: 'center',
    }).setOrigin(0.5).setDepth(50);

    // Create buttons (all hidden initially)
    const btnY = height * 0.94;
    this.readyBtn = new Button(this, width / 2, btnY, 'Roll Selected', 200, 40).onClick(() => this.onReadyToRoll());
    this.rollBtn = new Button(this, width / 2, btnY, 'Roll!', 160, 40).onClick(() => this.onRoll());
    this.rerollBtn = new Button(this, width * 0.35, btnY, 'Re-roll All', 180, 40).onClick(() => this.onReroll());
    this.scoreBtn = new Button(this, width * 0.65, btnY, 'Score Hand', 160, 40).onClick(() => this.onScore());
    this.continueBtn = new Button(this, width / 2, btnY, 'Continue', 160, 40).onClick(() => this.onContinue());

    this.hideAllButtons();

    // Equipment display
    this.buildEquipmentDisplay();

    // Re-enter current phase
    this.enterCurrentPhase();

    EventBus.emit('current-scene-ready', this);
  }

  private enterCurrentPhase(): void {
    const phase = this.gameState.state.phase;
    if (phase === 'SELECT') {
      this.enterDrawPhase();
    } else if (phase === 'ROLL') {
      this.enterRollPhaseLayout();
    } else if (phase === 'SCORE' || phase === 'DAY_END') {
      this.enterRollPhaseLayout();
      // Show continue button on DAY_END
      if (phase === 'DAY_END') {
        this.continueBtn.setVisible(true);
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
    this.handDisplay.hide();
    this.scoreMilesText.setVisible(false);

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

    // Create dice sprites for hand
    const hand = this.gameState.state.hand;
    this.handSprites = this.createDiceRow(hand, this.scale.height * HAND_Y_RATIO);

    // Pre-select forced dice
    for (const sprite of this.handSprites) {
      if (this.forcedDiceIds.has(sprite.dieData.id)) {
        this.selectedHandIds.add(sprite.dieData.id);
        sprite.setForced(true);
      }
    }

    // Enable selection on hand sprites
    for (const sprite of this.handSprites) {
      sprite.on('pointerdown', () => {
        if (this.animating) return;
        const id = sprite.dieData.id;
        // Don't allow deselecting forced dice
        if (this.forcedDiceIds.has(id)) return;
        if (this.selectedHandIds.has(id)) {
          this.selectedHandIds.delete(id);
          sprite.setSelected(false);
        } else {
          if (this.selectedHandIds.size >= MAX_SELECT_FOR_ROLL) return;
          this.selectedHandIds.add(id);
          sprite.setSelected(true);
        }
        this.updateDrawButtons();
      });
    }

    // Show roll button
    this.readyBtn.setVisible(true);
    this.updateDrawButtons();

    const remaining = this.gameState.state.hand.length;
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
    this.rollSprites = this.createDiceRow(rolled, this.scale.height * ROLL_Y_RATIO);
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

  /** Shared: wire up click handlers on roll sprites (click to lock/unlock) */
  private setupRollSpriteInteraction(): void {
    for (let i = 0; i < this.rollSprites.length; i++) {
      const sprite = this.rollSprites[i];
      const lockIcon = this.lockIcons[i];
      sprite.on('pointerdown', () => {
        if (this.animating) return;
        const id = sprite.dieData.id;
        if (this.lockedDiceIds.has(id)) {
          this.lockedDiceIds.delete(id);
          sprite.setSelected(false);
          if (lockIcon) lockIcon.setVisible(false);
        } else {
          this.lockedDiceIds.add(id);
          sprite.setSelected(true);
          if (lockIcon) lockIcon.setVisible(true);
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
    this.rollSprites = this.createDiceRow(rolled, this.scale.height * ROLL_Y_RATIO);
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

    // Show hand display
    this.handDisplay.showResult(result);

    // Play score animation
    this.animating = true;
    playScoreAnimation(this, this.rollSprites, result, this.scoreMilesText, () => {
      this.animating = false;

      // Show final miles
      this.scoreMilesText.setText(`+${result.miles} miles`);
      this.scoreMilesText.setVisible(true);

      // Show continue button
      this.continueBtn.setVisible(true);

      this.instructionText.setText('');
      this.updateHUD();
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
      this.scene.start('GameOver', {
        won: true,
        totalMiles: this.gameState.state.totalMiles,
        targetMiles: this.gameState.config.targetMiles,
      });
    } else if (outcome === 'lost') {
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
    const startX = this.scale.width / 2 - totalWidth / 2;

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
    this.clearLockIcons();
    this.handSprites = [];
    this.rollSprites = [];
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
    this.hud.update({
      day: s.day,
      maxDays: this.gameState.config.maxDays,
      rerolls: s.rerollsRemaining,
      miles: s.totalMiles,
      targetMiles: this.gameState.config.targetMiles,
      phase: s.phase,
      diceRemaining: s.hand.length,
      diceSpent: s.spent.length,
    });
  }

  // ─── Refresh Prompt ───

  private showRefreshPrompt(prompt: { availableCount: number; refreshCost: number; canAfford: boolean; freeIfUsed: boolean }): void {
    this.destroyRefreshOverlay();
    const { width, height } = this.scale;

    this.refreshOverlay = this.add.container(0, 0).setDepth(100);

    // Dim background
    const dimBg = this.add.graphics();
    dimBg.fillStyle(0x000000, 0.6);
    dimBg.fillRect(0, 0, width, height);
    this.refreshOverlay.add(dimBg);

    // Panel
    const panelW = 440;
    const panelH = 200;
    const panelX = width / 2 - panelW / 2;
    const panelY = height / 2 - panelH / 2;
    const panel = this.add.graphics();
    panel.fillStyle(0x1e1e3a, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
    panel.lineStyle(2, 0x6666aa, 1);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 12);
    this.refreshOverlay.add(panel);

    // Title
    const title = this.add.text(width / 2, panelY + 30, 'Not Enough Dice!', {
      fontFamily: 'Arial Black',
      fontSize: '22px',
      color: '#ffcc44',
      align: 'center',
    }).setOrigin(0.5);
    this.refreshOverlay.add(title);

    // Description
    const desc = this.add.text(width / 2, panelY + 60, `You only have ${prompt.availableCount} dice available (need ${this.gameState.config.rollSize})`, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#cccccc',
      align: 'center',
    }).setOrigin(0.5);
    this.refreshOverlay.add(desc);

    // Option 1: Use remaining and refresh for free
    if (prompt.freeIfUsed) {
      const freeBtn = new Button(this, width / 2, panelY + 110, `Use remaining ${prompt.availableCount} dice & refresh for free`, 380, 40)
        .onClick(() => {
          // Capture the IDs of remaining dice before refresh
          const player = getPlayerState();
          const remainingIds = player.availableDice.map(d => d.id);
          // Refresh the pool (marks remaining as spent, auto-clears since all spent)
          this.gameState.useRemainingAndRefresh();
          // Force-select those dice in the now-full hand
          this.forcedDiceIds = new Set(remainingIds);
          this.destroyRefreshOverlay();
          this.enterDrawPhaseLayout();
        });
      freeBtn.setDepth(101);
      this.refreshOverlay.add(freeBtn);
    }

    // Option 2: Pay to refresh now
    const costLabel = prompt.refreshCost === 0 ? 'Refresh for free' : `Spend $${prompt.refreshCost} to refresh now`;
    const payBtn = new Button(this, width / 2, panelY + 160, costLabel, 380, 40)
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

  // ─── Equipment Display ───

  private buildEquipmentDisplay(): void {
    const { width, height } = this.scale;
    const player = getPlayerState();
    const equipment = player.equipment;

    this.equipmentContainer = this.add.container(0, 0).setDepth(90);

    if (equipment.length === 0) return;

    const COMPACT_SPACING = 78;
    const totalWidth = (equipment.length - 1) * COMPACT_SPACING;
    const startX = width / 2 - totalWidth / 2;
    const y = height * 0.12;

    // Label
    const label = this.add.text(width / 2, y - 50, 'Equipment', {
      fontFamily: 'Arial',
      fontSize: '12px',
      color: '#888888',
    }).setOrigin(0.5, 1);
    this.equipmentContainer.add(label);

    for (let i = 0; i < equipment.length; i++) {
      const equip = equipment[i];
      const x = startX + i * COMPACT_SPACING;

      const card = new ItemCard(this, x, y, equip.def, {
        mode: 'compact',
        cardScale: 0.6,
      });
      this.equipmentContainer.add(card);
    }
  }
}
