// ─── EquipmentBar ───
// Top bar in the main content area showing owned equipment cards.
// Balatro-style: always visible across shop and game scenes.
// Cards are drag-to-reorder since scoring depends on equipment order (L→R).

import { Scene } from 'phaser';
import { UI } from '../../game/Constants';
import { getPlayerState } from '../../game/PlayerState';
import { ItemCard, CardActionTabConfig } from './ItemCard';
import { CardBar } from './CardBar';
import type { GameState } from '../../game/GameState';
import type { PlayerState } from '../../game/PlayerState';

export class EquipmentBar extends CardBar {
  protected readonly cardScale = UI.EQUIP_CARD_SCALE;
  protected readonly preferredSpacing = UI.EQUIP_CARD_SPACING;
  protected readonly barPadding = 20;

  constructor(scene: Scene, x: number, y: number, width: number, height: number) {
    super(scene, x, y, width, height);
    this.refresh();
  }

  /** Update all card hints with current game context */
  updateHints(game: GameState | null, player: PlayerState): void {
    for (const card of this.cards) {
      card.updateHints(game, player);
    }
  }

  // ─── CardBar abstract implementations ───

  protected getSlotLabel(): string {
    const player = getPlayerState();
    return `${player.usedEquipmentSlots}/${player.maxEquipmentSlots}`;
  }

  protected getItemCount(): number {
    return getPlayerState().equipment.length;
  }

  protected createCardForItem(x: number, y: number, index: number): ItemCard {
    const equip = getPlayerState().equipment[index];
    return new ItemCard(this.scene, x, y, equip.def, {
      mode: 'compact',
      cardScale: UI.EQUIP_CARD_SCALE,
    });
  }

  protected buildActionTabs(card: ItemCard, index: number): CardActionTabConfig[] | null {
    const player = getPlayerState();
    const equip = player.equipment[index];
    if (!equip) return null;

    return [
      {
        label: `SELL\n$${equip.sellValue}`,
        color: 0x338833,
        callback: () => this.animateSellCard(card, index),
      },
    ];
  }

  protected onReorder(fromIndex: number, toIndex: number): void {
    getPlayerState().reorderEquipment(fromIndex, toIndex);
  }

  protected onSellComplete(index: number): void {
    getPlayerState().sellEquipment(index);
    this.emit('equipment-changed');
  }
}
