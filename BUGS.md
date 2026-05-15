# Bugs noticed while playing

? mirage supply didn't seem to duplicate dice and also changed the dices value?
? Outlaw profession is earning interest, and I'm not sure rewards are being calculated correctly
? When a trail event removes a day it immediately shows in the sidebar which is good, but then it increased again while in the shop before finally reducing again once i was in the game scene.
x in game scene the Score Dice button and Re-roll button should be swapped to be more like balatro
x In the dice grab bag packs, when you buy a dice it shows all the dice at the top of the screen before going back to the shop scene
? When new dice are added to pouch from trail events they have no number showing on them till they are rolled once. Fine for stone ones, but all others should show a value.
? Stone dice are showing numbers. They should never have a die value, they should sort as the highest value (above 12s)
? Stone dice should also not count towards hands, but should always be scored (Not sure that is happening cause they have numbers)
x "Buy & Use" tab should stay on the right hand size, but the "Buy" button should actually be a tab at the bottom of the card that the card moves up to reveal. 
x "Hit the Trail" button should be red
x "Reroll" button in shop should be green
- when you get a negative trail event like swamped wagon where you lose 2 random supply/trail cards and don't have any supply cards, it should fallback to $10 or something. right now it just silently does nothing which is lame.
- second helping doesn't seem to work. Have tried it a few times and didn't get an additional card in my consumable card as expected.
- you can currently use supply cards like rabbits foot directly from the shop. But really that should only be able to be used in the game scene or booster scenes. Basically things that effect dice need to have dice present on the screen to work. Only cards like treasure map, trade, second helpings, trail guide cards, can be used at anytime because you don't need to select dice first. I think some of this logic might exist cause the "Buy and Use" button doesn't show in the shop stock, but once its in your consumable area the use button shows up.
- in a dice mega grab bag, after the first dice purchase, i can see 8 dice at the top of the screen half way off the screen.
- equipment and supply/trail cards that are in equipment bar and consumable bar should not show up in the shop again. But when we implement "Counterfeit Goods" item, then they can show up multiple times and you can purchase a second copy of the equipment (Currently you are blocked from buying copies)


## New Features
- our tooltips need access to game/player state so things like second helpings can tell us the card we'll get, trade tells us how much money we'll get, etc. Needs to work like displayHints I think.
- Doctor - lets buff doctor by having her start with 2 ghost aura medicine cards, and have her recieve a ghost medicine card after every boss win.
- Boss fights needs to be added
- Need an overview screen that shows the 3 legs and what the boss fight will be when you click "Hit the trail". Similar view available from Journey Info modal (New tab)
- dice have a new state, "lock + held" and "lock + to score". This can maybe be indicated by a lock and red cross(🔒❌) for held not played and a lock an lighting bolt (🔒⚡) for held to score. By default left clicking goes to locked to score and you can right click to get context menu to lock and hold.
- when you have 5 or less dice locked and in the "to score" state, we should show the  hand type, hand level, and base miles, base mult in the sidebar. Its really nice to be able to get a baseline for what you are about to score and make sure you've made the correct selection before hitting "Score Dice".


## Code Feedback
- lets convert the JSON data into JS arrays that are typed. It would make a lot of things much easier in our code base if we were sure about the shape of the data without doing checks.
- Dead code: these TrailEventModifiers are defined and set but never consumed by game logic or UI: `flatMilesPenalty`, `moneyPerDayLoss`, `disableRerollDay1`, `standardDiceDay1`, `diamondCrackDoubled`, `luckyOddsHalved`, `scoredDiceDestroyChance`. Need to implement their effects in GameState/GameScene or remove them.
