import { Interface, getAddress, formatUnits, parseUnits } from './vendor/ethers-6.17.0.mjs';

export const CHAIN_ID = 11155111;
export const CHAIN_HEX = '0xaa36a7';
export const ADDRESSES = Object.freeze({
  TestIMD: '0x2b69099e59b05901faa1dd164fabf098bf831e82',
  TestSIMD: '0xf9e2eec3b610ec6781f7438ac5fb4bc049d81cc1',
  Intake: '0xa43e6f75ee006411f79ac1c84120606c2330de82',
  OracleIMD: '0x44a1cd38474fb1748400e7deb5f8d786cce3f89a',
});
export const RPC_URLS = Object.freeze([
  'https://rpc.sepolia.ethpandaops.io',
  'https://sepolia.rpc.sentio.xyz',
  'https://ethereum-sepolia-rpc.publicnode.com',
]);
export const TOKEN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)',
  'function faucet()',
  'function nextFaucetAt(address) view returns (uint256)',
  'function mint(address,uint256)',
];
export const VAULT_ABI = [
  ...TOKEN_ABI,
  'function asset() view returns (address)',
  'function paused() view returns (bool)',
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function convertToAssets(uint256) view returns (uint256)',
];
export const STACKER_ABI = [
  'function IMD() view returns (address)',
  'function SIMD() view returns (address)',
  'function credit(address trader,uint256 imdAmount) returns (uint256)',
  'function totalStacked() view returns (uint256)',
  'event Stacked(address indexed project,address indexed trader,uint256 imd,uint256 shares)',
];
export const REGISTRY_ABI = [
  'function stacker() view returns (address)',
  'function intake() view returns (address)',
  'function oracleAsset() view returns (address)',
  'function ORACLE_FEE() view returns (uint256)',
  'function challengeBond() view returns (uint256)',
  'function PENDING_EXPIRY() view returns (uint64)',
  'function projectOf(address) view returns ((uint8 ask,bool listed,uint16 rateBps,uint64 askedAt,uint64 fromBlock,uint64 toBlock,address beneficiary,uint64 challengeOpenAt,address asker,bytes32 intakeId))',
  'function applyListing(address,string,string,uint16,address) returns (bytes32)',
  'function challengeForBeneficiary(address,string,address) returns (bytes32)',
  'error BeneficiaryChanged(address expected,address actual)',
  'function expire(address)',
  'event Applied(address indexed project,address indexed applicant,bytes32 indexed intakeId,uint16 rateBps,address beneficiary,string name,string sourceUrl)',
  'event Listed(address indexed project,uint16 rateBps,address beneficiary,uint64 fromBlock,bytes32 oracleRequestId)',
  'event Rejected(address indexed project,bytes32 oracleRequestId)',
  'event Challenged(address indexed project,address indexed challenger,bytes32 indexed intakeId,string reason)',
  'event Defended(address indexed project,uint256 bondToBeneficiary,bytes32 oracleRequestId)',
  'event Delisted(address indexed project,uint64 toBlock,bytes32 oracleRequestId)',
  'event AskCleared(address indexed project,bytes32 indexed intakeId,uint8 ask,uint8 status,bytes32 reason)',
  'event BeneficiarySet(address indexed project,address beneficiary)',
];
export const INTAKE_ABI = ['function requests(bytes32) view returns (address payer,address callbackTarget,bytes4 callbackSelector,bool completed)'];
export const stackerInterface = new Interface(STACKER_ABI);
export const registryInterface = new Interface(REGISTRY_ABI);
export const hexBlock = n => `0x${BigInt(n).toString(16)}`;
export const key = address => address.toLowerCase();
export const short = address => `${address.slice(0, 6)}…${address.slice(-4)}`;
export const units = (n, decimals = 18, precision = 4) => {
  const [whole, fraction] = formatUnits(n, decimals).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction && /[1-9]/.test(fraction.slice(0, precision)) ? `.${fraction.slice(0, precision).replace(/0+$/, '')}` : '');
};
export function amount(value) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)) throw new Error('Enter a positive amount with at most 18 decimal places.');
  const n = parseUnits(value, 18);
  if (n <= 0n || n >= 2n ** 256n) throw new Error('Amount is outside the supported range.');
  return n;
}
export function address(value) {
  const a = getAddress(value.trim());
  if (/^0x0{40}$/i.test(a) || /^0x0{36}dead$/i.test(a)) throw new Error('A real contract or wallet address is required.');
  return a;
}
export function checkedText(text, min, max, label) {
  if (text.length < min || text.length > max || /[^\x20-\x7e]|["\\\[\]]/.test(text)) {
    throw new Error(`${label} must be ${min}–${max} printable ASCII characters, without quotes, backslashes or brackets.`);
  }
  return text;
}
export function validateDeployment(raw) {
  if (raw?.chainId !== CHAIN_ID) throw new Error('The release handoff must be for Sepolia (11155111).');
  if (!Array.isArray(raw.contracts) || raw.contracts.length !== 2) throw new Error('The handoff must contain Stacker then ProjectRegistry.');
  const contracts = raw.contracts.map((c, i) => {
    if (c.contract !== ['Stacker', 'ProjectRegistry'][i]) throw new Error('Unexpected release contract order.');
    if (!Number.isSafeInteger(c.blockNumber) || c.blockNumber <= 0) throw new Error('A confirmed deployment block is required.');
    if (!/^0x[0-9a-f]{64}$/i.test(c.transactionHash) || /^0x0{64}$/i.test(c.transactionHash)) throw new Error('A confirmed deployment transaction is required.');
    return { ...c, address: address(c.address) };
  });
  if (key(contracts[0].address) === key(contracts[1].address)) throw new Error('The two deployment addresses must differ.');
  return { chainId: CHAIN_ID, contracts, Stacker: contracts[0].address, ProjectRegistry: contracts[1].address, fromBlock: Math.min(...contracts.map(c => c.blockNumber)) };
}

// Each fallback endpoint is chain-checked before serving reads. No silent partial log results.
export class Rpc {
  constructor(urls = RPC_URLS, fetcher = globalThis.fetch) {
    this.urls = [...urls]; this.fetcher = fetcher; this.checked = new Set(); this.id = 0;
  }
  async callUrl(url, method, params) {
    const response = await this.fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const body = await response.json();
    if (body.error) throw new Error(body.error.message || 'RPC rejected the request.');
    if (!Object.hasOwn(body, 'result')) throw new Error('RPC returned no result.');
    return body.result;
  }
  async request(method, params = []) {
    let error;
    for (const url of this.urls) {
      try {
        if (!this.checked.has(url)) {
          if (BigInt(await this.callUrl(url, 'eth_chainId', [])) !== BigInt(CHAIN_ID)) throw new Error('RPC is on the wrong network.');
          this.checked.add(url);
        }
        return await this.callUrl(url, method, params);
      } catch (e) { error = e; }
    }
    throw new Error(`Sepolia read failed: ${error?.message}`);
  }
  async read(target, abi, method, args = [], block = 'latest') {
    const iface = new Interface(abi);
    const result = await this.request('eth_call', [{ to: target, data: iface.encodeFunctionData(method, args) }, block]);
    const decoded = iface.decodeFunctionResult(method, result);
    return decoded.length === 1 ? decoded[0] : decoded;
  }
  async logs(target, from, to, topics, progress = () => {}) {
    const result = [];
    let step = 1000;
    for (let start = from; start <= to;) {
      const end = Math.min(start + step - 1, to);
      let logs;
      try {
        logs = await this.request('eth_getLogs', [{ address: target, fromBlock: hexBlock(start), toBlock: hexBlock(end), topics }]);
        if (!Array.isArray(logs)) throw new Error('Invalid log response.');
      } catch (e) {
        if (step === 1) throw e;
        step = Math.max(1, Math.floor(step / 2)); continue;
      }
      result.push(...logs); start = end + 1; progress(end, to);
    }
    return result;
  }
}
export function decodeLogs(logs, iface) {
  const seen = new Set();
  return logs.filter(log => {
    const id = `${log.blockHash}:${log.transactionHash}:${log.logIndex}`;
    if (log.removed || seen.has(id)) return false;
    seen.add(id); return true;
  }).map(log => {
    const event = iface.parseLog(log);
    return { name: event.name, args: event.args, block: Number(BigInt(log.blockNumber)), index: Number(BigInt(log.logIndex)), tx: log.transactionHash };
  }).sort((a, b) => a.block - b.block || a.index - b.index);
}
export function summarize(stacks, events) {
  const projects = new Map();
  for (const e of events) {
    const id = key(e.args.project);
    const p = projects.get(id) || { address: e.args.project, name: short(e.args.project), periods: [], outcome: 'Unlisted' };
    if (e.name === 'Applied') { p.name = e.args.name; p.outcome = 'Application pending'; }
    if (e.name === 'Listed') { p.periods.push({ from: Number(e.args.fromBlock), to: Infinity }); p.outcome = 'Listed'; }
    if (e.name === 'Delisted') { const period = p.periods.at(-1); if (period && period.to === Infinity) period.to = Number(e.args.toBlock); p.outcome = 'Delisted'; }
    if (e.name === 'Rejected') p.outcome = 'Rejected';
    if (e.name === 'Challenged') p.outcome = 'Challenge pending';
    if (e.name === 'Defended') p.outcome = 'Defended';
    if (e.name === 'AskCleared') p.outcome = 'Question cleared';
    projects.set(id, p);
  }
  const traders = new Map(), projectTotals = new Map();
  const credits = stacks.map(e => {
    const p = projects.get(key(e.args.project));
    const eligible = !!p?.periods.some(period => period.from <= e.block && e.block < period.to);
    const credit = { ...e, eligible };
    const id = key(e.args.trader);
    const trader = traders.get(id) || { address: e.args.trader, cashback: 0n, shares: 0n, points: 0n, projects: new Map() };
    trader.cashback += e.args.imd; trader.shares += e.args.shares;
    if (eligible) trader.points += e.args.imd;
    const pid = key(e.args.project);
    const subtotal = trader.projects.get(pid) || { address: e.args.project, cashback: 0n, points: 0n };
    subtotal.cashback += e.args.imd;
    if (eligible) subtotal.points += e.args.imd;
    trader.projects.set(pid, subtotal); traders.set(id, trader);
    if (eligible) {
      const total = projectTotals.get(pid) || { address: e.args.project, points: 0n, traders: new Set() };
      total.points += e.args.imd; total.traders.add(id); projectTotals.set(pid, total);
    }
    return credit;
  });
  const rank = list => list.sort((a, b) => a.points === b.points ? a.address.localeCompare(b.address) : a.points > b.points ? -1 : 1);
  return { projects, traders, credits, topTraders: rank([...traders.values()].filter(t => t.points > 0n)), topProjects: rank([...projectTotals.values()]) };
}

export async function verifyDeployment(rpc, config) {
  for (const c of config.contracts) {
    const [code, priorCode, receipt] = await Promise.all([
      rpc.request('eth_getCode', [c.address, hexBlock(c.blockNumber)]),
      rpc.request('eth_getCode', [c.address, hexBlock(c.blockNumber - 1)]),
      rpc.request('eth_getTransactionReceipt', [c.transactionHash]),
    ]);
    if (code === '0x' || priorCode !== '0x' || !receipt || BigInt(receipt.status) !== 1n || Number(BigInt(receipt.blockNumber)) !== c.blockNumber) throw new Error(`Unconfirmed ${c.contract} deployment.`);
    // Factory deployments have no receipt.contractAddress; bind the address through its wiring below.
    if (receipt.contractAddress && key(receipt.contractAddress) !== key(c.address)) throw new Error('Deployment receipt names another contract.');
  }
  const reads = [
    [config.Stacker, STACKER_ABI, 'IMD', ADDRESSES.TestIMD],
    [config.Stacker, STACKER_ABI, 'SIMD', ADDRESSES.TestSIMD],
    [config.ProjectRegistry, REGISTRY_ABI, 'stacker', config.Stacker],
    [config.ProjectRegistry, REGISTRY_ABI, 'intake', ADDRESSES.Intake],
    [config.ProjectRegistry, REGISTRY_ABI, 'oracleAsset', ADDRESSES.OracleIMD],
    [ADDRESSES.TestSIMD, VAULT_ABI, 'asset', ADDRESSES.TestIMD],
  ];
  for (const [target, abi, method, expected] of reads) {
    if (key(await rpc.read(target, abi, method)) !== key(expected)) throw new Error(`Unexpected ${method} wiring in the release.`);
  }
}
