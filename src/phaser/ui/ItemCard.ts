// ─── ItemCard ───
// Reusable Phaser Container that displays any game card (equipment, trail guide,
// supply card, frontier encounter, etc.) as a worn card with rounded corners,
// drop shadow, item image, and hover tooltip.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';

/** Generic data shape for any card type */
export interface CardData {
  id: string;
  name: string;
  description: string;
  cost?: number;
  rarity?: string;
}

export interface ItemCardOptions {
  /** Display mode affects layout and what info is shown */
  mode?: 'shop' | 'inventory' | 'compact';
  /** Show cost badge (shop mode default) */
  showCost?: boolean;
  /** Show sell value instead of cost */
  sellValue?: number;
  /** Scale multiplier (default 1) */
  cardScale?: number;
  /** Texture key prefix (default 'item_'). The texture key is `${prefix}${id}` */
  texturePrefix?: string;
}

const CARD_W = 165;
const CARD_H = 235;
const CARD_RADIUS = 12;
const SHADOW_OFFSET = 4;
const SHADOW_ALPHA = 0.35;
const PRICE_TAG_H = 26;
const PRICE_TAG_GAP = 6;
const TOOLTIP_PAD = 10;
const TOOLTIP_BG = 0x1a1a2e;
const TOOLTIP_BORDER = 0x555588;

const RARITY_LABELS: Record<string, string> = {
  common:    'Common',
  uncommon:  'Uncommon',
  rare:      'Rare',
  legendary: 'Legendary',
};

const RARITY_LABEL_COLORS: Record<string, string> = {
  common:    '#88aa88',
  uncommon:  '#8888cc',
  rare:      '#ccaa44',
  legendary: '#cc66aa',
};

export class ItemCard extends GameObjects.Container {
  private cardBg: GameObjects.Graphics;
  private _def: CardData;
  private _options: ItemCardOptions;
  private _sold: boolean = false;
  private costText: GameObjects.Text | null = null;
  private soldOverlay: GameObjects.Graphics;
  private tooltip: GameObjects.Container | null = null;
  private _cardW: number;
  private _cardH: number;

