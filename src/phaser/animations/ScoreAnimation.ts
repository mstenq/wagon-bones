// ─── ScoreAnimation ───
// Balatro-style sequential dice highlight with running total tick-up.

import { Scene } from 'phaser';
import { DiceSprite } from '../ui/DiceSprite';
import { ScoreResult } from '../../game/types';

export function playScoreAnimation(
  scene: Scene,
  diceSprites: DiceSprite[],
  result: ScoreResult,
  milesText: Phaser.GameObjects.Text | null,
  onComplete: () => void
): void {
  const scoringIds = new Set(result.handResult.scoringDice.map(d => d.id));
  const scoringSprites = diceSprites.filter(s => scoringIds.has(s.dieData.id));

  let currentMiles = 0;
  const perDieMiles = result.miles / Math.max(scoringSprites.length, 1);
  let index = 0;

  function highlightNext() {
    if (index >= scoringSprites.length) {
      // Final flash
      scene.time.delayedCall(300, () => {
        if (milesText) {
          scene.tweens.add({
            targets: milesText,
            scaleX: 1.3,
            scaleY: 1.3,
            duration: 150,
            yoyo: true,
            ease: 'Back.easeOut',
          });
        }
        scene.time.delayedCall(400, onComplete);
      });
      return;
    }

    const sprite = scoringSprites[index];

    // Glow effect
    scene.tweens.add({
      targets: sprite,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 150,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        currentMiles += perDieMiles;
        if (milesText) {
          milesText.setText(`+${Math.round(currentMiles)}`);
        }
        index++;
        scene.time.delayedCall(100, highlightNext);
      },
    });
  }

  // Reset miles text
  if (milesText) {
    milesText.setText('+0');
    milesText.setVisible(true);
  }

  highlightNext();
}
