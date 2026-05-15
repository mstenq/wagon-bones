# Bugs noticed while playing

? mirage supply didn't seem to duplicate dice and also changed the dices value?
? Outlaw profession is earning interest, and I'm not sure rewards are being calculated correctly
- When a trail event removes a day it immediately shows in the sidebar which is good, but then it increased again while in the shop before finally reducing again once i was in the game scene.
- in game scene the Score Dice button and Re-roll button should be swapped to be more like balatro
- In the dice grab bag packs, when you buy a dice it shows all the dice at the top of the screen before going back to the shop scene
- When new dice are added to pouch from trail events they have no number showing on them till they are rolled once. Fine for stone ones, but all others should show a value.
- Stone dice are showing numbers. They should never have a die value, they should sort as the highest value (above 12s)
- Stone dice should also not count towards hands, but should always be scored (Not sure that is happening cause they have numbers)
- "Buy & Use" tab should stay on the right hand size, but the "Buy" button should actually be a tab at the bottom of the card that the card moves up to reveal. 
- when a consumable is in your consumable bar, the 2 tabs on the right side is fine, but the use tab should be red.
- "Hit the Trail" button should be red
- "Reroll" button in shop should be green



## Code Feedback
- lets convert the JSON data into JS arrays that are typed. It would make a lot of things much easier in our code base if we were sure about the shape of the data without doing checks.
