// ─── JourneyInfoModal ───
// Modal showing trail knowledge levels (hand types and how many times played),
// and upcoming leg/boss info.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { getPlayerState } from '../../game/PlayerState';
import { HandType } from '../../game/types';
import { Button } from './Button';
import handsData from '../../data/hands.json';

export class JourneyInfoModal extends GameObjects.Container {
  constructor(scene: Scene, contentX: number, width: number, height: number) {
    super(scene, 0, 0);

    // Dim background
    const dim = scene.add.graphics();
    dim.fillStyle(0x000000, UI.MODAL_DIM_ALPHA);
    dim.fillRect(0, 0, scene.scale.width, height);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, scene.scale.width, height), Phaser.Geom.Rectangle.Contains);
    this.add(dim);

    // Modal panel
    const panelW = Math.min(width - 40, 600);
    const panelH = Math.min(height - 80, 520);
    const panelX = contentX + (width - panelW) / 2;
    const panelY = (height - panelH) / 2;

    const panel = scene.add.graphics();
    panel.fillStyle(UI.MODAL_BG, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    panel.lineStyle(2, UI.MODAL_BORDER, 1);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    this.add(panel);

    // Title
    const title = scene.add
      .text(panelX + panelW / 2, panelY + 24, 'Journey Info', {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: TEXT_COLORS.GOLD,
      })
      .setOrigin(0.5);
    this.add(title);

    // ─── Trail Knowledge (Hand levels) ───
    const sectionLabel = scene.add.text(panelX + 20, panelY + 56, 'Trail Knowledge', {
      fontFamily: FONTS.HEADING,
      fontSize: '14px',
      color: TEXT_COLORS.SECONDARY,
    });
    this.add(sectionLabel);

    let rowY = panelY + 80;
    const rowH = 32;

    // Column positions
    const colName = panelX + 24;
    const colLevel = panelX + panelW * 0.38;
    const colMiles = panelX + panelW * 0.52;
    const colMult = panelX + panelW * 0.7;
    const colPlayed = panelX + panelW - 50;

    // Header row
    const headerName = scene.add.text(colName, rowY, 'Hand', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: TEXT_COLORS.MUTED,
    });
    const headerLevel = scene.add.text(colLevel, rowY, 'Level', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: TEXT_COLORS.MUTED,
    });
    const headerMiles = scene.add.text(colMiles, rowY, 'Miles', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: TEXT_COLORS.MUTED,
    });
    const headerMult = scene.add.text(colMult, rowY, 'Mult', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: TEXT_COLORS.MUTED,
    });
    const headerPlayed = scene.add
      .text(colPlayed, rowY, 'Played', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5, 0);
    this.add([headerName, headerLevel, headerMiles, headerMult, headerPlayed]);
    rowY += 20;

    // Separator
    const sep = scene.add.graphics();
    sep.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.5);
    sep.lineBetween(panelX + 20, rowY, panelX + panelW - 20, rowY);
    this.add(sep);
    rowY += 6;

    const player = getPlayerState();

    for (let i = 0; i < handsData.length; i++) {
      const hand = handsData[i];
      const handType = hand.type as HandType;
      const stats = player.getHandStats(handType);

      // Row background (alternating)
      if (i % 2 === 0) {
        const rowBg = scene.add.graphics();
        rowBg.fillStyle(COLORS.SIDEBAR_SECTION, 0.5);
        rowBg.fillRect(panelX + 16, rowY - 2, panelW - 32, rowH);
        this.add(rowBg);
      }

      const nameText = scene.add
        .text(colName, rowY + rowH / 2, hand.name, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '13px',
          color: TEXT_COLORS.PRIMARY,
        })
        .setOrigin(0, 0.5);

      const levelText = scene.add
        .text(colLevel, rowY + rowH / 2, `Lv.${stats.level}`, {
          fontFamily: FONTS.HEADING,
          fontSize: '13px',
          color: stats.level > 1 ? TEXT_COLORS.GOLD : TEXT_COLORS.SECONDARY,
        })
        .setOrigin(0, 0.5);

      const milesText = scene.add
        .text(colMiles, rowY + rowH / 2, `${hand.baseMiles + stats.milesPerLevel * (stats.level - 1)}`, {
          fontFamily: FONTS.HEADING,
          fontSize: '14px',
          color: '#6699ff',
        })
        .setOrigin(0, 0.5);

      const multText = scene.add
        .text(colMult, rowY + rowH / 2, `×${hand.baseMult + stats.multPerLevel * (stats.level - 1)}`, {
          fontFamily: FONTS.HEADING,
          fontSize: '14px',
          color: '#ff6666',
        })
        .setOrigin(0, 0.5);

      const playedText = scene.add
        .text(colPlayed, rowY + rowH / 2, `${stats.timesPlayed}`, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '13px',
          color: stats.timesPlayed > 0 ? TEXT_COLORS.PRIMARY : TEXT_COLORS.MUTED,
        })
        .setOrigin(0.5, 0.5);

      this.add([nameText, levelText, milesText, multText, playedText]);
      rowY += rowH;
    }

    // Close button
    const closeBtn = new Button(scene, panelX + panelW / 2, panelY + panelH - 30, 'Close', 120, 34);
    closeBtn.onClick(() => this.destroy());
    this.add(closeBtn);

    this.setDepth(500);
    scene.add.existing(this);
  }
}
