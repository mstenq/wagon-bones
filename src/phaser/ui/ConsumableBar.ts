// ─── ConsumableBar ───
// Right-side bar showing consumable cards (supply cards, trail guides, frontier encounters).
// Modeled on EquipmentBar: drag-to-reorder, idle wobble, hover tilt, click for action tabs (USE + SELL).

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI, ANIM } from '../../game/Constants';
import { getPlayerState } from '../../game/PlayerState';
import { ItemCard, CardActionTabConfig } from './ItemCard';
import type { ConsumableInstance } from '../../game/ConsumablesSystem';

const CARD_VERTICAL_OFFSET = 20;

export class ConsumableBar extends GameObjects.Container {
  private bg: GameObjects.Graphics;
  private cards: ItemCard[] = [];
  private slotCountText: GameObjects.Text;
  private barWidth: number;
  private barHeight: number;

  // Drag state
  private draggingCard: ItemCard | null = null;
  private dragStartIndex: number = -1;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;
  private dragHandlersInstalled: boolean = false;
  private dragPrevX: number = 0;
  private dragVelocityX: number = 0;

  // Per-card wobble tweens
  private wobbleTweens: Phaser.Tweens.Tween[] = [];

  // Hover tilt tracking
  private hoveredCard: ItemCard | null = null;
  private moveHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  private tiltRotation: number = 0;
  private tiltScaleX: number = 1;
  private tiltScaleY: number = 1;
  private tiltBaseY: number = 0;

  // Action tab state
  private activeTabCard: ItemCard | null = null;
  private dismissHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;

  constructor(scene: Scene, x: number, y: number, width: number, height: number) {
    super(scene, x, y);
    this.barWidth = width;
    this.barHeight = height;

    this.bg = scene.add.graphics();
    this.bg.setDepth(-10);
    this.add(this.bg);

    this.drawBackground();

    // Slot count text (e.g. "1/2")
    this.slotCountText = scene.add.text(width - 8, height - 4, '', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: TEXT_COLORS.MUTED,
    }).setOrigin(1, 1);
    this.slotCountText.setDepth(-5);
    this.add(this.slotCountText);

    this.setDepth(150);
    scene.add.existing(this);

    this.installDragHandlers();
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
    // Clean up wobble tweens
    for (const t of this.wobbleTweens) t.destroy();
    this.wobbleTweens = [];
    this.hoveredCard = null;
    this.dismissActiveTab();

    // Remove old cards
    for (const card of this.cards) card.destroy();
    this.cards = [];

    const player = getPlayerState();
    const consumables = player.consumables;

    this.slotCountText.setText(`${player.usedConsumableSlots}/${player.maxConsumableSlots}`);

    if (consumables.length === 0) return;

    const spacing = this.getCardSpacing(consumables.length);
    const totalW = (consumables.length - 1) * spacing;
    const startX = this.barWidth / 2 - totalW / 2;
    const cy = (this.barHeight / 2) - CARD_VERTICAL_OFFSET;

    for (let i = 0; i < consumables.length; i++) {
      const consumable = consumables[i];
      const texturePrefix = this.getTexturePrefix(consumable);
      const card = new ItemCard(this.scene, startX + i * spacing, cy, consumable.def, {
        mode: 'compact',
        cardScale: UI.CONSUMABLE_CARD_SCALE,
        texturePrefix,
      });
      this.scene.input.setDraggable(card);
      this.add(card);
      this.cards.push(card);

      // ─── Idle wobble ───
      this.startWobble(card, i);

      // ─── Hover tilt ───
      this.setupHoverTilt(card);

      // ─── Click to show action tabs ───
      this.setupClickActions(card, i);
    }

