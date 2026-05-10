import { Scene } from 'phaser';

export class Boot extends Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // No external assets needed — we generate everything with Graphics
  }

  create() {
    this.scene.start('Preloader');
  }
}
