import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { injected, coinbaseWallet, walletConnect } from "wagmi/connectors";

// Same Chainstack RPC as rushgame.vip — public mainnet.base.org rate-limits
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://base-mainnet.core.chainstack.com/977532e58b2430d1f01739e7d209d236";

const transport = http(RPC_URL, { retryCount: 3, retryDelay: 1000 });

// WalletConnect Cloud projectId — same as main site
const WC_PROJECT_ID =
  process.env.NEXT_PUBLIC_WC_PROJECT_ID || "83b7531d45db48105b33da04366b9455";

export const wagmiConfig = createConfig({
  chains: [base],
  ssr: true,
  connectors: [
    injected(), // MetaMask + Phantom (both inject as window.ethereum on EVM)
    coinbaseWallet({
      appName: "Rush Markets",
      preference: "eoaOnly", // force EOA — smart wallet proxy strips msg.value
    }),
    walletConnect({
      projectId: WC_PROJECT_ID,
      metadata: {
        name: "Rush Markets",
        description: "On-chain prediction markets on Base",
        url: "https://markets.rushgame.vip",
        icons: ["https://rushgame.vip/logo.png"],
      },
      showQrModal: true, // native WC modal — QR desktop, deep-link mobile
    }),
  ],
  transports: { [base.id]: transport },
});

export { base };
