// Run after the platform deployment. No keys, deployment, or publishing occurs here.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rpc, validateDeployment, verifyDeployment } from './core.mjs';
const input = process.argv[2];
if (!input) throw new Error('Usage: node site/configure.mjs /path/to/confirmed-sepolia-handoff.json');
const raw = JSON.parse(await readFile(resolve(input), 'utf8'));
const config = validateDeployment(raw);
await verifyDeployment(new Rpc(), config);
const output = resolve(dirname(fileURLToPath(import.meta.url)), 'deployment.json');
await writeFile(output, JSON.stringify({ chainId: config.chainId, contracts: config.contracts }, null, 2) + '\n');
console.log(`Verified Sepolia release saved to ${output}`);
