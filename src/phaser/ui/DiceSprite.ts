// ─── DiceSprite ───
// Phaser Container that renders a die as a rounded rect with pip dots.
// Reads from a Die data object — no game logic here.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { Die, PipEffect } from '../../game/types';
import diceEnhancementsData from '../../data/dice_enhancements.json';
import diceAurasData from '../../data/dice_auras.json';
import pipEnhancementsData from '../../data/pip_enhancements.json';

// Lookup maps for descriptions
const ENHANCEMENT_INFO = new Map(diceEnhancementsData.map(e => [e.id, e]));
const AURA_INFO = new Map(diceAurasData.map(a => [a.id, a]));
const PIP_INFO = new Map(pipEnhancementsData.map(p => [p.id, p]));

const DICE_SIZE = 64;
const DICE_RADIUS = 10;
const PIP_RADIUS = 5;
const BG_COLOR = 0xf5f0e1;
const PIP_COLOR = 0x222222;
const SELECTED_STROKE = 0xffcc00;
const FORCED_STROKE = 0xff4444;
const DEFAULT_STROKE = 0x444444;
const GRIMY_COLOR = 0x6b5a3e;
const INDICATOR_SIZE = 8;
const INDICATOR_GAP = 2;
const MINI_SIZE = 36;
const MINI_GAP = 4;
const MINI_PIP_RADIUS = 3;
const TOOLTIP_PAD = 10;
const TOOLTIP_BG_COLOR = 0x1a1a2e;
const TOOLTIP_BORDER_COLOR = 0x555588;

// Pip positions for a standard die face, normalized to 0-1 range
const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.5], [0.75, 0.5], [0.25, 0.75], [0.75, 0.75]],
};

export class DiceSprite extends GameObjects.Container {
  private bg: GameObjects.Graphics;
  private pipGraphics: GameObjects.Graphics;
  private auraGfx: GameObjects.Graphics;
  private auraLabel: GameObjects.Text | null = null;
  private indicatorContainer: GameObjects.Container | null = null;
  private tooltip: GameObjects.Container | null = null;
  private auraTweens: Phaser.Tweens.Tween[] = [];
  private auraEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private _dieData: Die;
  private _selected: boolean = false;
  private _forced: boolean = false;
  _disabled: boolean = false;
  private _showAuraLabel: boolean = false;

