import { Scene } from 'phaser';
import allItems from '../../data/items';
import allTrailGuides from '../../data/trail_guides.json';
import allSupplyCards from '../../data/supply_cards.json';
import allFrontierEncounters from '../../data/frontier_encounters.json';
import packsData from '../../data/packs.json';

export class Preloader extends Scene {
  constructor() {
    super('Preloader');
  }

  preload() {
    // Load backgrounds
    this.load.image('bg_1', 'assets/backgrounds/1.png');
    this.load.image('bg_shop', 'assets/backgrounds/shop.png');

    // Load pack images
    for (const pack of packsData) {
      this.load.image(`pack_${pack.id}`, `assets/packs/${pack.id}.png`);
    }

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

    // Load sound effects
    this.load.audio('sfx_button', 'assets/sounds/button.ogg');
    this.load.audio('sfx_dice_roll', 'assets/sounds/diceRattleAndRoll.wav');
    this.load.audio('sfx_dice_rattle', 'assets/sounds/diceRattle.wav');
    this.load.audio('sfx_dice_land', 'assets/sounds/diceRoll.wav');
    this.load.audio('sfx_card1', 'assets/sounds/card1.ogg');
    this.load.audio('sfx_card3', 'assets/sounds/card3.ogg');
    this.load.audio('sfx_card_slide1', 'assets/sounds/cardSlide1.ogg');
    this.load.audio('sfx_card_slide2', 'assets/sounds/cardSlide2.ogg');
    this.load.audio('sfx_chips1', 'assets/sounds/chips1.ogg');
    this.load.audio('sfx_chips2', 'assets/sounds/chips2.ogg');
    this.load.audio('sfx_coin', 'assets/sounds/coin3.ogg');
    this.load.audio('sfx_highlight1', 'assets/sounds/highlight1.ogg');
    this.load.audio('sfx_highlight2', 'assets/sounds/highlight2.ogg');
    this.load.audio('sfx_multhit1', 'assets/sounds/multhit1.ogg');
    this.load.audio('sfx_multhit2', 'assets/sounds/multhit2.ogg');
    this.load.audio('sfx_whoosh', 'assets/sounds/whoosh.ogg');
    this.load.audio('sfx_tarot1', 'assets/sounds/tarot1.ogg');
    this.load.audio('sfx_tarot2', 'assets/sounds/tarot2.ogg');
    this.load.audio('sfx_cancel', 'assets/sounds/cancel.ogg');
    this.load.audio('sfx_foil1', 'assets/sounds/foil1.ogg');
    this.load.audio('sfx_win', 'assets/sounds/win.ogg');
    this.load.audio('sfx_timpani', 'assets/sounds/timpani.ogg');
    this.load.audio('sfx_generic1', 'assets/sounds/generic1.ogg');
    this.load.audio('sfx_explosion', 'assets/sounds/explosion1.ogg');
    this.load.audio('sfx_negative', 'assets/sounds/negative.ogg');
    this.load.audio('sfx_glass1', 'assets/sounds/glass1.ogg');
    this.load.audio('sfx_paper1', 'assets/sounds/paper1.ogg');
    this.load.audio('sfx_card_fan', 'assets/sounds/cardFan2.ogg');
    this.load.audio('sfx_crumple1', 'assets/sounds/crumple1.ogg');
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
