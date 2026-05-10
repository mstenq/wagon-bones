// ─── Button ───
// Reusable Phaser text button with background rect, hover/click states.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';

const DEFAULT_BG = 0x3a3a5c;
const HOVER_BG = 0x5a5a8c;
const DISABLED_BG = 0x2a2a3a;
const TEXT_COLOR = '#ffffff';
const DISABLED_TEXT = '#666666';

export class Button extends GameObjects.Container {
  private bg: GameObjects.Graphics;
  private label: GameObjects.Text;
  private _enabled: boolean = true;
  private _width: number;
  private _height: number;
  private onClickCallback: (() => void) | null = null;

  constructor(scene: Scene, x: number, y: number, text: string, width = 160, height = 44) {
    super(scene, x, y);
    this._width = width;
    this._height = height;

    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, text, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: TEXT_COLOR,
      align: 'center',
    }).setOrigin(0.5);

    this.add([this.bg, this.label]);
    this.setSize(width, height);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains
    );

    this.on('pointerover', () => { if (this._enabled) this.drawBg(HOVER_BG); });
    this.on('pointerout', () => { if (this._enabled) this.drawBg(DEFAULT_BG); });
    this.on('pointerdown', () => { if (this._enabled && this.onClickCallback) this.onClickCallback(); });

    this.drawBg(DEFAULT_BG);
    scene.add.existing(this);
  }

  onClick(cb: () => void): this {
    this.onClickCallback = cb;
    return this;
  }

  setEnabled(enabled: boolean): this {
    this._enabled = enabled;
    this.drawBg(enabled ? DEFAULT_BG : DISABLED_BG);
    this.label.setColor(enabled ? TEXT_COLOR : DISABLED_TEXT);
    return this;
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  private drawBg(color: number): void {
    this.bg.clear();
    this.bg.fillStyle(color, 1);
    this.bg.fillRoundedRect(-this._width / 2, -this._height / 2, this._width, this._height, 8);
    this.bg.lineStyle(1, 0x888888, 0.5);
    this.bg.strokeRoundedRect(-this._width / 2, -this._height / 2, this._width, this._height, 8);
  }
}
