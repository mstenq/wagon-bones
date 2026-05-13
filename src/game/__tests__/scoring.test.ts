import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import {
  die,
  diceFromValues,
  diceWithValue,
  item,
  itemWithAura,
  calculateTestScore,
  setupGame,
  resetDieIds,
} from './testHelpers';
import { HandType } from '../types';

beforeEach(() => {
  resetDieIds();
});

// ─── Basic Hand Detection & Scoring ───

describe('basic scoring (no equipment)', () => {
  test('high value — single die', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 10 })],
    });
    // HIGH_VALUE: baseMiles=5, baseMult=1
    // miles = (5 + 10) * 1 = 15
    expect(result.handResult.type).toBe(HandType.HIGH_VALUE);
    expect(result.miles).toBe(15);
    expect(result.mult).toBe(1);
  });

  test('pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(7, 2),
    });
    // PAIR: baseMiles=10, baseMult=1
    // miles = (10 + 14) * 1 = 24
    expect(result.handResult.type).toBe(HandType.PAIR);
    expect(result.miles).toBe(24);
  });

  test('three of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 3),
    });
    // THREE_OF_A_KIND: baseMiles=20, baseMult=3
    // miles = (20 + 12) * 3 = 96
    expect(result.handResult.type).toBe(HandType.THREE_OF_A_KIND);
    expect(result.miles).toBe(96);
  });

  test('full house', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(5, 3), ...diceWithValue(8, 2)],
    });
    // FULL_HOUSE: baseMiles=25, baseMult=4
    // totalValue = 5*3 + 8*2 = 31
    // miles = (25 + 31) * 4 = 224
    expect(result.handResult.type).toBe(HandType.FULL_HOUSE);
    expect(result.miles).toBe(224);
  });

  test('five of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(12, 5),
    });
    // FIVE_OF_A_KIND: baseMiles=50, baseMult=6
    // totalValue = 60
    // miles = (50 + 60) * 6 = 660
    expect(result.handResult.type).toBe(HandType.FIVE_OF_A_KIND);
    expect(result.miles).toBe(660);
  });

  test('five straight', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([8, 9, 10, 11, 12]),
    });
    // FIVE_STRAIGHT: baseMiles=40, baseMult=6
    // totalValue = 50
    // miles = (40 + 50) * 6 = 540
    expect(result.handResult.type).toBe(HandType.FIVE_STRAIGHT);
    expect(result.miles).toBe(540);
  });
});

// ─── Equipment Effects ───

describe('equipment: ADD_MULT', () => {
  test('horseshoe adds +4 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 3),
      equipment: [item('horseshoe')],
    });
    // THREE_OF_A_KIND: baseMiles=20, baseMult=3
    // Equipment: +4 mult → totalMult = 7
    // totalValue = 18
    // miles = (20 + 18) * 7 = 266
    expect(result.mult).toBe(7);
    expect(result.miles).toBe(266);
  });

  test('two horseshoes stack', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 3),
      equipment: [item('horseshoe'), item('horseshoe')],
    });
    // baseMult=3, +4+4=8, totalMult=11
    // (20 + 18) * 11 = 418
    expect(result.mult).toBe(11);
    expect(result.miles).toBe(418);
  });
});

describe('equipment: PIP_MULT', () => {
  test('snake_eyes adds mult per scored 1', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(1, 3),
      equipment: [item('snake_eyes')],
    });
    // THREE_OF_A_KIND: baseMiles=20, baseMult=3
    // PIP_MULT: +3 per die with value 1 → +9
    // totalValue = 3
    // mult = 3 + 9 = 12
    // miles = (20 + 3) * 12 = 276
    expect(result.mult).toBe(12);
    expect(result.miles).toBe(276);
  });

  test('snake_eyes does not trigger on non-1 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 3),
      equipment: [item('snake_eyes')],
    });
    // No 1s scored → no PIP_MULT bonus
    expect(result.mult).toBe(3);
  });
});

describe('equipment: HAND_MULT', () => {
  test('wedding_ring adds mult on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 2),
      equipment: [item('wedding_ring')],
    });
    // PAIR: baseMult=1
    // wedding_ring: +8 mult when hand contains pair → mult = 9
    expect(result.mult).toBe(9);
  });

  test('wedding_ring activates on full house (contains pair)', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(3, 3), ...diceWithValue(7, 2)],
      equipment: [item('wedding_ring')],
    });
    // FULL_HOUSE contains PAIR → wedding ring triggers
    // baseMult=4, +8 = 12
    expect(result.mult).toBe(12);
  });

  test('wedding_ring does not activate on high value', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 10 })],
      equipment: [item('wedding_ring')],
    });
    expect(result.mult).toBe(1);
  });
});

// ─── Dice Enhancements ───

