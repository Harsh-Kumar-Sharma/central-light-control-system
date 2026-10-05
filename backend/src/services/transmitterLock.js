// A transmitter talks to its receivers one exchange at a time. Commands and
// status polls for the same transmitter are queued through this so two TCP
// conversations never hit the same device simultaneously.
//
// COOLDOWN_MS: many embedded TCP servers handle a single client and only
// notice the previous one has closed a moment later, so the next connection
// waits a short beat instead of arriving while the old socket is still open.
// Callers get their result immediately; only the *next* caller waits.
const COOLDOWN_MS = 100;
const tails = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function withTransmitterLock(transmitterId, fn) {
  const previous = tails.get(transmitterId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => {}).then(() => sleep(COOLDOWN_MS));
  tails.set(transmitterId, tail);
  tail.then(() => {
    if (tails.get(transmitterId) === tail) tails.delete(transmitterId);
  });
  return run;
}
