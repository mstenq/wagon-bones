// ─── ShopScene ───
// Shop that appears before each round. Buy equipment with your money.
// Balatro-inspired layout: sidebar left, equipment top, shop center, pouch bottom-right.

import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { getPlayerState } from '../../game/PlayerState';
import { TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { generateShopStock, EquipmentDef } from '../../game/ItemsSystem';
import { generateShopPacks, PackInstance } from '../../game/BoosterPackSystem';
import { ConsumableDef, ConsumableInstance, generateShopConsumables, executeConsumableEffect } from '../../game/ConsumablesSystem';
import { ItemCard } from '../ui/ItemCard';
import { BoosterPackCard } from '../ui/BoosterPackCard';
import { Button } from '../ui/Button';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import { ConsumableBar } from '../ui/ConsumableBar';
import { DicePouch } from '../ui/DicePouch';
import { createLayout } from '../ui/SceneLayout';

const CARD_SPACING = 185;

/** A shop stock item — either equipment or consumable */
type ShopItem = 
  | { type: 'equipment'; def: EquipmentDef }
  | { type: 'consumable'; def: ConsumableDef };

export class ShopScene extends Scene {
  private stockItems: ShopItem[];
  private packs: PackInstance[];
  private cards: ItemCard[] = [];
  private packCards: BoosterPackCard[] = [];
  private rerollBtn: Button;

  // Shared UI
  private sidebar: Sidebar;
  private equipBar: EquipmentBar;
  private consumableBar: ConsumableBar;
  private dicePouch: DicePouch;

  constructor() {
    super('Shop');
  }

  create() {
    const player = getPlayerState();
    if (!this.stockItems) {
      this.stockItems = this.generateMixedStock(player);
      player.resetShopRerolls();
    }
    if (!this.packs) {
      this.packs = generateShopPacks(2);
    }

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
    });

    this.buildLayout();
    EventBus.emit(Events.SCENE_READY, this);
  }

  private buildLayout(): void {
    const player = getPlayerState();

    const layout = createLayout(this, { bgKey: 'bg_shop', sidebarTitle: 'SHOP' });
    this.sidebar = layout.sidebar;
    this.equipBar = layout.equipBar;
    this.consumableBar = layout.consumableBar;
    this.dicePouch = layout.dicePouch;
    const contentL = layout.contentX;
    const contentW = layout.contentW;

    // Refresh displays when equipment is sold from the bar
    this.equipBar.on('equipment-changed', () => {
      this.updateDisplays();
      this.updateEquipHints();
    });

    // Refresh displays when consumables change
    this.consumableBar.on('consumable-changed', () => {
      this.updateDisplays();
    });

    // Execute consumable effect when used
    this.consumableBar.on('consumable-used', (consumed: ConsumableInstance) => {
      this.handleConsumableUsed(consumed);
    });

    // Show equipment hints with default (shop) context
    this.updateEquipHints();

    // ─── Layout constants ───
    const equipBarH = UI.EQUIP_BAR_HEIGHT;
    const BOX_RADIUS = 12;
    const BOX_PAD = 16;          // padding inside boxes
    const BOX_GAP = 12;          // gap between the two boxes
    const CARD_H = 235;
    const PRICE_TAG_SPACE = 36;  // room above cards for price tags
    const BTN_COL_W = 130;

    // Row heights (box inner height = card height + price tag + padding)
    const rowInnerH = CARD_H + PRICE_TAG_SPACE + BOX_PAD * 2;

    // Top of first box (below equipment/consumable bars)
    const box1Top = equipBarH + 20;
    const box1H = rowInnerH;
    const box2Top = box1Top + box1H + BOX_GAP;
    const box2H = rowInnerH;

    // Card center Y (same for both rows — vertically centered in box, shifted down for price tags)
    const cardCY1 = box1Top + BOX_PAD + PRICE_TAG_SPACE + CARD_H / 2;
    const cardCY2 = box2Top + BOX_PAD + PRICE_TAG_SPACE + CARD_H / 2;

    // ─── Box 1: Shop items + action buttons ───
    const shopBox = this.add.graphics();
    shopBox.fillStyle(0x0d0d1a, 0.75);
    shopBox.fillRoundedRect(contentL, box1Top, contentW, box1H, BOX_RADIUS);
    shopBox.lineStyle(2, 0x333355, 0.6);
    shopBox.strokeRoundedRect(contentL, box1Top, contentW, box1H, BOX_RADIUS);

    // Action buttons (left side of box 1)
    const btnColX = contentL + BOX_PAD + BTN_COL_W / 2 - 6;
    const btnW = BTN_COL_W - 16;
    const btnH = 52;

    new Button(this, btnColX, cardCY1 - btnH / 2 - 8, 'Hit the\nTrail', btnW, btnH)
      .onClick(() => {
        this.stockItems = null!;
        this.packs = null!;
        this.scene.start('Game');
      });

    this.rerollBtn = new Button(this, btnColX, cardCY1 + btnH / 2 + 8, `Reroll\n$${player.shopRerollCost}`, btnW, btnH);
    this.rerollBtn.setEnabled(player.canRerollShop());
    this.rerollBtn.onClick(() => this.onRerollShop());

    // Shop stock cards (right side of box 1)
    this.cards = [];
    const cardAreaLeft = contentL + BOX_PAD + BTN_COL_W + 8;
    const cardAreaW = contentW - BOX_PAD * 2 - BTN_COL_W - 8;
    const equipTotalW = this.stockItems.length > 1 ? (this.stockItems.length - 1) * CARD_SPACING : 0;
    const cardStartX = cardAreaLeft + cardAreaW / 2 - equipTotalW / 2;

    for (let i = 0; i < this.stockItems.length; i++) {
      const shopItem = this.stockItems[i];
      const texturePrefix = shopItem.type === 'consumable'
        ? (shopItem.def.category === 'trail_guide' ? 'tg_' : shopItem.def.category === 'frontier' ? 'fe_' : 'supply_')
        : undefined;
      const card = new ItemCard(this, cardStartX + i * CARD_SPACING, cardCY1, shopItem.def, {
        mode: 'shop',
        showCost: true,
        ...(texturePrefix ? { texturePrefix } : {}),
      });
      card.setDepth(10);

      if (shopItem.type === 'equipment') {
        const alreadyOwned = player.equipment.some(e => e.def.id === shopItem.def.id);
        if (alreadyOwned) {
          card.markSold();
        } else {
          card.setAffordable(player.canBuy(shopItem.def));
          card.on('pointerdown', () => this.onBuyEquipment(card, shopItem.def));
          card.on('pointerover', () => {
            if (!card.sold) this.tweens.add({ targets: card, scaleX: 1.05, scaleY: 1.05, duration: 100 });
          });
          card.on('pointerout', () => {
            if (!card.sold) this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, duration: 100 });
          });
        }
      } else {
        // Consumable card
        const canAfford = player.economy.balance >= shopItem.def.cost;
        card.setAffordable(canAfford);
        card.on('pointerdown', () => this.onBuyConsumable(card, shopItem.def));
        card.on('pointerover', () => {
          if (!card.sold) this.tweens.add({ targets: card, scaleX: 1.05, scaleY: 1.05, duration: 100 });
        });
        card.on('pointerout', () => {
          if (!card.sold) this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, duration: 100 });
        });
      }

      this.cards.push(card);
    }

    // ─── Box 2: Voucher + Booster packs ───
    const packBox = this.add.graphics();
    packBox.fillStyle(0x0d0d1a, 0.75);
    packBox.fillRoundedRect(contentL, box2Top, contentW, box2H, BOX_RADIUS);
    packBox.lineStyle(2, 0x333355, 0.6);
    packBox.strokeRoundedRect(contentL, box2Top, contentW, box2H, BOX_RADIUS);

    // Voucher placeholder (left side of box 2)
    const voucherW = BTN_COL_W - 16;
    const voucherH = CARD_H;
    const voucherX = contentL + BOX_PAD + voucherW / 2 - 6;
    const voucherY = cardCY2;

    const voucherSlot = this.add.graphics();
    voucherSlot.fillStyle(0x1a1a2e, 0.6);
    voucherSlot.fillRoundedRect(-voucherW / 2, -voucherH / 2, voucherW, voucherH, 8);
    voucherSlot.lineStyle(1.5, 0x444466, 0.5);
    voucherSlot.strokeRoundedRect(-voucherW / 2, -voucherH / 2, voucherW, voucherH, 8);
    voucherSlot.setPosition(voucherX, voucherY);

    this.add.text(voucherX, voucherY - 12, '🎟️', {
      fontSize: '28px',
      align: 'center',
    }).setOrigin(0.5).setAlpha(0.4);

    this.add.text(voucherX, voucherY + 20, 'VOUCHER', {
      fontFamily: FONTS.HEADING,
      fontSize: '10px',
      color: TEXT_COLORS.MUTED,
      align: 'center',
    }).setOrigin(0.5).setAlpha(0.5);

    // Booster packs (right side of box 2)
    this.packCards = [];
    const packAreaLeft = contentL + BOX_PAD + BTN_COL_W + 8;
    const packAreaW = contentW - BOX_PAD * 2 - BTN_COL_W - 8;
    const packTotalW = (this.packs.length - 1) * CARD_SPACING;
    const packX0 = packAreaLeft + packAreaW / 2 - packTotalW / 2;

    for (let i = 0; i < this.packs.length; i++) {
      const packInst = this.packs[i];
      const packCard = new BoosterPackCard(this, packX0 + i * CARD_SPACING, cardCY2, packInst);
      packCard.setDepth(10);

      if ((packInst as unknown as { _opened?: boolean })._opened) {
        packCard.markSold();
      } else {
        packCard.setAffordable(player.economy.balance >= packInst.def.cost);
        packCard.on('pointerdown', () => this.onBuyPack(packCard, packInst));
        packCard.on('pointerover', () => {
          if (!packCard.sold) this.tweens.add({ targets: packCard, scaleX: 1.05, scaleY: 1.05, duration: 100 });
        });
        packCard.on('pointerout', () => {
          if (!packCard.sold) this.tweens.add({ targets: packCard, scaleX: 1, scaleY: 1, duration: 100 });
        });
      }

      this.packCards.push(packCard);
    }
  }

  private onBuyPack(card: BoosterPackCard, pack: PackInstance): void {
    if (card.sold) return;
    const player = getPlayerState();
    if (player.economy.balance < pack.def.cost) {
      this.showCardPopup(card, "Can't afford!");
      return;
    }

    player.economy.spend(pack.def.cost);
    card.markSold();
    (pack as unknown as { _opened?: boolean })._opened = true;
    this.updateDisplays();
    this.sound.play('sfx_card_fan', { volume: 0.5 });

    this.scene.start('BoosterPack', { packDef: pack.def });
  }

  private onBuyEquipment(card: ItemCard, def: EquipmentDef): void {
    if (card.sold) return;
    const player = getPlayerState();
    const success = player.buyEquipment(def);
    if (success) {
      card.markSold();
      this.sound.play('sfx_coin', { volume: 0.5 });
      this.updateDisplays();
      this.equipBar.refresh();
      this.updateEquipHints();
    } else if (player.economy.balance < def.cost) {
      this.showCardPopup(card, "Can't afford!");
    } else {
      this.showCardPopup(card, 'No space!');
    }
  }

  private onBuyConsumable(card: ItemCard, def: ConsumableDef): void {
    if (card.sold) return;
    const player = getPlayerState();
    if (player.economy.balance < def.cost) {
      this.showCardPopup(card, "Can't afford!");
      return;
    }
    if (!player.canAddConsumable(def)) {
      this.showCardPopup(card, 'No space!');
      return;
    }
    player.economy.spend(def.cost);
    player.addConsumable(def);
    card.markSold();
    this.sound.play('sfx_coin', { volume: 0.5 });
    this.updateDisplays();
    this.consumableBar.refresh();
  }

  private handleConsumableUsed(consumed: ConsumableInstance): void {
    const player = getPlayerState();
    const result = executeConsumableEffect(consumed, player);

    // Refresh all UI
    this.updateDisplays();
    this.equipBar.refresh();
    this.consumableBar.refresh();
    this.dicePouch.refresh();

    if (!result.success && result.failReason) {
      // Show popup at center of consumable bar area
      const text = this.add.text(this.consumableBar.x + this.consumableBar.width / 2, this.consumableBar.y, result.failReason, {
        fontFamily: 'sans-serif', fontSize: '24px', color: '#fff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(1000);
      this.sound.play('sfx_cancel', { volume: 0.5 });
      this.tweens.add({ targets: text, y: text.y - 15, alpha: 0, duration: 2000, ease: 'Power2', onComplete: () => text.destroy() });
    }

    // If the consumable triggers a dice selection, launch it
    if (result.diceSelection) {
      this.scene.start('DiceSelection', {
        config: result.diceSelection,
        returnScene: 'Shop',
      });
    }
  }

  /** Show a brief floating text popup above a card with a cancel sound */
  private showCardPopup(card: ItemCard | BoosterPackCard, message: string): void {
    this.sound.play('sfx_cancel', { volume: 0.5 });

    const matrix = card.getWorldTransformMatrix();
    const worldX = matrix.tx;
    const worldY = matrix.ty;

    const text = this.add.text(worldX, worldY - 40, message, {
      fontFamily: 'sans-serif',
      fontSize: '24px',
      color: '#fff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(1000);

    this.tweens.add({
      targets: text,
      y: text.y - 15,
      fontSize: '32px',
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  private onRerollShop(): void {
    const player = getPlayerState();
    if (!player.payShopReroll()) return;

    this.stockItems = this.generateMixedStock(player);

    this.children.removeAll(true);
    this.cards = [];
    this.packCards = [];
    this.buildLayout();
  }

  private updateDisplays(): void {
    const player = getPlayerState();
    this.sidebar.refreshMoney();

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      if (card.sold) continue;
      const shopItem = this.stockItems[i];
      if (shopItem.type === 'equipment') {
        card.setAffordable(player.canBuy(shopItem.def));
      } else {
        card.setAffordable(player.economy.balance >= shopItem.def.cost);
      }
    }

    for (const packCard of this.packCards) {
      if (!packCard.sold) {
        packCard.setAffordable(player.economy.balance >= packCard.pack.def.cost);
      }
    }

    this.rerollBtn.setEnabled(player.canRerollShop());
    this.dicePouch.refresh();
  }

  private onResize(): void {
    this.children.removeAll(true);
    this.cards = [];
    this.packCards = [];
    this.buildLayout();
  }

  private updateEquipHints(): void {
    this.equipBar.updateHints(null, getPlayerState());
  }

  /** Generate a mix of equipment and consumable cards for the shop stock */
  private generateMixedStock(player: ReturnType<typeof getPlayerState>): ShopItem[] {
    const items: ShopItem[] = [];

    // Equipment cards
    const equipCount = Math.max(1, player.shopSlots);
    const equipDefs = generateShopStock(equipCount);
    for (const def of equipDefs) {
      items.push({ type: 'equipment', def });
    }

    // Consumable card (1 by default)
    const includeFrontier = !!player.profession?.modifiers?.frontierInShop;
    const consumableDefs = generateShopConsumables(1, { includeFrontier });
    for (const def of consumableDefs) {
      items.push({ type: 'consumable', def });
    }

    return items;
  }
}
