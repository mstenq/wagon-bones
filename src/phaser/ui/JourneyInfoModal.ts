// ─── JourneyInfoModal ───
// Modal showing trail knowledge levels (hand types and how many times played),
// and a Permits tab showing purchased frontier permits.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { getPlayerState } from '../../game/PlayerState';
import { HandType } from '../../game/types';
import { Button } from './Button';
import { getPermitById } from '../../game/PermitsSystem';
import handsData from '../../data/hands.json';

export class JourneyInfoModal extends GameObjects.Container {
  private scene: Scene;
  private panelX: number;
  private panelY: number;
  private panelW: number;
  private panelH: number;
  private tabContent: GameObjects.Container;
  private tabButtons: GameObjects.Container[] = [];
  private activeTab: string = 'knowledge';

  constructor(scene: Scene, contentX: number, width: number, height: number) {
    super(scene, 0, 0);
    this.scene = scene;

    // Dim background
    const dim = scene.add.graphics();
    dim.fillStyle(0x000000, UI.MODAL_DIM_ALPHA);
    dim.fillRect(0, 0, scene.scale.width, height);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, scene.scale.width, height), Phaser.Geom.Rectangle.Contains);
    this.add(dim);

    // Modal panel
    this.panelW = Math.min(width - 40, 600);
    this.panelH = Math.min(height - 80, 520);
    this.panelX = contentX + (width - this.panelW) / 2;
    this.panelY = (height - this.panelH) / 2;

    const panel = scene.add.graphics();
    panel.fillStyle(UI.MODAL_BG, 1);
    panel.fillRoundedRect(this.panelX, this.panelY, this.panelW, this.panelH, UI.MODAL_RADIUS);
    panel.lineStyle(2, UI.MODAL_BORDER, 1);
    panel.strokeRoundedRect(this.panelX, this.panelY, this.panelW, this.panelH, UI.MODAL_RADIUS);
    this.add(panel);

    // Title
    const title = scene.add
      .text(this.panelX + this.panelW / 2, this.panelY + 24, 'Journey Info', {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: TEXT_COLORS.GOLD,
      })
      .setOrigin(0.5);
    this.add(title);

    // ─── Tab Buttons ───
    this.buildTabButtons();

    // ─── Tab Content Container ───
    this.tabContent = scene.add.container(0, 0);
    this.add(this.tabContent);

    // Default: show knowledge tab
    this.showKnowledgeTab();

    // Close button
    const closeBtn = new Button(scene, this.panelX + this.panelW / 2, this.panelY + this.panelH - 30, 'Close', 120, 34);
    closeBtn.onClick(() => this.destroy());
    this.add(closeBtn);

    this.setDepth(500);
    scene.add.existing(this);
  }

  private buildTabButtons(): void {
    const tabs = [
      { id: 'knowledge', label: 'Trail Knowledge' },
      { id: 'permits', label: 'Permits' },
    ];

    const tabY = this.panelY + 52;
    const tabW = 140;
    const tabH = 28;
    const tabGap = 8;
    const totalW = tabs.length * tabW + (tabs.length - 1) * tabGap;
    const startX = this.panelX + this.panelW / 2 - totalW / 2;

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const x = startX + i * (tabW + tabGap) + tabW / 2;

      const container = this.scene.add.container(x, tabY);

      const bg = this.scene.add.graphics();
      bg.fillStyle(tab.id === this.activeTab ? 0x333366 : 0x1a1a30, 1);
      bg.fillRoundedRect(-tabW / 2, -tabH / 2, tabW, tabH, 6);
      bg.lineStyle(1, 0x555588, 0.6);
      bg.strokeRoundedRect(-tabW / 2, -tabH / 2, tabW, tabH, 6);
      container.add(bg);

      const label = this.scene.add
        .text(0, 0, tab.label, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '12px',
          color: tab.id === this.activeTab ? TEXT_COLORS.PRIMARY : TEXT_COLORS.MUTED,
        })
        .setOrigin(0.5);
      container.add(label);

      container.setSize(tabW, tabH);
      container.setInteractive(new Phaser.Geom.Rectangle(-tabW / 2, -tabH / 2, tabW, tabH), Phaser.Geom.Rectangle.Contains);
      container.on('pointerup', () => this.switchTab(tab.id));

      this.add(container);
      this.tabButtons.push(container);
    }
  }

  private switchTab(tabId: string): void {
    if (tabId === this.activeTab) return;
    this.activeTab = tabId;

    // Rebuild tab button styling
    const tabs = ['knowledge', 'permits'];
    for (let i = 0; i < this.tabButtons.length; i++) {
      const container = this.tabButtons[i];
      const isActive = tabs[i] === tabId;
      // Update bg and label colors
      const bg = container.list[0] as GameObjects.Graphics;
      const label = container.list[1] as GameObjects.Text;
      bg.clear();
      bg.fillStyle(isActive ? 0x333366 : 0x1a1a30, 1);
      bg.fillRoundedRect(-70, -14, 140, 28, 6);
      bg.lineStyle(1, 0x555588, 0.6);
      bg.strokeRoundedRect(-70, -14, 140, 28, 6);
      label.setColor(isActive ? TEXT_COLORS.PRIMARY : TEXT_COLORS.MUTED);
    }

    // Clear and rebuild content
    this.tabContent.removeAll(true);
    if (tabId === 'knowledge') {
      this.showKnowledgeTab();
    } else {
      this.showPermitsTab();
    }
  }

  private showKnowledgeTab(): void {
    const scene = this.scene;
    const panelX = this.panelX;
    const panelW = this.panelW;
    const panelY = this.panelY;

    let rowY = panelY + 88;
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
    this.tabContent.add([headerName, headerLevel, headerMiles, headerMult, headerPlayed]);
    rowY += 20;

    // Separator
    const sep = scene.add.graphics();
    sep.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.5);
    sep.lineBetween(panelX + 20, rowY, panelX + panelW - 20, rowY);
    this.tabContent.add(sep);
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
        this.tabContent.add(rowBg);
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

      this.tabContent.add([nameText, levelText, milesText, multText, playedText]);
      rowY += rowH;
    }
  }

  private showPermitsTab(): void {
    const scene = this.scene;
    const panelX = this.panelX;
    const panelW = this.panelW;
    const panelY = this.panelY;
    const player = getPlayerState();

    let rowY = panelY + 88;
    const rowH = 44;

    if (player.purchasedPermits.length === 0) {
      const emptyText = scene.add
        .text(panelX + panelW / 2, panelY + this.panelH / 2 - 20, 'No permits purchased yet', {
          fontFamily: FONTS.PRIMARY,
          fontSize: '14px',
          color: TEXT_COLORS.MUTED,
        })
        .setOrigin(0.5);
      this.tabContent.add(emptyText);
      return;
    }

    for (let i = 0; i < player.purchasedPermits.length; i++) {
      const permitId = player.purchasedPermits[i];
      const permit = getPermitById(permitId);
      if (!permit) continue;

      // Row background (alternating)
      if (i % 2 === 0) {
        const rowBg = scene.add.graphics();
        rowBg.fillStyle(COLORS.SIDEBAR_SECTION, 0.5);
        rowBg.fillRect(panelX + 16, rowY - 2, panelW - 32, rowH);
        this.tabContent.add(rowBg);
      }

      // Stage indicator
      const stageText = scene.add
        .text(panelX + 24, rowY + rowH / 2, `★${'★'.repeat(permit.stage - 1)}`, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '12px',
          color: '#aa88ff',
        })
        .setOrigin(0, 0.5);

      const nameText = scene.add
        .text(panelX + 60, rowY + rowH / 2 - 8, permit.name, {
          fontFamily: FONTS.HEADING,
          fontSize: '13px',
          color: TEXT_COLORS.PRIMARY,
        })
        .setOrigin(0, 0.5);

      const descText = scene.add
        .text(panelX + 60, rowY + rowH / 2 + 8, permit.description, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '11px',
          color: TEXT_COLORS.SECONDARY,
          wordWrap: { width: panelW - 100 },
        })
        .setOrigin(0, 0.5);

      this.tabContent.add([stageText, nameText, descText]);
      rowY += rowH;
    }
  }
}
