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

// ─── Floating Score Popup ───

const POPUP_MILES_COLOR = '#4488ff';
const POPUP_MULT_COLOR = '#ff4444';
const POPUP_XMULT_COLOR = '#ff4444';
const POPUP_MONEY_COLOR = '#ffd700';

/**
 * Spawn a short-lived text popup that scales up, shakes, and fades out.
 * @param direction 'up' pops above (dice), 'down' pops below (equipment)
 */
function floatingText(
  scene: Scene,
  x: number,
  y: number,
  text: string,
  color: string,
  direction: 'up' | 'down' = 'up',
): void {
  const offsetY = direction === 'up' ? -40 : 48;
  const driftY = direction === 'up' ? -18 : 18;

  const txt = scene.add.text(x, y + offsetY, text, {
    fontFamily: 'Arial Black',
    fontSize: '18px',
    color,
    stroke: '#000000',
    strokeThickness: 3,
    align: 'center',
  }).setOrigin(0.5).setDepth(200).setScale(0.3).setAlpha(1);

  // Pop in with scale + slight shake
  scene.tweens.add({
    targets: txt,
    scaleX: 1.2,
    scaleY: 1.2,
    duration: 100,
    ease: 'Back.easeOut',
    onComplete: () => {
      // Quick shake
      const origX = txt.x;
      scene.tweens.chain({
        targets: txt,
        tweens: [
          { x: origX - 2, duration: 30 },
          { x: origX + 2, duration: 30 },
          { x: origX - 1, duration: 30 },
          { x: origX, duration: 30 },
        ],
      });

      // Settle scale then drift + fade out
      scene.tweens.add({
        targets: txt,
        scaleX: 1,
        scaleY: 1,
        duration: 80,
        ease: 'Sine.easeOut',
        onComplete: () => {
          scene.tweens.add({
            targets: txt,
            y: txt.y + driftY,
            alpha: 0,
            duration: 300,
            delay: 50,
            ease: 'Sine.easeIn',
            onComplete: () => txt.destroy(),
          });
        },
      });
    },
  });
}

/** Format a floating popup for a scoring contribution */
function popupForDie(scene: Scene, sprite: DiceSprite, type: 'miles' | 'mult' | 'xmult' | 'money', value: number): void {
  if (type === 'miles') {
    floatingText(scene, sprite.x, sprite.y, `+${value} mi`, POPUP_MILES_COLOR, 'up');
  } else if (type === 'mult') {
    floatingText(scene, sprite.x, sprite.y, `+${value} mult`, POPUP_MULT_COLOR, 'up');
  } else if (type === 'xmult') {
    floatingText(scene, sprite.x, sprite.y, `x${value} mult`, POPUP_XMULT_COLOR, 'up');
  } else if (type === 'money') {
    floatingText(scene, sprite.x, sprite.y, `+$${value}`, POPUP_MONEY_COLOR, 'up');
  }
}

function popupForEquip(scene: Scene, equipBar: EquipmentBar, index: number, type: 'miles' | 'mult' | 'xmult' | 'money', value: number): void {
  const cards = equipBar.getCards();
  if (index >= cards.length) return;
  const card = cards[index];
  // Cards are children of the EquipmentBar container — offset by bar's world position
  const wx = equipBar.x + card.x;
  const wy = equipBar.y + card.y;
  if (type === 'miles') {
    floatingText(scene, wx, wy, `+${value} mi`, POPUP_MILES_COLOR, 'down');
  } else if (type === 'mult') {
    floatingText(scene, wx, wy, `+${value} mult`, POPUP_MULT_COLOR, 'down');
  } else if (type === 'xmult') {
    floatingText(scene, wx, wy, `x${value} mult`, POPUP_XMULT_COLOR, 'down');
  } else if (type === 'money') {
    floatingText(scene, wx, wy, `+$${value}`, POPUP_MONEY_COLOR, 'down');
  }
}

