// ─── AuraFX ───
// Shared aura visual effects for dice and equipment cards.
// Uses Phaser 4 Filters (glow) + particles for dramatic per-aura VFX.

import * as Phaser from 'phaser';
import { Scene, GameObjects } from 'phaser';

// ─── Shared Aura Color Palette ───
export const AURA_COLORS: Record<string, { primary: number; secondary: number; glow: number; tints: number[] }> = {
  holy: {
    primary: 0xffd700,
    secondary: 0xfffacd,
    glow: 0xffd700,
    tints: [0xffd700, 0xfffacd, 0xfff8b0, 0xffec80],
  },
  fire: {
    primary: 0xff4500,
    secondary: 0xff8800,
    glow: 0xff4500,
    tints: [0xff2200, 0xff4500, 0xff6600, 0xffaa00, 0xffdd00],
  },
  icy: {
    primary: 0x00bfff,
    secondary: 0x88ddff,
    glow: 0x00aaff,
    tints: [0x00bfff, 0x44ccff, 0x88ddff, 0xaaeeff, 0xffffff],
  },
  ghost: {
    primary: 0x44dd88,
    secondary: 0x88ffbb,
    glow: 0x33cc77,
    tints: [0x33cc77, 0x44dd88, 0x66eebb, 0x88ffbb, 0xaaffdd],
  },
};

export function getAuraPrimary(auraId: string): number {
  return AURA_COLORS[auraId]?.primary ?? 0xffffff;
}

// ─── Particle texture generation (shared) ───

export function ensureAuraTextures(scene: Scene): void {
  const tm = scene.textures;

  if (!tm.exists('aura_soft')) {
    const gfx = scene.add.graphics();
    // Larger soft glow circle with radial falloff
    gfx.fillStyle(0xffffff, 0.15);
    gfx.fillCircle(16, 16, 16);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(16, 16, 12);
    gfx.fillStyle(0xffffff, 0.5);
    gfx.fillCircle(16, 16, 8);
    gfx.fillStyle(0xffffff, 0.8);
    gfx.fillCircle(16, 16, 4);
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(16, 16, 2);
    gfx.generateTexture('aura_soft', 32, 32);
    gfx.destroy();
  }

  if (!tm.exists('aura_spark')) {
    const gfx = scene.add.graphics();
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(4, 4, 4);
    gfx.fillStyle(0xffffff, 0.5);
    gfx.fillCircle(4, 4, 6);
    gfx.generateTexture('aura_spark', 12, 12);
    gfx.destroy();
  }

  if (!tm.exists('aura_streak')) {
    const gfx = scene.add.graphics();
    // Elongated horizontal streak for fire wisps
    gfx.fillStyle(0xffffff, 0.8);
    gfx.fillRect(0, 2, 16, 4);
    gfx.fillStyle(0xffffff, 1);
    gfx.fillRect(2, 3, 12, 2);
    gfx.generateTexture('aura_streak', 16, 8);
    gfx.destroy();
  }
}

// ─── Glow filter helpers ───

/** Apply a pulsing glow filter to a game object. Returns cleanup function. */
export function applyAuraGlow(
  scene: Scene,
  target: GameObjects.GameObject & { enableFilters?: () => void; filters?: any },
  auraId: string,
  options?: { strength?: number; pulseDuration?: number; pulseMin?: number; pulseMax?: number },
): { tweens: Phaser.Tweens.Tween[]; destroy: () => void } {
  const colors = AURA_COLORS[auraId];
  if (!colors || !target.enableFilters) return { tweens: [], destroy: () => {} };

  const strength = options?.strength ?? 4;
  const pulseDuration = options?.pulseDuration ?? (auraId === 'fire' ? 400 : auraId === 'icy' ? 2500 : 1500);
  const pulseMin = options?.pulseMin ?? 0.5;
  const pulseMax = options?.pulseMax ?? 1;

  target.enableFilters();
  const glow = target.filters.internal.addGlow(
    colors.glow, strength, 0, 1, false, 4, 10,
  );

  const tweens: Phaser.Tweens.Tween[] = [];
  tweens.push(
    scene.tweens.add({
      targets: glow,
      outerStrength: { from: strength * pulseMin, to: strength * pulseMax },
      duration: pulseDuration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    }),
  );

  return {
    tweens,
    destroy: () => {
      for (const tw of tweens) tw.destroy();
      if (target.filters) {
        target.filters.internal.remove(glow);
      }
    },
  };
}

