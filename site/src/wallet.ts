import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrowserProvider,
  Contract,
  type Eip1193Provider,
  type Interface,
} from "ethers";
import {
  CHAIN_HEX,
  CHAIN_ID,
  EXPLORER,
  REGISTRY,
  RPC_URLS,
  STACKER,
  TOKEN,
  VAULT,
} from "./config";
import { key } from "./model";

export type Injected = Eip1193Provider & {
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};
export type WalletOption = {
  info: { uuid: string; name: string; rdns: string };
  provider: Injected;
};
declare global {
  interface Window {
    ethereum?: Injected;
  }
}
const errorMessages: Record<string, string> = {
  ZeroAddress: "Enter a nonzero project and beneficiary address.",
  NotAContract:
    "Project has no contract code. Use the trading contract address.",
  RateOutOfRange: "Choose a rate from 25 to 100 basis points (0.25%–1%).",
  BadText:
    "Check the text limits. Use printable ASCII without double quotes, backslashes or square brackets, and an https:// source URL.",
  AskOpen:
    "This project already has an open question. Refresh to see its status.",
  AlreadyListed: "This project is already listed.",
  NotListed: "This project is not listed. Refresh the project list.",
  ChallengeTooSoon:
    "The listing cooldown has not ended. Wait until the displayed time.",
  BeneficiaryChanged:
    "The beneficiary changed. Refresh and review it before challenging again.",
  BeneficiaryPinRequired: "Review the current beneficiary before challenging.",
  NothingToExpire:
    "This question has already closed. Refresh to see its outcome.",
  NotStale:
    "This question cannot expire yet. Wait for the expiry time or a completed Intake request.",
  OracleUnavailable:
    "The oracle is not accepting this payment token. Try again later.",
  ERC20InsufficientBalance:
    "Token balance is too low. Get test tokens before continuing.",
  ERC20InsufficientAllowance:
    "The allowance is too low. Approve the current amount and try again.",
  SafeERC20FailedOperation:
    "The token transfer failed. Check your balance and approval.",
  ZeroTrader: "A trader wallet is required.",
  ZeroShares: "This amount would mint no vault shares. Try a larger amount.",
  AssetMismatch:
    "The vault asset does not match TestIMD. Stacking is unavailable.",
  EnforcedPause: "The vault is paused. Try stacking after it reopens.",
};
export function explainError(error: unknown): string {
  const e = error as any;
  if (
    e?.code === 4001 ||
    e?.code === "ACTION_REJECTED" ||
    e?.info?.error?.code === 4001
  )
    return "Request cancelled in your wallet. You can try again.";
  if (e?.code === "INSUFFICIENT_FUNDS")
    return "You need Sepolia ETH to pay for gas.";
  const data = [
    e?.data,
    e?.error?.data,
    e?.info?.error?.data,
    e?.cause?.data,
  ].flatMap((d) =>
    typeof d === "string" ? [d] : typeof d?.data === "string" ? [d.data] : [],
  );
  for (const bytes of data)
    for (const iface of [REGISTRY, STACKER, TOKEN, VAULT]) {
      try {
        const name = iface.parseError(bytes)?.name;
        if (name && errorMessages[name]) return errorMessages[name];
      } catch {
        /* Other interface. */
      }
    }
  if (e?.revert?.name && errorMessages[e.revert.name])
    return errorMessages[e.revert.name];
  const message =
    e?.reason ||
    e?.shortMessage ||
    e?.message ||
    "The request failed. Try again.";
  if (/user rejected|user denied/i.test(message))
    return "Request cancelled in your wallet. You can try again.";
  if (/paused/i.test(message)) return errorMessages.EnforcedPause;
  if (/faucet/i.test(message))
    return "The faucet is not ready. Check the next allowed time and refresh.";
  if (/insufficient funds/i.test(message))
    return "You need Sepolia ETH to pay for gas.";
  if (/missing revert data|execution reverted/i.test(message))
    return "The contract refused this transaction. Refresh, then check the amount, balance, approval and project status.";
  return message.length > 350 ? `${message.slice(0, 350)}…` : message;
}
export function useWallet() {
  const [options, setOptions] = useState<WalletOption[]>([]);
  const [selected, setSelected] = useState<WalletOption>();
  const [account, setAccount] = useState<string>();
  const [chain, setChain] = useState<number>();
  const [status, setStatus] = useState("");
  const [connecting, setConnecting] = useState(false);
  useEffect(() => {
    const announce = (event: Event) => {
      const detail = (event as CustomEvent<WalletOption>).detail;
      if (
        typeof detail?.info?.uuid !== "string" ||
        typeof detail.info.name !== "string" ||
        typeof detail.provider?.request !== "function"
      )
        return;
      setOptions((old) =>
        old.some(
          (w) =>
            w.provider === detail.provider || w.info.uuid === detail.info.uuid,
        )
          ? old
          : [
              ...old.filter(
                (w) =>
                  w.info.uuid !== "legacy" || w.provider !== detail.provider,
              ),
              detail,
            ],
      );
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const timer = window.setTimeout(() => {
      if (window.ethereum)
        setOptions((old) =>
          old.some((w) => w.provider === window.ethereum)
            ? old
            : [
                ...old,
                {
                  info: { uuid: "legacy", name: "Browser wallet", rdns: "" },
                  provider: window.ethereum!,
                },
              ],
        );
    }, 250);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", announce);
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    const accounts = (values: string[]) => {
      setAccount(values[0]);
      setStatus(
        values.length ? "" : "Wallet disconnected. Connect to continue.",
      );
    };
    const chains = (value: string) => {
      setChain(Number(BigInt(value)));
      setStatus(
        Number(BigInt(value)) === CHAIN_ID
          ? ""
          : "Switch to Sepolia to send transactions.",
      );
    };
    const disconnect = () => {
      setAccount(undefined);
      setChain(undefined);
      setStatus("Wallet disconnected. Connect to continue.");
    };
    selected.provider.on?.("accountsChanged", accounts);
    selected.provider.on?.("chainChanged", chains);
    selected.provider.on?.("disconnect", disconnect);
    return () => {
      selected.provider.removeListener?.("accountsChanged", accounts);
      selected.provider.removeListener?.("chainChanged", chains);
      selected.provider.removeListener?.("disconnect", disconnect);
    };
  }, [selected]);
  const connect = async (option?: WalletOption) => {
    const wallet = option ?? selected ?? options[0];
    if (!wallet) {
      setStatus(
        "No injected wallet found. Open this site in an Ethereum wallet browser or enable your wallet extension.",
      );
      return;
    }
    setConnecting(true);
    setStatus("Confirm the connection in your wallet.");
    try {
      const accounts = (await wallet.provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts.length)
        throw new Error("Select an account in your wallet.");
      setSelected(wallet);
      setAccount(accounts[0]);
      let chain = Number(
        BigInt(await wallet.provider.request({ method: "eth_chainId" })),
      );
      if (chain !== CHAIN_ID) {
        try {
          await wallet.provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: CHAIN_HEX }],
          });
        } catch (e) {
          if ((e as any).code !== 4902) throw e;
          await wallet.provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: CHAIN_HEX,
                chainName: "Sepolia",
                rpcUrls: RPC_URLS,
                nativeCurrency: {
                  name: "Sepolia Ether",
                  symbol: "ETH",
                  decimals: 18,
                },
                blockExplorerUrls: [EXPLORER],
              },
            ],
          });
          await wallet.provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: CHAIN_HEX }],
          });
        }
        chain = Number(
          BigInt(await wallet.provider.request({ method: "eth_chainId" })),
        );
      }
      setChain(chain);
      if (chain !== CHAIN_ID)
        throw new Error("Switch to Sepolia in your wallet.");
      setStatus("");
    } catch (e) {
      setStatus(explainError(e));
    } finally {
      setConnecting(false);
    }
  };
  return {
    options,
    selected,
    account,
    chain,
    status,
    connecting,
    connect,
    disconnect: () => {
      setSelected(undefined);
      setAccount(undefined);
      setChain(undefined);
      setStatus("");
    },
  };
}
export type Wallet = ReturnType<typeof useWallet>;
export type TxState = {
  phase: "pending" | "success" | "error";
  message: string;
  hash?: string;
};
export function useTransactions(wallet: Wallet, refresh: () => Promise<void>) {
  const [states, setStates] = useState<Record<string, TxState>>({});
  const inFlight = useRef(false);
  const update = useCallback(
    (id: string, state: TxState) =>
      setStates((old) => ({ ...old, [id]: state })),
    [],
  );
  const run = async (
    id: string,
    target: string,
    iface: Interface,
    method: string,
    args: unknown[],
    preflight?: () => Promise<void>,
  ) => {
    if (inFlight.current) return;
    inFlight.current = true;
    let provider: BrowserProvider | undefined;
    try {
      if (!wallet.selected || !wallet.account)
        throw new Error("Connect a wallet first.");
      const injected = wallet.selected.provider,
        expected = wallet.account;
      const guard = async () => {
        const [chain, accounts] = await Promise.all([
          injected.request({ method: "eth_chainId" }),
          injected.request({ method: "eth_accounts" }),
        ]);
        if (Number(BigInt(chain)) !== CHAIN_ID)
          throw new Error("Switch to Sepolia to continue.");
        if (
          !(accounts as string[])?.length ||
          key((accounts as string[])[0]) !== key(expected)
        )
          throw new Error(
            "Your wallet account changed. Review the form and try again.",
          );
      };
      update(id, { phase: "pending", message: "Checking the transaction…" });
      await guard();
      await preflight?.();
      provider = new BrowserProvider(injected, "any");
      const signer = await provider.getSigner(expected);
      const fn = new Contract(target, iface, signer).getFunction(method);
      const estimate = await fn.estimateGas(...args);
      await guard();
      update(id, { phase: "pending", message: "Confirm in your wallet." });
      const tx = await fn(...args, {
        chainId: CHAIN_ID,
        gasLimit: (estimate * 130n + 99n) / 100n,
      });
      update(id, {
        phase: "pending",
        message: "Waiting for confirmation…",
        hash: tx.hash,
      });
      let receipt;
      try {
        receipt = await tx.wait(1);
      } catch (e) {
        if (
          (e as any).code === "TRANSACTION_REPLACED" &&
          !(e as any).cancelled &&
          (e as any).receipt?.status === 1
        )
          receipt = (e as any).receipt;
        else throw e;
      }
      if (!receipt || receipt.status !== 1)
        throw new Error(
          "The transaction reverted. Refresh and review the current values.",
        );
      update(id, {
        phase: "pending",
        message: "Confirmed. Refreshing data…",
        hash: receipt.hash,
      });
      await refresh();
      update(id, {
        phase: "success",
        message: "Confirmed.",
        hash: receipt.hash,
      });
    } catch (e) {
      update(id, { phase: "error", message: explainError(e) });
    } finally {
      provider?.destroy();
      inFlight.current = false;
    }
  };
  return {
    states,
    run,
    busy: Object.values(states).some((s) => s.phase === "pending"),
  };
}
export type Transactions = ReturnType<typeof useTransactions>;
