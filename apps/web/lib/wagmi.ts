import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { injected, coinbaseWallet, walletConnect } from "wagmi/connectors";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org";

const transport = http(RPC_URL, { retryCount: 3, retryDelay: 1000 });

export const wagmiConfig = createConfig({
  chains: [base],
  ssr: true,
  connectors: [
    injected(),
    coinbaseWallet({
      appName: "Rush Markets",
      preference: "eoaOnly", // Force EOA mode — smart wallet proxy strips ETH value
    }),
  ],
  transports: { [base.id]: transport },
});

export { base };
