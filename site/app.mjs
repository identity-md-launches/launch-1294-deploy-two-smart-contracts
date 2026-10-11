import { BrowserProvider, Contract } from './vendor/ethers-6.17.0.mjs';
import {
  CHAIN_ID, CHAIN_HEX, ADDRESSES, RPC_URLS, Rpc, TOKEN_ABI, VAULT_ABI, STACKER_ABI, REGISTRY_ABI,
  INTAKE_ABI, stackerInterface, registryInterface, hexBlock, key, short, units, amount,
  address, checkedText, validateDeployment, verifyDeployment, decodeLogs, summarize,
} from './core.mjs';

const $ = id => document.getElementById(id);
const rpc = new Rpc();
let deployment, wallet, account, ready = false, busy = false, refreshing = false, data;
const projectStates = new Map();
function text(id, value) { $(id).textContent = value; }
function link(value, label = short(value), kind = 'address') {
  const a = document.createElement('a'); a.href = `https://sepolia.etherscan.io/${kind}/${value}`;
  a.textContent = label; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
}
function el(tag, value, className) { const n = document.createElement(tag); if (value !== undefined) n.textContent = value; if (className) n.className = className; return n; }
function empty(target, message) { $(target).replaceChildren(el('p', message, 'empty')); }
function controls() {
  document.querySelectorAll('[data-write]').forEach(b => { b.disabled = !ready || busy || b.dataset.unavailable === 'true'; });
  $('connect').disabled = busy; $('refresh').disabled = refreshing || busy || !deployment;
}
function status(id, message, error = false) { text(id, message); $(id).classList.toggle('error', error); }
function describeError(e) {
  if (e.code === 4001 || e.code === 'ACTION_REJECTED') return 'Wallet request cancelled. You can try again.';
  return e.reason || e.shortMessage || e.message || 'The request did not complete.';
}
function clearWalletView() {
  for (const id of ['cashback', 'points', 'value', 'held']) text(id, '—');
  text('yield', 'Priced by the live vault'); $('wallet-projects').replaceChildren();
  text('staking-balance', 'Staking token balance —'); text('oracle-balance', 'Oracle token balance —');
}
async function connectWallet() {
  if (!window.ethereum) throw new Error('Open this page in a browser with an Ethereum wallet.');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts.length) throw new Error('No wallet account was selected.');
  if (BigInt(await window.ethereum.request({ method: 'eth_chainId' })) !== BigInt(CHAIN_ID)) {
    try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }); }
    catch (e) {
      if (e.code !== 4902) throw e;
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_HEX, chainName: 'Sepolia', rpcUrls: [RPC_URLS[2]], nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 }, blockExplorerUrls: ['https://sepolia.etherscan.io'] }] });
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
    }
  }
  if (BigInt(await window.ethereum.request({ method: 'eth_chainId' })) !== BigInt(CHAIN_ID)) throw new Error('Switch the wallet to Sepolia to continue.');
  wallet = new BrowserProvider(window.ethereum, 'any');
  const signer = await wallet.getSigner(); account = await signer.getAddress();
  text('connect', short(account)); text('wallet-status', `Connected on Sepolia · ${account}`);
  return signer;
}
async function walletGuard(expected) {
  const chain = await window.ethereum.request({ method: 'eth_chainId' });
  const accounts = await window.ethereum.request({ method: 'eth_accounts' });
  if (BigInt(chain) !== BigInt(CHAIN_ID) || !accounts.length || key(accounts[0]) !== key(expected)) {
    throw new Error('Wallet account or network changed. Reconnect on Sepolia and submit again.');
  }
}
async function send(signer, target, abi, method, args, output, label) {
  const sender = await signer.getAddress();
  await walletGuard(sender);
  const fn = new Contract(target, abi, signer).getFunction(method);
  status(output, `${label}: checking the transaction…`);
  const gas = await fn.estimateGas(...args);
  await walletGuard(sender);
  status(output, `${label}: confirm in your wallet.`);
  const tx = await fn(...args, { chainId: CHAIN_ID, gasLimit: (gas * 130n + 99n) / 100n });
  $(output).replaceChildren(document.createTextNode(`${label}: waiting for confirmation. `), link(tx.hash, 'View transaction ↗', 'tx'));
  let receipt;
  try { receipt = await tx.wait(1); }
  catch (e) { if (e.code === 'TRANSACTION_REPLACED' && !e.cancelled && e.receipt?.status === 1) receipt = e.receipt; else throw e; }
  if (!receipt || receipt.status !== 1) throw new Error('The transaction was not successful.');
  $(output).replaceChildren(document.createTextNode(`${label}: confirmed. `), link(receipt.hash, 'View transaction ↗', 'tx'));
  return receipt;
}
async function approve(signer, token, spender, value, output) {
  // Always replace the allowance with the exact quote, even if an earlier approval was larger.
  await send(signer, token, TOKEN_ABI, 'approve', [spender, value], output, `Approve ${units(value)} test IMD`);
}
async function action(button, output, operation) {
  if (!ready || busy) return;
  busy = true; controls(); const label = button.textContent; button.textContent = 'Waiting…';
  try {
    const signer = await connectWallet();
    await operation(signer);
    await refresh();
  } catch (e) { status(output, describeError(e), true); }
  finally { busy = false; button.textContent = label; controls(); }
}
function renderContracts() {
  $('contracts').replaceChildren();
  const all = { ...ADDRESSES, ...(deployment ? { Stacker: deployment.Stacker, ProjectRegistry: deployment.ProjectRegistry } : {}) };
  for (const [name, value] of Object.entries(all)) {
    const a = link(value, '', 'address'); a.className = 'contract-link'; a.append(el('strong', name), document.createTextNode(value)); $('contracts').append(a);
  }
}
function renderBoards(summary) {
  for (const [id, entries, isProject] of [['trader-board', summary.topTraders, false], ['project-board', summary.topProjects, true]]) {
    $(id).replaceChildren();
    if (!entries.length) { empty(id, 'No listing points yet. Every stack has a beginning.'); continue; }
    entries.slice(0, 20).forEach((entry, i) => {
      const row = el('div', undefined, 'row'), left = el('div');
      left.append(el('span', String(i + 1).padStart(2, '0'), 'rank'), link(entry.address, isProject ? summary.projects.get(key(entry.address))?.name || short(entry.address) : short(entry.address)));
      if (isProject) left.append(el('small', `${entry.traders.size} trader${entry.traders.size === 1 ? '' : 's'}`));
      row.append(left, el('strong', `${units(entry.points)} pts`)); $(id).append(row);
    });
  }
  $('recent').replaceChildren();
  if (!summary.credits.length) empty('recent', 'No stacks recorded yet. Try the faucet to make the first one.');
  summary.credits.slice(-10).reverse().forEach(credit => {
    const row = el('div', undefined, 'row'), left = el('div');
    left.append(link(credit.args.trader), document.createTextNode(' ← '), link(credit.args.project));
    left.append(el('small', `${credit.eligible ? 'Listed project · earns points' : 'Direct / unlisted · no points'} · block ${credit.block}`));
    row.append(left, link(credit.tx, `${units(credit.args.imd)} IMD ↗`, 'tx')); $('recent').append(row);
  });
}
async function renderWallet(summary, block) {
  const currentAccount = account;
  if (!currentAccount) { clearWalletView(); return; }
  const figures = summary.traders.get(key(currentAccount)) || { cashback: 0n, points: 0n, shares: 0n, projects: new Map() };
  const [balance, oracleBalance, held, decimals, value, next] = await Promise.all([
    rpc.read(ADDRESSES.TestIMD, TOKEN_ABI, 'balanceOf', [currentAccount], block),
    rpc.read(ADDRESSES.OracleIMD, TOKEN_ABI, 'balanceOf', [currentAccount], block),
    rpc.read(ADDRESSES.TestSIMD, TOKEN_ABI, 'balanceOf', [currentAccount], block),
    rpc.read(ADDRESSES.TestSIMD, TOKEN_ABI, 'decimals', [], block),
    rpc.read(ADDRESSES.TestSIMD, VAULT_ABI, 'convertToAssets', [figures.shares], block),
    rpc.read(ADDRESSES.TestIMD, TOKEN_ABI, 'nextFaucetAt', [currentAccount], block),
  ]);
  if (account !== currentAccount) return;
  text('cashback', `${units(figures.cashback)} IMD`); text('points', units(figures.points)); text('value', `${units(value)} IMD`);
  text('held', units(held, Number(decimals))); text('yield', `${value >= figures.cashback ? '+' : ''}${units(value - figures.cashback)} IMD change from deposits`);
  text('staking-balance', `Staking token balance · ${units(balance)} test IMD`);
  text('oracle-balance', `Oracle token balance · ${units(oracleBalance)} oracle test IMD`);
  const now = data.timestamp;
  $('faucet').dataset.unavailable = BigInt(now) < next ? 'true' : 'false';
  text('faucet-next', next > BigInt(now) ? `Next faucet claim · ${new Date(Number(next) * 1000).toLocaleString()}` : 'Your next faucet claim is available. Sepolia ETH is needed for gas.');
  $('wallet-projects').replaceChildren();
  for (const p of figures.projects.values()) {
    const row = el('div', undefined, 'row'); row.append(link(p.address, summary.projects.get(key(p.address))?.name || short(p.address)), el('span', `${units(p.cashback)} IMD · ${units(p.points)} pts`)); $('wallet-projects').append(row);
  }
}
async function renderProjects(summary, block, timestamp) {
  const entries = await Promise.all([...summary.projects.values()].map(async p => {
    const state = await rpc.read(deployment.ProjectRegistry, REGISTRY_ABI, 'projectOf', [p.address], block);
    let canExpire = false;
    if (state.ask !== 0n) {
      canExpire = BigInt(timestamp) > state.askedAt + 86400n;
      if (!canExpire) canExpire = (await rpc.read(ADDRESSES.Intake, INTAKE_ABI, 'requests', [state.intakeId], block)).completed;
    }
    return { ...p, state, canExpire };
  }));
  projectStates.clear(); $('projects').replaceChildren(); text('project-count', `${entries.length} projects`);
  if (!entries.length) empty('projects', 'No applications yet. Be the first project to apply.');
  for (const p of entries) {
    projectStates.set(key(p.address), p.state);
    const card = el('article', undefined, 'project-card');
    card.append(el('span', p.state.ask === 1n ? 'Application pending' : p.state.ask === 2n ? 'Challenge pending' : p.state.listed ? 'Listed' : p.outcome, 'pill'), el('h3', p.name), link(p.address));
    card.append(el('p', `${Number(p.state.rateBps) / 100}% cashback · beneficiary ${short(p.state.beneficiary)}`));
    if (p.periods.length) card.append(el('p', `Listing blocks · ${p.periods.map(period => `${period.from} → ${period.to === Infinity ? 'ongoing' : `${period.to} (exclusive)`}`).join(', ')}`));
    if (p.state.ask !== 0n) {
      card.append(el('p', `Waiting ${Math.max(0, Math.floor((timestamp - Number(p.state.askedAt)) / 60))} minutes for an oracle result. Public expiry after ${new Date((Number(p.state.askedAt) + 86400) * 1000).toLocaleString()}, or once the Intake has completed.`));
      const button = el('button', 'Clear unanswered question'); button.dataset.write = ''; button.dataset.unavailable = p.canExpire ? 'false' : 'true';
      const output = el('output'); output.id = `expire-${key(p.address)}`; output.setAttribute('aria-live', 'polite');
      button.addEventListener('click', () => action(button, output.id, signer => send(signer, deployment.ProjectRegistry, REGISTRY_ABI, 'expire', [p.address], output.id, 'Clear question')));
      card.append(button, output);
    } else if (p.state.listed) {
      if (BigInt(timestamp) < p.state.challengeOpenAt) card.append(el('p', `Challenges open ${new Date(Number(p.state.challengeOpenAt) * 1000).toLocaleString()}`));
      const button = el('button', 'Review this project'); button.addEventListener('click', () => { $('challenge-project').value = p.address; $('challenge-reason').focus(); $('challenge-form').scrollIntoView({ behavior: 'smooth', block: 'center' }); }); card.append(button);
    }
    $('projects').append(card);
  }
}
async function refresh() {
  if (!deployment || refreshing) return;
  refreshing = true; controls();
  try {
    const head = await rpc.request('eth_getBlockByNumber', ['latest', false]);
    const to = Number(BigInt(head.number)); const block = hexBlock(to);
    if (to < deployment.fromBlock) throw new Error('The RPC has not reached the deployment block.');
    text('sync-status', `Reading complete history through block ${to}…`);
    const [stacks, registry, fee, bond, paused, assets, shares, decimals] = await Promise.all([
      rpc.logs(deployment.Stacker, deployment.contracts[0].blockNumber, to, [stackerInterface.getEvent('Stacked').topicHash]),
      rpc.logs(deployment.ProjectRegistry, deployment.contracts[1].blockNumber, to, [registryInterface.fragments.filter(f => f.type === 'event').map(f => f.topicHash)]),
      rpc.read(deployment.ProjectRegistry, REGISTRY_ABI, 'ORACLE_FEE', [], block),
      rpc.read(deployment.ProjectRegistry, REGISTRY_ABI, 'challengeBond', [], block),
      rpc.read(ADDRESSES.TestSIMD, VAULT_ABI, 'paused', [], block),
      rpc.read(ADDRESSES.TestSIMD, VAULT_ABI, 'totalAssets', [], block),
      rpc.read(ADDRESSES.TestSIMD, VAULT_ABI, 'totalSupply', [], block),
      rpc.read(ADDRESSES.TestSIMD, TOKEN_ABI, 'decimals', [], block),
    ]);
    const summary = summarize(decodeLogs(stacks, stackerInterface), decodeLogs(registry, registryInterface));
    data = { summary, timestamp: Number(BigInt(head.timestamp)), block, fee, bond };
    await Promise.all([renderProjects(summary, block, data.timestamp), renderWallet(summary, block)]);
    const sameHead = await rpc.request('eth_getBlockByNumber', [block, false]);
    if (!sameHead || sameHead.hash !== head.hash) throw new Error('A chain reorganization occurred during the scan. Refresh to reload the history.');
    renderBoards(summary);
    text('oracle-fee', fee === 0n ? 'Action unavailable' : `${units(fee)} oracle IMD`); text('challenge-bond', `${units(bond)} oracle IMD`);
    text('vault-status', paused ? 'Vault paused' : 'Vault open'); text('vault-totals', `${units(assets)} test IMD staked · ${units(shares, Number(decimals))} tsIMD shares`);
    $('stack-form').querySelector('button').dataset.unavailable = paused ? 'true' : 'false';
    for (const id of ['apply-form', 'challenge-form']) $(id).querySelector('button').dataset.unavailable = fee === 0n ? 'true' : 'false';
    ready = true;
    status('release-status', `Sepolia release connected. ${fee === 0n ? 'Oracle action unavailable; new applications and challenges are disabled.' : 'Try the faucet, make a stack, or submit a project for review.'}`);
    text('sync-status', `Complete history through block ${to} · ${new Date().toLocaleTimeString()} · Recent blocks may reorganize. Refreshes every 30 seconds.`);
  } catch (e) {
    ready = false;
    status('release-status', `Data unavailable or stale. ${describeError(e)}`, true);
    text('sync-status', 'The current scan did not complete. Previous figures, if shown, are stale. Refresh to retry.');
  } finally { refreshing = false; controls(); }
}

