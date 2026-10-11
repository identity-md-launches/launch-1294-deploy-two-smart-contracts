import assert from 'node:assert/strict';
import { Interface } from '../vendor/ethers-6.17.0.mjs';
import { ADDRESSES, TOKEN_ABI, VAULT_ABI, STACKER_ABI, REGISTRY_ABI, INTAKE_ABI } from '../core.mjs';

// Synthetic accounts/contracts are confined to tests, never deployment configuration.
export const account = '0x7777777777777777777777777777777777777777';
const stacker = '0x1111111111111111111111111111111111111111';
const registry = '0x2222222222222222222222222222222222222222';
export const project = '0x3333333333333333333333333333333333333333';
export const hash = n => '0x' + BigInt(n).toString(16).padStart(64, '0');
const iface = address => new Interface(address.toLowerCase() === stacker ? STACKER_ABI : address.toLowerCase() === registry ? REGISTRY_ABI : address.toLowerCase() === ADDRESSES.TestSIMD ? VAULT_ABI : address.toLowerCase() === ADDRESSES.Intake ? INTAKE_ABI : TOKEN_ABI);
export const state = { chain: '0x1', number: 100, txs: [], logs: [], allowances: new Map(), balances: { [ADDRESSES.TestIMD]: 0n, [ADDRESSES.OracleIMD]: 0n }, shares: 0n, total: 0n, projects: new Map(), dropLogs: false, mutateOnApproval: false };
export const deployment = { chainId: 11155111, contracts: [{ contract: 'Stacker', address: stacker, blockNumber: 100, transactionHash: hash(1) }, { contract: 'ProjectRegistry', address: registry, blockNumber: 100, transactionHash: hash(1) }] };
const zeroProject = () => [0n, false, 0n, 0n, 0n, 0n, account, 0n, account, hash(0)];
const block = () => ({ number: '0x' + state.number.toString(16), hash: hash(state.number), timestamp: '0x6553f100' });
function receipt(txHash) { return { transactionHash: txHash, transactionIndex: '0x0', blockHash: block().hash, blockNumber: block().number, from: account, to: state.txs.find(t => t.hash === txHash)?.to || stacker, cumulativeGasUsed: '0x10000', gasUsed: '0x10000', effectiveGasPrice: '0x1', contractAddress: null, logs: [], logsBloom: '0x' + '0'.repeat(512), status: '0x1', type: '0x2' }; }
export function addEvent(target, name, args) {
  const encoded = iface(target).encodeEventLog(iface(target).getEvent(name), args);
  state.logs.push({ ...encoded, address: target, blockNumber: block().number, blockHash: block().hash, transactionHash: state.txs.at(-1)?.hash || hash(1), transactionIndex: '0x0', logIndex: '0x' + state.logs.length.toString(16), removed: false });
}
function readContract(target, data) {
  const i = iface(target), parsed = i.parseTransaction({ data }), a = [...parsed.args];
  const values = {
    IMD: ADDRESSES.TestIMD, SIMD: ADDRESSES.TestSIMD, stacker, intake: ADDRESSES.Intake, oracleAsset: ADDRESSES.OracleIMD,
    asset: ADDRESSES.TestIMD, paused: false, totalStacked: state.total, totalAssets: state.total, totalSupply: state.shares,
    ORACLE_FEE: 500000000000000000n, challengeBond: 5000000000000000000n, PENDING_EXPIRY: 86400n,
    decimals: target === ADDRESSES.TestSIMD ? 24n : 18n, nextFaucetAt: 0n,
    allowance: state.allowances.get(`${target}:${a[1]}`) || 0n,
    balanceOf: target === ADDRESSES.TestSIMD ? state.shares : state.balances[target] || 0n,
    convertToAssets: a[0] !== undefined ? BigInt(a[0]) / 1000000n : 0n,
    projectOf: state.projects.get(typeof a[0] === "string" ? a[0].toLowerCase() : "") || zeroProject(),
    requests: [registry, registry, '0x510379c7', true],
  };
  if (!(parsed.name in values)) throw new Error(`No mock for ${parsed.name}`);
  return i.encodeFunctionResult(parsed.name, parsed.name === 'requests' ? values.requests : [values[parsed.name]]);
}
function sendTransaction(transaction) {
  const target = transaction.to.toLowerCase(), parsed = iface(target).parseTransaction(transaction), args = parsed.args;
  assert.equal(state.chain, '0xaa36a7', 'all writes must stay on Sepolia');
  assert.equal(transaction.chainId, '0xaa36a7', 'wallet request itself pins Sepolia during confirmation');
  assert.equal(BigInt(transaction.gas), 130000n, 'gas estimate gets 30% headroom');
  const tx = { ...transaction, to: target, name: parsed.name, args: [...args], hash: hash(state.txs.length + 2) };
  state.txs.push(tx); state.number++;
  if (parsed.name === 'approve') { state.allowances.set(`${target}:${args[0]}`, args[1]); if (state.mutateOnApproval) state.chain = '0x1'; }
  if (parsed.name === 'faucet') state.balances[ADDRESSES.TestIMD] += 10000n * 10n ** 18n;
  if (parsed.name === 'mint') { assert.equal(args[0].toLowerCase(), account); state.balances[ADDRESSES.OracleIMD] += args[1]; }
  if (parsed.name === 'credit') {
    assert.equal(args[0].toLowerCase(), account);
    assert.equal(state.allowances.get(`${ADDRESSES.TestIMD}:${stacker}`), args[1]);
    state.shares += args[1] * 1000000n; state.total += args[1]; state.balances[ADDRESSES.TestIMD] -= args[1];
    addEvent(stacker, 'Stacked', [account, account, args[1], args[1] * 1000000n]);
  }
  if (parsed.name === 'applyListing') {
    assert.equal(state.allowances.get(`${ADDRESSES.OracleIMD}:${registry}`), 500000000000000000n);
    state.projects.set(args[0].toLowerCase(), [1n, false, args[3], 1700000000n, 0n, 0n, args[4], 0n, account, hash(42)]);
    addEvent(registry, 'Applied', [args[0], account, hash(42), args[3], args[4], args[1], args[2]]);
  }
  if (parsed.name === 'challenge') {
    assert.equal(state.allowances.get(`${ADDRESSES.OracleIMD}:${registry}`), 5500000000000000000n);
    const p = state.projects.get(args[0].toLowerCase()); p[0] = 2n; p[3] = 1700000000n;
    addEvent(registry, 'Challenged', [args[0], account, hash(43), args[1]]);
  }
  if (parsed.name === 'expire') { const p = state.projects.get(args[0].toLowerCase()); p[0] = 0n; addEvent(registry, 'AskCleared', [args[0], hash(43), 2, 0, hash(0)]); }
  return tx.hash;
}
export async function rpc(method, params, wallet = false) {
  if (method === 'eth_chainId') return wallet ? state.chain : '0xaa36a7';
  if (method === 'wallet_switchEthereumChain') { state.chain = params[0].chainId; return null; }
  if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
  if (method === 'eth_blockNumber') return block().number;
  if (method === 'eth_getBlockByNumber') return block();
  if (method === 'eth_getCode') return params[1] === '0x63' ? '0x' : '0x6000';
  if (method === 'eth_getLogs') { if (state.dropLogs) throw new Error('RPC history unavailable'); return state.logs.filter(log => log.address === params[0].address.toLowerCase() && BigInt(log.blockNumber) >= BigInt(params[0].fromBlock) && BigInt(log.blockNumber) <= BigInt(params[0].toBlock)); }
  if (method === 'eth_call') return readContract(params[0].to.toLowerCase(), params[0].data);
  if (method === 'eth_estimateGas') return '0x186a0';
  if (method === 'eth_sendTransaction') return sendTransaction(params[0]);
  if (method === 'eth_getTransactionReceipt') return receipt(params[0]);
  if (method === 'eth_getTransactionByHash') {
    const tx = state.txs.find(t => t.hash === params[0]);
    return { hash: tx.hash, from: tx.from, to: tx.to, gas: tx.gas, blockHash: block().hash, blockNumber: block().number, transactionIndex: '0x0', value: '0x0', gasPrice: '0x1', nonce: '0x0', input: tx.data, chainId: '0xaa36a7', type: '0x0', v: '0x1b', r: hash(1), s: hash(1) };
  }
  throw new Error(`Unimplemented mock RPC ${method}`);
}
