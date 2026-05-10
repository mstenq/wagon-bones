// ─── ScoreAnimation ───
// Balatro-style sequential dice scoring: each die shakes and adds to the
// running miles/mult tally shown in the sidebar. Equipment that contributes
// gets wiggled. Sounds play on each step.

import { Scene } from 'phaser';
import { DiceSprite } from '../ui/DiceSprite';
import { Die, ScoreResult } from '../../game/types';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import { EquipmentInstance } from '../../game/ItemsSystem';
import { ANIM } from '../../game/Constants';

export interface ScoreAnimationConfig {
  scene: Scene;
  diceSprites: DiceSprite[];
  result: ScoreResult;
  sidebar: Sidebar;
  equipBar: EquipmentBar;
  equipment: EquipmentInstance[];
  onComplete: () => void;
}

/** Determine which equipment indices trigger for a specific die */
function getTriggeredEquipForDie(die: Die, equipment: EquipmentInstance[], _handType: string): number[] {
  const triggered: number[] = [];
  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i];
    const { effectType, effectParams } = equip.def;
    const p = effectParams as Record<string, unknown>;
    switch (effectType) {
      case 'PIP_MULT':
      case 'PIP_MILES':
        if (die.pips === (p.pip as number)) triggered.push(i);
        break;
      case 'PARITY_MULT':
      case 'PARITY_MILES': {
        const parity = p.parity as string;
        const matches = parity === 'odd' ? die.pips % 2 !== 0 : die.pips % 2 === 0;
        if (matches) triggered.push(i);
        break;
      }
    }
  }
  return triggered;
}

/** Determine which equipment triggers independently (not per-die) */
function getIndependentTriggeredEquip(equipment: EquipmentInstance[], handType: string, context: { rerollsRemaining: number; scoringDice: Die[]; equipmentCount: number }): number[] {
  const triggered: number[] = [];
  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i];
    const { effectType, effectParams } = equip.def;
    const p = effectParams as Record<string, unknown>;
    switch (effectType) {
      case 'ADD_MULT':
      case 'ADD_MULT_RISKY':
        triggered.push(i);
        break;
      case 'HAND_MULT':
      case 'HAND_MILES':
        if (handTypeMatches(handType, p.handType as string)) triggered.push(i);
        break;
      case 'MILES_PER_UNUSED_REROLL':
        if (context.rerollsRemaining > 0) triggered.push(i);
        break;
      case 'CONDITIONAL_MULT': {
        const condition = p.condition as string;
        let met = false;
        if (condition === 'SCORED_DICE_LTE') met = context.scoringDice.length <= (p.threshold as number);
        else if (condition === 'NO_REROLLS') met = context.rerollsRemaining === 0;
        if (met) triggered.push(i);
        break;
      }
      case 'MULT_PER_EQUIPMENT':
        triggered.push(i);
        break;
    }

    // Aura effects trigger independently (fire, icy, holy all contribute to scoring)
    if (!triggered.includes(i) && equip.def.aura) {
      const auraId = equip.def.aura.id;
      if (auraId === 'fire' || auraId === 'icy' || auraId === 'holy') {
        triggered.push(i);
      }
    }
  }
  return triggered;
}

function handTypeMatches(played: string, required: string): boolean {
  if (played === required) return true;
  if (played === 'FULL_HOUSE' && (required === 'PAIR' || required === 'THREE_OF_A_KIND')) return true;
  if (played === 'TWO_PAIR' && required === 'PAIR') return true;
  if (played === 'FOUR_OF_A_KIND' && (required === 'THREE_OF_A_KIND' || required === 'PAIR')) return true;
  if (played === 'FIVE_OF_A_KIND' && (required === 'FOUR_OF_A_KIND' || required === 'THREE_OF_A_KIND' || required === 'PAIR')) return true;
  if (played === 'FIVE_STRAIGHT' && (required === 'FOUR_STRAIGHT' || required === 'THREE_STRAIGHT')) return true;
  if (played === 'FOUR_STRAIGHT' && required === 'THREE_STRAIGHT') return true;
  return false;
}

/** Wiggle an equipment card */
function wiggleEquipCard(scene: Scene, equipBar: EquipmentBar, index: number): void {
  const cards = equipBar.getCards();
  if (index >= cards.length) return;
  const card = cards[index];
  const origX = card.x;
  scene.tweens.add({
    targets: card,
    x: origX - 3,
    duration: 40,
    yoyo: true,
    repeat: 2,
    ease: 'Sine.easeInOut',
    onComplete: () => { card.x = origX; },
  });
}