  constructor(scene: Scene, x: number, y: number, dieData: Die, options?: { showAuraLabel?: boolean }) {
    super(scene, x, y);
    this._dieData = dieData;
    this._showAuraLabel = options?.showAuraLabel ?? false;

    this.auraGfx = scene.add.graphics();
    this.bg = scene.add.graphics();
    this.pipGraphics = scene.add.graphics();
    this.add([this.auraGfx, this.bg, this.pipGraphics]);

    this.setSize(DICE_SIZE, DICE_SIZE);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, DICE_SIZE, DICE_SIZE),
      Phaser.Geom.Rectangle.Contains
    );

    this.redraw();
    this.drawPipIndicators();
    this.drawAuraFX();

    this.on('pointerover', this.showTooltip, this);
    this.on('pointerout', this.hideTooltip, this);

    scene.add.existing(this);
  }

  get dieData(): Die {
    return this._dieData;
  }

  get selected(): boolean {
    return this._selected;
  }

  setDieData(data: Die): void {
    this._dieData = data;
    this.redraw();
    this.drawPipIndicators();
    this.drawAuraFX();
  }

  setSelected(selected: boolean): void {
    this._selected = selected;
    this.redraw();
  }

  setForced(forced: boolean): void {
    this._forced = forced;
    this._selected = forced;
    this.redraw();
  }

  get forced(): boolean {
    return this._forced;
  }

  setDisabled(disabled: boolean): void {
    this._disabled = disabled;
    this.setAlpha(disabled ? 0.4 : 1);
  }

  toggleSelected(): void {
    this.setSelected(!this._selected);
  }

  private redraw(): void {
    this.bg.clear();
    this.pipGraphics.clear();

    const half = DICE_SIZE / 2;
    const isGrimy = this._dieData.isGrimy;

    // Background
    const hasEnhancement = !!this._dieData.enhancement;
    const bgColor = isGrimy ? GRIMY_COLOR : (hasEnhancement ? getEnhancementBgColor(this._dieData.enhancement!) : BG_COLOR);
    const strokeColor = this._forced ? FORCED_STROKE : (this._selected ? SELECTED_STROKE : DEFAULT_STROKE);
    const strokeWidth = (this._selected || this._forced) ? 3 : 1;

    this.bg.fillStyle(bgColor, 1);
    this.bg.fillRoundedRect(-half, -half, DICE_SIZE, DICE_SIZE, DICE_RADIUS);
    this.bg.lineStyle(strokeWidth, strokeColor, 1);
    this.bg.strokeRoundedRect(-half, -half, DICE_SIZE, DICE_SIZE, DICE_RADIUS);

    // Enhancement label at bottom
    if (this._dieData.enhancement && !isGrimy) {
      const labelColor = getEnhancementLabelColor(this._dieData.enhancement);
      // Small text label would be ideal but we use a colored accent bar
      this.bg.fillStyle(labelColor, 0.5);
      this.bg.fillRect(-half + 2, half - 10, DICE_SIZE - 4, 8);
    }

    // Aura glow — now handled by drawAuraFX()

    // Pips (only if not grimy)
    if (!isGrimy && this._dieData.pips > 0) {
      const positions = PIP_POSITIONS[this._dieData.pips] || [];
      // Per-side pip color: check sidePips for the current face
      const currentSidePip = this._dieData.sidePips?.[this._dieData.pips - 1] ?? null;
      const pipColor = currentSidePip
        ? getPipEffectColor(currentSidePip)
        : (hasEnhancement ? getEnhancementPipColor(this._dieData.enhancement!) : PIP_COLOR);
      this.pipGraphics.fillStyle(pipColor, 1);

      const inset = 12;
      const area = DICE_SIZE - inset * 2;
      for (const [nx, ny] of positions) {
        const px = -half + inset + nx * area;
        const py = -half + inset + ny * area;
        this.pipGraphics.fillCircle(px, py, PIP_RADIUS);
      }
    }

    // Question mark for grimy dice
    if (isGrimy) {
      // Drawn as text would be better but Graphics-only approach:
      // We'll just skip pips — the grimy color signals "unknown"
    }
  }

  private drawAuraFX(): void {
    // Clean up previous
    this.auraGfx.clear();
    if (this.auraLabel) {
      this.auraLabel.destroy();
      this.auraLabel = null;
    }
    for (const tw of this.auraTweens) tw.destroy();
    this.auraTweens = [];
    for (const em of this.auraEmitters) em.destroy();
    this.auraEmitters = [];

    const aura = this._dieData.aura;
    if (!aura) return;

    this.ensureParticleTextures();

    const half = DICE_SIZE / 2;
    const color = getAuraColor(aura);
    const info = AURA_INFO.get(aura);

    // Subtle pulsing border to identify aura type
    this.auraGfx.lineStyle(2, color, 0.6);
    this.auraGfx.strokeRoundedRect(-half - 2, -half - 2, DICE_SIZE + 4, DICE_SIZE + 4, DICE_RADIUS + 1);
    this.auraTweens.push(
      this.scene.tweens.add({
        targets: this.auraGfx,
        alpha: { from: 0.4, to: 0.9 },
        duration: aura === 'fire' ? 500 : aura === 'icy' ? 2000 : 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    );

    // Particle effects per aura type
    if (aura === 'fire') {
      this.createFireParticles(half);
    } else if (aura === 'icy') {
      this.createIcyParticles(half);
    } else if (aura === 'holy') {
      this.createHolyParticles(half);
    }

    // Aura label below indicators (only in grab bag / booster pack)
    if (info && this._showAuraLabel) {
      this.auraLabel = this.scene.add.text(0, half + 16, info.name, {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: '#' + color.toString(16).padStart(6, '0'),
        align: 'center',
      }).setOrigin(0.5, 0);
      this.add(this.auraLabel);
    }
  }

  private ensureParticleTextures(): void {
    const tm = this.scene.textures;
    if (!tm.exists('aura_particle')) {
      const gfx = this.scene.add.graphics();
      // Soft glowing circle
      gfx.fillStyle(0xffffff, 0.3);
      gfx.fillCircle(8, 8, 8);
      gfx.fillStyle(0xffffff, 0.6);
      gfx.fillCircle(8, 8, 5);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillCircle(8, 8, 2);
      gfx.generateTexture('aura_particle', 16, 16);
      gfx.destroy();
    }
    if (!tm.exists('aura_spark')) {
      const gfx = this.scene.add.graphics();
      gfx.fillStyle(0xffffff, 1);
      gfx.fillCircle(3, 3, 3);
      gfx.generateTexture('aura_spark', 6, 6);
      gfx.destroy();
    }
  }

  private createFireParticles(half: number): void {
    // Rising flame particles from bottom edge
    const flames = this.scene.add.particles(0, 0, 'aura_particle', {
      speed: { min: 15, max: 50 },
      angle: { min: -110, max: -70 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: { min: 400, max: 800 },
      frequency: 35,
      quantity: 1,
      tint: [0xff4500, 0xff6600, 0xffaa00, 0xff2200],
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-half, half - 8, DICE_SIZE, 8),
      } as any,
      maxAliveParticles: 18,
    });
    this.add(flames);
    this.auraEmitters.push(flames);

    // Ember sparks from edges
    const embers = this.scene.add.particles(0, 0, 'aura_spark', {
      speed: { min: 25, max: 70 },
      angle: { min: -130, max: -50 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 300, max: 600 },
      frequency: 80,
      quantity: 1,
      tint: [0xffdd00, 0xff8800, 0xff4400],
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-half - 4, -half, DICE_SIZE + 8, DICE_SIZE),
      } as any,
      maxAliveParticles: 8,
    });
    this.add(embers);
    this.auraEmitters.push(embers);
  }

  private createIcyParticles(half: number): void {
    // Slow drifting ice crystals around the die
    const crystals = this.scene.add.particles(0, 0, 'aura_spark', {
      speed: { min: 5, max: 18 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 0.1 },
      alpha: { start: 0.8, end: 0 },
      lifespan: { min: 1500, max: 2500 },
      frequency: 100,
      quantity: 1,
      tint: [0x88ddff, 0xaaeeff, 0xffffff, 0x00bfff],
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-half - 6, -half - 6, DICE_SIZE + 12, DICE_SIZE + 12),
      } as any,
      maxAliveParticles: 15,
    });
    this.add(crystals);
    this.auraEmitters.push(crystals);

    // Gentle frost mist falling downward
    const mist = this.scene.add.particles(0, 0, 'aura_particle', {
      speedX: { min: -10, max: 10 },
      speedY: { min: 5, max: 15 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.4, end: 0 },
      lifespan: { min: 2000, max: 3000 },
      frequency: 200,
      quantity: 1,
      tint: 0xcceeFF,
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-half - 8, -half - 8, DICE_SIZE + 16, 8),
      } as any,
      maxAliveParticles: 8,
    });
    this.add(mist);
    this.auraEmitters.push(mist);
  }

  private createHolyParticles(half: number): void {
    // Rising golden sparkles
    const sparkles = this.scene.add.particles(0, 0, 'aura_particle', {
      speed: { min: 10, max: 30 },
      angle: { min: -100, max: -80 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: { min: 800, max: 1400 },
      frequency: 60,
      quantity: 1,
      tint: [0xfffacd, 0xffd700, 0xfff8b0],
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-half - 4, -half, DICE_SIZE + 8, DICE_SIZE),
      } as any,
      maxAliveParticles: 15,
    });
    this.add(sparkles);
    this.auraEmitters.push(sparkles);

    // Soft halo glow above the die
    const halo = this.scene.add.particles(0, -half - 4, 'aura_particle', {
      speed: { min: 3, max: 10 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.4, end: 0 },
      lifespan: { min: 600, max: 1000 },
      frequency: 120,
      quantity: 1,
      tint: 0xfffacd,
      blendMode: 'ADD',
      maxAliveParticles: 6,
    });
    this.add(halo);
    this.auraEmitters.push(halo);
  }

  private drawPipIndicators(): void {
    if (this.indicatorContainer) {
      this.indicatorContainer.destroy();
      this.indicatorContainer = null;
    }

    if (this._dieData.isGrimy) return;

    const sp = this._dieData.sidePips;
    if (!sp || !sp.some(e => e !== null)) return;

    const half = DICE_SIZE / 2;
    const totalWidth = 6 * INDICATOR_SIZE + 5 * INDICATOR_GAP;
    const startX = -totalWidth / 2;
    const topY = half + 3;

    this.indicatorContainer = this.scene.add.container(0, 0);
    this.add(this.indicatorContainer);

    const gfx = this.scene.add.graphics();
    for (let i = 0; i < 6; i++) {
      const eff = sp[i];
      const sx = startX + i * (INDICATOR_SIZE + INDICATOR_GAP);
      if (eff) {
        gfx.fillStyle(getPipEffectColor(eff), 1);
      } else {
        gfx.fillStyle(0x999999, 0.3);
      }
      gfx.fillRect(sx, topY, INDICATOR_SIZE, INDICATOR_SIZE);
    }
    this.indicatorContainer.add(gfx);
  }

  private showTooltip(): void {
    if (this.tooltip) return;

    // Get world position (handles nested containers)
    const matrix = this.getWorldTransformMatrix();
    const worldX = matrix.tx;
    const worldY = matrix.ty;
    const half = DICE_SIZE / 2;

    this.tooltip = this.scene.add.container(0, 0).setDepth(1000);

    // --- Info text ---
    const lines: string[] = [];

    if (this._dieData.enhancement) {
      const info = ENHANCEMENT_INFO.get(this._dieData.enhancement);
      if (info) {
        lines.push(`${info.name} Die`);
        lines.push(`  ${info.description}`);
      }
    } else {
      lines.push('Standard Die');
    }

    if (this._dieData.aura) {
      const info = AURA_INFO.get(this._dieData.aura);
      if (info) {
        lines.push(`${info.name} Aura: ${info.description}`);
      }
    }

    if (this._dieData.isGrimy) {
      lines.push('Grimy (face hidden)');
    }

    // Pip effect summary
    const pipCounts = new Map<string, number>();
    for (const pip of this._dieData.sidePips) {
      if (pip) {
        pipCounts.set(pip, (pipCounts.get(pip) || 0) + 1);
      }
    }
    for (const [pip, count] of pipCounts) {
      const info = PIP_INFO.get(pip);
      const pipName = info ? info.name : pip.replace(/_/g, ' ');
      const pipDesc = info ? ` - ${info.description}` : '';
      lines.push(`${count}× ${pipName}${pipDesc}`);
    }

    const infoText = this.scene.add.text(0, 0, lines.join('\n'), {
      fontFamily: 'Arial',
      fontSize: '13px',
      color: '#dddddd',
      lineSpacing: 4,
    }).setOrigin(0, 0);

    // --- 2x3 mini dice grid ---
    const GRID_COLS = 3;
    const GRID_ROWS = 2;
    const gridWidth = GRID_COLS * MINI_SIZE + (GRID_COLS - 1) * MINI_GAP;
    const gridHeight = GRID_ROWS * MINI_SIZE + (GRID_ROWS - 1) * MINI_GAP;

    const textWidth = infoText.width;
    const textHeight = infoText.height;

    const contentWidth = Math.max(textWidth, gridWidth);
    const contentHeight = textHeight + 8 + gridHeight;

    const tooltipWidth = contentWidth + TOOLTIP_PAD * 2;
    const tooltipHeight = contentHeight + TOOLTIP_PAD * 2;

    // Background
    const bg = this.scene.add.graphics();
    bg.fillStyle(TOOLTIP_BG_COLOR, 0.95);
    bg.fillRoundedRect(0, 0, tooltipWidth, tooltipHeight, 8);
    bg.lineStyle(1, TOOLTIP_BORDER_COLOR, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipWidth, tooltipHeight, 8);
    this.tooltip.add(bg);

    // Position text
    infoText.setPosition(TOOLTIP_PAD, TOOLTIP_PAD);
    this.tooltip.add(infoText);

    // Draw mini dice grid
    const gridStartX = TOOLTIP_PAD + (contentWidth - gridWidth) / 2;
    const gridStartY = TOOLTIP_PAD + textHeight + 8;

    for (let i = 0; i < 6; i++) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const mx = gridStartX + col * (MINI_SIZE + MINI_GAP);
      const my = gridStartY + row * (MINI_SIZE + MINI_GAP);
      this.drawMiniDieFace(mx, my, i + 1, this._dieData.sidePips[i]);
    }

    // Position tooltip above the die
    let tx = worldX - tooltipWidth / 2;
    let ty = worldY - half - tooltipHeight - 12;

    // Clamp to screen bounds
    const { width: sw } = this.scene.scale;
    if (tx < 8) tx = 8;
    if (tx + tooltipWidth > sw - 8) tx = sw - 8 - tooltipWidth;
    if (ty < 8) {
      ty = worldY + half + 28;
    }

    this.tooltip.setPosition(tx, ty);
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }

  private drawMiniDieFace(
    x: number, y: number,
    pips: number,
    sidePip: PipEffect,
  ): void {
    if (!this.tooltip) return;

    const gfx = this.scene.add.graphics();
    const die = this._dieData;

    // Background
    const bgColor = die.enhancement
      ? getEnhancementBgColor(die.enhancement)
      : BG_COLOR;
    gfx.fillStyle(bgColor, 1);
    gfx.fillRoundedRect(x, y, MINI_SIZE, MINI_SIZE, 4);

    // Border — colored if side has pip effect
    if (sidePip) {
      gfx.lineStyle(2, getPipEffectColor(sidePip), 1);
    } else {
      gfx.lineStyle(1, 0x444444, 0.6);
    }
    gfx.strokeRoundedRect(x, y, MINI_SIZE, MINI_SIZE, 4);

    // Pips
    const positions = PIP_POSITIONS[pips] || [];
    const pipColor = sidePip
      ? getPipEffectColor(sidePip)
      : (die.enhancement ? getEnhancementPipColor(die.enhancement) : PIP_COLOR);
    gfx.fillStyle(pipColor, 1);
    const inset = 8;
    const area = MINI_SIZE - inset * 2;
    for (const [nx, ny] of positions) {
      const px = x + inset + nx * area;
      const py = y + inset + ny * area;
      gfx.fillCircle(px, py, MINI_PIP_RADIUS);
    }

    this.tooltip.add(gfx);

    // Side number label
    const label = this.scene.add.text(x + MINI_SIZE - 3, y + 2, `${pips}`, {
      fontFamily: 'Arial',
      fontSize: '9px',
      color: '#888888',
    }).setOrigin(1, 0);
    this.tooltip.add(label);
  }

  destroy(fromScene?: boolean): void {
    this.hideTooltip();
    for (const tw of this.auraTweens) tw.destroy();
    this.auraTweens = [];
    for (const em of this.auraEmitters) em.destroy();
    this.auraEmitters = [];
    super.destroy(fromScene);
  }
}

