import { Game } from 'phaser';
import { gameConfig } from './config';

const StartGame = (parent: string) => {
  return new Game({ ...gameConfig, parent });
};

export default StartGame;