describe('dice enhancements', () => {
  test('bone dice add +4 mult per die', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5, enhancement: 'bone' })],
    });
    // PAIR: baseMult=1
    // 2 bone dice: +4 * 2 = +8 → mult = 9
    // totalValue = 10
    // miles = (10 + 10) * 9 = 180
    expect(result.mult).toBe(9);
    expect(result.miles).toBe(180);
  });

  test('wooden dice add +10 miles per die', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 3, enhancement: 'wooden' }), die({ value: 3, enhancement: 'wooden' })],
    });
    // PAIR: baseMiles=10, baseMult=1
    // totalValue = 3 + 3 + 10 + 10 = 26 (each wooden adds +10 value)
    // miles = (10 + 26) * 1 = 36
    expect(result.totalValue).toBe(26);
    expect(result.miles).toBe(36);
  });

  test('diamond dice apply x2 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 6, enhancement: 'diamond' }), die({ value: 6 })],
    });
    // PAIR: baseMult=1
    // 1 diamond → xMult = 2
    // mult = 1 * 2 = 2
    expect(result.mult).toBe(2);
  });

  test('stone dice contribute 50 miles instead of face value', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 0, enhancement: 'stone' })],
    });
    // HIGH_VALUE: baseMiles=5, baseMult=1
    // stone: +50 miles instead of value
    // miles = (5 + 50) * 1 = 55
    expect(result.totalValue).toBe(50);
    expect(result.miles).toBe(55);
  });
});

// ─── Dice Auras ───

describe('dice auras', () => {
  test('fire aura adds +10 mult per die', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, aura: 'fire' }), die({ value: 5 })],
    });
    // PAIR: baseMult=1
    // fire aura on 1 die: +10 → mult = 11
    expect(result.mult).toBe(11);
  });

  test('icy aura adds +50 to totalValue', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, aura: 'icy' }), die({ value: 5 })],
    });
    // PAIR: baseMiles=10, baseMult=1
    // totalValue = 5 + 5 + 50 = 60
    // miles = (10 + 60) * 1 = 70
    expect(result.totalValue).toBe(60);
  });

  test('holy aura applies x1.5 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, aura: 'holy' }), die({ value: 5 })],
    });
    // PAIR: baseMult=1
    // holy: xMult * 1.5 → mult = 1.5
    expect(result.mult).toBe(1.5);
  });
});

// ─── Item Auras ───

describe('item auras', () => {
  test('fire aura on equipment adds +10 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [itemWithAura('horseshoe', 'fire')],
    });
    // PAIR: baseMult=1
    // horseshoe: +4, fire aura: +10 → 1 + 4 + 10 = 15
    expect(result.mult).toBe(15);
  });

  test('holy aura on equipment applies x1.5', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [itemWithAura('horseshoe', 'holy')],
    });
    // PAIR: baseMult=1
    // horseshoe: +4 → 5, then holy x1.5 → 7.5
    expect(result.mult).toBe(7.5);
  });

  test('icy aura on equipment adds +50 miles', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [itemWithAura('horseshoe', 'icy')],
    });
    // PAIR: baseMiles=10, baseMult=1
    // horseshoe: +4 mult → mult=5
    // icy aura: +50 miles → totalValue = 4+4+50 = 58 ... wait
    // icy aura on ITEMS adds +50 to bonusMiles in applyEquipmentEffects
    // miles = (baseMiles + totalValue + bonusMiles) * mult
    // = (10 + 8 + 50) * 5 = 340
    expect(result.miles).toBe(340);
  });

  test('ghost aura on equipment does not take an inventory slot', () => {
    const { player } = setupGame({ maxEquipmentSlots: 2 });
    // Fill both slots with normal items
    player.equipment = [item('horseshoe'), item('trail_markers')];
    expect(player.equipmentSlotsFree).toBe(0);
    expect(player.usedEquipmentSlots).toBe(2);

    // Can't buy a normal item when full
    const normalDef = item('horseshoe').def;
    player.economy.setBalance(100);
    expect(player.canBuy(normalDef)).toBe(false);

    // Replace one with a ghost-aura item — frees a slot
    player.equipment = [item('horseshoe'), itemWithAura('trail_markers', 'ghost')];
    expect(player.usedEquipmentSlots).toBe(1);
    expect(player.equipmentSlotsFree).toBe(1);
    expect(player.canBuy(normalDef)).toBe(true);
  });

  test('ghost aura item can be added even when slots are full', () => {
    const { player } = setupGame({ maxEquipmentSlots: 2 });
    player.equipment = [item('horseshoe'), item('trail_markers')];
    player.economy.setBalance(100);

    // Can't buy normal item
    expect(player.canBuy(item('horseshoe').def)).toBe(false);

    // CAN buy ghost-aura item
    const ghostDef = itemWithAura('horseshoe', 'ghost').def;
    expect(player.canBuy(ghostDef)).toBe(true);

    // After buying, we have 3 items but only 2 used slots
    player.buyEquipment(ghostDef);
    expect(player.equipment.length).toBe(3);
    expect(player.usedEquipmentSlots).toBe(2);
    expect(player.equipmentSlotsFree).toBe(0);
  });

  test('ghost aura does not affect scoring', () => {
    const { result: withGhost } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [itemWithAura('horseshoe', 'ghost')],
    });
    const { result: withoutAura } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [item('horseshoe')],
    });
    // Ghost aura should not change mult or miles vs no aura
    expect(withGhost.mult).toBe(withoutAura.mult);
    expect(withGhost.miles).toBe(withoutAura.miles);
  });
});