function getEnhancementColor(e: string): number {
  const colors: Record<string, number> = {
    bone: 0xd4c9a8, 
    lucky: 0x4caf50, 
    wooden: 0x8b6914,
    iron: 0x808080, 
    gold: 0xcaab02, 
    loaded: 0xcc3333,
    diamond: 0x00bcd4, 
    stone: 0x666666, 
    blurry: 0xaa88ff,
  };
  return colors[e] ?? 0xffffff;
}

/** Full background color for enhanced dice — tinted but visible */
function getEnhancementBgColor(e: string): number {
  const colors: Record<string, number> = {
    bone:    0xe8dcc8,  // warm cream/bone
    lucky:   0xc8f0c8,  // light green
    wooden:  0xc4a055,  // wood brown
    iron:    0xa8a8b0,  // steel grey
    gold:    0xffe870,  // bright gold
    loaded:  0xf0a0a0,  // soft red
    diamond: 0xa0e8f0,  // light cyan
    stone:   0x888888,  // dark grey
    blurry:  0xd0c0f0,  // light purple
  };
  return colors[e] ?? BG_COLOR;
}

/** Pip color that contrasts with the enhancement background */
function getEnhancementPipColor(e: string): number {
  const colors: Record<string, number> = {
    bone:    0x5a4a2a,  // dark brown
    lucky:   0x1a5a1a,  // dark green
    wooden:  0x3a2a00,  // dark brown
    iron:    0x2a2a3a,  // dark blue-grey
    gold:    0x8a6a00,  // dark gold
    loaded:  0x6a0000,  // dark red
    diamond: 0x004a5a,  // dark teal
    stone:   0x333333,  // very dark grey
    blurry:  0x4a2a8a,  // dark purple
  };
  return colors[e] ?? PIP_COLOR;
}

/** Accent bar color (slightly darker than bg) */
function getEnhancementLabelColor(e: string): number {
  return getEnhancementColor(e);
}

function getAuraColor(a: string): number {
  const colors: Record<string, number> = {
    holy: 0xc8a800, fire: 0xff4500, icy: 0x0088cc,
  };
  return colors[a] ?? 0xffffff;
}

function getPipEffectColor(p: string): number {
  const colors: Record<string, number> = {
    purple_flower: 0x9c27b0, 
    red_bullet: 0xf44336,
    golden_dollar: 0xffd700, 
    blue_diamond: 0x2196f3,
  };
  return colors[p] ?? PIP_COLOR;
}
