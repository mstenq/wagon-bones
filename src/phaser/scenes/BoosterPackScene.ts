// ─── BoosterPackScene ───
// Opened when player buys a booster pack. Shows N cards, player picks some.
// Then returns to Shop.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { PackDefinition, PackItem, InstantEffect, generatePackContents } from '../../game/BoosterPackSystem';
import { getPlayerState } from '../../game/PlayerState';
import { createDie } from '../../game/DiceSystem';
import { DiceEnhancement } from '../../game/types';
import { Button } from '../ui/Button';
import { DiceSprite } from '../ui/DiceSprite';
import { ItemCard } from '../ui/ItemCard';
import diceEnhancementsData from '../../data/dice_enhancements.json';
import pipEnhancementsData from '../../data/pip_enhancements.json';

const ENHANCEMENT_INFO = new Map(diceEnhancementsData.map(e => [e.id, e]));
const PIP_INFO = new Map(pipEnhancementsData.map(p => [p.id, p]));

const CARD_W = 130;
const CARD_H = 180;
const CARD_SPACING = 185;
const CARD_RADIUS = 8;

const CATEGORY_COLORS: Record<string, number> = {
  dice: 0x8B4513,
  supply: 0x2E8B57,
  trail_guide: 0x4682B4,
  frontier: 0x8B008B,
  equipment: 0xB8860B,
};

interface CardSprite {
  container: Phaser.GameObjects.Container;
  item: PackItem;
  selected: boolean;
  index: number;
  diceSprite?: DiceSprite;
  itemCard?: ItemCard;
}

export class BoosterPackScene extends Scene {
  private packDef: PackDefinition;
  private contents: PackItem[];
  private cardSprites: CardSprite[] = [];
  private picksRemaining: number;
  private confirmBtn: Button;
  private skipBtn: Button;
  private picksText: Phaser.GameObjects.Text;

  constructor() {
    super('BoosterPack');
  }

  init(data: { packDef: PackDefinition }) {
    this.packDef = data.packDef;
  }

  create() {
    this.contents = generatePackContents(this.packDef);
    this.picksRemaining = this.packDef.pickCount;
    this.cardSprites = [];

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => this.scale.off('resize', this.onResize, this));

