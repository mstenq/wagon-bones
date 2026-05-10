// ─── BoosterPackCard ───
// Displays a booster pack in the shop. Looks like a colorful pack/bag.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { PackInstance } from '../../game/BoosterPackSystem';

const PACK_W = 120;
const PACK_H = 160;
const PACK_RADIUS = 10;

const TIER_LABELS: Record<string, string> = {
  normal: '',
  jumbo: 'JUMBO',
  mega: 'MEGA',
};

const CATEGORY_ICONS: Record<string, string> = {
  dice: '🎲',
  supply: '📦',
  trail_guide: '🗺️',
  frontier: '⚡',
  equipment: '🔧',
};

export class BoosterPackCard extends GameObjects.Container {
  private bg: GameObjects.Graphics;
  private _pack: PackInstance;
  private _sold: boolean = false;
  private costText: GameObjects.Text;
  private soldOverlay: GameObjects.Graphics;

  constructor(scene: Scene, x: number, y: number, pack: PackInstance) {
    super(scene, x, y);
    this._pack = pack;

    const def = pack.def;
    this.bg = scene.add.graphics();
    this.add(this.bg);

    // Tier label (top)
    const tierLabel = TIER_LABELS[def.tier];
    if (tierLabel) {
      const tierText = scene.add.text(0, -PACK_H / 2 + 14, tierLabel, {
        fontFamily: 'Arial Black',
        fontSize: '11px',
        color: '#ffffff',
        align: 'center',
      }).setOrigin(0.5, 0);
      this.add(tierText);
    }

    // Category icon
    const icon = scene.add.text(0, -15, CATEGORY_ICONS[def.category] || '?', {
      fontSize: '28px',
      align: 'center',
    }).setOrigin(0.5);
    this.add(icon);

    // Pack name
    const nameText = scene.add.text(0, 18, def.name, {
      fontFamily: 'Arial',
      fontSize: '12px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: PACK_W - 16 },
    }).setOrigin(0.5, 0);
    this.add(nameText);

    // Pick info
    const pickInfo = `Pick ${def.pickCount} of ${def.totalCards}`;
    const infoText = scene.add.text(0, 48, pickInfo, {
      fontFamily: 'Arial',
      fontSize: '10px',
      color: '#bbbbbb',
      align: 'center',
    }).setOrigin(0.5, 0);
    this.add(infoText);

    // Cost
    this.costText = scene.add.text(0, PACK_H / 2 - 22, `$${def.cost}`, {
      fontFamily: 'Arial Black',
      fontSize: '18px',
      color: '#ffd700',
      align: 'center',
    }).setOrigin(0.5);
    this.add(this.costText);

    // Sold overlay (hidden initially)
    this.soldOverlay = scene.add.graphics();
    this.soldOverlay.setVisible(false);
    this.add(this.soldOverlay);

    this.drawPack();

    this.setSize(PACK_W, PACK_H);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, PACK_W, PACK_H),
      Phaser.Geom.Rectangle.Contains
    );

    scene.add.existing(this);
  }

  get pack(): PackInstance { return this._pack; }
  get sold(): boolean { return this._sold; }

  markSold(): void {
    this._sold = true;
    this.soldOverlay.clear();
    this.soldOverlay.fillStyle(0x000000, 0.6);
    this.soldOverlay.fillRoundedRect(-PACK_W / 2, -PACK_H / 2, PACK_W, PACK_H, PACK_RADIUS);
    this.soldOverlay.setVisible(true);
    this.costText.setText('OPENED');
    this.costText.setColor('#888888');
  }

  setAffordable(canAfford: boolean): void {
    if (this._sold) return;
    this.costText.setColor(canAfford ? '#ffd700' : '#ff4444');
  }

  private drawPack(): void {
    const color = this._pack.def.color;
    this.bg.clear();

    // Pack body
    this.bg.fillStyle(color, 1);
    this.bg.fillRoundedRect(-PACK_W / 2, -PACK_H / 2, PACK_W, PACK_H, PACK_RADIUS);

    // Top tear line
    this.bg.lineStyle(2, 0xffffff, 0.3);
    this.bg.lineBetween(-PACK_W / 2 + 10, -PACK_H / 2 + 30, PACK_W / 2 - 10, -PACK_H / 2 + 30);

    // Border
    this.bg.lineStyle(2, 0xffffff, 0.4);
    this.bg.strokeRoundedRect(-PACK_W / 2, -PACK_H / 2, PACK_W, PACK_H, PACK_RADIUS);
  }
}
