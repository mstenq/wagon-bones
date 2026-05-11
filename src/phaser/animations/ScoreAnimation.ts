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
import { HeldAnimStep } from '../../game/EquipmentEffects';
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

/** Determine which equipment indices trigger for a specific die, with their contribution type */
function getTriggeredEquipForDie(die: Die, equipment: EquipmentInstance[], _handType: string): { index: number; type: 'mult' | 'miles'; value: number }[] {
  const triggered: { index: number; type: 'mult' | 'miles'; value: number }[] = [];
  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i];
    const { effectType, effectParams } = equip.def;
    const p = effectParams as Record<string, unknown>;
    switch (effectType) {
      case 'PIP_MULT':
        if (die.value === (p.pip as number)) triggered.push({ index: i, type: 'mult', value: p.value as number });
        break;
      case 'PIP_MILES':
        if (die.value === (p.pip as number)) triggered.push({ index: i, type: 'miles', value: p.value as number });
        break;
      case 'PARITY_MULT': {
        const parity = p.parity as string;
        const matches = parity === 'odd' ? die.value % 2 !== 0 : die.value % 2 === 0;
        if (matches) triggered.push({ index: i, type: 'mult', value: p.value as number });
        break;
      }
      case 'PARITY_MILES': {
        const parity = p.parity as string;
        const matches = parity === 'odd' ? die.value % 2 !== 0 : die.value % 2 === 0;
        if (matches) triggered.push({ index: i, type: 'miles', value: p.value as number });
        break;
      }
    }
  }
  return triggered;
}

