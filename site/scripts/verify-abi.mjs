import { readFile } from "node:fs/promises";
import { keccak256, toUtf8Bytes } from "ethers";
const root = new URL("../", import.meta.url);
const deployment = JSON.parse(
  await readFile(new URL("src/deployment.json", root), "utf8"),
);
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
for (const contract of deployment.contracts) {
  const abi = JSON.parse(
    await readFile(new URL(`src/abi/${contract.name}.json`, root), "utf8"),
  );
  const hash = keccak256(toUtf8Bytes(JSON.stringify(canonical(abi)))).slice(2);
  if (hash !== contract.abiHash)
    throw new Error(`${contract.name} ABI mismatch: ${hash}`);
  console.log(`${contract.name}: canonical ABI matches ${hash}`);
}
