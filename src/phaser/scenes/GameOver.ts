import { Scene } from 'phaser';
import { EventBus } from '../../game/EventBus';
import { resetPlayerState } from '../../game/PlayerState';
import { Button } from '../ui/Button';

export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  private sceneData: { won: boolean; totalMiles: number; targetMiles: number };

  create(data: { won: boolean; totalMiles: number; targetMiles: number }) {
    this.sceneData = data;
    const { width, height } = this.scale;

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => this.scale.off('resize', this.onResize, this));

    const bg = this.add.graphics();
    bg.fillStyle(data.won ? 0x1a3a1a : 0x3a1a1a, 1);
    bg.fillRect(0, 0, width, height);

    const title = data.won ? 'LANDMARK REACHED!' : 'TRAIL ENDS HERE';
    const color = data.won ? '#44ff44' : '#ff4444';

    this.add.text(width / 2, height * 0.34, title, {
      fontFamily: 'Arial Black',
      fontSize: '48px',
      color,
      stroke: '#000000',
      strokeThickness: 6,
      align: 'center',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.44, `${data.totalMiles} / ${data.targetMiles} miles`, {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5);

    new Button(this, width / 2, height * 0.57, 'Play Again', 200, 48)
      .onClick(() => {
        resetPlayerState();
        this.scene.start('MainMenu');
      });

    EventBus.emit('current-scene-ready', this);
  }

  private onResize(): void {
    this.scene.restart(this.sceneData);
  }
}
