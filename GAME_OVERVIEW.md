# Wagon Bones
a balatro like game based on OregonTrail/Wild Wild West and using dice.

Pips on the dice are considered as base miles traveled. Mult is still just mult.


# Hand Types       Miles   Base Mult
high value          5       1
two of a kind       10      1
two pair            15      2
three of a kind     20      3
full house          25      4
four of a kind      40      5
five of a kind      50      6

3 straight          15      1
4 straight          20      3 
5 straight          40      6 

# Main differences from balatro
instead of having limited number of hands, you have a limited number of days you can travel. So you need to beat this round or reach your destination within a certain number of miles. Each round the number of miles increases just like balatro.

Since we are using 6 sided dice, we don't have face cards/suits/fixed card numbers etc, so deck fixing is gonna be a little different and probably not as important. This will need to be tweaked. Also since we are dealing with dice, there will be an additional phase during rounds for doing re-rolls.
Instead of discards, you pick 5 dice from your hand to roll each day. Once dice are rolled and scored, they go to a "spent" pile. You must cycle through ALL your dice before any come back — even across days within a round. This means if you cherry-pick your best dice early, you'll be stuck with the worst ones later.
Also since this is a journey I want to start with a shop and a bit of money to start so you can pick up supplies before starting your journey which just fits better with our theme.

# Rounds / Landmarks
We have 8 bosses we will face in order to reach each landmark. Balatro calls these antes, but we might call them legs, or something.

0. Independence Missouri - This is where you start
1. Fort Kearny
2. Chimney Rock
3. Fort Laramie
4. Independence Rock
5. Fort Bridger
6. Fort Hall
7. The Dalles
8. Oregon City- This is the finish line

# Phases of a Round
days (4 days to get to destination by default) - each day has 2 phases
1. pick phase - pick 5 dice from your hand to roll. You can see all available dice in your hand (drawn from your collection). Dice you've already used are in the spent pile and won't come back until you've cycled through all of them.
2. roll phase - roll your 5 dice, by default you get 3 re-rolls per day (resets each day)
3. score phase - lock in the 1 to 5 dice you want to play. If hand matches multiple possible score targets, the more difficult hand to get wins.

Dice cycling: When dice are scored, they move to a spent pile. Each day you draw fresh dice from the remaining pouch. If the pouch runs out, the spent pile is shuffled back in. This persists across days within a round.

# Trail Guides
Trail guides are what Balatro calls planet cards. These bump up your base miles and mult for a particular hand. The scaling of this will vary, but generally the harder the hand the faster it scales, while easier hands to score rise much slower. These trail guide cards can be gotten as stand alone cards in the shop or in trail guide booster packs. Certain items/equipment or supply cards can also generate them. 

# Supply Cards
Supply cards are what Balatro calls Tarot cards. They are used to enhance the scoring power of your dice, manipulate your dice collection, earn money, generate trail guides, etc.

# Frontier Encounters
Frontier encounter cards are what spectral cards are in Balatro. They can add enhanced pips to dice, add aura to dice or equipment, duplicate equipment, create ghost equipment, destroy 5 dice for money, etc. They are very powerful and show up in the shop much more rarely. Stand alone cards do not show in shop except for certain characters.

# Professions
Instead of decks, we instead choose a character, and the character affects how the journey will go. Here is the list of characters and there affects.

- Farmer Hank Caldwell = +1 re-roll per day 
- Surveyor Elias Mercer = +1 day of travel 
- Banker Charles Whitlock = starts with $20
- Outlaw Jesse Rawlins = Earns no interest on money, instead gets 
   - $1 per remaining day
   - $1 per unused re-roll 
- Merchant Abigail Turner = 1 extra slot for equipment, -1 day of travel
- Cook Martha Delaney = Starts with extra supplies voucher and 2 copies of second helpings supply card
- Scout Caleb Winters = Starts with binoculars voucher (Can always find most used trail knowledge card), -1 supply slot
- Demon Hunter Isaac Granger = Frontier Encounter cards appear in shop, start with a Priests Blessings card   
- Prospector Davis Holler - Start with vouchers for extra supplies/extra trail guides/extra stock in shops
- Gambler Thomas “Tommy” Reeve - Start with +2 hand size and -1 equipment slot
- Hunter / Trapper Nathan Cole - After each boss gain a double tag (Doubles rewards from skipping a blind)
- Accountant Henry Pritchard - Balance miles and mult before calculating total miles when scoring (x2 base blind size)
- Doctor Dr. Eleanor Sykes - Start the game with 2 medicine cards in hand, medicine is twice as likely to show up in shop
- Con Artist Victor Hale - +2 re-rolls per day, -1 hand size

## Also See:
GAME_BOSS_OVERVIEW.md
GAME_DICE_OVERVIEW.md
GAME_EQUIPMENT_OVERVIEW.md