/** Determine which equipment triggers independently (not per-die), with contribution details */
function getIndependentTriggeredEquip(equipment: EquipmentInstance[], handType: string, context: { rerollsRemaining: number; scoringDice: Die[]; equipmentCount: number }): { index: number; type: 'mult' | 'miles' | 'xmult'; value: number }[] {
  const triggered: { index: number; type: 'mult' | 'miles' | 'xmult'; value: number }[] = [];
  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i];
    const { effectType, effectParams } = equip.def;
    const p = effectParams as Record<string, unknown>;
    switch (effectType) {
      case 'ADD_MULT':
      case 'ADD_MULT_RISKY':
        triggered.push({ index: i, type: 'mult', value: p.value as number });
        break;
      case 'HAND_MULT':
        if (handTypeMatches(handType, p.handType as string))
          triggered.push({ index: i, type: 'mult', value: p.value as number });
        break;
      case 'HAND_MILES':
        if (handTypeMatches(handType, p.handType as string))
          triggered.push({ index: i, type: 'miles', value: p.value as number });
        break;
      case 'MILES_PER_UNUSED_REROLL': {
        const total = (p.value as number) * context.rerollsRemaining;
        if (total > 0) triggered.push({ index: i, type: 'miles', value: total });
        break;
      }
      case 'CONDITIONAL_MULT': {
        const condition = p.condition as string;
        let met = false;
        if (condition === 'SCORED_DICE_LTE') met = context.scoringDice.length <= (p.threshold as number);
        else if (condition === 'NO_REROLLS') met = context.rerollsRemaining === 0;
        if (met) triggered.push({ index: i, type: 'mult', value: p.value as number });
        break;
      }
      case 'MULT_PER_EQUIPMENT':
        triggered.push({ index: i, type: 'mult', value: (p.value as number) * context.equipmentCount });
        break;
    }

    // Aura effects
    if (equip.def.aura) {
      const auraId = equip.def.aura.id;
      if (auraId === 'fire') {
        triggered.push({ index: i, type: 'mult', value: 10 });
      } else if (auraId === 'icy') {
        triggered.push({ index: i, type: 'miles', value: 50 });
      } else if (auraId === 'holy') {
        triggered.push({ index: i, type: 'xmult', value: 1.5 });
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

  const EQUIP_STEP_DELAY = 250;

  let index = 0;

  function scoreNextDie() {
    if (index >= scoringSprites.length) {
      // All dice scored — now trigger independent equipment one by one
      const independentEquip = getIndependentTriggeredEquip(equipment, result.handResult.type, {
        rerollsRemaining: (result as any)._rerollsRemaining ?? 0,
        scoringDice: result.handResult.scoringDice,
        equipmentCount: equipment.length,
      });

      if (independentEquip.length > 0) {
        let equipIdx = 0;
        function triggerNextEquip() {
          if (equipIdx >= independentEquip.length) {
            startHeldInHandPhase();
            return;
          }
          const entry = independentEquip[equipIdx];
          wiggleEquipCard(scene, equipBar, entry.index);

          if (entry.type === 'mult') {
            currentMult += entry.value;
            sidebar.setMultAnimated(currentMult);
            scene.sound.play('sfx_multhit1', { volume: 0.35, detune: equipIdx * 60 });
          } else if (entry.type === 'miles') {
            currentMiles += entry.value;
            sidebar.setMilesAnimated(currentMiles);
            scene.sound.play('sfx_chips2', { volume: 0.35, detune: equipIdx * 60 });
          } else if (entry.type === 'xmult') {
            currentMult = Math.floor(currentMult * entry.value);
            sidebar.setMultAnimated(currentMult);
            scene.sound.play('sfx_multhit2', { volume: 0.45, detune: -200 });
          }

          equipIdx++;
          scene.time.delayedCall(EQUIP_STEP_DELAY, triggerNextEquip);
        }
        scene.time.delayedCall(200, triggerNextEquip);
      } else {
        startHeldInHandPhase();
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

      // Add this die's value to miles
      const dieMiles = die.enhancement === 'stone' ? 50 : die.value;
      currentMiles += dieMiles;
      sidebar.setMilesAnimated(currentMiles);
      scene.sound.play('sfx_chips2', { volume: 0.3, detune: index * 80 });

      // Per-die equipment triggers — animate each one sequentially
      const triggered = getTriggeredEquipForDie(die, equipment, result.handResult.type);
      if (triggered.length > 0) {
        let tIdx = 0;
        function triggerNextPerDie() {
          if (tIdx >= triggered.length) {
            index++;
            scene.time.delayedCall(ANIM.SCORE_HIGHLIGHT_DURATION, scoreNextDie);
            return;
          }
          const entry = triggered[tIdx];
          wiggleEquipCard(scene, equipBar, entry.index);
          if (entry.type === 'mult') {
            currentMult += entry.value;
            sidebar.setMultAnimated(currentMult);
            scene.sound.play('sfx_multhit1', { volume: 0.3 });
          } else {
            currentMiles += entry.value;
            sidebar.setMilesAnimated(currentMiles);
            scene.sound.play('sfx_chips2', { volume: 0.3, detune: 200 });
          }
          tIdx++;
          scene.time.delayedCall(EQUIP_STEP_DELAY, triggerNextPerDie);
        }
        scene.time.delayedCall(120, triggerNextPerDie);
      } else {
        index++;
        scene.time.delayedCall(ANIM.SCORE_HIGHLIGHT_DURATION + 100, scoreNextDie);
      }
    });
  }

  // ─── Held-in-Hand Animation Phase (Step 4) ───

  function startHeldInHandPhase() {
    const heldSteps: HeldAnimStep[] = (result as any)._heldSteps ?? [];
    if (heldSteps.length === 0) {
      finishScoring();
      return;
    }

    // Get held dice sprites (rolled but not scored)
    const heldSprites = diceSprites.filter(s => !scoringIds.has(s.dieData.id));
    const heldSpriteMap = new Map<string, DiceSprite>();
    for (const s of heldSprites) heldSpriteMap.set(s.dieData.id, s);

    let stepIdx = 0;
    const HELD_STEP_DELAY = 300;

    function animateNextHeldStep() {
      if (stepIdx >= heldSteps.length) {
        finishScoring();
        return;
      }

      const step = heldSteps[stepIdx];
      const sprite = heldSpriteMap.get(step.dieId);

      // Shake the held die sprite
      if (sprite) {
        const origX = sprite.x;
        const origY = sprite.y;
        const shakeDuration = 50;
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

        // Scale pop after shake
        scene.time.delayedCall(shakeDuration * shakeCount * 2, () => {
          sprite.x = origX;
          sprite.y = origY;
          scene.tweens.add({
            targets: sprite,
            scaleX: 1.15,
            scaleY: 1.15,
            duration: 100,
            yoyo: true,
            ease: 'Back.easeOut',
          });
        });
      }

      // Wiggle triggering equipment card
      if (step.equipIndex !== undefined) {
        wiggleEquipCard(scene, equipBar, step.equipIndex);
      }

      // Update sidebar values and play sound
      if (step.type === 'mult') {
        currentMult += step.value;
        sidebar.setMultAnimated(currentMult);
        scene.sound.play('sfx_multhit1', { volume: 0.3, detune: stepIdx * 50 });
      } else if (step.type === 'xmult') {
        currentMult = Math.floor(currentMult * step.value);
        sidebar.setMultAnimated(currentMult);
        scene.sound.play('sfx_multhit2', { volume: 0.4, detune: -100 });
      } else if (step.type === 'money') {
        scene.sound.play('sfx_chips1', { volume: 0.25, detune: 300 });
      }

      stepIdx++;
      scene.time.delayedCall(HELD_STEP_DELAY, animateNextHeldStep);
    }

    // Small pause before starting held phase
    scene.time.delayedCall(200, animateNextHeldStep);
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
