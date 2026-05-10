import { Boot } from '../phaser/scenes/Boot';
import { Preloader } from '../phaser/scenes/Preloader';
import { MainMenu } from '../phaser/scenes/MainMenu';
import { ShopScene } from '../phaser/scenes/ShopScene';
import { BoosterPackScene } from '../phaser/scenes/BoosterPackScene';
import { DiceSelectionScene } from '../phaser/scenes/DiceSelectionScene';
import { GameScene } from '../phaser/scenes/GameScene';
import { GameOver } from '../phaser/scenes/GameOver';
import { AUTO, Game, Scale } from 'phaser';

const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1024,
    height: 768,
    parent: 'game-container',
    backgroundColor: '#1a1a2e',
    scale: {
        mode: Scale.RESIZE,
        autoCenter: Scale.CENTER_BOTH,
    },
    scene: [
        Boot,
        Preloader,
        MainMenu,
        ShopScene,
        BoosterPackScene,
        DiceSelectionScene,
        GameScene,
        GameOver
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
