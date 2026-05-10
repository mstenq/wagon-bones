// ─── HandDisplay ───
// Shows the detected hand type name and score breakdown during SCORE phase.

import { GameObjects, Scene } from 'phaser';
import { ScoreResult } from '../../game/types';

export class HandDisplay extends GameObjects.Container {
  private handName: GameObjects.Text;
  private scoreText: GameObjects.Text;
  private detailText: GameObjects.Text;

  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y);

    this.handName = scene.add.text(0, 0, '', {
      fontFamily: 'Arial Black',
      fontSize: '28px',
      color: '#ffcc00',
      align: 'center',
    }).setOrigin(0.5);

    this.scoreText = scene.add.text(0, 40, '', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5);

    this.detailText = scene.add.text(0, 70, '', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#aaaaaa',
      align: 'center',
    }).setOrigin(0.5);

    this.add([this.handName, this.scoreText, this.detailText]);
    this.setVisible(false);
    scene.add.existing(this);
  }

  showResult(result: ScoreResult): void {
    const hr = result.handResult;
    this.handName.setText(hr.name);
    this.scoreText.setText(`+${result.miles} miles`);
    this.detailText.setText(
      `(${hr.baseMiles} base + ${result.totalPips} pips) × ${result.mult} mult`
    );
    this.setVisible(true);
  }

  hide(): void {
    this.setVisible(false);
  }
}
