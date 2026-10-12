import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FirstVisibleTextReceipt } from '../src/visible-text-receipt.mjs';

const CALL_A = '11111111-1111-4111-8111-111111111111';
const CALL_B = '22222222-2222-4222-8222-222222222222';

function fixture({ report } = {}) {
  const frames = [];
  const reports = [];
  const documentListeners = new Map();
  const windowListeners = new Map();
  const window = {
    innerWidth: 320,
    innerHeight: 240,
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    addEventListener(name, callback) { windowListeners.set(name, callback); },
    removeEventListener(name) { windowListeners.delete(name); },
    getComputedStyle(node) { return node.style ?? { display: 'block', visibility: 'visible', opacity: '1' }; },
  };
  const document = {
    visibilityState: 'visible',
    defaultView: window,
    documentElement: { clientWidth: 320, clientHeight: 240 },
    addEventListener(name, callback) { documentListeners.set(name, callback); },
    removeEventListener(name) { documentListeners.delete(name); },
  };
  const receipt = new FirstVisibleTextReceipt({
    document,
    report: async observation => {
      reports.push(observation);
      return report ? report(observation) : { kind: 'ok' };
    },
    now: () => 1_791_804_000_123,
  });
  async function frame() {
    const callback = frames.shift();
    assert(callback, 'an observation check should wait for an animation frame');
    callback();
    await Promise.resolve();
    await Promise.resolve();
  }
  return { document, receipt, reports, frames, documentListeners, windowListeners, frame };
}

function node({ hidden = false, rect = { left: 10, top: 10, right: 110, bottom: 40 } } = {}) {
  const panel = {
    hidden,
    parentElement: null,
    style: { display: 'block', visibility: 'visible', opacity: '1' },
    getAttribute() { return null; },
  };
  return {
    isConnected: true,
    parentElement: panel,
    style: { display: 'block', visibility: 'visible', opacity: '1' },
    getAttribute() { return null; },
    getClientRects() { return this.isConnected && !panel.hidden ? [rect] : []; },
    getBoundingClientRect() { return rect; },
    setRect(value) { rect = value; },
    panel,
  };
}

test('hidden and offscreen text stays pending, then reports once after a visible frame', async () => {
  const f = fixture();
  const row = node({ hidden: true });
  f.receipt.setCall(CALL_A);

  assert.equal(f.receipt.observe({
    callId: CALL_A,
    reference: { kind: 'native-item', nativeItemId: 'output-item-1' },
    nodes: [row],
  }), true);
  await f.frame();
  assert.deepEqual(f.reports, []);

  row.panel.hidden = false;
  row.setRect({ left: 400, top: 10, right: 500, bottom: 40 });
  f.receipt.retry();
  await f.frame();
  assert.deepEqual(f.reports, []);

  row.setRect({ left: 10, top: 10, right: 110, bottom: 40 });
  f.receipt.retry();
  await f.frame();
  assert.deepEqual(f.reports, [{
    event: 'first_text_visible', observedAt: 1_791_804_000_123, callId: CALL_A,
    reference: { kind: 'native-item', nativeItemId: 'output-item-1' },
  }]);

  f.receipt.retry();
  assert.equal(f.frames.length, 0, 'a settled call never emits a duplicate observation');
});

test('document visibility and later panel changes keep the observation path alive', async () => {
  const f = fixture();
  const row = node();
  f.document.visibilityState = 'hidden';
  f.receipt.setCall(CALL_A);
  f.receipt.observe({
    callId: CALL_A,
    reference: { kind: 'message', messageId: 'message-1' },
    nodes: [row],
  });
  await f.frame();
  assert.deepEqual(f.reports, []);

  f.document.visibilityState = 'visible';
  f.documentListeners.get('visibilitychange')();
  await f.frame();
  assert.equal(f.reports.length, 1);
  assert.deepEqual(f.reports[0].reference, { kind: 'message', messageId: 'message-1' });
});

test('foreign, stale and duplicate candidates cannot cross the current-call fence', async () => {
  const f = fixture();
  const row = node();
  f.receipt.setCall(CALL_A);
  assert.equal(f.receipt.observe({
    callId: CALL_B,
    reference: { kind: 'native-item', nativeItemId: 'foreign' },
    nodes: [row],
  }), false);
  assert.equal(f.frames.length, 0);

  f.receipt.observe({
    callId: CALL_A,
    reference: { kind: 'native-item', nativeItemId: 'stale' },
    nodes: [row],
  });
  f.receipt.setCall(CALL_B);
  await f.frame();
  assert.deepEqual(f.reports, [], 'a queued frame cannot report after the call changes');

  f.receipt.observe({
    callId: CALL_B,
    reference: { kind: 'native-item', nativeItemId: 'current' },
    nodes: [row],
  });
  f.receipt.observe({
    callId: CALL_B,
    reference: { kind: 'native-item', nativeItemId: 'current' },
    nodes: [row],
  });
  await f.frame();
  assert.equal(f.reports.length, 1);
});

test('an old in-flight receipt cannot clear or settle the next call attempt', async () => {
  let settleOld;
  const f = fixture({ report: () => new Promise(resolve => { settleOld ??= resolve; }) });
  const row = node();
  f.receipt.setCall(CALL_A);
  f.receipt.observe({
    callId: CALL_A,
    reference: { kind: 'native-item', nativeItemId: 'old-current' },
    nodes: [row],
  });
  await f.frame();
  assert.equal(f.reports.length, 1);

  f.receipt.setCall(CALL_B);
  f.receipt.observe({
    callId: CALL_B,
    reference: { kind: 'native-item', nativeItemId: 'new-current' },
    nodes: [row],
  });
  assert.equal(f.frames.length, 0, 'the new call waits behind the already submitted receipt');

  settleOld({ kind: 'ok' });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.frames.length, 1, 'settling the stale receipt schedules the current call');
  await f.frame();
  assert.equal(f.reports.length, 2);
  assert.equal(f.reports[1].callId, CALL_B);
});
