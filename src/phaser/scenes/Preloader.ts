import { Scene } from 'phaser';
import allItems from '../../data/items.json';
import allTrailGuides from '../../data/trail_guides.json';
import allSupplyCards from '../../data/supply_cards.json';
import allFrontierEncounters from '../../data/frontier_encounters.json';

export class Preloader extends Scene {
  constructor() {
    super('Preloader');
  }

  preload() {
    // Load background
    this.load.image('bg_1', 'assets/backgrounds/1.png');

    // Load item images
    for (const item of allItems) {
      this.load.image(`item_${item.id}`, `assets/items/${item.id}.png`);
    }

    // Load trail guide images (ids already start with 'tg_')
    for (const tg of allTrailGuides) {
      this.load.image(tg.id, `assets/trail-guides/${tg.id}.png`);
    }

    // Load supply card images
    for (const sc of allSupplyCards) {
      this.load.image(`supply_${sc.id}`, `assets/supplies/${sc.id}.png`);
    }

    // Load frontier encounter images
    for (const fe of allFrontierEncounters) {
      this.load.image(`fe_${fe.id}`, `assets/trail-encounters/${fe.id}.png`);
    }
  }

  create() {
    const { width, height } = this.scale;
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, width, height);

    this.add.text(width / 2, height / 2, 'Loading...', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.time.delayedCall(400, () => {
      this.scene.start('MainMenu');
    });
  }
}