    this.buildLayout();
  }

  private buildLayout(): void {
    const { width, height } = this.scale;

    // Background (dark overlay)
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a1a, 1);
    bg.fillRect(0, 0, width, height);

    // Pack name
    this.add.text(width / 2, height * 0.08, this.packDef.name, {
      fontFamily: 'Arial Black',
      fontSize: '32px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Instructions
    this.picksText = this.add.text(width / 2, height * 0.16, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#cccccc',
    }).setOrigin(0.5);
    this.updatePicksText();

    // Cards
    const totalCardsWidth = (this.contents.length - 1) * CARD_SPACING;
    const startX = width / 2 - totalCardsWidth / 2;
    const cardY = height * 0.48;

    for (let i = 0; i < this.contents.length; i++) {
      const item = this.contents[i];
      const x = startX + i * CARD_SPACING;
      const { container, diceSprite, itemCard } = this.createCardDisplay(x, cardY, item);

      const sprite: CardSprite = { container, item, selected: false, index: i, diceSprite: diceSprite ?? undefined, itemCard: itemCard ?? undefined };
      this.cardSprites.push(sprite);

      container.on('pointerdown', () => this.onCardClick(sprite));
      // Forward clicks from embedded interactive children to the card handler
      if (diceSprite) {
        diceSprite.on('pointerdown', () => this.onCardClick(sprite));
      }
      if (itemCard) {
        itemCard.on('pointerdown', () => this.onCardClick(sprite));
      }
      container.on('pointerover', () => {
        if (!sprite.selected) {
          this.tweens.add({ targets: container, scaleX: 1.05, scaleY: 1.05, duration: 80 });
        }
      });
      container.on('pointerout', () => {
        if (!sprite.selected) {
          this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 80 });
        }
      });
    }

    // Buttons
    const btnY = height * 0.85;
    this.confirmBtn = new Button(this, width / 2 - 100, btnY, 'Take Selected', 180, 44);
    this.confirmBtn.setEnabled(false);
    this.confirmBtn.onClick(() => this.onConfirm());

    this.skipBtn = new Button(this, width / 2 + 100, btnY, 'Skip All', 140, 44);
    this.skipBtn.onClick(() => this.onSkip());
  }

  private createCardDisplay(x: number, y: number, item: PackItem): { container: Phaser.GameObjects.Container, diceSprite: DiceSprite | null, itemCard: ItemCard | null } {
    const container = this.add.container(x, y);
    const color = CATEGORY_COLORS[item.category] ?? 0x444444;
    let diceSprite: DiceSprite | null = null;
    let itemCard: ItemCard | null = null;

    // Card background
    const cardBg = this.add.graphics();
    cardBg.fillStyle(color, 1);
    cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
    cardBg.lineStyle(2, 0x888888, 0.7);
    cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
    container.add(cardBg);

    if (item.category === 'dice' && item.die) {
      // ─── Dice card layout ───
      // Cream/white background for dice cards
      const diceBg = this.add.graphics();
      diceBg.fillStyle(0xf0ece3, 1);
      diceBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
      diceBg.lineStyle(2, 0xc0b8a0, 0.9);
      diceBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
      container.add(diceBg);

      // Enhancement name as title (or "Standard")
      const enhInfo = item.die.enhancement ? ENHANCEMENT_INFO.get(item.die.enhancement) : null;
      const enhName = enhInfo ? enhInfo.name : 'Standard';
      const titleText = this.add.text(0, -CARD_H / 2 + 16, enhName, {
        fontFamily: 'Arial Black',
        fontSize: '15px',
        color: '#3a3020',
        align: 'center',
      }).setOrigin(0.5, 0);
      container.add(titleText);

      // Dice sprite — centered in card
      diceSprite = new DiceSprite(this, 0, -8, item.die, { showAuraLabel: true });
      container.add(diceSprite);

      // Build description lines — short labels only
      const descLines: string[] = [];
      const pipCounts = new Map<string, number>();
      for (const pip of item.die.sidePips) {
        if (pip) pipCounts.set(pip, (pipCounts.get(pip) || 0) + 1);
      }
      for (const [pip, count] of pipCounts) {
        const info = PIP_INFO.get(pip);
        descLines.push(`${count}× ${info ? info.name : pip.replace(/_/g, ' ')}`);
      }
      if (descLines.length > 0) {
        const descText = this.add.text(0, CARD_H / 2 - 12, descLines.join('\n'), {
          fontFamily: 'Arial',
          fontSize: '11px',
          color: '#5a4a2a',
          align: 'center',
        }).setOrigin(0.5, 1);
        container.add(descText);
      }
    } else if (item.category === 'equipment' && item.equipmentDef) {
      // ─── Equipment card layout — use ItemCard ───
      itemCard = new ItemCard(this, 0, 0, item.equipmentDef, { mode: 'inventory' });
      container.add(itemCard);
    } else if (item.category === 'trail_guide' && item.trailGuideId) {
      // ─── Trail guide card — use ItemCard ───
      const tgData = { ...item, id: item.trailGuideId };
      itemCard = new ItemCard(this, 0, 0, tgData, { mode: 'inventory', texturePrefix: '' });
      container.add(itemCard);
    } else if (item.category === 'supply' && item.supplyCardId) {
      // ─── Supply card — use ItemCard ───
      const scData = { ...item, id: item.supplyCardId };
      itemCard = new ItemCard(this, 0, 0, scData, { mode: 'inventory', texturePrefix: 'supply_' });
      container.add(itemCard);
    } else if (item.category === 'frontier' && item.frontierEncounterId) {
      // ─── Frontier encounter card — use ItemCard ───
      const feData = { ...item, id: item.frontierEncounterId };
      itemCard = new ItemCard(this, 0, 0, feData, { mode: 'inventory', texturePrefix: 'fe_' });
      container.add(itemCard);
    } else {
      // ─── Other non-dice, non-equipment cards ───
      const catLabel = item.category.replace('_', ' ').toUpperCase();
      const catText = this.add.text(0, -CARD_H / 2 + 14, catLabel, {
        fontFamily: 'Arial',
        fontSize: '10px',
        color: '#aaaaaa',
      }).setOrigin(0.5, 0);
      container.add(catText);

      const nameText = this.add.text(0, -20, item.name, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: CARD_W - 16 },
      }).setOrigin(0.5, 0.5);
      container.add(nameText);

      const descText = this.add.text(0, 20, item.description, {
        fontFamily: 'Arial',
        fontSize: '11px',
        color: '#cccccc',
        align: 'center',
        wordWrap: { width: CARD_W - 16 },
      }).setOrigin(0.5, 0);
      container.add(descText);
    }

    container.setSize(CARD_W, CARD_H);
    container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, CARD_W, CARD_H),
      Phaser.Geom.Rectangle.Contains
    );
    container.setDepth(10);

    return { container, diceSprite, itemCard };
  }

  private onCardClick(sprite: CardSprite): void {
    if (sprite.selected) {
      // Deselect
      sprite.selected = false;
      this.picksRemaining++;
      this.drawSelectionBorder(sprite, false);
    } else {
      if (this.picksRemaining <= 0) return;
      sprite.selected = true;
      this.picksRemaining--;
      this.drawSelectionBorder(sprite, true);
    }

    this.updatePicksText();
    const selectedCount = this.cardSprites.filter(s => s.selected).length;
    this.confirmBtn.setEnabled(selectedCount > 0);
    this.confirmBtn.setText(selectedCount > 0 ? `Take ${selectedCount}` : 'Take Selected');
  }

  private drawSelectionBorder(sprite: CardSprite, selected: boolean): void {
    const container = sprite.container;
    // Remove old selection border if exists
    const existingBorder = container.getByName('selectionBorder') as Phaser.GameObjects.Graphics;
    if (existingBorder) existingBorder.destroy();

    if (selected) {
      // Use ItemCard size if present, otherwise fallback to CARD_W/CARD_H
      const cw = sprite.itemCard ? sprite.itemCard.width : CARD_W;
      const ch = sprite.itemCard ? sprite.itemCard.height : CARD_H;
      const cr = sprite.itemCard ? 12 : CARD_RADIUS;

      const border = this.add.graphics();
      border.lineStyle(3, 0x44ff44, 1);
      border.strokeRoundedRect(-cw / 2 - 4, -ch / 2 - 4, cw + 8, ch + 8, cr + 2);
      border.setName('selectionBorder');
      container.add(border);

      this.tweens.add({ targets: container, y: container.y - 10, duration: 100 });
    } else {
      this.tweens.add({ targets: container, y: this.scale.height * 0.48, duration: 100 });
    }
  }

  private updatePicksText(): void {
    const total = this.packDef.pickCount;
    const picked = total - this.picksRemaining;
    this.picksText.setText(`Choose ${total - picked} more (${picked}/${total} selected)`);
  }

  private onConfirm(): void {
    const selected = this.cardSprites.filter(s => s.selected);
    const player = getPlayerState();

    // Collect dice selection configs to run after processing
    const diceSelections: { config: import('../../game/DiceSelectionSystem').DiceSelectionConfig }[] = [];

    for (const sprite of selected) {
      const item = sprite.item;

      if (item.category === 'equipment' && item.equipmentDef) {
        // Add equipment directly (free — already paid for the pack)
        if (player.equipment.length < player.maxEquipmentSlots) {
          player.equipment.push({
            def: item.equipmentDef,
            sellValue: Math.max(1, Math.floor(item.equipmentDef.cost / 2)),
          });
        }
      } else if (item.category === 'dice' && item.die) {
        player.addDie(item.die);
      } else if (item.instantEffect) {
        this.applyInstantEffect(item.instantEffect, player);
      } else if (item.diceSelection) {
        diceSelections.push({ config: item.diceSelection });
      }
      // Other categories are stubs for now
    }

    // If any cards require dice selection, chain to DiceSelectionScene
    if (diceSelections.length > 0) {
      // For simplicity, run the first one; if multiple, they chain back here
      // Store remaining selections in registry for chaining
      this.registry.set('pendingDiceSelections', diceSelections.slice(1));
      this.scene.start('DiceSelection', {
        config: diceSelections[0].config,
        returnScene: diceSelections.length > 1 ? 'DiceSelectionChain' : 'Shop',
      });
      return;
    }

    this.scene.start('Shop');
  }

  private applyInstantEffect(effect: InstantEffect, player: ReturnType<typeof getPlayerState>): void {
    switch (effect.type) {
      case 'CREATE_DICE': {
        const count = effect.count ?? 1;
        const enhancement = (effect.enhancement ?? null) as DiceEnhancement;
        for (let i = 0; i < count; i++) {
          player.addDie(createDie({ enhancement }));
        }
        break;
      }
      case 'DOUBLE_MONEY': {
        const gain = Math.min(player.economy.balance, effect.maxGain ?? 20);
        player.economy.earn(gain);
        break;
      }
      case 'TRADE_EQUIPMENT': {
        const totalValue = player.equipment.reduce((sum, eq) => sum + eq.sellValue, 0);
        const gain = Math.min(totalValue, effect.maxGain ?? 50);
        player.economy.earn(gain);
        break;
      }
    }
  }

  private onSkip(): void {
    this.scene.start('Shop');
  }

  private onResize(): void {
    this.cardSprites = [];
    this.children.removeAll(true);
    this.buildLayout();
  }
}
