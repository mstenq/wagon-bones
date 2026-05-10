// ─── RollAnimation ───
// Animates dice "tumbling" by rapidly changing pip values before landing on final value.

import { Scene } from 'phaser';
import { DiceSprite } from '../ui/DiceSprite';
import { Die } from '../../game/types';

export function playRollAnimation(
  scene: Scene,
  diceSprites: DiceSprite[],
  finalDice: Die[],
  onComplete: () => void
): void {
  const duration = 600;
  const interval = 60;
  let elapsed = 0;

  const timer = scene.time.addEvent({
    delay: interval,
    repeat: Math.floor(duration / interval) - 1,
    callback: () => {
      elapsed += interval;
      for (const sprite of diceSprites) {
        // Show random pips during tumble
        const tempData = { ...sprite.dieData, pips: Math.ceil(Math.random() * 6) };
        sprite.setDieData(tempData);
      }
    },
  });

  // After animation, set final values
  scene.time.delayedCall(duration, () => {
    timer.destroy();
    for (let i = 0; i < diceSprites.length; i++) {
      if (finalDice[i]) {
        diceSprites[i].setDieData(finalDice[i]);
      }
    }

    // Bounce tween on each die
    for (const sprite of diceSprites) {
      scene.tweens.add({
        targets: sprite,
        scaleX: 1.15,
        scaleY: 0.9,
        duration: 80,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }

    scene.time.delayedCall(200, onComplete);
  });
}