$('connect').addEventListener('click', async () => { try { await connectWallet(); await refresh(); } catch (e) { status('wallet-status', describeError(e), true); } });
$('refresh').addEventListener('click', refresh);
$('faucet').addEventListener('click', () => action($('faucet'), 'faucet-status', signer => send(signer, ADDRESSES.TestIMD, TOKEN_ABI, 'faucet', [], 'faucet-status', 'Get staking test IMD')));
$('mint').addEventListener('click', () => action($('mint'), 'mint-status', async signer => send(signer, ADDRESSES.OracleIMD, TOKEN_ABI, 'mint', [await signer.getAddress(), amount('10')], 'mint-status', 'Get oracle test IMD')));
$('stack-form').addEventListener('submit', e => {
  e.preventDefault(); const requested = $('stack-amount').value.trim();
  action(e.submitter, 'stack-status', async signer => {
    const value = amount(requested); const trader = await signer.getAddress();
    await approve(signer, ADDRESSES.TestIMD, deployment.Stacker, value, 'stack-status');
    await send(signer, deployment.Stacker, STACKER_ABI, 'credit', [trader, value], 'stack-status', 'Stack to myself');
  });
});
$('apply-form').addEventListener('submit', e => {
  const f = new FormData(e.target);
  e.preventDefault(); action(e.submitter, 'apply-status', async signer => {
    const project = address(f.get('project')), beneficiary = address(f.get('beneficiary'));
    const name = checkedText(f.get('name'), 1, 48, 'Name'), url = checkedText(f.get('sourceUrl'), 12, 200, 'Source URL');
    if (!url.startsWith('https://')) throw new Error('The source URL must start with https://.');
    const rate = Number(f.get('customRate') || f.get('rate'));
    if (!Number.isInteger(rate) || rate < 25 || rate > 100) throw new Error('Rate must be an integer between 25 and 100 basis points.');
    const state = await rpc.read(deployment.ProjectRegistry, REGISTRY_ABI, 'projectOf', [project]);
    if (state.ask !== 0n || state.listed) throw new Error('This project is already listed or has an open question.');
    if (await rpc.request('eth_getCode', [project, 'latest']) === '0x') throw new Error('The project must be a deployed Sepolia contract.');
    const fee = await rpc.read(deployment.ProjectRegistry, REGISTRY_ABI, 'ORACLE_FEE');
    if (fee === 0n) throw new Error('The oracle action is not currently sold.');
    await approve(signer, ADDRESSES.OracleIMD, deployment.ProjectRegistry, fee, 'apply-status');
    await send(signer, deployment.ProjectRegistry, REGISTRY_ABI, 'applyListing', [project, name, url, rate, beneficiary], 'apply-status', 'Submit application');
  });
});
$('challenge-form').addEventListener('submit', e => {
  const f = new FormData(e.target);
  e.preventDefault(); action(e.submitter, 'challenge-status', async signer => {
    const project = address(f.get('project')), reason = checkedText(f.get('reason'), 1, 280, 'Reason');
    const [state, fee, bond, block] = await Promise.all([
      rpc.read(deployment.ProjectRegistry, REGISTRY_ABI, 'projectOf', [project]),
      rpc.read(deployment.ProjectRegistry, REGISTRY_ABI, 'ORACLE_FEE'),
      rpc.read(deployment.ProjectRegistry, REGISTRY_ABI, 'challengeBond'),
      rpc.request('eth_getBlockByNumber', ['latest', false]),
    ]);
    if (!state.listed) throw new Error('This project is not listed.');
    if (state.ask !== 0n) throw new Error('This project already has an open question.');
    if (BigInt(block.timestamp) < state.challengeOpenAt) throw new Error(`Challenges open ${new Date(Number(state.challengeOpenAt) * 1000).toLocaleString()}.`);
    if (fee === 0n) throw new Error('The oracle action is not currently sold.');
    await approve(signer, ADDRESSES.OracleIMD, deployment.ProjectRegistry, fee + bond, 'challenge-status');
    await send(signer, deployment.ProjectRegistry, REGISTRY_ABI, 'challenge', [project, reason], 'challenge-status', 'Submit challenge');
  });
});
if (window.ethereum?.on) {
  window.ethereum.on('accountsChanged', () => { account = undefined; wallet = undefined; clearWalletView(); text('connect', 'Connect wallet'); text('wallet-status', 'Wallet account changed. Reconnect to refresh your stack.'); });
  window.ethereum.on('chainChanged', () => { account = undefined; wallet = undefined; clearWalletView(); text('connect', 'Connect wallet'); text('wallet-status', 'Wallet network changed. Connect on Sepolia to continue.'); });
}
try { if (localStorage.getItem('imd-theme') === 'dark' || (!localStorage.getItem('imd-theme') && matchMedia('(prefers-color-scheme: dark)').matches)) document.body.classList.add('dark'); } catch {}
$('theme').addEventListener('click', () => { const dark = document.body.classList.toggle('dark'); try { localStorage.setItem('imd-theme', dark ? 'dark' : 'light'); } catch {} });
renderContracts();
try {
  const response = await fetch('./deployment.json', { cache: 'no-store' });
  if (response.status === 404) {
    status('release-status', 'This Sepolia release is awaiting deployment. The platform will connect the confirmed contracts here.');
  } else {
    if (!response.ok) throw new Error('The release handoff could not be read.');
    deployment = validateDeployment(await response.json());
    await verifyDeployment(rpc, deployment); renderContracts(); await refresh();
  }
} catch (e) { deployment = undefined; ready = false; status('release-status', `Release verification failed. ${describeError(e)}`, true); }
controls();
setInterval(() => { if (!document.hidden && !busy) refresh(); }, 30000);
