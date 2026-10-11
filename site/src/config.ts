import { Interface } from "ethers";
import deployment from "./deployment.json";
import stackerAbi from "./abi/Stacker.json";
import registryAbi from "./abi/ProjectRegistry.json";

export const CHAIN_ID = 11155111;
export const CHAIN_HEX = "0xaa36a7";
export const EXPLORER = "https://sepolia.etherscan.io";
export const RPC_URLS = [
  "https://rpc.sepolia.ethpandaops.io",
  "https://sepolia.rpc.sentio.xyz",
  "https://ethereum-sepolia-rpc.publicnode.com",
];
export const ADDRESSES = {
  Stacker: deployment.contracts.find((c) => c.name === "Stacker")!.address,
  ProjectRegistry: deployment.contracts.find(
    (c) => c.name === "ProjectRegistry",
  )!.address,
  TestIMD: "0x2b69099e59b05901faa1dd164fabf098bf831e82",
  TestSIMD: "0xf9e2eec3b610ec6781f7438ac5fb4bc049d81cc1",
  OracleIMD: "0x44a1cd38474fb1748400e7deb5f8d786cce3f89a",
  Intake: "0xa43e6f75ee006411f79ac1c84120606c2330de82",
} as const;
export const DEPLOYMENT = deployment;
export const STACKER = new Interface(stackerAbi);
export const REGISTRY = new Interface(registryAbi);
export const TOKEN = new Interface([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function faucet()",
  "function nextFaucetAt(address) view returns (uint256)",
  "function mint(address,uint256)",
  "error ERC20InsufficientBalance(address,uint256,uint256)",
  "error ERC20InsufficientAllowance(address,uint256,uint256)",
]);
export const VAULT = new Interface([
  ...TOKEN.fragments,
  "function asset() view returns (address)",
  "function paused() view returns (bool)",
  "function totalAssets() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "error EnforcedPause()",
]);
export const INTAKE = new Interface([
  "function requests(bytes32) view returns (address payer,address callbackTarget,bytes4 callbackSelector,bool completed)",
]);
