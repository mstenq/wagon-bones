// Suppress console.log during tests to keep output clean.
// Remove or comment this file to see scoring debug logs.
// Imported at the top of each test file.

const originalLog = console.log;
console.log = () => {};

// Restore on process exit (for debugging if needed)
process.on('exit', () => {
  console.log = originalLog;
});
