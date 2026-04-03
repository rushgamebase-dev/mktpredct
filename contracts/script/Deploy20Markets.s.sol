// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

contract Deploy20MarketsScript is Script {
    // Factory on Base mainnet
    address constant FACTORY = 0x09257F570c77EdabfAcb7243712fFa8CcB0599f8;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        MarketFactory factory = MarketFactory(FACTORY);

        // ============================================================
        // SHORT-TERM (24h) — 6 markets
        // ============================================================

        // 1. ETH price move
        string[] memory labels2 = new string[](2);
        labels2[0] = "Yes"; labels2[1] = "No";

        factory.createMarket(
            "Will ETH price move +/-5% in the next 24h?",
            labels2,
            block.timestamp + 1 days,
            7 days
        );
        console.log("Market 1: ETH 5% move 24h");

        // 2. Base 1M transactions
        factory.createMarket(
            "Will Base process 1,000,000+ transactions in the next 24h?",
            labels2,
            block.timestamp + 1 days,
            7 days
        );
        console.log("Market 2: Base 1M tx");

        // 3. ETH above $2,200 in 24h (realistic from $2,044)
        factory.createMarket(
            "Will ETH be above $2,200 at UTC close tomorrow?",
            labels2,
            block.timestamp + 1 days,
            7 days
        );
        console.log("Market 3: ETH > $2,200");

        // 4. Base DEX volume $500M
        factory.createMarket(
            "Will total Base DEX volume exceed $500M in the next 24h?",
            labels2,
            block.timestamp + 1 days,
            7 days
        );
        console.log("Market 4: Base DEX $500M");

        // 5. Base token +30%
        factory.createMarket(
            "Will any Base token gain 30%+ in the next 24h?",
            labels2,
            block.timestamp + 1 days,
            7 days
        );
        console.log("Market 5: Base token +30%");

        // 6. Base 200k active wallets
        factory.createMarket(
            "Will Base daily active wallets exceed 200,000 today (UTC)?",
            labels2,
            block.timestamp + 1 days,
            7 days
        );
        console.log("Market 6: Base 200k wallets");

        // ============================================================
        // RECURRING (daily) — 4 markets
        // ============================================================

        // 7. AIXBT tweets
        factory.createMarket(
            "Will @aixbt_agent post 20+ tweets today (UTC)?",
            labels2,
            block.timestamp + 1 days,
            7 days
        );
        console.log("Market 7: AIXBT 20 tweets");

        // 8. Base more tx than yesterday
        factory.createMarket(
            "Will Base process more transactions than yesterday?",
            labels2,
            block.timestamp + 1 days,
            7 days
        );
        console.log("Market 8: Base tx > yesterday");

        // 9. ETH close higher than yesterday
        factory.createMarket(
            "Will ETH close higher than yesterday (UTC)?",
            labels2,
            block.timestamp + 1 days,
            7 days
        );
        console.log("Market 9: ETH > yesterday");

        // 10. Base gas > 0.02 gwei
        factory.createMarket(
            "Will Base gas fees average above 0.02 gwei today?",
            labels2,
            block.timestamp + 1 days,
            7 days
        );
        console.log("Market 10: Base gas");

        // ============================================================
        // NARRATIVE (longer term, Base hype) — 5 markets
        // ============================================================

        // 11. Base surpass Solana 3 consecutive days
        factory.createMarket(
            "Will Base surpass Solana in daily transactions for 3 consecutive days before July 2026?",
            labels2,
            block.timestamp + 90 days,
            14 days
        );
        console.log("Market 11: Base > Solana 3 days");

        // 12. Base TVL $5B
        factory.createMarket(
            "Will Base TVL exceed $5B before Dec 31, 2026?",
            labels2,
            1798761599, // Dec 31, 2026 23:59:59 UTC
            14 days
        );
        console.log("Market 12: Base TVL $5B");

        // 13. Base token top 50
        factory.createMarket(
            "Will a Base-native token enter top 50 market cap before Dec 31, 2026?",
            labels2,
            1798761599,
            14 days
        );
        console.log("Market 13: Base token top 50");

        // 14. Coinbase new Base product
        factory.createMarket(
            "Will Coinbase announce a major new Base product before Aug 2026?",
            labels2,
            block.timestamp + 120 days,
            14 days
        );
        console.log("Market 14: Coinbase Base product");

        // 15. ETH $3,000 (realistic target from $2,044)
        factory.createMarket(
            "Will ETH reach $3,000 before June 1, 2026?",
            labels2,
            block.timestamp + 60 days,
            14 days
        );
        console.log("Market 15: ETH $3k");

        // ============================================================
        // HIGH-ENGAGEMENT — 5 markets
        // ============================================================

        // 16. Base token $100M mcap in 48h
        factory.createMarket(
            "Will any new Base token reach $100M market cap within 48h of launch this week?",
            labels2,
            block.timestamp + 7 days,
            7 days
        );
        console.log("Market 16: Base token $100M 48h");

        // 17. ETH volatility >8% in 12h
        factory.createMarket(
            "Will ETH volatility exceed 8% in the next 12h?",
            labels2,
            block.timestamp + 12 hours,
            7 days
        );
        console.log("Market 17: ETH vol 8%");

        // 18. Base DEX volume increase vs previous 12h
        factory.createMarket(
            "Will Base DEX volume increase compared to previous 12h?",
            labels2,
            block.timestamp + 12 hours,
            7 days
        );
        console.log("Market 18: Base DEX volume increase");

        // 19. ETH tight range +-2% in 6h
        factory.createMarket(
            "Will ETH trade within a 2% range in the next 6h?",
            labels2,
            block.timestamp + 6 hours,
            7 days
        );
        console.log("Market 19: ETH 2% range 6h");

        // 20. Base 50k new wallets
        factory.createMarket(
            "Will Base create 50,000+ new wallets in the next 24h?",
            labels2,
            block.timestamp + 1 days,
            7 days
        );
        console.log("Market 20: Base 50k new wallets");

        vm.stopBroadcast();
        console.log("=== ALL 20 MARKETS DEPLOYED ===");
    }
}
