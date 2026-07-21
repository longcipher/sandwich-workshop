// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/Sandwich.sol";

contract DeploySandwich is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        Sandwich sandwich = new Sandwich(msg.sender);
        vm.stopBroadcast();

        console.log("Sandwich contract deployed at:", address(sandwich));
    }
}