    this.applyCardDepths();
  }

  /** Get the card containers for animation purposes */
  getCards(): ItemCard[] {
    return this.cards;
  }

  private getTexturePrefix(consumable: ConsumableInstance): string {
    switch (consumable.def.category) {
      case 'supply': return 'supply_';
      case 'trail_guide': return 'tg_';
      case 'frontier': return 'fe_';
      default: return 'supply_';
    }
  }

  // ─── Idle Wobble ───

  private startWobble(card: ItemCard, index: number): void {
    const duration = ANIM.CARD_WOBBLE_DURATION_MIN + Math.random() * (ANIM.CARD_WOBBLE_DURATION_MAX - ANIM.CARD_WOBBLE_DURATION_MIN);
    const delay = index * 120 + Math.random() * 200;
    const startAngle = (Math.random() - 0.5) * ANIM.CARD_WOBBLE_ANGLE;
    card.rotation = startAngle;

    const tween = this.scene.tweens.add({
      targets: card,
      rotation: { from: -ANIM.CARD_WOBBLE_ANGLE, to: ANIM.CARD_WOBBLE_ANGLE },
      duration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay,
    });
    this.wobbleTweens.push(tween);
  }

  private stopWobble(card: ItemCard): void {
    for (const t of this.wobbleTweens) {
      if ((t as any).targets && (t as any).targets.includes(card)) {
        t.pause();
      }
    }
  }

  private resumeWobble(card: ItemCard): void {
    for (const t of this.wobbleTweens) {
      if ((t as any).targets && (t as any).targets.includes(card)) {
        t.resume();
      }
    }
  }

  // ─── Hover Tilt ───

  private setupHoverTilt(card: ItemCard): void {
    card.on('pointerover', () => {
      if (this.draggingCard === card) return;
      if (this.activeTabCard === card) return;
      this.hoveredCard = card;
      this.tiltRotation = card.rotation;
      this.tiltScaleX = card.scaleX;
      this.tiltScaleY = card.scaleY;
      this.tiltBaseY = card.y;
      this.stopWobble(card);

      this.scene.tweens.add({
        targets: card,
        scaleX: ANIM.CARD_TILT_LIFT,
        scaleY: ANIM.CARD_TILT_LIFT,
        y: this.tiltBaseY - 4,
        duration: 200,
        ease: 'Back.easeOut',
      });

      if (!this.moveHandler) {
        this.moveHandler = (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer);
        this.scene.input.on('pointermove', this.moveHandler);
      }
    });

    card.on('pointerout', () => {
      if (this.hoveredCard !== card) return;
      this.hoveredCard = null;
      if (this.activeTabCard === card) return;
      this.resetTilt(card);
      this.resumeWobble(card);
    });
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const card = this.hoveredCard;
    if (!card || this.draggingCard === card) return;
    if (this.activeTabCard === card) return;

    const cardWorldX = this.x + card.x;
    const cardWorldY = this.y + card.y;
    const cw = card.width;
    const ch = card.height;

    const nx = Phaser.Math.Clamp((pointer.worldX - cardWorldX) / (cw / 2), -1, 1);
    const ny = Phaser.Math.Clamp((pointer.worldY - cardWorldY) / (ch / 2), -1, 1);

    const targetRotation = -nx * ANIM.CARD_TILT_MAX;
    const targetScaleX = ANIM.CARD_TILT_LIFT - Math.abs(nx) * ANIM.CARD_TILT_SCALE_AMOUNT;
    const targetScaleY = ANIM.CARD_TILT_LIFT - Math.abs(ny) * ANIM.CARD_TILT_SCALE_AMOUNT * 0.4;

    const lerp = ANIM.CARD_TILT_LERP;
    this.tiltRotation += (targetRotation - this.tiltRotation) * lerp;
    this.tiltScaleX += (targetScaleX - this.tiltScaleX) * lerp;
    this.tiltScaleY += (targetScaleY - this.tiltScaleY) * lerp;

    card.rotation = this.tiltRotation;
    card.scaleX = this.tiltScaleX;
    card.scaleY = this.tiltScaleY;
  }

  private resetTilt(card: ItemCard): void {
    this.scene.tweens.add({
      targets: card,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      y: this.tiltBaseY,
      duration: 300,
      ease: 'Back.easeOut',
    });
  }

  // ─── Click Actions (USE + SELL) ───

  private setupClickActions(card: ItemCard, consumableIndex: number): void {
    let wasDragged = false;

    card.on('dragstart', () => { wasDragged = true; });

    card.on('pointerup', () => {
      if (wasDragged) {
        wasDragged = false;
        return;
      }

      if (this.activeTabCard === card) {
        this.dismissActiveTab();
        return;
      }

      this.dismissActiveTab();

      const player = getPlayerState();
      const consumable = player.consumables[consumableIndex];
      if (!consumable) return;

      // Lock card in raised state
      this.stopWobble(card);
      this.hoveredCard = null;
      const cy = (this.barHeight / 2) - CARD_VERTICAL_OFFSET;
      this.tiltBaseY = cy;
      this.scene.tweens.add({
        targets: card,
        rotation: 0,
        scaleX: ANIM.CARD_TILT_LIFT,
        scaleY: ANIM.CARD_TILT_LIFT,
        y: cy - 4,
        duration: 150,
        ease: 'Back.easeOut',
      });

      this.scene.input.setDraggable(card, false);
      card.setDepth(200);
      this.bringToTop(card);

      const tabs: CardActionTabConfig[] = [
        {
          label: 'USE',
          color: 0x2255aa,
          callback: () => {
            this.onUseConsumable(card, consumableIndex);
          },
        },
        {
          label: `SELL\n$${consumable.sellValue}`,
          color: 0x338833,
          callback: () => {
            this.animateSellCard(card, consumableIndex);
          },
        },
      ];

      card.showActionTabs(tabs);
      this.activeTabCard = card;

      // Click-away dismiss
      this.scene.time.delayedCall(50, () => {
        if (this.dismissHandler) {
          this.scene.input.off('pointerdown', this.dismissHandler);
        }
        this.dismissHandler = (pointer: Phaser.Input.Pointer) => {
          const hitObjects = this.scene.input.hitTestPointer(pointer);
          if (this.activeTabCard && hitObjects.includes(this.activeTabCard)) return;
          for (const go of hitObjects) {
            if (go.parentContainer && this.activeTabCard && go.parentContainer === this.activeTabCard) return;
          }
          this.dismissActiveTab();
        };
        this.scene.input.on('pointerdown', this.dismissHandler);
      });
    });
  }

  private onUseConsumable(card: ItemCard, consumableIndex: number): void {
    const player = getPlayerState();
    const consumed = player.useConsumable(consumableIndex);
    if (!consumed) return;

    // Hide tabs
    card.hideActionTabs(true);
    this.activeTabCard = null;
    if (this.dismissHandler) {
      this.scene.input.off('pointerdown', this.dismissHandler);
      this.dismissHandler = null;
    }

    // Animate card disappearing (poof upward)
    card.disableInteractive();
    this.scene.sound.play('sfx_card_fan', { volume: 0.5 });

    this.scene.tweens.add({
      targets: card,
      y: card.y - 80,
      scaleX: 0.2,
      scaleY: 0.2,
      alpha: 0,
      duration: 350,
      ease: 'Power2',
      onComplete: () => {
        this.refresh();
        this.emit('consumable-used', consumed);
      },
    });
  }

  private animateSellCard(card: ItemCard, consumableIndex: number): void {
    const player = getPlayerState();

    card.hideActionTabs(true);
    this.activeTabCard = null;
    if (this.dismissHandler) {
      this.scene.input.off('pointerdown', this.dismissHandler);
      this.dismissHandler = null;
    }

    card.disableInteractive();

    this.scene.sound.play('sfx_crumple1', { volume: 0.5 });
    this.scene.time.delayedCall(100, () => {
      this.scene.sound.play('sfx_coin', { volume: 0.5 });
    });

    const flingDirection = Math.random() > 0.5 ? 1 : -1;
    this.scene.tweens.add({
      targets: card,
      x: card.x + flingDirection * 300,
      y: card.y - 200,
      rotation: flingDirection * (1.5 + Math.random()),
      scaleX: 0.1,
      scaleY: 0.1,
      alpha: 0,
      duration: 400,
      ease: 'Power3',
      onComplete: () => {
        player.sellConsumable(consumableIndex);
        this.refresh();
        this.emit('consumable-changed');
      },
    });
  }

  private dismissActiveTab(): void {
    if (this.activeTabCard) {
      const card = this.activeTabCard;
      card.hideActionTabs(true);

      this.scene.input.setDraggable(card, true);
      this.applyCardDepths();

      const cy = (this.barHeight / 2) - CARD_VERTICAL_OFFSET;
      this.scene.tweens.add({
        targets: card,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        y: cy,
        duration: 250,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.resumeWobble(card);
        },
      });

      this.activeTabCard = null;
    }
    if (this.dismissHandler) {
      this.scene.input.off('pointerdown', this.dismissHandler);
      this.dismissHandler = null;
    }
  }

  // ─── Drag-to-Reorder ───

  private applyCardDepths(): void {
    for (let i = 0; i < this.cards.length; i++) {
      this.cards[i].setDepth(i);
    }
    this.sort('depth');
  }

  private getCardSpacing(count: number): number {
    if (count <= 1) return 0;
    const cardW = UI.CARD_W * UI.CONSUMABLE_CARD_SCALE;
    const padding = 16;
    const availableW = this.barWidth - padding * 2 - cardW;
    const preferredSpacing = UI.CONSUMABLE_CARD_SPACING;
    const neededW = (count - 1) * preferredSpacing;
    if (neededW <= availableW) return preferredSpacing;
    return availableW / (count - 1);
  }

  private getCardXPositions(count: number): number[] {
    if (count === 0) return [];
    const spacing = this.getCardSpacing(count);
    const totalW = (count - 1) * spacing;
    const startX = this.barWidth / 2 - totalW / 2;
    return Array.from({ length: count }, (_, i) => startX + i * spacing);
  }

  private installDragHandlers(): void {
    if (this.dragHandlersInstalled) return;
    this.dragHandlersInstalled = true;

    this.scene.input.dragDistanceThreshold = Math.max(
      this.scene.input.dragDistanceThreshold ?? 0,
      8,
    );

    this.scene.input.on('dragstart', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      const card = gameObject as ItemCard;
      const idx = this.cards.indexOf(card);
      if (idx === -1) return;
      if (this.activeTabCard) return;

      this.draggingCard = card;
      this.dragStartIndex = idx;
      this.dragOffsetX = pointer.worldX - (this.x + card.x);
      this.dragOffsetY = pointer.worldY - (this.y + card.y);
      this.dragPrevX = pointer.worldX;
      this.dragVelocityX = 0;

      this.dismissActiveTab();
      this.stopWobble(card);
      this.hoveredCard = null;
      card.setDepth(200);
      this.bringToTop(card);
      card.scaleX = 1.03;
      card.scaleY = 1.03;
    });

    this.scene.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!this.draggingCard || gameObject !== this.draggingCard) return;

      const dx = pointer.worldX - this.dragPrevX;
      this.dragVelocityX = this.dragVelocityX * ANIM.CARD_DRAG_SWING_DAMPING + dx * (1 - ANIM.CARD_DRAG_SWING_DAMPING);
      this.dragPrevX = pointer.worldX;

      const swing = Phaser.Math.Clamp(
        this.dragVelocityX * ANIM.CARD_DRAG_SWING_FACTOR,
        -ANIM.CARD_DRAG_SWING_MAX,
        ANIM.CARD_DRAG_SWING_MAX,
      );
      this.draggingCard.rotation = swing;
      this.draggingCard.y = pointer.worldY - this.y - this.dragOffsetY;
      this.draggingCard.x = pointer.worldX - this.x - this.dragOffsetX;

      const positions = this.getCardXPositions(this.cards.length);
      let newIndex = 0;
      let minDist = Infinity;
      for (let i = 0; i < positions.length; i++) {
        const dist = Math.abs(this.draggingCard.x - positions[i]);
        if (dist < minDist) {
          minDist = dist;
          newIndex = i;
        }
      }

      const currentIndex = this.cards.indexOf(this.draggingCard);
      if (newIndex !== currentIndex) {
        this.cards.splice(currentIndex, 1);
        this.cards.splice(newIndex, 0, this.draggingCard);

        for (let i = 0; i < this.cards.length; i++) {
          if (this.cards[i] === this.draggingCard) continue;
          this.scene.tweens.add({
            targets: this.cards[i],
            x: positions[i],
            duration: 150,
            ease: 'Power2',
          });
        }
      }
    });

    this.scene.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!this.draggingCard || gameObject !== this.draggingCard) return;

      const card = this.draggingCard;
      const finalIndex = this.cards.indexOf(card);
      const finalVelocity = this.dragVelocityX;
      this.draggingCard = null;
      this.dragVelocityX = 0;

      card.setDepth(0);

      const positions = this.getCardXPositions(this.cards.length);
      const cy = (this.barHeight / 2) - CARD_VERTICAL_OFFSET;
      const overshoot = Phaser.Math.Clamp(
        finalVelocity * ANIM.CARD_DRAG_SWING_FACTOR * 2,
        -ANIM.CARD_DRAG_SWING_MAX,
        ANIM.CARD_DRAG_SWING_MAX,
      );
      const dur = ANIM.CARD_DRAG_SETTLE_DURATION;

      this.applyCardDepths();

      this.scene.tweens.chain({
        targets: card,
        tweens: [
          {
            x: positions[finalIndex],
            y: cy,
            rotation: overshoot,
            scaleX: 1,
            scaleY: 1,
            duration: dur * 0.3,
            ease: 'Sine.easeOut',
          },
          {
            rotation: -overshoot * 0.4,
            duration: dur * 0.25,
            ease: 'Sine.easeInOut',
          },
          {
            rotation: overshoot * 0.1,
            duration: dur * 0.2,
            ease: 'Sine.easeInOut',
          },
          {
            rotation: 0,
            duration: dur * 0.25,
            ease: 'Sine.easeIn',
            onComplete: () => {
              this.resumeWobble(card);
            },
          },
        ],
      });

      // Persist to PlayerState if order changed
      if (finalIndex !== this.dragStartIndex) {
        const player = getPlayerState();
        player.reorderConsumable(this.dragStartIndex, finalIndex);
      }

      this.dragStartIndex = -1;
    });
  }
}
