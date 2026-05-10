// ─── PlayerState (No Phaser imports) ───
// Persistent state that carries across scenes (shop, rounds, etc).

import { Die, HandType, HandStats } from './types';
import { createPouch } from './DiceSystem';
import { Economy } from './Economy';
import { EquipmentDef, EquipmentInstance } from './ItemsSystem';
import { GAMEPLAY } from './Constants';
import trailGuidesData from '../data/trail_guides.json';

const DEFAULT_STARTING_MONEY = GAMEPLAY.STARTING_MONEY;
const DEFAULT_MAX_EQUIPMENT_SLOTS = GAMEPLAY.MAX_EQUIPMENT_SLOTS;
const DEFAULT_SHOP_SLOTS = GAMEPLAY.SHOP_SLOTS;
const SHOP_REROLL_COST = GAMEPLAY.SHOP_REROLL_COST;

export class PlayerState {
  economy: Economy;
  dice: Die[];             // all dice the player owns
  spentDiceIds: Set<string> = new Set(); // dice used this cycle (persists across days & rounds)
  equipment: EquipmentInstance[];
  maxEquipmentSlots: number;
  shopSlots: number; // how many items appear in the shop (upgradeable via vouchers)
  leg: number; // current leg of the journey (1-8)
  handStats: Map<HandType, HandStats>; // level & play count per hand type

  constructor() {
    this.economy = new Economy(DEFAULT_STARTING_MONEY);
    this.dice = createPouch(10);
    this.equipment = [];
    this.maxEquipmentSlots = DEFAULT_MAX_EQUIPMENT_SLOTS;
    this.shopSlots = DEFAULT_SHOP_SLOTS;
    this.leg = 1;
    this.handStats = PlayerState.createDefaultHandStats();
  }

  /** Create default hand stats: level 1, 0 plays, per-level bonuses from trail guide data */
  private static createDefaultHandStats(): Map<HandType, HandStats> {
    // Build lookup from trail guide JSON
    const tgLookup = new Map<string, { milesPerLevel: number; multPerLevel: number }>();
    for (const tg of trailGuidesData) {
      tgLookup.set(tg.handType, { milesPerLevel: tg.milesPerLevel, multPerLevel: tg.multPerLevel });
    }

    const stats = new Map<HandType, HandStats>();
    for (const type of Object.values(HandType)) {
      const tg = tgLookup.get(type);
      stats.set(type, {
        level: 1,
        timesPlayed: 0,
        milesPerLevel: tg?.milesPerLevel ?? 10,
        multPerLevel: tg?.multPerLevel ?? 1,
      });
    }
    return stats;
  }

  /** Get stats for a hand type (always returns a value) */
  getHandStats(type: HandType): HandStats {
    if (!this.handStats.has(type)) {
      this.handStats.set(type, { level: 1, timesPlayed: 0, milesPerLevel: 10, multPerLevel: 1 });
    }
    return this.handStats.get(type)!;
  }

  /** Record that a hand was played */
  recordHandPlayed(type: HandType): void {
    const stats = this.getHandStats(type);
    stats.timesPlayed++;
  }

  /** Upgrade a hand's level (e.g. from trail guide cards) */
  upgradeHandLevel(type: HandType, amount: number = 1): void {
    const stats = this.getHandStats(type);
    stats.level += amount;
  }

  /** Dice that haven't been spent yet (available for play) */
  get availableDice(): Die[] {
    return this.dice.filter(d => !this.spentDiceIds.has(d.id));
  }

  /** Dice that have been used and are in the spent pile */
  get spentDice(): Die[] {
    return this.dice.filter(d => this.spentDiceIds.has(d.id));
  }

  /** Whether every die in the pool has been spent */
  get allDiceSpent(): boolean {
    return this.dice.length > 0 && this.spentDiceIds.size >= this.dice.length;
  }

  /** Mark dice as spent. Returns true if all dice are now spent (triggers auto-refresh). */
  markDiceSpent(ids: string[]): boolean {
    ids.forEach(id => this.spentDiceIds.add(id));
    if (this.allDiceSpent) {
      this.spentDiceIds.clear();
      return true; // auto-refreshed
    }
    return false;
  }

  /** Cost to refresh spent dice = number of available (non-spent) dice */
  get refreshCost(): number {
    return this.availableDice.length;
  }

  /** Pay to refresh all spent dice back into the available pool. Returns false if can't afford. */
  refreshSpentDice(): boolean {
    const cost = this.refreshCost;
    if (this.spentDiceIds.size === 0) return false; // nothing to refresh
    if (cost > 0 && !this.economy.spend(cost)) return false;
    this.spentDiceIds.clear();
    return true;
  }

  addDie(die: Die): void {
    this.dice.push({ ...die, id: `die_player_${this.dice.length}` });
  }

  get shopRerollCost(): number {
    return SHOP_REROLL_COST;
  }

  canRerollShop(): boolean {
    return this.economy.balance >= SHOP_REROLL_COST;
  }

  payShopReroll(): boolean {
    if (!this.canRerollShop()) return false;
    this.economy.spend(SHOP_REROLL_COST);
    return true;
  }

  get equipmentSlotsFree(): number {
    return this.maxEquipmentSlots - this.equipment.length;
  }

  canBuy(item: EquipmentDef): boolean {
    if (this.economy.balance < item.cost) return false;
    if (this.equipment.length >= this.maxEquipmentSlots) return false;
    return true;
  }

  buyEquipment(def: EquipmentDef): boolean {
    if (!this.canBuy(def)) return false;
    this.economy.spend(def.cost);
    this.equipment.push({
      def,
      sellValue: Math.max(1, Math.floor(def.cost / 2)),
    });
    return true;
  }

  sellEquipment(index: number): boolean {
    if (index < 0 || index >= this.equipment.length) return false;
    const item = this.equipment[index];
    this.economy.earn(item.sellValue);
    this.equipment.splice(index, 1);
    return true;
  }

  /** Reset for a new run */
  reset(): void {
    this.economy = new Economy(DEFAULT_STARTING_MONEY);
    this.dice = createPouch(10);
    this.spentDiceIds = new Set();
    this.equipment = [];
    this.maxEquipmentSlots = DEFAULT_MAX_EQUIPMENT_SLOTS;
    this.shopSlots = DEFAULT_SHOP_SLOTS;
    this.leg = 1;
    this.handStats = PlayerState.createDefaultHandStats();
  }
}

// Singleton shared across scenes via Phaser registry
let _instance: PlayerState | null = null;

export function getPlayerState(): PlayerState {
  if (!_instance) _instance = new PlayerState();
  return _instance;
}

export function resetPlayerState(): PlayerState {
  _instance = new PlayerState();
  return _instance;
}
