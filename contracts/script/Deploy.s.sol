// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {Market} from "../src/Market.sol";

contract DeployScript is Script {
    function run() external {
        // Anvil default account #0
        uint256 deployerKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        // Anvil account #1 as signer
        address signer = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        // Anvil account #0 as fee recipient
        address feeRecipient = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

        vm.startBroadcast(deployerKey);

        MarketFactory factory = new MarketFactory(feeRecipient, signer, 500);
        console.log("Factory deployed at:", address(factory));

        // Create sample markets
        string[] memory labels2 = new string[](2);
        labels2[0] = "Yes";
        labels2[1] = "No";

        string[] memory labels3 = new string[](3);
        labels3[0] = "Bitcoin";
        labels3[1] = "Ethereum";
        labels3[2] = "Solana";

        string[] memory labels4 = new string[](4);
        labels4[0] = "Trump";
        labels4[1] = "Biden";
        labels4[2] = "DeSantis";
        labels4[3] = "Other";

        address m1 = factory.createMarket(
            "Will Bitcoin hit $200k by end of 2026?",
            labels2,
            block.timestamp + 30 days,
            7 days
        );
        console.log("Market 1:", m1);

        address m2 = factory.createMarket(
            "Which L1 will have the highest TVL in Q3 2026?",
            labels3,
            block.timestamp + 60 days,
            7 days
        );
        console.log("Market 2:", m2);

        address m3 = factory.createMarket(
            "Who will win the 2028 US Presidential Election?",
            labels4,
            block.timestamp + 365 days,
            14 days
        );
        console.log("Market 3:", m3);

        // Place some bets from deployer
        Market(m1).bet{value: 0.5 ether}(0);  // Yes
        Market(m1).bet{value: 0.3 ether}(1);  // No
        Market(m2).bet{value: 0.2 ether}(0);  // Bitcoin
        Market(m2).bet{value: 0.15 ether}(1); // Ethereum
        Market(m2).bet{value: 0.1 ether}(2);  // Solana
        Market(m3).bet{value: 0.1 ether}(0);  // Trump

        vm.stopBroadcast();

        // Place bets from account #2
        uint256 user2Key = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
        vm.startBroadcast(user2Key);
        Market(m1).bet{value: 0.2 ether}(0);  // Yes
        Market(m1).bet{value: 0.4 ether}(1);  // No
        Market(m2).bet{value: 0.3 ether}(1);  // Ethereum
        Market(m3).bet{value: 0.05 ether}(1); // Biden
        Market(m3).bet{value: 0.08 ether}(3); // Other
        vm.stopBroadcast();

        console.log("--- Seeding complete ---");
        console.log("Total bets placed: 11");
    }
}