export function playScoreAnimation(config: ScoreAnimationConfig): void {
  const { scene, diceSprites, result, sidebar, equipBar, equipment, onComplete } = config;
  const scoringIds = new Set(result.handResult.scoringDice.map(d => d.id));
  const scoringSprites = diceSprites.filter(s => scoringIds.has(s.dieData.id));

  const handBaseMiles = result.handResult.baseMiles;
  const handBaseMult = result.handResult.baseMult;

  // Initialize sidebar miles/mult with the hand base values
  let currentMiles = handBaseMiles;
  let currentMult = handBaseMult;

  sidebar.setMilesAnimated(currentMiles);
  sidebar.setMultAnimated(currentMult);

  // Sound for hand detection
  scene.sound.play('sfx_chips1', { volume: 0.5 });

  let index = 0;

  function scoreNextDie() {
    if (index >= scoringSprites.length) {
      // All dice scored — now trigger independent equipment
      const independentEquip = getIndependentTriggeredEquip(equipment, result.handResult.type, {
        rerollsRemaining: (result as any)._rerollsRemaining ?? 0,
        scoringDice: result.handResult.scoringDice,
        equipmentCount: equipment.length,
      });

      if (independentEquip.length > 0) {
        let equipIdx = 0;
        function triggerNextEquip() {
          if (equipIdx >= independentEquip.length) {
            finishScoring();
            return;
          }
          const eqI = independentEquip[equipIdx];
          wiggleEquipCard(scene, equipBar, eqI);
          scene.sound.play('sfx_multhit1', { volume: 0.35 });
          equipIdx++;
          scene.time.delayedCall(180, triggerNextEquip);
        }
        scene.time.delayedCall(200, triggerNextEquip);
      } else {
        finishScoring();
      }
      return;
    }

    const sprite = scoringSprites[index];
    const die = sprite.dieData;

    // Save original position
    const origX = sprite.x;
    const origY = sprite.y;

    // Shake animation
    const shakeDuration = 60;
    const shakeCount = 3;
    const shakeIntensity = 3;

    let shakeStep = 0;
    scene.time.addEvent({
      delay: shakeDuration,
      repeat: shakeCount * 2 - 1,
      callback: () => {
        shakeStep++;
        if (shakeStep % 2 === 1) {
          sprite.x = origX + (Math.random() > 0.5 ? shakeIntensity : -shakeIntensity);
          sprite.y = origY + (Math.random() > 0.5 ? 1 : -1);
        } else {
          sprite.x = origX;
          sprite.y = origY;
        }
      },
    });

    // After shake, bump up and add pips to miles
    scene.time.delayedCall(shakeDuration * shakeCount * 2, () => {
      // Ensure position reset
      sprite.x = origX;
      sprite.y = origY;

      // Scale pop
      scene.tweens.add({
        targets: sprite,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 100,
        yoyo: true,
        ease: 'Back.easeOut',
      });

      // Add this die's pips to miles
      currentMiles += die.pips;
      sidebar.setMilesAnimated(currentMiles);
      scene.sound.play('sfx_chips2', { volume: 0.3, detune: index * 80 });

      // Wiggle equipment that triggers for this die
      const triggered = getTriggeredEquipForDie(die, equipment, result.handResult.type);
      if (triggered.length > 0) {
        scene.time.delayedCall(80, () => {
          for (const eqI of triggered) {
            wiggleEquipCard(scene, equipBar, eqI);
          }
          scene.sound.play('sfx_multhit2', { volume: 0.3 });
        });
      }

      index++;
      scene.time.delayedCall(ANIM.SCORE_HIGHLIGHT_DURATION + 100, scoreNextDie);
    });
  }

  function finishScoring() {
    scene.time.delayedCall(ANIM.SCORE_FINAL_FLASH_DELAY, () => {
      // Reset miles/mult to 0
      sidebar.updateData({ milesBase: 0, mult: 0 });

      // Bump round score
      sidebar.setRoundScoreAnimated((result as any)._roundScoreBefore + result.miles);
      scene.sound.play('sfx_timpani', { volume: 0.5 });

      scene.time.delayedCall(ANIM.SCORE_COMPLETE_DELAY + 400, onComplete);
    });
  }

  // Start the scoring sequence after a short delay
  scene.time.delayedCall(300, scoreNextDie);
}
