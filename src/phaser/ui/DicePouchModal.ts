// ─── DicePouchModal ───
// Full-screen modal showing all dice in player's collection.
// Filter toggles: All / Available / Spent

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { getPlayerState } from '../../game/PlayerState';
import { DiceSprite } from './DiceSprite';
import { Button } from './Button';

type FilterMode = 'all' | 'available' | 'spent';

export class DicePouchModal extends GameObjects.Container {
  private diceSprites: DiceSprite[] = [];
  private filterMode: FilterMode = 'all';
  private filterBtns: Button[] = [];
  private diceContainer: GameObjects.Container;

  constructor(scene: Scene, contentX: number, width: number, height: number) {
    super(scene, 0, 0);

    // Dim background (full screen)
    const dim = scene.add.graphics();
    dim.fillStyle(0x000000, UI.MODAL_DIM_ALPHA);
    dim.fillRect(0, 0, scene.scale.width, height);
    dim.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, scene.scale.width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    this.add(dim);

    // Modal panel
    const panelW = Math.min(width - 40, 700);
    const panelH = Math.min(height - 80, 500);
    const panelX = contentX + (width - panelW) / 2;
    const panelY = (height - panelH) / 2;

    const panel = scene.add.graphics();
    panel.fillStyle(UI.MODAL_BG, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    panel.lineStyle(2, UI.MODAL_BORDER, 1);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    this.add(panel);

    // Title
    const title = scene.add.text(panelX + panelW / 2, panelY + 24, 'Dice Pouch', {
      fontFamily: FONTS.HEADING,
      fontSize: '24px',
      color: TEXT_COLORS.GOLD,
    }).setOrigin(0.5);
    this.add(title);

    // Filter buttons
    const filterY = panelY + 56;
    const filterLabels: { label: string; mode: FilterMode }[] = [
      { label: 'All', mode: 'all' },
      { label: 'Available', mode: 'available' },
      { label: 'Spent', mode: 'spent' },
    ];
    const filterBtnW = 100;
    const filterGap = 8;
    const totalFilterW = filterLabels.length * filterBtnW + (filterLabels.length - 1) * filterGap;
    const filterStartX = panelX + panelW / 2 - totalFilterW / 2 + filterBtnW / 2;

    for (let i = 0; i < filterLabels.length; i++) {
      const { label, mode } = filterLabels[i];
      const btn = new Button(scene, filterStartX + i * (filterBtnW + filterGap), filterY, label, filterBtnW, 28);
      btn.onClick(() => {
        this.filterMode = mode;
        this.updateFilterButtons();
        this.renderDice(panelX, panelY + 80, panelW, panelH - 120);
      });
      this.add(btn);
      this.filterBtns.push(btn);
    }

    // Close button
    const closeBtn = new Button(scene, panelX + panelW / 2, panelY + panelH - 30, 'Close', 120, 34);
    closeBtn.onClick(() => this.destroy());
    this.add(closeBtn);

    // Dice container
    this.diceContainer = scene.add.container(0, 0);
    this.add(this.diceContainer);

    this.updateFilterButtons();
    this.renderDice(panelX, panelY + 80, panelW, panelH - 120);

    this.setDepth(500);
    scene.add.existing(this);
  }

  private updateFilterButtons(): void {
    const modes: FilterMode[] = ['all', 'available', 'spent'];
    for (let i = 0; i < this.filterBtns.length; i++) {
      // Visual feedback: active filter gets different look
      this.filterBtns[i].setEnabled(modes[i] !== this.filterMode);
    }
  }

  private renderDice(panelX: number, startY: number, panelW: number, availH: number): void {
    // Clear old
    for (const s of this.diceSprites) s.destroy();
    this.diceSprites = [];
    this.diceContainer.removeAll(true);

    const player = getPlayerState();
    const spentIds = player.spentDiceIds;

    let dice = player.dice;
    if (this.filterMode === 'available') {
      dice = player.availableDice;
    } else if (this.filterMode === 'spent') {
      dice = player.spentDice;
    }

    if (dice.length === 0) {
      const emptyText = this.scene.add.text(panelX + panelW / 2, startY + availH / 2, 'No dice', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '16px',
        color: TEXT_COLORS.DISABLED,
      }).setOrigin(0.5);
      this.diceContainer.add(emptyText);
      return;
    }

    const spacing = 76;
    const cols = Math.max(1, Math.floor((panelW - 40) / spacing));
    const totalW = (Math.min(dice.length, cols) - 1) * spacing;
    const gridStartX = panelX + panelW / 2 - totalW / 2;

    for (let i = 0; i < dice.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridStartX + col * spacing;
      const y = startY + 32 + row * spacing;

      const sprite = new DiceSprite(this.scene, x, y, dice[i]);
      const isSpent = spentIds.has(dice[i].id);

      // In "all" mode, dim spent dice
      if (this.filterMode === 'all' && isSpent) {
        sprite.setAlpha(0.4);
      }

      this.diceContainer.add(sprite);
      this.diceSprites.push(sprite);
    }

    // Count text
    const countText = this.scene.add.text(panelX + panelW / 2, startY + 8, `${dice.length} dice`, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '12px',
      color: TEXT_COLORS.MUTED,
    }).setOrigin(0.5);
    this.diceContainer.add(countText);
  }
}
