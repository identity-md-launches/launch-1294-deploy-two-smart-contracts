import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from './vendor/linkedom-0.18.12.mjs';
import { ADDRESSES } from '../core.mjs';
import { state, deployment, account, project, hash, addEvent, rpc } from './fixture.mjs';
const wait = async predicate => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 30)); }
  throw new Error(`Timed out: ${document.getElementById("release-status").textContent}; ${[...document.querySelectorAll("output")].map(o => o.id + "=" + o.textContent).join("; ")}`);
};
const $ = id => document.getElementById(id);
let fixture = false;
const { window } = parseHTML(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
const listeners = new Map();
window.ethereum = { on(name, fn) { listeners.set(name, fn); }, async request({ method, params = [] }) { return rpc(method, params, true); } };
Object.assign(globalThis, {
  window, document: window.document,
  matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() {} },
  fetch: async (url, options) => {
    if (url === './deployment.json') return { ok: fixture, status: fixture ? 200 : 404, json: async () => deployment };
    const input = JSON.parse(options.body);
    try { return { ok: true, json: async () => ({ result: await rpc(input.method, input.params) }) }; }
    catch (e) { return { ok: true, json: async () => ({ error: { message: e.message } }) }; }
  },
  FormData: class {
    constructor(form) { this.values = new Map([...form.querySelectorAll('[name]')].map(n => [n.name, n.value || ''])); }
    get(name) { return this.values.get(name) || ''; }
  },
});
// Unref the app refresh timer so it cannot keep the offline test process alive.
const realInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => { const id = realInterval(...args); id.unref(); return id; };
function submit(formId) {
  const form = $(formId), event = new window.Event('submit', { cancelable: true });
  event.submitter = form.querySelector('button'); form.dispatchEvent(event);
}
function click(selector) { document.querySelector(selector).dispatchEvent(new window.Event('click')); }
async function confirmed(status) { await wait(() => $(status)?.textContent.includes('confirmed.') && !$('connect').disabled); }

test('actual app DOM and wallet flows, offline', async t => {
  await t.test('missing deployment disables all writes', async () => {
    await import('../app.mjs?pending');
    assert.ok($('release-status').textContent.includes('awaiting deployment'));
    assert.ok([...document.querySelectorAll('[data-write]')].every(b => b.disabled));
  });
  // Fresh document prevents event handlers from the pending instance being retained.
  const second = parseHTML(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  second.window.ethereum = window.ethereum;
  globalThis.window = second.window; globalThis.document = second.document;
  fixture = true;
  await import('../app.mjs?fixture');
  assert.ok($('release-status').textContent.includes('release connected'), $('release-status').textContent);
  await t.test('connect switches network and faucet targets the staking token', async () => {
    click('#connect'); await wait(() => $('wallet-status').textContent.includes('Connected on Sepolia') && !$('refresh').disabled);
    assert.equal(state.chain, '0xaa36a7');
    click('#faucet'); await confirmed('faucet-status');
    assert.equal(state.txs.at(-1).to, ADDRESSES.TestIMD);
  });
  await t.test('self-stack approves exact amount and updates cashback without points', async () => {
    $('stack-amount').value = '5'; submit('stack-form'); await confirmed('stack-status');
    assert.equal($('cashback').textContent, '5 IMD'); assert.equal($('points').textContent, '0');
    assert.equal($('value').textContent, '5 IMD');
    assert.equal(state.txs.at(-2).to, ADDRESSES.TestIMD); assert.equal(state.txs.at(-2).args[1], 5n * 10n ** 18n);
  });
  await t.test('oracle fee mint is separate; application text cannot become HTML', async () => {
    click('#mint'); await confirmed('mint-status');
    assert.equal(state.txs.at(-1).to, ADDRESSES.OracleIMD);
    $('apply-project').value = project; $('apply-name').value = '<img src=x onerror=alert(1)>';
    $('apply-url').value = 'https://example.org/source'; $('apply-beneficiary').value = account;
    submit('apply-form'); await confirmed('apply-status');
    assert.equal(document.querySelector('#projects img'), null);
    assert.ok($('projects').textContent.includes('<img src=x onerror=alert(1)>'));
    assert.equal(state.txs.at(-2).to, ADDRESSES.OracleIMD);
    assert.equal(state.txs.at(-2).args[1], 500000000000000000n);
  });
  await t.test('challenge approves fee plus bond and a completed question can expire', async () => {
    const p = state.projects.get(project); p[0] = 0n; p[1] = true; p[4] = BigInt(state.number); p[7] = 0n;
    addEvent(deployment.contracts[1].address, 'Listed', [project, 50, account, state.number, hash(44)]);
    $('challenge-project').value = project; $('challenge-reason').value = 'It credits outside trades.';
    submit('challenge-form'); await confirmed('challenge-status');
    assert.equal(state.txs.at(-2).args[1], 5500000000000000000n);
    click('#projects button[data-write]');
    await wait(() => state.txs.at(-1).name === 'expire' && !$('connect').disabled);
    assert.equal(state.projects.get(project)[0], 0n);
  });
  await t.test('network changes between approval and deposit stop the flow', async () => {
    state.mutateOnApproval = true;
    const before = state.txs.filter(tx => tx.name === 'credit').length;
    submit('stack-form'); await wait(() => $('stack-status').textContent.includes('Wallet account or network changed'));
    assert.equal(state.txs.filter(tx => tx.name === 'credit').length, before);
    assert.ok(state.txs.every(tx => tx.chainId === '0xaa36a7'), 'emitted wallet requests pin chainId');
    state.mutateOnApproval = false;
  });
  await t.test('account changes clear previous wallet values', async () => {
    listeners.get('accountsChanged')([]);
    assert.equal($('cashback').textContent, '—'); assert.equal($('connect').textContent, 'Connect wallet');
  });
  await t.test('RPC log failure marks totals stale and disables writes', async () => {
    state.dropLogs = true; click('#refresh');
    await wait(() => $('release-status').textContent.includes('Data unavailable or stale'));
    assert.ok([...document.querySelectorAll('[data-write]')].every(b => b.disabled));
    assert.ok($('sync-status').textContent.includes('stale'));
  });
});
