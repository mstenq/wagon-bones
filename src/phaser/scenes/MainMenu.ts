import { Scene } from 'phaser';
import { EventBus } from '../../game/EventBus';
import { resetPlayerState } from '../../game/PlayerState';
import { Button } from '../ui/Button';

export class MainMenu extends Scene {
  constructor() {
    super('MainMenu');
  }

  create() {
    const { width, height } = this.scale;

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => this.scale.off('resize', this.onResize, this));

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, width, height);

    // Title
    this.add.text(width / 2, height * 0.31, 'WAGON BONES', {
      fontFamily: 'Arial Black',
      fontSize: '64px',
      color: '#ffcc00',
      stroke: '#000000',
      strokeThickness: 6,
      align: 'center',
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(width / 2, height * 0.42, 'A Dice Rolling Journey', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#cccccc',
      align: 'center',
    }).setOrigin(0.5);

    // Start button
    new Button(this, width / 2, height * 0.57, 'Start Journey', 220, 52)
      .onClick(() => {
        resetPlayerState();
        this.scene.start('Shop');
      });

    EventBus.emit('current-scene-ready', this);
  }

  private onResize(): void {
    this.scene.restart();
  }
}
