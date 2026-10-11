import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAIN_ID, ADDRESSES, Rpc, validateDeployment, verifyDeployment, summarize, amount, units, checkedText, decodeLogs, stackerInterface, registryInterface } from '../core.mjs';
const p = '0x1111111111111111111111111111111111111111';
const t = '0x2222222222222222222222222222222222222222';
const direct = '0x3333333333333333333333333333333333333333';
const hash = '0x' + 'ab'.repeat(32);
const configInput = () => ({ chainId: CHAIN_ID, contracts: [
  { contract: 'Stacker', address: p, blockNumber: 100, transactionHash: hash },
  { contract: 'ProjectRegistry', address: t, blockNumber: 100, transactionHash: hash },
] });
const event = (name, block, args) => ({ name, block, args: { project: p, ...args } });
const credit = (block, imd, project = p) => event('Stacked', block, { project, trader: t, imd: BigInt(imd) * 10n ** 18n, shares: BigInt(imd) * 10n ** 24n });

test('real static ABI matches the compiled contracts', () => {
  // Foundry is the source of truth; run forge build first. This catches renamed getters/events.
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  for (const [name, iface] of [['Stacker', stackerInterface], ['ProjectRegistry', registryInterface]]) {
    const abi = JSON.parse(readFileSync(resolve(root, 'out', `${name}.sol`, `${name}.json`))).abi;
    for (const fragment of iface.fragments) {
      const match = abi.find(entry => entry.type === fragment.type && entry.name === fragment.name);
      assert.ok(match, `${name}.${fragment.name} exists`);
      assert.equal(new (iface.constructor)([match]).fragments[0].format('sighash'), fragment.format('sighash'));
    }
  }
});

test('handoff rejects wrong networks, missing addresses, missing receipts and legacy address reuse', () => {
  assert.equal(validateDeployment(configInput()).Stacker, p);
  for (const edit of [c => c.chainId = 1, c => c.contracts.reverse(), c => c.contracts[0].address = '0x' + '0'.repeat(40), c => c.contracts[0].address = '', c => c.contracts[0].blockNumber = 0, c => c.contracts[0].transactionHash = '0x' + '0'.repeat(64), c => c.contracts[1].address = p]) {
    const input = configInput(); edit(input); assert.throws(() => validateDeployment(input));
  }
});

test('points honor listing epochs, both boundaries, relisting and direct stacks', () => {
  const events = [event('Applied', 5, { name: 'Project' }), event('Listed', 10, { fromBlock: 10n }), event('Delisted', 20, { toBlock: 20n }), event('Listed', 30, { fromBlock: 30n })];
  const result = summarize([credit(9, 1), credit(10, 2), credit(19, 3), credit(20, 4), credit(29, 5), credit(30, 6), credit(31, 100, direct)], events);
  assert.equal(result.traders.get(t).cashback, 121n * 10n ** 18n);
  assert.equal(result.traders.get(t).points, 11n * 10n ** 18n);
  assert.equal(result.topProjects.length, 1);
  assert.equal(result.topProjects[0].points, 11n * 10n ** 18n);
  assert.equal(result.topProjects[0].traders.size, 1);
  assert.deepEqual(result.credits.map(c => c.eligible), [false, true, true, false, false, true, false]);
});

test('rejected applications never confer points; pending challenges preserve a listing', () => {
  assert.equal(summarize([credit(10, 1)], [event('Applied', 5, { name: 'X' }), event('Rejected', 6, {})]).topTraders.length, 0);
  const result = summarize([credit(12, 1)], [event('Listed', 10, { fromBlock: 10n }), event('Challenged', 11, {})]);
  assert.equal(result.topTraders[0].points, 10n ** 18n);
});

test('decode real ABI logs, deduplicate and ignore removed logs', () => {
  const encoded = stackerInterface.encodeEventLog(stackerInterface.getEvent('Stacked'), [p, t, 10n, 100n]);
  const log = { ...encoded, blockHash: hash, transactionHash: hash, blockNumber: '0xa', logIndex: '0x2' };
  const logs = decodeLogs([log, { ...log }, { ...log, logIndex: '0x3', removed: true }], stackerInterface);
  assert.equal(logs.length, 1); assert.equal(logs[0].args.imd, 10n); assert.equal(logs[0].index, 2);
});

test('amounts never use floating point, and text follows contract validation', () => {
  assert.equal(amount('123456789012345678.000000000000000001'), 123456789012345678000000000000000001n);
  for (const input of ['0', '-1', '1e18', 'NaN', '1.1234567890123456789', '00.3', '0x10']) assert.throws(() => amount(input));
  assert.equal(units(123456789n, 6), '123.4567');
  assert.equal(units(1000000n, 6), '1');
  assert.equal(checkedText('A project', 1, 48, 'Name'), 'A project');
  for (const input of ['', 'quote"', '[REASON]', 'back\\slash', 'café', '\n']) assert.throws(() => checkedText(input, 1, 48, 'Name'));
});

const response = result => ({ ok: true, json: async () => ({ result }) });
test('RPC fallbacks reject wrong chain and paginate every block without gaps', async () => {
  const ranges = [], calls = [];
  const fetcher = async (url, options) => {
    const { method, params } = JSON.parse(options.body); calls.push([url, method]);
    if (method === 'eth_chainId') return response(url === 'bad' ? '0x1' : '0xaa36a7');
    assert.equal(url, 'good');
    if (method === 'eth_getLogs') {
      const start = Number(BigInt(params[0].fromBlock)), end = Number(BigInt(params[0].toBlock));
      if (end - start > 200) return { ok: true, json: async () => ({ error: { message: 'range too large' } }) };
      ranges.push([start, end]); return response([{ start, end }]);
    }
    return response('ok');
  };
  const rpc = new Rpc(['bad', 'good'], fetcher);
  const logs = await rpc.logs(p, 99, 1341, []);
  assert.equal(logs.length, ranges.length);
  assert.equal(ranges[0][0], 99); assert.equal(ranges.at(-1)[1], 1341);
  for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i][0], ranges[i - 1][1] + 1);
  assert.ok(!calls.some(([url, method]) => url === 'bad' && method !== 'eth_chainId'));
});

test('unreadable log history fails explicitly instead of showing a partial leaderboard', async () => {
  const rpc = new Rpc(['bad'], async (_, options) => {
    const { method } = JSON.parse(options.body);
    if (method === 'eth_chainId') return response('0xaa36a7');
    throw new Error('no historical data');
  });
  await assert.rejects(rpc.logs(p, 10, 12, []), /no historical data/);
});

test('deployment validation checks reused dependency wiring', async () => {
  const config = validateDeployment(configInput());
  const rpc = {
    request: async (method, params) => method === 'eth_getCode' ? (params[1] === '0x63' ? '0x' : '0x6000') : { status: '0x1', blockNumber: '0x64' },
    read: async (_, __, method) => ({ IMD: ADDRESSES.TestIMD, SIMD: ADDRESSES.TestSIMD, stacker: p, intake: ADDRESSES.Intake, oracleAsset: ADDRESSES.OracleIMD, asset: ADDRESSES.TestIMD })[method],
  };
  await verifyDeployment(rpc, config);
  const goodRequest = rpc.request;
  rpc.request = async (method, params) => method === 'eth_getCode' ? '0x6000' : goodRequest(method, params);
  await assert.rejects(verifyDeployment(rpc, config), /Unconfirmed/, 'old contract with unrelated receipt must fail');
  rpc.request = goodRequest;
  rpc.read = async () => direct;
  await assert.rejects(verifyDeployment(rpc, config), /wiring/);
});
