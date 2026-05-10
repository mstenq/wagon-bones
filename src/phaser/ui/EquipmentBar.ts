// ─── EquipmentBar ───
// Top bar in the main content area showing owned equipment cards.
// Balatro-style: always visible across shop and game scenes.

import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { getPlayerState } from '../../game/PlayerState';
import { ItemCard } from './ItemCard';

export class EquipmentBar extends GameObjects.Container {
  private bg: GameObjects.Graphics;
  private cards: ItemCard[] = [];
  private slotCountText: GameObjects.Text;
  private barWidth: number;
  private barHeight: number;

  constructor(scene: Scene, x: number, y: number, width: number, height: number) {
    super(scene, x, y);
    this.barWidth = width;
    this.barHeight = height;

    this.bg = scene.add.graphics();
    this.add(this.bg);

    this.drawBackground();

    // Slot count text (e.g. "3/5")
    this.slotCountText = scene.add.text(width - 8, height - 4, '', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: TEXT_COLORS.MUTED,
    }).setOrigin(1, 1);
    this.add(this.slotCountText);

    this.setDepth(150);
    scene.add.existing(this);

    this.refresh();
  }

  private drawBackground(): void {
    this.bg.clear();
    this.bg.fillStyle(COLORS.BG_PRIMARY, 0.6);
    this.bg.fillRoundedRect(0, 0, this.barWidth, this.barHeight, 8);
    this.bg.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.5);
    this.bg.strokeRoundedRect(0, 0, this.barWidth, this.barHeight, 8);
  }

  refresh(): void {
    // Remove old cards
    for (const card of this.cards) card.destroy();
    this.cards = [];

    const player = getPlayerState();
    const equipment = player.equipment;
    const maxSlots = player.maxEquipmentSlots;

    this.slotCountText.setText(`${equipment.length}/${maxSlots}`);

    if (equipment.length === 0) return;

    const spacing = UI.EQUIP_CARD_SPACING;
    const totalW = (equipment.length - 1) * spacing;
    const startX = this.barWidth / 2 - totalW / 2;
    const cy = this.barHeight / 2;

    for (let i = 0; i < equipment.length; i++) {
      const equip = equipment[i];
      const card = new ItemCard(this.scene, startX + i * spacing, cy, equip.def, {
        mode: 'compact',
        cardScale: UI.EQUIP_CARD_SCALE,
      });
      this.add(card);
      this.cards.push(card);
    }
  }

  /** Get the card containers for animation purposes */
  getCards(): ItemCard[] {
    return this.cards;
  }
}
