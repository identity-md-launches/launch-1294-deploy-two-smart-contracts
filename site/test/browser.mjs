// Offline browser integration test. Uses a fresh headless Chrome profile, mocked RPC and wallet.
// No transaction is sent to a chain and no wallet key is loaded. No npm packages are required.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { ADDRESSES } from '../core.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const chromePath = process.argv[2] || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const directory = await mkdtemp(join(tmpdir(), 'imd-browser-'));
import { state, deployment, account, project, hash, addEvent, rpc } from './fixture.mjs';
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/mockrpc') {
      let body = ''; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      let out; try { out = { result: await rpc(input.method, input.params || [], input.wallet) }; } catch (e) { out = { error: { message: e.message } }; }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out)); return;
    }
    const fixture = req.url.startsWith('/fixture/');
    const path = req.url.replace(/^\/(pending|fixture)\//, '/').split('?')[0];
    if (path === '/deployment.json') { res.statusCode = fixture ? 200 : 404; res.setHeader('content-type', 'application/json'); res.end(fixture ? JSON.stringify(deployment) : '{}'); return; }
    const target = resolve(root, '.' + path);
    if (!target.startsWith(root)) { res.statusCode = 403; res.end(); return; }
    const contents = await readFile(target);
    res.setHeader('content-type', ({ '.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css' })[extname(target)] || 'text/plain'); res.end(contents);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let chrome, socket;
const delay = ms => new Promise(r => setTimeout(r, ms));
try {
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { stdio: 'ignore' });
  chrome.on('error', e => { console.error(e.message); });
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(join(directory, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); } }
  if (!port) throw new Error('Chrome did not start; pass its executable as the first argument.');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => socket.addEventListener('open', r, { once: true }));
  let seq = 0; const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) { const [yes, no] = pending.get(m.id); pending.delete(m.id); m.error ? no(new Error(m.error.message)) : yes(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  });
  const cdp = (method, params = {}) => new Promise((yes, no) => { const id = ++seq; pending.set(id, [yes, no]); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result.value; };
  const wait = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}`); };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    const realFetch = window.fetch.bind(window);
    window.fetch = (url, options) => typeof url === 'string' && url.startsWith('https://') ? realFetch('${base}/mockrpc', options) : realFetch(url, options);
    window.ethereum = { on() {}, request: async ({method, params = []}) => { const r = await (await realFetch('${base}/mockrpc', {method:'POST',body:JSON.stringify({method,params,wallet:true})})).json(); if(r.error) throw new Error(r.error.message); return r.result; } };
  ` });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.navigate', { url: `${base}/pending/index.html` });
  await wait("document.getElementById('release-status')?.textContent.includes('awaiting deployment')");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-write]')].every(b => b.disabled)"), true);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= 360'), true, 'no horizontal scroll at 360px');
  const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(directory, 'mobile.png'), Buffer.from(screenshot.data, 'base64'));
  console.log('PASS predeployment state and 360px layout');
  await cdp('Page.navigate', { url: `${base}/fixture/index.html` });
  await wait("document.getElementById('release-status')?.textContent.includes('release connected')");
  await evaluate("document.getElementById('connect').click()");
  await wait("document.getElementById('wallet-status').textContent.includes('Connected on Sepolia')");
  assert.equal(state.chain, '0xaa36a7');
  const clickAndWait = async (button, status) => { await evaluate(`document.querySelector(${JSON.stringify(button)}).click()`); await wait(`document.getElementById(${JSON.stringify(status)}).textContent.includes('confirmed.') && !document.getElementById('connect').disabled`); };
  await clickAndWait('#faucet', 'faucet-status');
  await evaluate("document.getElementById('stack-amount').value='5'");
  await clickAndWait('#stack-form button', 'stack-status');
  assert.equal(await evaluate("document.getElementById('cashback').textContent"), '5 IMD');
  assert.equal(await evaluate("document.getElementById('points').textContent"), '0');
  assert.equal(await evaluate("document.getElementById('value').textContent"), '5 IMD');
  await clickAndWait('#mint', 'mint-status');
  await evaluate(`document.getElementById('apply-project').value='${project}';document.getElementById('apply-name').value='<img src=x onerror=alert(1)>';document.getElementById('apply-url').value='https://example.org/source';document.getElementById('apply-beneficiary').value='${account}'`);
  await clickAndWait('#apply-form button', 'apply-status');
  assert.equal(await evaluate("document.querySelector('#projects img') === null"), true, 'untrusted names are text');
  const p = state.projects.get(project); p[0] = 0n; p[1] = true; p[4] = BigInt(state.number); p[7] = 0n;
  addEvent(deployment.contracts[1].address, 'Listed', [project, 50, account, state.number, hash(44)]);
  await evaluate(`document.getElementById('challenge-project').value='${project}';document.getElementById('challenge-reason').value='It credits outside trades.'`);
  await clickAndWait('#challenge-form button', 'challenge-status');
  await evaluate("document.querySelector('#projects button[data-write]').click()");
  await wait("!document.getElementById('connect').disabled && !document.querySelector('#projects button[data-write]')");
  assert.equal(state.txs.at(-1).name, 'expire');
  assert.ok(state.txs.some(tx => tx.name === 'mint' && tx.to === ADDRESSES.OracleIMD));
  assert.ok(state.txs.some(tx => tx.name === 'faucet' && tx.to === ADDRESSES.TestIMD));
  console.log('PASS wallet switch, faucet, exact approvals, self-stack, separate oracle mint, application, challenge, expiry, safe text rendering');
  state.mutateOnApproval = true;
  const previousCredits = state.txs.filter(tx => tx.name === 'credit').length;
  await evaluate("document.querySelector('#stack-form button').click()");
  await wait("document.getElementById('stack-status').textContent.includes('Wallet account or network changed')");
  assert.equal(state.txs.filter(tx => tx.name === 'credit').length, previousCredits);
  console.log('PASS network change after approval prevents the deposit');
  state.dropLogs = true;
  await evaluate("document.getElementById('refresh').click()");
  await wait("document.getElementById('release-status').textContent.includes('Data unavailable or stale')");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-write]')].every(b => b.disabled)"), true);
  console.log('PASS RPC history failure disables transactions and marks data stale');
  assert.deepEqual(errors, [], 'no browser exceptions');
  console.log(`Browser screenshot: ${join(directory, 'mobile.png')}`);
} finally {
  socket?.close(); chrome?.kill(); await new Promise(r => server.close(r));
  // Keep the temporary screenshot for manual inspection; the fresh browser profile contains no keys.
}
