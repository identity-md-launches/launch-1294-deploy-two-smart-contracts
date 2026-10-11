export async function injectForkWallet(p, fork, tester) {
  await p.addInitScript(
    ({ fork, tester }) => {
      const listeners = new Map();
      window.__walletControl = {
        chain: "0x1",
        rejectNext: false,
        accounts: [tester],
        calls: [],
        estimates: [],
        gasChecks: [],
      };
      const control = window.__walletControl;
      const provider = {
        request: async ({ method, params = [] }) => {
          control.calls.push({ method, params });
          if (method === "eth_accounts" || method === "eth_requestAccounts")
            return control.accounts;
          if (method === "eth_chainId") return control.chain;
          if (method === "wallet_switchEthereumChain") {
            control.chain = params[0].chainId;
            for (const f of listeners.get("chainChanged") || [])
              f(control.chain);
            return null;
          }
          if (method === "eth_sendTransaction") {
            const estimate = [...control.estimates]
              .reverse()
              .find((e) => e.data === params[0].data);
            control.gasChecks.push(
              !!estimate &&
                BigInt(params[0].gas) ===
                  (BigInt(estimate.result) * 130n + 99n) / 100n,
            );
          }
          if (method === "eth_sendTransaction" && control.rejectNext) {
            control.rejectNext = false;
            throw Object.assign(new Error("User rejected"), { code: 4001 });
          }
          const response = await fetch(fork, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: Date.now(),
              method,
              params,
            }),
          });
          const body = await response.json();
          if (body.error)
            throw Object.assign(new Error(body.error.message), body.error);
          if (method === "eth_estimateGas")
            control.estimates.push({
              data: params[0].data,
              result: body.result,
            });
          return body.result;
        },
        on: (event, fn) => {
          const list = listeners.get(event) || [];
          listeners.set(event, [...list, fn]);
        },
        removeListener: (event, fn) =>
          listeners.set(
            event,
            (listeners.get(event) || []).filter((f) => f !== fn),
          ),
      };
      const announce = () => {
        dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: {
                uuid: "fork-wallet",
                name: "Sepolia fork wallet",
                rdns: "test.local",
              },
              provider,
            },
          }),
        );
        dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: {
                uuid: "second-wallet",
                name: "Second test wallet",
                rdns: "test.second",
              },
              provider: { ...provider },
            },
          }),
        );
      };
      addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { fork, tester },
  );
}