// ─── Per-aura particle effects ───

export interface AuraParticleResult {
  emitters: GameObjects.Particles.ParticleEmitter[];
  tweens: Phaser.Tweens.Tween[];
}

/** Create aura particles sized for a given bounding box. */
export function createAuraParticles(
  scene: Scene,
  auraId: string,
  halfW: number,
  halfH: number,
): AuraParticleResult {
  ensureAuraTextures(scene);
  const colors = AURA_COLORS[auraId];
  if (!colors) return { emitters: [], tweens: [] };

  switch (auraId) {
    case 'fire': return createFireParticles(scene, halfW, halfH, colors);
    case 'icy': return createIcyParticles(scene, halfW, halfH, colors);
    case 'holy': return createHolyParticles(scene, halfW, halfH, colors);
    case 'ghost': return createGhostParticles(scene, halfW, halfH, colors);
    default: return { emitters: [], tweens: [] };
  }
}

function createFireParticles(scene: Scene, hw: number, hh: number, colors: typeof AURA_COLORS['fire']): AuraParticleResult {
  const emitters: GameObjects.Particles.ParticleEmitter[] = [];
  const tweens: Phaser.Tweens.Tween[] = [];
  const w = hw * 2;
  const h = hh * 2;

  // Intense rising flames from bottom
  emitters.push(scene.add.particles(0, 0, 'aura_soft', {
    speed: { min: 20, max: 60 },
    angle: { min: -110, max: -70 },
    scale: { start: 0.7, end: 0 },
    alpha: { start: 0.9, end: 0 },
    lifespan: { min: 500, max: 900 },
    frequency: 25,
    quantity: 2,
    tint: colors.tints,
    blendMode: 'ADD',
    emitZone: {
      type: 'random',
      source: new Phaser.Geom.Rectangle(-hw + 4, hh - 6, w - 8, 6),
    } as any,
    maxAliveParticles: 30,
  }));

  // Hot ember sparks shooting upward from edges
  emitters.push(scene.add.particles(0, 0, 'aura_spark', {
    speed: { min: 40, max: 100 },
    angle: { min: -130, max: -50 },
    scale: { start: 0.4, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: 400, max: 700 },
    frequency: 50,
    quantity: 1,
    tint: [0xffdd00, 0xff8800, 0xff4400],
    blendMode: 'ADD',
    emitZone: {
      type: 'random',
      source: new Phaser.Geom.Rectangle(-hw - 2, hh - 12, w + 4, 12),
    } as any,
    maxAliveParticles: 12,
  }));

  // Heat distortion wisps along sides
  emitters.push(scene.add.particles(0, 0, 'aura_streak', {
    speed: { min: 10, max: 30 },
    angle: { min: -100, max: -80 },
    scale: { start: 0.5, end: 0 },
    alpha: { start: 0.5, end: 0 },
    lifespan: { min: 600, max: 1000 },
    frequency: 80,
    quantity: 1,
    tint: [0xff6600, 0xff4400],
    blendMode: 'ADD',
    rotate: { min: -30, max: 30 },
    emitZone: {
      type: 'random',
      source: new Phaser.Geom.Rectangle(-hw - 6, -hh, 6, h),
    } as any,
    maxAliveParticles: 6,
  }));

  // Same on right side
  emitters.push(scene.add.particles(0, 0, 'aura_streak', {
    speed: { min: 10, max: 30 },
    angle: { min: -100, max: -80 },
    scale: { start: 0.5, end: 0 },
    alpha: { start: 0.5, end: 0 },
    lifespan: { min: 600, max: 1000 },
    frequency: 80,
    quantity: 1,
    tint: [0xff6600, 0xff4400],
    blendMode: 'ADD',
    rotate: { min: -30, max: 30 },
    emitZone: {
      type: 'random',
      source: new Phaser.Geom.Rectangle(hw, -hh, 6, h),
    } as any,
    maxAliveParticles: 6,
  }));

  return { emitters, tweens };
}

