// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

contract DeployMainnetScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Balance:", deployer.balance);

        vm.startBroadcast(deployerKey);

        // Deploy Factory — deployer is owner, signer, and feeRecipient
        MarketFactory factory = new MarketFactory(
            deployer,   // feeRecipient
            deployer,   // signer
            500         // 5% fee
        );

        console.log("Factory deployed at:", address(factory));
        console.log("Owner:", factory.owner());
        console.log("Signer:", factory.signer());
        console.log("Fee recipient:", factory.feeRecipient());

        vm.stopBroadcast();
    }
}
