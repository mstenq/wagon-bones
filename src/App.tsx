import { PhaserGame } from './PhaserGame';

const App = () => {
  const currentScene = (_scene: Phaser.Scene) => {
    // Can react to scene changes here if needed
  };

  return (
    <div id="app">
      <PhaserGame currentActiveScene={currentScene} />
    </div>
  );
};

export default App;
