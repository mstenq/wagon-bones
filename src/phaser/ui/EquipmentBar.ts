// ─── EquipmentBar ───
// Top bar in the main content area showing owned equipment cards.
// Balatro-style: always visible across shop and game scenes.
// Cards are drag-to-reorder since scoring depends on equipment order (L→R).
// Cards idle-wobble, tilt on hover, and swing with momentum when dragged.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI, ANIM } from '../../game/Constants';
import { getPlayerState } from '../../game/PlayerState';
import { ItemCard } from './ItemCard';
import type { GameState } from '../../game/GameState';
import type { PlayerState } from '../../game/PlayerState';

export class EquipmentBar extends GameObjects.Container {
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

  // Per-card wobble tweens (cleaned up on refresh)
  private wobbleTweens: Phaser.Tweens.Tween[] = [];

  // Hover tilt tracking
  private hoveredCard: ItemCard | null = null;
  private moveHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  // Smoothed tilt state (lerped toward target each pointermove)
  private tiltRotation: number = 0;
  private tiltScaleX: number = 1;
  private tiltScaleY: number = 1;
  private tiltBaseY: number = 0;  // card's resting Y before hover lift

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
    const cy = (this.barHeight / 2) - 20;

    for (let i = 0; i < equipment.length; i++) {
      const equip = equipment[i];
      const card = new ItemCard(this.scene, startX + i * spacing, cy, equip.def, {
        mode: 'compact',
        cardScale: UI.EQUIP_CARD_SCALE,
      });
      this.scene.input.setDraggable(card);
      this.add(card);
      this.cards.push(card);

      // ─── Idle wobble ───
      this.startWobble(card, i);

      // ─── Hover tilt ───
      this.setupHoverTilt(card);
    }
  }

  /** Get the card containers for animation purposes */
  getCards(): ItemCard[] {
    return this.cards;
  }

  /** Update all card hints with current game context */
  updateHints(game: GameState | null, player: PlayerState): void {
    for (const card of this.cards) {
      card.updateHints(game, player);
    }
  }

  // ─── Idle Wobble ───

  private startWobble(card: ItemCard, index: number): void {
    // Stagger start and randomize duration so cards don't wobble in sync
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
    const idx = this.cards.indexOf(card);
    if (idx === -1) return;
    // Find and pause the wobble tween for this card
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

  // ─── Hover Tilt (faux 3D perspective) ───

  private setupHoverTilt(card: ItemCard): void {
    card.on('pointerover', () => {
      if (this.draggingCard === card) return;
      this.hoveredCard = card;
      this.tiltRotation = card.rotation;
      this.tiltScaleX = card.scaleX;
      this.tiltScaleY = card.scaleY;
      this.tiltBaseY = card.y;
      this.stopWobble(card);

      // Scale up — card "lifts" toward the viewer
      this.scene.tweens.add({
        targets: card,
        scaleX: ANIM.CARD_TILT_LIFT,
        scaleY: ANIM.CARD_TILT_LIFT,
        y: this.tiltBaseY - 4,
        duration: 200,
        ease: 'Back.easeOut',
      });

      // Install scene-level pointermove if not already
      if (!this.moveHandler) {
        this.moveHandler = (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer);
        this.scene.input.on('pointermove', this.moveHandler);
      }
    });

    card.on('pointerout', () => {
      if (this.hoveredCard !== card) return;
      this.hoveredCard = null;
      this.resetTilt(card);
      this.resumeWobble(card);
    });
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const card = this.hoveredCard;
    if (!card || this.draggingCard === card) return;

    // Convert pointer world position to card-local coordinates
    const cardWorldX = this.x + card.x;
    const cardWorldY = this.y + card.y;
    const cw = card.width;
    const ch = card.height;

    // Normalized offset from card center: -1 to 1
    const nx = Phaser.Math.Clamp((pointer.worldX - cardWorldX) / (cw / 2), -1, 1);
    const ny = Phaser.Math.Clamp((pointer.worldY - cardWorldY) / (ch / 2), -1, 1);

    // Target values
    const targetRotation = -nx * ANIM.CARD_TILT_MAX;
    // Foreshorten scaleX based on horizontal offset (perspective simulation)
    const targetScaleX = ANIM.CARD_TILT_LIFT - Math.abs(nx) * ANIM.CARD_TILT_SCALE_AMOUNT;
    // Slight vertical foreshortening
    const targetScaleY = ANIM.CARD_TILT_LIFT - Math.abs(ny) * ANIM.CARD_TILT_SCALE_AMOUNT * 0.4;

    // Lerp toward targets for smooth, weighted feel
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

  // ─── Drag-to-Reorder ───

  /** Target X positions for the current card count */
  private getCardXPositions(count: number): number[] {
    if (count === 0) return [];
    const spacing = UI.EQUIP_CARD_SPACING;
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

      this.draggingCard = card;
      this.dragStartIndex = idx;
      this.dragOffsetX = pointer.worldX - (this.x + card.x);
      this.dragOffsetY = pointer.worldY - (this.y + card.y);
      this.dragPrevX = pointer.worldX;
      this.dragVelocityX = 0;

      // Stop wobble and clear hover tilt
      this.stopWobble(card);
      this.hoveredCard = null;
      card.setDepth(200);
      this.bringToTop(card);
      card.scaleX = 1.03;
      card.scaleY = 1.03;
    });

    this.scene.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!this.draggingCard || gameObject !== this.draggingCard) return;

      // Track velocity for momentum swing (exponential moving average)
      const dx = pointer.worldX - this.dragPrevX;
      this.dragVelocityX = this.dragVelocityX * ANIM.CARD_DRAG_SWING_DAMPING + dx * (1 - ANIM.CARD_DRAG_SWING_DAMPING);
      this.dragPrevX = pointer.worldX;

      // Apply swing rotation — card trails behind cursor like a pendulum
      const swing = Phaser.Math.Clamp(
        this.dragVelocityX * ANIM.CARD_DRAG_SWING_FACTOR,
        -ANIM.CARD_DRAG_SWING_MAX,
        ANIM.CARD_DRAG_SWING_MAX,
      );
      this.draggingCard.rotation = swing;

      // Free vertical movement — follow pointer Y
      this.draggingCard.y = pointer.worldY - this.y - this.dragOffsetY;

      // Convert pointer world position to container-local, accounting for initial grab offset
      this.draggingCard.x = pointer.worldX - this.x - this.dragOffsetX;

      // Determine which slot it's closest to
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

        // Animate non-dragged cards to their new slots
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

      // Snap to final position with a decaying spring settle
      const positions = this.getCardXPositions(this.cards.length);
      const cy = this.barHeight / 2;
      const overshoot = Phaser.Math.Clamp(
        finalVelocity * ANIM.CARD_DRAG_SWING_FACTOR * 2,
        -ANIM.CARD_DRAG_SWING_MAX,
        ANIM.CARD_DRAG_SWING_MAX,
      );
      const dur = ANIM.CARD_DRAG_SETTLE_DURATION;

      // Spring settle: overshoot → counter → small counter → rest
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
        player.reorderEquipment(this.dragStartIndex, finalIndex);
      }

      this.dragStartIndex = -1;
    });
  }
}