  constructor(scene: Scene, x: number, y: number, def: CardData, options?: ItemCardOptions) {
    super(scene, x, y);
    this._def = def;
    this._options = options ?? {};

    const scale = this._options.cardScale ?? 1;
    this._cardW = CARD_W * scale;
    this._cardH = CARD_H * scale;

    this.cardBg = scene.add.graphics();
    this.add(this.cardBg);

    this.drawCard();
    this.addContent(scale);

    // Sold overlay (hidden initially)
    this.soldOverlay = scene.add.graphics();
    this.soldOverlay.setVisible(false);
    this.add(this.soldOverlay);

    this.setSize(this._cardW, this._cardH);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, this._cardW, this._cardH),
      Phaser.Geom.Rectangle.Contains,
    );

    // Tooltip on hover
    this.on('pointerover', this.showTooltip, this);
    this.on('pointerout', this.hideTooltip, this);

    scene.add.existing(this);
  }

  get def(): CardData { return this._def; }
  get sold(): boolean { return this._sold; }

  // ─── Public API ───

  markSold(): void {
    this._sold = true;
    this.soldOverlay.clear();
    this.soldOverlay.fillStyle(0x000000, 0.6);
    this.soldOverlay.fillRoundedRect(
      -this._cardW / 2, -this._cardH / 2,
      this._cardW, this._cardH, CARD_RADIUS,
    );
    this.soldOverlay.setVisible(true);
    if (this.costText) {
      this.costText.setText('SOLD');
      this.costText.setColor('#888888');
    }
  }

  setAffordable(canAfford: boolean): void {
    if (this._sold) return;
    if (this.costText) {
      this.costText.setColor(canAfford ? '#ffd700' : '#ff4444');
    }
  }

  // ─── Drawing ───

  private drawCard(): void {
    const g = this.cardBg;
    g.clear();

    const w = this._cardW;
    const h = this._cardH;
    const hw = w / 2;
    const hh = h / 2;

    // Drop shadow
    g.fillStyle(0x000000, SHADOW_ALPHA);
    g.fillRoundedRect(-hw + SHADOW_OFFSET, -hh + SHADOW_OFFSET, w, h, CARD_RADIUS);

    // Card body — neutral dark background
    g.fillStyle(0x2a2a3a, 1);
    g.fillRoundedRect(-hw, -hh, w, h, CARD_RADIUS);
  }

  private addContent(scale: number): void {
    const w = this._cardW;
    const h = this._cardH;
    const hh = h / 2;
    const mode = this._options.mode ?? 'shop';
    const radius = CARD_RADIUS * scale;

    // Item image — bake rounded corners into a CanvasTexture
    const prefix = this._options.texturePrefix ?? 'item_';
    const srcKey = `${prefix}${this._def.id}`;
    if (this.scene.textures.exists(srcKey)) {
      const roundedKey = `${srcKey}_rounded_${Math.round(w)}x${Math.round(h)}`;

      if (!this.scene.textures.exists(roundedKey)) {
        // Get source image
        const srcImg = this.scene.textures.get(srcKey).getSourceImage() as HTMLImageElement;

        // Create canvas texture at card dimensions
        const canvasTex = this.scene.textures.createCanvas(roundedKey, w, h)!;
        const ctx = canvasTex.getContext();

        // Clip to rounded rect path
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(w - radius, 0);
        ctx.arcTo(w, 0, w, radius, radius);
        ctx.lineTo(w, h - radius);
        ctx.arcTo(w, h, w - radius, h, radius);
        ctx.lineTo(radius, h);
        ctx.arcTo(0, h, 0, h - radius, radius);
        ctx.lineTo(0, radius);
        ctx.arcTo(0, 0, radius, 0, radius);
        ctx.closePath();
        ctx.clip();

        // Draw source image cover-filling the card area
        const imgScale = Math.max(w / srcImg.width, h / srcImg.height);
        const drawW = srcImg.width * imgScale;
        const drawH = srcImg.height * imgScale;
        const dx = (w - drawW) / 2;
        const dy = (h - drawH) / 2;
        ctx.drawImage(srcImg, dx, dy, drawW, drawH);

        canvasTex.refresh();
      }

      const img = this.scene.add.image(0, 0, roundedKey);
      this.add(img);
    }

    // Price tag floating above the card (shop mode)
    const showCost = this._options.showCost ?? (mode === 'shop');
    if ((showCost && this._def.cost !== undefined) || this._options.sellValue !== undefined) {
      const value = this._options.sellValue !== undefined ? this._options.sellValue : this._def.cost!;
      const prefix = this._options.sellValue !== undefined ? 'Sell $' : '$';
      const tagY = -hh - PRICE_TAG_GAP * scale - (PRICE_TAG_H * scale) / 2;

      const tagBg = this.scene.add.graphics();
      const tagW = 50 * scale;
      const tagH = PRICE_TAG_H * scale;
      tagBg.fillStyle(0x222233, 0.95);
      tagBg.fillRoundedRect(-tagW / 2, tagY - tagH / 2, tagW, tagH, 6 * scale);
      tagBg.lineStyle(1.5 * scale, 0x555577, 0.8);
      tagBg.strokeRoundedRect(-tagW / 2, tagY - tagH / 2, tagW, tagH, 6 * scale);
      this.add(tagBg);

      this.costText = this.scene.add.text(0, tagY, `${prefix}${value}`, {
        fontFamily: 'Arial Black',
        fontSize: `${Math.round(14 * scale)}px`,
        color: '#ffd700',
        align: 'center',
      }).setOrigin(0.5);
      this.add(this.costText);
    }
  }

  // ─── Tooltip ───

  private showTooltip(): void {
    if (this.tooltip) return;

    const matrix = this.getWorldTransformMatrix();
    const worldX = matrix.tx;
    const worldY = matrix.ty;
    const hh = this._cardH / 2;

    this.tooltip = this.scene.add.container(0, 0).setDepth(1000);

    // Build tooltip text
    const lines: string[] = [];
    lines.push(this._def.name);
    lines.push('');
    lines.push(this._def.description);
    if (this._def.rarity || this._def.cost !== undefined) {
      lines.push('');
      const rarityLabel = this._def.rarity ? (RARITY_LABELS[this._def.rarity] ?? this._def.rarity) : '';
      const costLabel = this._def.cost !== undefined ? `Cost: $${this._def.cost}` : '';
      lines.push([rarityLabel, costLabel].filter(Boolean).join('  ·  '));
    }
    const rarityLabel = this._def.rarity ? (RARITY_LABELS[this._def.rarity] ?? this._def.rarity) : null;

    const infoText = this.scene.add.text(0, 0, lines.join('\n'), {
      fontFamily: 'Arial',
      fontSize: '13px',
      color: '#dddddd',
      lineSpacing: 4,
      wordWrap: { width: 200 },
    }).setOrigin(0, 0);

    // Title styling
    const nameText = this.scene.add.text(TOOLTIP_PAD, TOOLTIP_PAD, this._def.name, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: (this._def.rarity && RARITY_LABEL_COLORS[this._def.rarity]) || '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0, 0);

    const descText = this.scene.add.text(TOOLTIP_PAD, TOOLTIP_PAD + nameText.height + 6, this._def.description, {
      fontFamily: 'Arial',
      fontSize: '12px',
      color: '#cccccc',
      lineSpacing: 3,
      wordWrap: { width: 200 },
    }).setOrigin(0, 0);

    let bottomY = TOOLTIP_PAD + nameText.height + 6 + descText.height;
    const tooltipChildren: GameObjects.GameObject[] = [nameText, descText];

    if (rarityLabel) {
      const rarityText = this.scene.add.text(
        TOOLTIP_PAD,
        bottomY + 8,
        rarityLabel,
        {
          fontFamily: 'Arial',
          fontSize: '11px',
          color: (this._def.rarity && RARITY_LABEL_COLORS[this._def.rarity]) || '#888888',
        },
      ).setOrigin(0, 0);
      bottomY = bottomY + 8 + rarityText.height;
      tooltipChildren.push(rarityText);
    }

    // Compute size
    const contentWidth = tooltipChildren.reduce((max, child) => Math.max(max, (child as GameObjects.Text).width ?? 0), 0);
    const tooltipW = contentWidth + TOOLTIP_PAD * 2;
    const tooltipH = bottomY + TOOLTIP_PAD;

    // Discard the multiline infoText — we built separate texts instead
    infoText.destroy();

    // Background
    const bg = this.scene.add.graphics();
    bg.fillStyle(TOOLTIP_BG, 0.95);
    bg.fillRoundedRect(0, 0, tooltipW, tooltipH, 8);
    bg.lineStyle(1, TOOLTIP_BORDER, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipW, tooltipH, 8);
    this.tooltip.add([bg, ...tooltipChildren]);

    // Position above the card (account for price tag if present)
    const hasTag = this.costText !== null;
    const tagOffset = hasTag ? (PRICE_TAG_H + PRICE_TAG_GAP) * (this._options.cardScale ?? 1) : 0;
    let tx = worldX - tooltipW / 2;
    let ty = worldY - hh - tagOffset - tooltipH - 10;

    // Clamp to screen bounds
    const { width: sw } = this.scene.scale;
    if (tx < 8) tx = 8;
    if (tx + tooltipW > sw - 8) tx = sw - 8 - tooltipW;
    if (ty < 8) {
      ty = worldY + hh + 12;
    }

    this.tooltip.setPosition(tx, ty);
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }

  destroy(fromScene?: boolean): void {
    this.hideTooltip();
    super.destroy(fromScene);
  }
}