// ─── Held-in-Hand Dice ───

describe('held-in-hand effects', () => {
  test('steel dice held in hand apply x1.5 mult each', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, enhancement: 'steel' })],
    });
    // PAIR: baseMult=1
    // held steel: xMult=1.5
    // afterHeldMult = (1 + 0) * 1.5 = 1.5
    expect(result.mult).toBe(1.5);
  });

  test('two steel dice held multiply together', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, enhancement: 'steel' }), die({ value: 4, enhancement: 'steel' })],
    });
    // xMult = 1.5 * 1.5 = 2.25
    expect(result.mult).toBe(2.25);
  });
});

// ─── Hand Levels ───

describe('hand levels', () => {
  test('level 2 pair adds milesPerLevel and multPerLevel', () => {
    const { result: lvl1 } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
    });
    const { result: lvl2 } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      handLevels: { [HandType.PAIR]: 2 },
    });

    // Level 2 should give more miles than level 1
    expect(lvl2.miles).toBeGreaterThan(lvl1.miles);
  });
});

// ─── Combined Scenarios ───

describe('combined scenarios', () => {
  test('bone dice + horseshoe on three of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: [
        die({ value: 8, enhancement: 'bone' }),
        die({ value: 8, enhancement: 'bone' }),
        die({ value: 8, enhancement: 'bone' }),
      ],
      equipment: [item('horseshoe')],
    });
    // THREE_OF_A_KIND: baseMiles=20, baseMult=3
    // 3 bone: +12 mult
    // horseshoe: +4 mult
    // totalMult = 3 + 12 + 4 = 19
    // totalValue = 24
    // miles = (20 + 24) * 19 = 836
    expect(result.mult).toBe(19);
    expect(result.miles).toBe(836);
  });

  test('snake_eyes + wedding_ring on pair of 1s', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(1, 2),
      equipment: [item('snake_eyes'), item('wedding_ring')],
    });
    // PAIR: baseMiles=10, baseMult=1
    // snake_eyes: +3 per 1 scored → +6
    // wedding_ring: +8 (pair)
    // mult = 1 + 6 + 8 = 15
    // totalValue = 2
    // miles = (10 + 2) * 15 = 180
    expect(result.mult).toBe(15);
    expect(result.miles).toBe(180);
  });

  test('steel held + equipment + scored bone dice', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      heldDice: [die({ value: 2, enhancement: 'steel' })],
      equipment: [item('horseshoe')],
    });
    // PAIR: baseMiles=10, baseMult=1
    // bone: +4 mult in scoreHand → scoreHand mult = (1 + 4) * 1 = 5
    // horseshoe: +4 mult (applied in applyEquipmentEffects step)
    // held steel: xMult=1.5 → applied before equipment step
    //
    // scoreHand: totalValue=10, mult=5, miles=(10+10)*5=100
    // afterHeld: mult=(5+0)*1.5=7.5, miles=(10+10)*7.5=150
    // equipment: +4 mult → finalMult=7.5+4=11.5
    // finalMiles = (10+10+0)*11.5 = 230... wait let me re-check the flow

    // Actually the flow in calculateScore:
    // 1. scoreHand → baseMult=1, bonusMult from bone=+4, xMult=1 → mult=(1+4)*1=5
    //    totalValue=10, miles=(10+10)*5=100
    // 2. processHeldInHand → bonusMult=0, xMult=1.5
    // 3. afterHeld: heldMult = (5 + 0) * 1.5 = 7.5
    //    miles = (10 + 10) * 7.5 = 150
    // 4. applyEquipmentEffects on afterHeldResult:
    //    horseshoe ADD_MULT: bonusMult=+4
    //    finalMult = 7.5 + 4 = 11.5
    //    finalMiles = (10 + 10 + 0) * 11.5 = 230

    expect(result.mult).toBe(11.5);
    expect(result.miles).toBe(230);
  });
});