export interface ScoreAnimationConfig {
  scene: Scene;
  diceSprites: DiceSprite[];
  result: ScoreResult;
  sidebar: Sidebar;
  equipBar: EquipmentBar;
  equipment: EquipmentInstance[];
  lockedDiceIds: Set<string>;
  contentCX: number;
  onComplete: () => void;
}

/** Determine which equipment indices trigger for a specific die, with their contribution type */
function getTriggeredEquipForDie(die: Die, equipment: EquipmentInstance[], _handType: string): { index: number; type: 'mult' | 'miles' | 'xmult' | 'money'; value: number }[] {
  const triggered: { index: number; type: 'mult' | 'miles' | 'xmult' | 'money'; value: number }[] = [];
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
      case 'GOLD_DICE_MONEY':
        if (die.enhancement === 'gold') triggered.push({ index: i, type: 'money', value: p.value as number });
        break;
      case 'LUCKY_NUMBER_PIP_XMULT':
        if (die.value === (equip.state.pip ?? 0)) triggered.push({ index: i, type: 'xmult', value: p.value as number });
        break;
    }
  }
  return triggered;
}

/** Determine which equipment triggers independently (not per-die), with contribution details */
function getIndependentTriggeredEquip(equipment: EquipmentInstance[], handType: string, context: { rerollsRemaining: number; scoringDice: Die[]; equipmentCount: number; playerBalance: number; currentDay: number; maxDays: number }): { index: number; type: 'mult' | 'miles' | 'xmult'; value: number }[] {
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

      // ─── Phase 2 additive effects ───
      case 'MILES_PER_DOLLAR': {
        const milesGain = (p.value as number) * context.playerBalance;
        if (milesGain > 0) triggered.push({ index: i, type: 'miles', value: milesGain });
        break;
      }
      case 'SELL_VALUE_AS_MULT': {
        let totalSellValue = 0;
        for (const other of equipment) {
          if (other !== equip) totalSellValue += other.sellValue;
        }
        if (totalSellValue > 0) triggered.push({ index: i, type: 'mult', value: totalSellValue });
        break;
      }
      case 'STATEFUL_ADD_MULT':
      case 'DECAYING_MULT':
      case 'HAND_MULT_GAIN':
      case 'SHOP_REROLL_MULT_GAIN': {
        const multVal = equip.state.mult ?? 0;
        if (multVal > 0) triggered.push({ index: i, type: 'mult', value: multVal });
        break;
      }
      case 'ENHANCED_SPENT_MILES_GAIN': {
        const milesVal = equip.state.miles ?? 0;
        if (milesVal > 0) triggered.push({ index: i, type: 'miles', value: milesVal });
        break;
      }

      // ─── Phase 2 xMult effects ───
      case 'UNCOMMON_EQUIP_XMULT': {
        const uncommonCount = equipment.filter(e => e.def.rarity === 'uncommon').length;
        if (uncommonCount > 0) {
          triggered.push({ index: i, type: 'xmult', value: Math.pow(1.5, uncommonCount) });
        }
        break;
      }
      case 'FINAL_DAY_XMULT':
        if (context.currentDay >= context.maxDays) {
          triggered.push({ index: i, type: 'xmult', value: p.value as number });
        }
        break;
      case 'LUCKY_TRIGGER_XMULT':
      case 'SELL_XMULT_GAIN':
      case 'STATEFUL_XMULT': {
        const xm = equip.state.xMult ?? 1;
        if (xm !== 1) triggered.push({ index: i, type: 'xmult', value: xm });
        break;
      }
      case 'DECAYING_XMULT': {
        const xm = equip.state.xMult ?? 1;
        if (xm > 0 && xm !== 1) triggered.push({ index: i, type: 'xmult', value: xm });
        break;
      }
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
  if (played === 'FULL_HOUSE' && (required === 'PAIR' || required === 'THREE_OF_A_KIND' || required === 'TWO_PAIR')) return true;
  if (played === 'TWO_PAIR' && required === 'PAIR') return true;
  if (played === 'FOUR_OF_A_KIND' && (required === 'THREE_OF_A_KIND' || required === 'PAIR' || required === 'TWO_PAIR')) return true;
  if (played === 'FIVE_OF_A_KIND' && (required === 'FOUR_OF_A_KIND' || required === 'THREE_OF_A_KIND' || required === 'PAIR' || required === 'TWO_PAIR' || required === 'FULL_HOUSE')) return true;
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
  const { scene, diceSprites, result, sidebar, equipBar, equipment, lockedDiceIds, contentCX, onComplete } = config;
  const scoringIds = new Set(result.handResult.scoringDice.map(d => d.id));
  const scoringSprites = diceSprites.filter(s => scoringIds.has(s.dieData.id));
  const playedNonScoringSprites = diceSprites.filter(s => lockedDiceIds.has(s.dieData.id) && !scoringIds.has(s.dieData.id));
  const heldSprites = diceSprites.filter(s => !lockedDiceIds.has(s.dieData.id));

  // ─── Step 0: Separate played vs held dice ───
  // Held (unlocked) dice slide down; played dice stay in place.
  // Non-scoring played dice get dimmed to 50% alpha.
  const HELD_DROP_Y = 80;
  const SEPARATION_DURATION = 350;
  const SPACING = 70;

  // Move held dice down into their own row
  if (heldSprites.length > 0) {
    const totalW = (heldSprites.length - 1) * SPACING;
    const startX = contentCX - totalW / 2;
    const rollY = scene.scale.height * 0.50;

    for (let i = 0; i < heldSprites.length; i++) {
      const s = heldSprites[i];
      const count = heldSprites.length;
      let arcY = 0;
      let arcRot = 0;
      if (count > 1) {
        const t = i / (count - 1) - 0.5;
        arcY = -12 * (1 - 4 * t * t);
        arcRot = t * 0.08;
      }
      scene.tweens.add({
        targets: s,
        x: startX + i * SPACING,
        y: rollY + HELD_DROP_Y + arcY,
        rotation: arcRot,
        alpha: 0.5,
        duration: SEPARATION_DURATION,
        ease: 'Back.easeOut',
      });
    }
  }

  // Dim played-but-not-scoring dice in place
  for (const s of playedNonScoringSprites) {
    scene.tweens.add({
      targets: s,
      alpha: 0.5,
      duration: SEPARATION_DURATION,
      ease: 'Sine.easeOut',
    });
  }

  // Start scoring after separation settles
  scene.time.delayedCall(SEPARATION_DURATION + 150, beginScoring);

  function beginScoring(): void {

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
      // All dice scored — Step 4: held-in-hand, then Step 5: independent equipment
      startHeldInHandPhase();
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

    // After shake, process all scoring sub-events for this die sequentially
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

      // Build a queue of sub-steps for this die
      type DieSubStep = { action: () => void };
      const subSteps: DieSubStep[] = [];

      // Sub-step 1: Die value → miles
      const dieMiles = die.enhancement === 'stone' ? 50 : die.value;
      subSteps.push({
        action: () => {
          currentMiles += dieMiles;
          sidebar.setMilesAnimated(currentMiles);
          scene.sound.play('sfx_chips2', { volume: 0.3, detune: index * 80 });
          popupForDie(scene, sprite, 'miles', dieMiles);
        },
      });

      // Sub-step 2: Enhancement bonus (if any)
      if (die.enhancement === 'bone') {
        subSteps.push({
          action: () => {
            currentMult += 4;
            sidebar.setMultAnimated(currentMult);
            scene.sound.play('sfx_multhit1', { volume: 0.3 });
            popupForDie(scene, sprite, 'mult', 4);
          },
        });
      } else if (die.enhancement === 'wooden') {
        subSteps.push({
          action: () => {
            currentMiles += 10;
            sidebar.setMilesAnimated(currentMiles);
            scene.sound.play('sfx_chips2', { volume: 0.3, detune: 200 });
            popupForDie(scene, sprite, 'miles', 10);
          },
        });
      } else if (die.enhancement === 'diamond') {
        subSteps.push({
          action: () => {
            currentMult = currentMult * 2;
            sidebar.setMultAnimated(currentMult);
            scene.sound.play('sfx_multhit2', { volume: 0.4, detune: -100 });
            popupForDie(scene, sprite, 'xmult', 2);
          },
        });
      }

      // Sub-step: Dice aura bonus (if any)
      if (die.aura === 'fire') {
        subSteps.push({
          action: () => {
            currentMult += 10;
            sidebar.setMultAnimated(currentMult);
            scene.sound.play('sfx_multhit1', { volume: 0.35 });
            popupForDie(scene, sprite, 'mult', 10);
          },
        });
      } else if (die.aura === 'icy') {
        subSteps.push({
          action: () => {
            currentMiles += 50;
            sidebar.setMilesAnimated(currentMiles);
            scene.sound.play('sfx_chips2', { volume: 0.35, detune: 100 });
            popupForDie(scene, sprite, 'miles', 50);
          },
        });
      } else if (die.aura === 'holy') {
        subSteps.push({
          action: () => {
            currentMult = currentMult * 1.5;
            sidebar.setMultAnimated(currentMult);
            scene.sound.play('sfx_multhit2', { volume: 0.45, detune: -200 });
            popupForDie(scene, sprite, 'xmult', 1.5);
          },
        });
      }

      // Sub-steps 3+: Per-die equipment triggers
      const triggered = getTriggeredEquipForDie(die, equipment, result.handResult.type);
      for (const entry of triggered) {
        subSteps.push({
          action: () => {
            wiggleEquipCard(scene, equipBar, entry.index);
            popupForDie(scene, sprite, entry.type, entry.value);
            if (entry.type === 'mult') {
              currentMult += entry.value;
              sidebar.setMultAnimated(currentMult);
              scene.sound.play('sfx_multhit1', { volume: 0.3 });
            } else if (entry.type === 'xmult') {
              currentMult = currentMult * entry.value;
              sidebar.setMultAnimated(currentMult);
              scene.sound.play('sfx_multhit2', { volume: 0.4, detune: -100 });
            } else if (entry.type === 'money') {
              scene.sound.play('sfx_coin', { volume: 0.4 });
            } else {
              currentMiles += entry.value;
              sidebar.setMilesAnimated(currentMiles);
              scene.sound.play('sfx_chips2', { volume: 0.3, detune: 200 });
            }
          },
        });
      }

      // Process sub-steps sequentially with delay between each
      let subIdx = 0;
      function processNextSubStep() {
        if (subIdx >= subSteps.length) {
          index++;
          scene.time.delayedCall(ANIM.SCORE_SUBSTEP_DELAY, scoreNextDie);
          return;
        }
        subSteps[subIdx].action();
        subIdx++;
        if (subIdx < subSteps.length) {
          scene.time.delayedCall(ANIM.SCORE_SUBSTEP_DELAY, processNextSubStep);
        } else {
          // Last sub-step done — move to next die
          index++;
          scene.time.delayedCall(ANIM.SCORE_SUBSTEP_DELAY, scoreNextDie);
        }
      }
      // Delay before first sub-step so scale pop plays first
      scene.time.delayedCall(120, processNextSubStep);
    });
  }

  // ─── Held-in-Hand Animation Phase (Step 4) ───

  function startHeldInHandPhase() {
    const heldSteps: HeldAnimStep[] = result.heldSteps ?? [];
    if (heldSteps.length === 0) {
      startIndependentEquipPhase();
      return;
    }

    // Get held dice sprites (rolled but not scored)
    const heldSprites = diceSprites.filter(s => !scoringIds.has(s.dieData.id));
    const heldSpriteMap = new Map<string, DiceSprite>();
    for (const s of heldSprites) heldSpriteMap.set(s.dieData.id, s);

    let stepIdx = 0;

    function animateNextHeldStep() {
      if (stepIdx >= heldSteps.length) {
        startIndependentEquipPhase();
        return;
      }

      const step = heldSteps[stepIdx];
      const sprite = heldSpriteMap.get(step.dieId);

      // Shake the held die sprite
      if (sprite) {
        const origX = sprite.x;
        const origY = sprite.y;
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
        popupForEquip(scene, equipBar, step.equipIndex, step.type, step.value);
      }

      // Popup above the held die
      if (sprite) {
        popupForDie(scene, sprite, step.type, step.value);
      }

      // Update sidebar values and play sound
      if (step.type === 'mult') {
        currentMult += step.value;
        sidebar.setMultAnimated(currentMult);
        scene.sound.play('sfx_multhit1', { volume: 0.3, detune: stepIdx * 50 });
      } else if (step.type === 'xmult') {
        currentMult = currentMult * step.value;
        sidebar.setMultAnimated(currentMult);
        scene.sound.play('sfx_multhit2', { volume: 0.4, detune: -100 });
      } else if (step.type === 'money') {
        scene.sound.play('sfx_chips1', { volume: 0.25, detune: 300 });
      }

      stepIdx++;
      scene.time.delayedCall(ANIM.SCORE_STEP_DELAY, animateNextHeldStep);
    }

    // Small pause before starting held phase
    scene.time.delayedCall(ANIM.SCORE_STEP_DELAY, animateNextHeldStep);
  }

  // ─── Independent Equipment Animation Phase (Step 5) ───

  function startIndependentEquipPhase() {
    const independentEquip = getIndependentTriggeredEquip(equipment, result.handResult.type, {
      rerollsRemaining: result.rerollsRemaining ?? 0,
      scoringDice: result.handResult.scoringDice,
      equipmentCount: equipment.length,
      playerBalance: result.playerBalance ?? 0,
      currentDay: result.currentDay ?? 1,
      maxDays: result.maxDays ?? 4,
    });

    if (independentEquip.length > 0) {
      let equipIdx = 0;
      function triggerNextEquip() {
        if (equipIdx >= independentEquip.length) {
          finishScoring();
          return;
        }
        const entry = independentEquip[equipIdx];
        wiggleEquipCard(scene, equipBar, entry.index);
        popupForEquip(scene, equipBar, entry.index, entry.type, entry.value);

        if (entry.type === 'mult') {
          currentMult += entry.value;
          sidebar.setMultAnimated(currentMult);
          scene.sound.play('sfx_multhit1', { volume: 0.35, detune: equipIdx * 60 });
        } else if (entry.type === 'miles') {
          currentMiles += entry.value;
          sidebar.setMilesAnimated(currentMiles);
          scene.sound.play('sfx_chips2', { volume: 0.35, detune: equipIdx * 60 });
        } else if (entry.type === 'xmult') {
          currentMult = currentMult * entry.value;
          sidebar.setMultAnimated(currentMult);
          scene.sound.play('sfx_multhit2', { volume: 0.45, detune: -200 });
        }

        equipIdx++;
        scene.time.delayedCall(ANIM.SCORE_STEP_DELAY, triggerNextEquip);
      }
      scene.time.delayedCall(ANIM.SCORE_STEP_DELAY, triggerNextEquip);
    } else {
      finishScoring();
    }
  }

  function finishScoring() {
    scene.time.delayedCall(ANIM.SCORE_FINAL_FLASH_DELAY, () => {
      // Reset miles/mult to 0
      sidebar.updateData({ milesBase: 0, mult: 0 });

      // Bump round score
      sidebar.setRoundScoreAnimated((result.roundScoreBefore ?? 0) + result.miles);
      scene.sound.play('sfx_timpani', { volume: 0.5 });

      scene.time.delayedCall(ANIM.SCORE_COMPLETE_DELAY + 400, onComplete);
    });
  }

  // Start the scoring sequence after a short delay
  scene.time.delayedCall(ANIM.SCORE_STEP_DELAY, scoreNextDie);

  } // end beginScoring
}
