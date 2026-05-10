// ─── Items System (No Phaser imports) ───
// Equipment definitions, shop stock generation.

import allItems from '../data/items.json';

export interface EquipmentDef {
  id: string;
  name: string;
  cost: number;
  rarity: string;
  description: string;
  effectType: string;
  effectParams: Record<string, unknown>;
}

export interface EquipmentInstance {
  def: EquipmentDef;
  sellValue: number;
}

const ITEMS_POOL: EquipmentDef[] = allItems as EquipmentDef[];

const SHOP_SIZE = 5;

/** Generate a random shop stock of equipment */
export function generateShopStock(count: number = SHOP_SIZE): EquipmentDef[] {
  const shuffled = [...ITEMS_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/** Get all equipment definitions */
export function getAllEquipment(): EquipmentDef[] {
  return ITEMS_POOL;
}
