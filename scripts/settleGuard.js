// A test that awaits a promise nothing will settle does not fail: Node runs
// out of work and exits 0, skipping every test after it. A deadlocked
// refresh test passed this way with the race it guards against back in.
//
// Call once at startup; call the returned function when the run has
// finished. Exiting before then, with nothing else having failed, exits 1.
module.exports = function guardUnsettled(label) {
  let finished = false;
  process.on("exit", (code) => {
    if (finished || code !== 0) return;
    console.error(`${label} did not finish: a test is waiting on a promise that never settles`);
    process.exitCode = 1;
  });
  return () => { finished = true; };
};