function createIcyParticles(scene: Scene, hw: number, hh: number, colors: typeof AURA_COLORS['icy']): AuraParticleResult {
  const emitters: GameObjects.Particles.ParticleEmitter[] = [];
  const tweens: Phaser.Tweens.Tween[] = [];
  const w = hw * 2;
  const h = hh * 2;

  // Drifting ice crystals all around — slower, more serene
  emitters.push(scene.add.particles(0, 0, 'aura_spark', {
    speed: { min: 3, max: 12 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.5, end: 0 },
    alpha: { start: 0.9, end: 0 },
    lifespan: { min: 2000, max: 3500 },
    frequency: 60,
    quantity: 1,
    tint: colors.tints,
    blendMode: 'ADD',
    emitZone: {
      type: 'random',
      source: new Phaser.Geom.Rectangle(-hw - 8, -hh - 8, w + 16, h + 16),
    } as any,
    maxAliveParticles: 20,
  }));

  // Frost mist falling gently downward
  emitters.push(scene.add.particles(0, 0, 'aura_soft', {
    speedX: { min: -8, max: 8 },
    speedY: { min: 8, max: 20 },
    scale: { start: 0.5, end: 0 },
    alpha: { start: 0.35, end: 0 },
    lifespan: { min: 2500, max: 4000 },
    frequency: 120,
    quantity: 1,
    tint: [0xcceeFF, 0xaaddff, 0x88ccff],
    blendMode: 'ADD',
    emitZone: {
      type: 'random',
      source: new Phaser.Geom.Rectangle(-hw - 6, -hh - 10, w + 12, 10),
    } as any,
    maxAliveParticles: 10,
  }));

  // Occasional bright ice flash
  emitters.push(scene.add.particles(0, 0, 'aura_soft', {
    speed: { min: 1, max: 5 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.8, end: 0 },
    alpha: { start: 0.7, end: 0 },
    lifespan: { min: 300, max: 600 },
    frequency: 500,
    quantity: 1,
    tint: 0xffffff,
    blendMode: 'ADD',
    emitZone: {
      type: 'random',
      source: new Phaser.Geom.Rectangle(-hw, -hh, w, h),
    } as any,
    maxAliveParticles: 3,
  }));

  return { emitters, tweens };
}

function createHolyParticles(scene: Scene, hw: number, hh: number, colors: typeof AURA_COLORS['holy']): AuraParticleResult {
  const emitters: GameObjects.Particles.ParticleEmitter[] = [];
  const tweens: Phaser.Tweens.Tween[] = [];
  const w = hw * 2;
  const h = hh * 2;

  // Rising golden sparkles — graceful upward drift
  emitters.push(scene.add.particles(0, 0, 'aura_soft', {
    speed: { min: 12, max: 35 },
    angle: { min: -100, max: -80 },
    scale: { start: 0.5, end: 0 },
    alpha: { start: 0.9, end: 0 },
    lifespan: { min: 900, max: 1600 },
    frequency: 40,
    quantity: 1,
    tint: colors.tints,
    blendMode: 'ADD',
    emitZone: {
      type: 'random',
      source: new Phaser.Geom.Rectangle(-hw - 4, -hh, w + 8, h),
    } as any,
    maxAliveParticles: 20,
  }));

  // Halo ring above the die — soft pulsing light
  emitters.push(scene.add.particles(0, -hh - 6, 'aura_soft', {
    speed: { min: 2, max: 8 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.6, end: 0 },
    alpha: { start: 0.5, end: 0 },
    lifespan: { min: 700, max: 1200 },
    frequency: 80,
    quantity: 1,
    tint: 0xfffacd,
    blendMode: 'ADD',
    maxAliveParticles: 8,
  }));

  // Occasional bright divine flash burst
  emitters.push(scene.add.particles(0, 0, 'aura_spark', {
    speed: { min: 30, max: 80 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.4, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: 200, max: 400 },
    frequency: 1200,
    quantity: 4,
    tint: [0xffd700, 0xfffacd],
    blendMode: 'ADD',
    maxAliveParticles: 8,
  }));

  return { emitters, tweens };
}

function createGhostParticles(_scene: Scene, _hw: number, _hh: number, _colors: typeof AURA_COLORS['ghost']): AuraParticleResult {
  // Ghost aura uses tint + transparency on the card itself, no particles needed
  return { emitters: [], tweens: [] };
}
