// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {Market} from "../src/Market.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

// ============================================================
// Attacker contract for reentrancy testing
// ============================================================

contract ReentrancyAttacker {
    Market public target;
    uint256 public attackCount;

    constructor(address _target) {
        target = Market(_target);
    }

    function bet(uint256 outcome) external payable {
        target.bet{value: msg.value}(outcome);
    }

    function attack() external {
        attackCount = 0;
        target.claim();
    }

    receive() external payable {
        // Try to re-enter claim()
        if (attackCount < 3) {
            attackCount++;
            try target.claim() {} catch {}
        }
    }
}

// ============================================================
// Adversarial test suite
// ============================================================

contract AdversarialTest is Test {
    MarketFactory factory;
    address owner = address(this);
    address feeRecipient = makeAddr("feeRecipient");
    uint256 signerPk = 0xA11CE;
    address signer = vm.addr(signerPk);

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        factory = new MarketFactory(feeRecipient, signer, 500);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function _createMarket(string memory q, string[] memory labels, uint256 deadlineOffset, uint256 grace) internal returns (Market) {
        address m = factory.createMarket(q, labels, block.timestamp + deadlineOffset, grace);
        return Market(m);
    }

    function _binaryLabels() internal pure returns (string[] memory) {
        string[] memory l = new string[](2);
        l[0] = "Yes"; l[1] = "No";
        return l;
    }

    function _multiLabels() internal pure returns (string[] memory) {
        string[] memory l = new string[](5);
        l[0] = "A"; l[1] = "B"; l[2] = "C"; l[3] = "D"; l[4] = "E";
        return l;
    }

    function _signResolve(address market, uint256 outcome) internal view returns (bytes memory) {
        bytes32 h = keccak256(abi.encodePacked("resolve", block.chainid, market, outcome));
        bytes32 eh = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, eh);
        return abi.encodePacked(r, s, v);
    }

    function _signCancel(address market) internal view returns (bytes memory) {
        bytes32 h = keccak256(abi.encodePacked("cancel", block.chainid, market));
        bytes32 eh = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, eh);
        return abi.encodePacked(r, s, v);
    }

    // ==========================================================
    // TEST: Reentrancy on claim()
    // ==========================================================
    function test_reentrancy_claim() public {
        Market m = _createMarket("Reentrancy test", _binaryLabels(), 2 days, 7 days);

        // Deploy attacker contract
        ReentrancyAttacker attacker = new ReentrancyAttacker(address(m));
        vm.deal(address(attacker), 10 ether);

        // Attacker bets
        attacker.bet{value: 1 ether}(0);

        // Normal user bets other side
        vm.prank(bob);
        m.bet{value: 1 ether}(1);

        // Resolve — attacker's side wins
        vm.warp(block.timestamp + 2 days);
        m.resolve(0, _signResolve(address(m), 0));

        // Attacker tries reentrancy
        uint256 balBefore = address(attacker).balance;
        attacker.attack();
        uint256 balAfter = address(attacker).balance;

        // Should only get paid once (not 3x)
        uint256 fee = 2 ether * 500 / 10000; // 0.1 ETH
        uint256 expected = 2 ether - fee; // 1.9 ETH (attacker had 100% of winning side)
        assertEq(balAfter - balBefore, expected, "Reentrancy: should only claim once");
        assertEq(attacker.attackCount(), 1, "Re-enter attempts should fail after first");
    }

    // ==========================================================
    // TEST: Reentrancy on withdrawFee()
    // ==========================================================
    function test_reentrancy_withdrawFee() public {
        // feeRecipient is an EOA so no reentrancy possible there,
        // but let's verify the flag is set before transfer
        Market m = _createMarket("Fee reentrancy", _binaryLabels(), 2 days, 7 days);

        vm.prank(alice);
        m.bet{value: 1 ether}(0);

        vm.warp(block.timestamp + 2 days);
        m.resolve(0, _signResolve(address(m), 0));

        vm.prank(feeRecipient);
        m.withdrawFee();

        assertTrue(m.feeWithdrawn());

        // Second attempt reverts
        vm.prank(feeRecipient);
        vm.expectRevert("Fee already withdrawn");
        m.withdrawFee();
    }

    // ==========================================================
    // TEST: Signature replay across markets
    // ==========================================================
    function test_signature_replay_across_markets() public {
        Market m1 = _createMarket("Market A", _binaryLabels(), 2 days, 7 days);
        Market m2 = _createMarket("Market B", _binaryLabels(), 2 days, 7 days);

        vm.prank(alice);
        m1.bet{value: 0.1 ether}(0);
        vm.prank(alice);
        m2.bet{value: 0.1 ether}(0);

        vm.warp(block.timestamp + 2 days);

        // Sign for m1
        bytes memory sig1 = _signResolve(address(m1), 0);
        m1.resolve(0, sig1);

        // Try to use same sig on m2 — should revert (address is part of hash)
        vm.expectRevert("Invalid signature");
        m2.resolve(0, sig1);
    }

    // ==========================================================
    // TEST: Signature replay same market different outcome
    // ==========================================================
    function test_signature_replay_different_outcome() public {
        Market m = _createMarket("Replay test", _binaryLabels(), 2 days, 7 days);

        vm.prank(alice);
        m.bet{value: 0.1 ether}(0);

        vm.warp(block.timestamp + 2 days);

        // Sign for outcome 0
        bytes memory sig0 = _signResolve(address(m), 0);

        // Try to use it for outcome 1 — should revert
        vm.expectRevert("Invalid signature");
        m.resolve(1, sig0);

        // Original sig works
        m.resolve(0, sig0);
    }

    // ==========================================================
    // TEST: Cancel signature cannot be used as resolve
    // ==========================================================
    function test_cancel_sig_not_usable_for_resolve() public {
        Market m = _createMarket("Cross-sig test", _binaryLabels(), 2 days, 7 days);

        vm.prank(alice);
        m.bet{value: 0.1 ether}(0);

        vm.warp(block.timestamp + 2 days);

        bytes memory cancelSig = _signCancel(address(m));

        // Cancel sig used for resolve — should revert
        vm.expectRevert("Invalid signature");
        m.resolve(0, cancelSig);
    }

    // ==========================================================
    // TEST: Dust attacks — tiny bets exploiting rounding
    // ==========================================================
    function test_dust_attack_rounding() public {
        Market m = _createMarket("Dust test", _binaryLabels(), 2 days, 7 days);

        // Alice bets minimum on YES
        vm.prank(alice);
        m.bet{value: 0.001 ether}(0);

        // Bob bets 10 ether on NO
        vm.prank(bob);
        m.bet{value: 10 ether}(1);

        // Resolve YES wins — Alice has 100% of YES pool
        vm.warp(block.timestamp + 2 days);
        m.resolve(0, _signResolve(address(m), 0));

        // Alice's payout: (1 / 1) * (totalPool - fee)
        uint256 totalPool = 10 ether + 0.001 ether;
        uint256 fee = totalPool * 500 / 10000;
        uint256 distributable = totalPool - fee;

        uint256 claimable = m.getClaimable(alice);
        assertEq(claimable, distributable, "Min bet should get full distributable");

        // Alice claims
        vm.prank(alice);
        m.claim();

        // Contract should have fee left, no stuck funds
        uint256 contractBal = address(m).balance;
        assertEq(contractBal, fee, "Only fee should remain");

        // Fee withdrawal
        vm.prank(feeRecipient);
        m.withdrawFee();
        assertEq(address(m).balance, 0, "Contract should be empty after all claims + fee");
    }

    // ==========================================================
    // TEST: Contract balance accounting — no stuck ETH
    // ==========================================================
    function test_no_stuck_eth_normal_flow() public {
        Market m = _createMarket("Accounting test", _binaryLabels(), 2 days, 7 days);

        vm.prank(alice);
        m.bet{value: 3 ether}(0);
        vm.prank(bob);
        m.bet{value: 2 ether}(0);
        vm.prank(carol);
        m.bet{value: 5 ether}(1);

        assertEq(address(m).balance, 10 ether);

        vm.warp(block.timestamp + 2 days);
        m.resolve(0, _signResolve(address(m), 0));

        // Winners claim
        vm.prank(alice);
        m.claim();
        vm.prank(bob);
        m.claim();

        // Fee
        vm.prank(feeRecipient);
        m.withdrawFee();

        // Only rounding dust should remain (if any)
        uint256 dust = address(m).balance;
        assertTrue(dust < 10, "At most a few wei of dust should remain");
    }

    // ==========================================================
    // TEST: No stuck ETH on cancel
    // ==========================================================
    function test_no_stuck_eth_cancel() public {
        Market m = _createMarket("Cancel accounting", _binaryLabels(), 2 days, 7 days);

        vm.prank(alice);
        m.bet{value: 1 ether}(0);
        vm.prank(bob);
        m.bet{value: 2 ether}(1);
        vm.prank(carol);
        m.bet{value: 0.5 ether}(0);

        assertEq(address(m).balance, 3.5 ether);

        m.cancel(_signCancel(address(m)));

        vm.prank(alice);
        m.claim();
        vm.prank(bob);
        m.claim();
        vm.prank(carol);
        m.claim();

        assertEq(address(m).balance, 0, "All ETH returned on cancel");
    }

    // ==========================================================
    // TEST: Max outcomes (10) — loop gas in claim
    // ==========================================================
    function test_max_outcomes_claim() public {
        string[] memory labels = new string[](10);
        for (uint i = 0; i < 10; i++) {
            labels[i] = string(abi.encodePacked("Outcome", vm.toString(i)));
        }
        Market m = _createMarket("Max outcomes", labels, 2 days, 7 days);

        // Alice bets on ALL 10 outcomes
        for (uint i = 0; i < 10; i++) {
            vm.prank(alice);
            m.bet{value: 0.1 ether}(i);
        }

        // Cancel — claim should iterate all 10 and refund
        m.cancel(_signCancel(address(m)));

        uint256 claimable = m.getClaimable(alice);
        assertEq(claimable, 1 ether, "Should refund full 1 ETH across 10 outcomes");

        vm.prank(alice);
        m.claim();
        assertEq(address(m).balance, 0);
    }

    // ==========================================================
    // TEST: Multiple bets same user same outcome accumulate
    // ==========================================================
    function test_multiple_bets_accumulate() public {
        Market m = _createMarket("Accumulate test", _binaryLabels(), 2 days, 7 days);

        vm.startPrank(alice);
        m.bet{value: 0.1 ether}(0);
        m.bet{value: 0.2 ether}(0);
        m.bet{value: 0.3 ether}(0);
        vm.stopPrank();

        assertEq(m.userBets(alice, 0), 0.6 ether);
        assertEq(m.totalPerOutcome(0), 0.6 ether);
        assertEq(m.totalPool(), 0.6 ether);
    }

    // ==========================================================
    // TEST: Empty market (no bets) — resolve then claim
    // ==========================================================
    function test_empty_market_resolve() public {
        Market m = _createMarket("Empty market", _binaryLabels(), 2 days, 7 days);

        // No bets at all
        vm.warp(block.timestamp + 2 days);
        m.resolve(0, _signResolve(address(m), 0));

        // Nobody can claim (no bets)
        vm.prank(alice);
        vm.expectRevert("Nothing to claim");
        m.claim();

        // Fee withdrawal should revert (no winners — pool is 0)
        vm.prank(feeRecipient);
        vm.expectRevert("No winners");
        m.withdrawFee();

        // Contract balance should be 0
        assertEq(address(m).balance, 0);
    }

    // ==========================================================
    // TEST: User bets on BOTH sides — hedging
    // ==========================================================
    function test_bet_both_sides() public {
        Market m = _createMarket("Hedge test", _binaryLabels(), 2 days, 7 days);

        vm.startPrank(alice);
        m.bet{value: 1 ether}(0); // YES
        m.bet{value: 1 ether}(1); // NO
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);
        m.resolve(0, _signResolve(address(m), 0));

        // Alice has 100% of YES pool, gets distributable
        uint256 fee = 2 ether * 500 / 10000; // 0.1 ETH
        uint256 payout = 2 ether - fee; // 1.9 ETH

        uint256 claimable = m.getClaimable(alice);
        assertEq(claimable, payout);

        // Alice loses 0.1 ETH total (the fee) by hedging
        // bet 2 ETH, get back 1.9 ETH
        vm.prank(alice);
        m.claim();
    }

    // ==========================================================
    // TEST: Direct ETH transfer to contract (not via bet)
    // ==========================================================
    function test_bet_below_minimum() public {
        Market m = _createMarket("Min bet test", _binaryLabels(), 2 days, 7 days);

        // Try to bet 1 wei — should revert
        vm.prank(alice);
        vm.expectRevert("Bet too small");
        m.bet{value: 1}(0);

        // Try 0.0009 ETH — should revert
        vm.prank(alice);
        vm.expectRevert("Bet too small");
        m.bet{value: 0.0009 ether}(0);

        // 0.001 ETH — should pass
        vm.prank(alice);
        m.bet{value: 0.001 ether}(0);
        assertEq(m.totalPool(), 0.001 ether);
    }

    function test_direct_eth_transfer() public {
        Market m = _createMarket("Direct ETH", _binaryLabels(), 2 days, 7 days);

        // Try to send ETH directly — should revert (no receive/fallback)
        vm.prank(alice);
        (bool success,) = address(m).call{value: 1 ether}("");
        assertFalse(success, "Direct ETH transfer should fail");
    }

    // ==========================================================
    // TEST: Very large bet — near max
    // ==========================================================
    function test_large_bet() public {
        Market m = _createMarket("Large bet", _binaryLabels(), 2 days, 7 days);

        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);

        vm.prank(alice);
        m.bet{value: 500 ether}(0);
        vm.prank(bob);
        m.bet{value: 500 ether}(1);

        vm.warp(block.timestamp + 2 days);
        m.resolve(0, _signResolve(address(m), 0));

        uint256 fee = 1000 ether * 500 / 10000; // 50 ETH
        uint256 payout = 1000 ether - fee; // 950 ETH

        assertEq(m.getClaimable(alice), payout);

        vm.prank(alice);
        m.claim();

        vm.prank(feeRecipient);
        m.withdrawFee();

        assertTrue(address(m).balance < 10, "Max dust");
    }

    // ==========================================================
    // TEST: Fee rounding — pool so small fee rounds to 0
    // ==========================================================
    function test_fee_rounding_small_pool() public {
        Market m = _createMarket("Small pool", _binaryLabels(), 2 days, 7 days);

        // Minimum bets — pool = 0.002 ETH, fee = 0.0001 ETH
        vm.prank(alice);
        m.bet{value: 0.001 ether}(0);
        vm.prank(bob);
        m.bet{value: 0.001 ether}(1);

        vm.warp(block.timestamp + 2 days);
        m.resolve(0, _signResolve(address(m), 0));

        uint256 totalPool = 0.002 ether;
        uint256 fee = totalPool * 500 / 10000; // 0.0001 ETH
        uint256 distributable = totalPool - fee;

        uint256 claimable = m.getClaimable(alice);
        assertEq(claimable, distributable, "Small pool: winner gets distributable");

        vm.prank(alice);
        m.claim();

        vm.prank(feeRecipient);
        m.withdrawFee();
        assertTrue(m.feeWithdrawn());
    }

    // ==========================================================
    // TEST: Signer rotation — old sig stops working
    // ==========================================================
    function test_signer_rotation() public {
        // Change signer in factory
        uint256 newSignerPk = 0xB0B;
        address newSigner = vm.addr(newSignerPk);
        factory.setSigner(newSigner);

        // Create market with new signer
        string[] memory labels = _binaryLabels();
        Market m = Market(factory.createMarket("New signer", labels, block.timestamp + 2 days, 7 days));

        vm.prank(alice);
        m.bet{value: 0.1 ether}(0);

        vm.warp(block.timestamp + 2 days);

        // Old signer's signature should fail
        bytes memory oldSig = _signResolve(address(m), 0);
        vm.expectRevert("Invalid signature");
        m.resolve(0, oldSig);

        // New signer works
        bytes32 h = keccak256(abi.encodePacked("resolve", block.chainid, address(m), uint256(0)));
        bytes32 eh = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newSignerPk, eh);
        bytes memory newSig = abi.encodePacked(r, s, v);
        m.resolve(0, newSig);

        assertEq(uint256(m.status()), uint256(Market.Status.Resolved));
    }

    // ==========================================================
    // TEST: Race — cancel and resolve in same block
    // ==========================================================
    function test_cancel_then_resolve_same_context() public {
        Market m = _createMarket("Race test", _binaryLabels(), 2 days, 7 days);

        vm.prank(alice);
        m.bet{value: 0.1 ether}(0);

        // Cancel first
        m.cancel(_signCancel(address(m)));

        // Now try resolve — should fail (not open)
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert("Market not open");
        m.resolve(0, _signResolve(address(m), 0));
    }

    // ==========================================================
    // TEST: Resolve then cancel — should fail
    // ==========================================================
    function test_resolve_then_cancel() public {
        Market m = _createMarket("Resolve then cancel", _binaryLabels(), 2 days, 7 days);

        vm.prank(alice);
        m.bet{value: 0.1 ether}(0);

        vm.warp(block.timestamp + 2 days);
        m.resolve(0, _signResolve(address(m), 0));

        // Cancel after resolve — should fail
        vm.expectRevert("Market not open");
        m.cancel(_signCancel(address(m)));
    }

    // ==========================================================
    // TEST: Expire then resolve — should fail
    // ==========================================================
    function test_expire_then_resolve() public {
        Market m = _createMarket("Expire then resolve", _binaryLabels(), 2 hours, 1 days);

        vm.prank(alice);
        m.bet{value: 0.1 ether}(0);

        vm.warp(block.timestamp + 2 hours + 1 days + 1);
        m.expire();

        vm.expectRevert("Market not open");
        m.resolve(0, _signResolve(address(m), 0));
    }

    // ==========================================================
    // TEST: Claim after expire returns exact amounts
    // ==========================================================
    function test_expire_refund_exact_amounts() public {
        Market m = _createMarket("Exact refund", _multiLabels(), 2 hours, 1 days);

        vm.prank(alice);
        m.bet{value: 0.123 ether}(0);
        vm.prank(alice);
        m.bet{value: 0.456 ether}(3);
        vm.prank(bob);
        m.bet{value: 0.789 ether}(2);

        vm.warp(block.timestamp + 2 hours + 1 days + 1);
        m.expire();

        assertEq(m.getClaimable(alice), 0.579 ether, "Alice should get exact sum back");
        assertEq(m.getClaimable(bob), 0.789 ether, "Bob should get exact amount back");

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        m.claim();
        assertEq(alice.balance - aliceBefore, 0.579 ether);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        m.claim();
        assertEq(bob.balance - bobBefore, 0.789 ether);

        assertEq(address(m).balance, 0, "Contract empty after all refunds");
    }
}
