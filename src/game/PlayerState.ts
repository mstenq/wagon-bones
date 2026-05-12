// ─── PlayerState (No Phaser imports) ───
// Persistent state that carries across scenes (shop, rounds, etc).

import { Die, HandType, HandStats, BossDef } from './types';
import { createPouch } from './DiceSystem';
import { Economy } from './Economy';
import { EquipmentDef, EquipmentInstance } from './ItemsSystem';
import { processEquipmentOnSell } from './EquipmentEffects';
import { GAMEPLAY } from './Constants';
import trailGuidesData from '../data/trail_guides.json';
import professionsData from '../data/professions.json';
import bossesData from '../data/bosses.json';

export interface ProfessionDef {
  id: string;
  title: string;
  name: string;
  description: string;
  modifiers: Record<string, unknown>;
}

export interface PayoutBreakdown {
  roundReward: number;      // base reward for completing the round ($3/$4/$5)
  dayBonus: number;         // $1 per remaining day
  interest: number;         // $1 per $5 held, capped at interestCap
  equipmentMoney: number;   // END_ROUND_MONEY items like Payday (not in interest)
  total: number;
}

const DEFAULT_STARTING_MONEY = GAMEPLAY.STARTING_MONEY;
const DEFAULT_MAX_EQUIPMENT_SLOTS = GAMEPLAY.MAX_EQUIPMENT_SLOTS;
const DEFAULT_SHOP_SLOTS = GAMEPLAY.SHOP_SLOTS;
const DEFAULT_STARTING_DICE = GAMEPLAY.STARTING_DICE;
const SHOP_REROLL_COST = GAMEPLAY.SHOP_REROLL_COST;

export class PlayerState {
  economy: Economy;
  dice: Die[];             // all dice the player owns
  spentDiceIds: Set<string> = new Set(); // dice used this cycle (persists across days & rounds)
  equipment: EquipmentInstance[];
  maxEquipmentSlots: number;
  shopSlots: number; // how many items appear in the shop (upgradeable via vouchers)
  leg: number; // current leg of the journey (1-8)
  round: number; // current round within the leg (1-3)
  interestCap: number; // max money counted for interest (default $25, vouchers can raise to $50)
  handStats: Map<HandType, HandStats>; // level & play count per hand type
  profession: ProfessionDef | null = null; // selected profession
  handSize: number = GAMEPLAY.ROLL_SIZE; // dice selected for rolling
  private bossAssignments: BossDef[] = []; // one boss per leg, assigned at game start

  constructor() {
    this.economy = new Economy(DEFAULT_STARTING_MONEY);
    this.dice = createPouch(DEFAULT_STARTING_DICE);
    this.equipment = [];
    this.maxEquipmentSlots = DEFAULT_MAX_EQUIPMENT_SLOTS;
    this.shopSlots = DEFAULT_SHOP_SLOTS;
    this.leg = 1;
    this.round = 1;
    this.interestCap = GAMEPLAY.INTEREST_CAP;
    this.handStats = PlayerState.createDefaultHandStats();
    this.assignBosses();
  }

  /** Apply profession modifiers after selection */
  applyProfession(professionId: string): void {
    const prof = professionsData.find(p => p.id === professionId);
    if (!prof) return;
    this.profession = prof as ProfessionDef;
    const m = prof.modifiers as Record<string, unknown>;

    // Starting money bonus
    if (typeof m.startingMoney === 'number') {
      this.economy.earn(m.startingMoney);
    }

    // Equipment slot modifiers
    if (typeof m.equipmentSlots === 'number') {
      this.maxEquipmentSlots += m.equipmentSlots;
    }

    // Hand size modifier
    if (typeof m.handSize === 'number') {
      this.handSize += m.handSize;
    }
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
      state: def.initialState ? { ...def.initialState } : {},
    });
    return true;
  }

  sellEquipment(index: number): boolean {
    if (index < 0 || index >= this.equipment.length) return false;
    const item = this.equipment[index];
    this.economy.earn(item.sellValue);
    this.equipment.splice(index, 1);
    // Update stateful equipment on sell (Snake Oil Ledger)
    processEquipmentOnSell(this.equipment);
    return true;
  }

  reorderEquipment(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.equipment.length) return;
    if (toIndex < 0 || toIndex >= this.equipment.length) return;
    const [item] = this.equipment.splice(fromIndex, 1);
    this.equipment.splice(toIndex, 0, item);
  }

  /** Randomly assign one boss from the pool to each leg */
  private assignBosses(): void {
    const pool = [...(bossesData as BossDef[])];
    // Shuffle and pick LEGS bosses
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.bossAssignments = pool.slice(0, GAMEPLAY.LEGS);
  }

  /** Get the boss for the current leg (only active on round 3) */
  get currentBoss(): BossDef | null {
    if (this.round !== GAMEPLAY.ROUNDS_PER_LEG) return null;
    return this.bossAssignments[this.leg - 1] ?? null;
  }

  /** Get the boss assigned to a specific leg */
  getBossForLeg(leg: number): BossDef | null {
    return this.bossAssignments[leg - 1] ?? null;
  }

  /** Whether the current round is a boss round */
  get isBossRound(): boolean {
    return this.round === GAMEPLAY.ROUNDS_PER_LEG;
  }

  /** The overall round number (1–24) */
  get totalRound(): number {
    return (this.leg - 1) * GAMEPLAY.ROUNDS_PER_LEG + this.round;
  }

  /** Target miles for the current round (base × round multiplier) */
  get targetMiles(): number {
    const base = GAMEPLAY.TARGET_MILES_BY_LEG[this.leg - 1] ?? GAMEPLAY.TARGET_MILES;
    const multiplier = GAMEPLAY.ROUND_MULTIPLIERS[this.round - 1] ?? 1;
    return Math.ceil(base * multiplier);
  }

  /** Calculate the payout breakdown for winning the current round */
  calculatePayout(daysRemaining: number): PayoutBreakdown {
    const roundReward = GAMEPLAY.ROUND_REWARDS[this.round - 1] ?? 3;
    const dayBonus = daysRemaining;

    // Interest: based on current balance (gold dice money already earned before payout)
    const cappedMoney = Math.min(this.economy.balance, this.interestCap);
    const interest = Math.floor(cappedMoney / GAMEPLAY.INTEREST_PER);

    // Equipment end-of-round money (e.g. Payday) — NOT included in interest
    let equipmentMoney = 0;
    for (const equip of this.equipment) {
      if (equip.def.effectType === 'END_ROUND_MONEY') {
        equipmentMoney += (equip.def.effectParams.value as number) ?? 0;
      }
    }

    return {
      roundReward,
      dayBonus,
      interest,
      equipmentMoney,
      total: roundReward + dayBonus + interest + equipmentMoney,
    };
  }

  /** Whether the entire journey is complete */
  get journeyComplete(): boolean {
    return this.leg > GAMEPLAY.LEGS;
  }

  /** Advance to next round after a win. Returns true if the journey is complete. */
  advanceRound(): boolean {
    this.round++;
    if (this.round > GAMEPLAY.ROUNDS_PER_LEG) {
      this.round = 1;
      this.leg++;
    }
    // Refresh spent dice between rounds
    this.spentDiceIds.clear();
    return this.journeyComplete;
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
    this.round = 1;
    this.interestCap = GAMEPLAY.INTEREST_CAP;
    this.handStats = PlayerState.createDefaultHandStats();
    this.profession = null;
    this.handSize = GAMEPLAY.ROLL_SIZE;
    this.assignBosses();
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
