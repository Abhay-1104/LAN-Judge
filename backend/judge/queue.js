const os = require('os');

// Caps how many submissions compile/run at the exact same time. Without this,
// a burst of students hitting "Submit" together (e.g. right when a contest
// starts) would spawn one compiler process per submission simultaneously and
// could grind the host laptop to a halt. Extra submissions wait in line
// instead — a few seconds of queueing beats the whole server freezing.
const MAX_CONCURRENT = Math.max(2, os.cpus().length - 1);

let running = 0;
const queue = [];

function runNext() {
  if (running >= MAX_CONCURRENT || queue.length === 0) return;
  running++;
  const { task, resolve, reject } = queue.shift();
  task()
    .then(resolve, reject)
    .finally(() => {
      running--;
      runNext();
    });
}

/**
 * Wraps an async judge task so it respects the concurrency cap.
 * @param {() => Promise<any>} task
 */
function enqueue(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    runNext();
  });
}

function getQueueStatus() {
  return { running, waiting: queue.length, maxConcurrent: MAX_CONCURRENT };
}

module.exports = { enqueue, getQueueStatus, MAX_CONCURRENT };
