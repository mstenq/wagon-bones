// ─── ShopScene ───
// Shop that appears before each round. Buy equipment with your money.

import { Scene } from 'phaser';
import { EventBus } from '../../game/EventBus';
import { getPlayerState } from '../../game/PlayerState';
import { generateShopStock, EquipmentDef } from '../../game/ItemsSystem';
import { generateShopPacks, PackInstance } from '../../game/BoosterPackSystem';
import { ItemCard } from '../ui/ItemCard';
import { BoosterPackCard } from '../ui/BoosterPackCard';
import { Button } from '../ui/Button';

const CARD_SPACING = 185;
const PACK_SPACING = 140;

export class ShopScene extends Scene {
  private stock: EquipmentDef[];
  private packs: PackInstance[];
  private cards: ItemCard[] = [];
  private packCards: BoosterPackCard[] = [];
  private moneyText: Phaser.GameObjects.Text;
  private slotsText: Phaser.GameObjects.Text;
  private rerollBtn: Button;
  private ownedContainer: Phaser.GameObjects.Container;

  constructor() {
    super('Shop');
  }

  create() {
    const player = getPlayerState();
    // Only generate new stock/packs on first create, not when returning from pack scene
    if (!this.stock) {
      this.stock = generateShopStock(player.shopSlots);
    }
    if (!this.packs) {
      this.packs = generateShopPacks(2);
    }

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      // Clear stock/packs when leaving shop entirely (going to Game)
    });

    this.buildLayout();
    EventBus.emit('current-scene-ready', this);
  }

  private buildLayout(): void {
    const { width, height } = this.scale;
    const player = getPlayerState();

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, width, height);

    // Shop sign
    this.add.text(width / 2, height * 0.05, 'GENERAL STORE', {
      fontFamily: 'Arial Black',
      fontSize: '32px',
      color: '#ffcc00',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5);

    // Money display
    this.moneyText = this.add.text(width * 0.08, height * 0.12, `$${player.economy.balance}`, {
      fontFamily: 'Arial Black',
      fontSize: '24px',
      color: '#ffd700',
    }).setOrigin(0, 0.5);

    // Equipment slots display
    this.slotsText = this.add.text(width * 0.92, height * 0.12, `Slots: ${player.equipmentSlotsFree}/${player.maxEquipmentSlots}`, {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#aaaaaa',
    }).setOrigin(1, 0.5);

    // ─── Equipment for sale section ───
    // Reroll shop button (left of equipment cards)
    this.rerollBtn = new Button(this, width * 0.12, height * 0.30, `Reroll\n$${player.shopRerollCost}`, 90, 50);
    this.rerollBtn.setEnabled(player.canRerollShop());
    this.rerollBtn.onClick(() => this.onRerollShop());

    // Shop stock cards
    this.cards = [];
    const equipStartX = width * 0.28;
    const equipEndX = width * 0.72;
    const equipTotalW = this.stock.length > 1 ? (this.stock.length - 1) * CARD_SPACING : 0;
    const equipCenterX = (equipStartX + equipEndX) / 2;
    const equipX0 = equipCenterX - equipTotalW / 2;

    for (let i = 0; i < this.stock.length; i++) {
      const def = this.stock[i];
      const card = new ItemCard(this, equipX0 + i * CARD_SPACING, height * 0.30, def, { mode: 'shop', showCost: true });
      card.setDepth(10);

      const alreadyOwned = player.equipment.some(e => e.def.id === def.id);
      if (alreadyOwned) {
        card.markSold();
      } else {
        card.setAffordable(player.canBuy(def));
        card.on('pointerdown', () => this.onBuyItem(card));
        card.on('pointerover', () => {
          if (!card.sold) this.tweens.add({ targets: card, scaleX: 1.05, scaleY: 1.05, duration: 100 });
        });
        card.on('pointerout', () => {
          if (!card.sold) this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, duration: 100 });
        });
      }

      this.cards.push(card);
    }

    // ─── Booster packs section ───
    this.add.text(width / 2, height * 0.50, 'BOOSTER PACKS', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#888888',
    }).setOrigin(0.5);

    this.packCards = [];
    const packTotalW = (this.packs.length - 1) * PACK_SPACING;
    const packX0 = width / 2 - packTotalW / 2;

    for (let i = 0; i < this.packs.length; i++) {
      const packInst = this.packs[i];
      const packCard = new BoosterPackCard(this, packX0 + i * PACK_SPACING, height * 0.64, packInst);
      packCard.setDepth(10);

      // Check if already opened
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

    // ─── Owned equipment section ───
    this.add.text(width / 2, height * 0.80, 'YOUR EQUIPMENT', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#888888',
      align: 'center',
    }).setOrigin(0.5);

    this.ownedContainer = this.add.container(0, 0);
    this.renderOwnedEquipment();

    // Start Round button
    new Button(this, width / 2, height * 0.94, 'Hit the Trail', 220, 48)
      .onClick(() => {
        // Clear shop data for next visit
        this.stock = null!;
        this.packs = null!;
        this.scene.start('Game');
      });
  }

  private onBuyPack(card: BoosterPackCard, pack: PackInstance): void {
    if (card.sold) return;
    const player = getPlayerState();
    if (player.economy.balance < pack.def.cost) return;

    player.economy.spend(pack.def.cost);
    card.markSold();
    (pack as unknown as { _opened?: boolean })._opened = true;
    this.updateDisplays();

    // Transition to pack opening scene
    this.scene.start('BoosterPack', { packDef: pack.def });
  }

  private onBuyItem(card: ItemCard): void {
    if (card.sold) return;
    const player = getPlayerState();
    const success = player.buyEquipment(card.def as EquipmentDef);
    if (success) {
      card.markSold();
      this.updateDisplays();
      this.renderOwnedEquipment();
    }
  }

  private onRerollShop(): void {
    const player = getPlayerState();
    if (!player.payShopReroll()) return;

    // Generate new stock (packs stay the same)
    this.stock = generateShopStock(player.shopSlots);

    // Full rebuild
    this.children.removeAll(true);
    this.cards = [];
    this.packCards = [];
    this.buildLayout();
  }

  private updateDisplays(): void {
    const player = getPlayerState();
    this.moneyText.setText(`$${player.economy.balance}`);
    this.slotsText.setText(`Slots: ${player.equipmentSlotsFree}/${player.maxEquipmentSlots}`);

    // Update affordability on remaining equipment cards
    for (const card of this.cards) {
      if (!card.sold) {
        card.setAffordable(player.canBuy(card.def as EquipmentDef));
      }
    }

    // Update affordability on remaining pack cards
    for (const packCard of this.packCards) {
      if (!packCard.sold) {
        packCard.setAffordable(player.economy.balance >= packCard.pack.def.cost);
      }
    }

    // Update reroll button
    this.rerollBtn.setEnabled(player.canRerollShop());
  }

  private renderOwnedEquipment(): void {
    const player = getPlayerState();
    const { width, height } = this.scale;

    // Clear old
    this.ownedContainer.removeAll(true);

    if (player.equipment.length === 0) {
      const emptyText = this.add.text(width / 2, height * 0.86, 'No equipment yet', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#666666',
      }).setOrigin(0.5);
      this.ownedContainer.add(emptyText);
      return;
    }

    const COMPACT_SPACING = 80;
    const totalW = (player.equipment.length - 1) * COMPACT_SPACING;
    const startX = width / 2 - totalW / 2;

    for (let i = 0; i < player.equipment.length; i++) {
      const eq = player.equipment[i];
      const x = startX + i * COMPACT_SPACING;
      const y = height * 0.86;

      const card = new ItemCard(this, x, y, eq.def, {
        mode: 'compact',
        cardScale: 0.65,
        sellValue: eq.sellValue,
      });
      this.ownedContainer.add(card);
    }
  }

  private onResize(): void {
    this.children.removeAll(true);
    this.cards = [];
    this.packCards = [];
    this.buildLayout();
  }
}
