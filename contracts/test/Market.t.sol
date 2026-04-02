// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {Market} from "../src/Market.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

contract MarketTest is Test {
    MarketFactory factory;
    Market market;

    address owner = address(this);
    address feeRecipient = makeAddr("feeRecipient");
    uint256 signerPk = 0xA11CE;
    address signer = vm.addr(signerPk);

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    uint256 deadline;
    uint256 gracePeriod = 7 days;

    function setUp() public {
        deadline = block.timestamp + 2 days;

        factory = new MarketFactory(feeRecipient, signer, 500);

        string[] memory labels = new string[](3);
        labels[0] = "Outcome A";
        labels[1] = "Outcome B";
        labels[2] = "Outcome C";

        address marketAddr = factory.createMarket("Who wins?", labels, deadline, gracePeriod);
        market = Market(marketAddr);

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _signResolve(uint256 outcome) internal view returns (bytes memory) {
        bytes32 messageHash = keccak256(
            abi.encodePacked("resolve", block.chainid, address(market), outcome)
        );
        bytes32 ethSignedHash = _toEthSignedMessageHash(messageHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    function _signCancel() internal view returns (bytes memory) {
        bytes32 messageHash = keccak256(
            abi.encodePacked("cancel", block.chainid, address(market))
        );
        bytes32 ethSignedHash = _toEthSignedMessageHash(messageHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    function _toEthSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    // ------------------------------------------------------------------
    // Construction
    // ------------------------------------------------------------------

    function test_initialState() public view {
        assertEq(uint256(market.status()), uint256(Market.Status.Open));
        assertEq(market.outcomeCount(), 3);
        assertEq(market.deadline(), deadline);
        assertEq(market.gracePeriod(), gracePeriod);
        assertEq(market.signer(), signer);
        assertEq(market.feeRecipient(), feeRecipient);
        assertEq(market.feeBps(), 500);
        assertEq(market.totalPool(), 0);
    }

    // ------------------------------------------------------------------
    // Betting
    // ------------------------------------------------------------------

    function test_bet() public {
        vm.prank(alice);
        market.bet{value: 1 ether}(0);

        assertEq(market.userBets(alice, 0), 1 ether);
        assertEq(market.totalPerOutcome(0), 1 ether);
        assertEq(market.totalPool(), 1 ether);
    }

    function test_bet_multipleOutcomes() public {
        vm.prank(alice);
        market.bet{value: 1 ether}(0);

        vm.prank(alice);
        market.bet{value: 2 ether}(1);

        assertEq(market.userBets(alice, 0), 1 ether);
        assertEq(market.userBets(alice, 1), 2 ether);
        assertEq(market.totalPool(), 3 ether);
    }

    function test_bet_revert_afterDeadline() public {
        vm.warp(deadline);
        vm.prank(alice);
        vm.expectRevert("Betting closed");
        market.bet{value: 1 ether}(0);
    }

    function test_bet_revert_invalidOutcome() public {
        vm.prank(alice);
        vm.expectRevert("Invalid outcome");
        market.bet{value: 1 ether}(3);
    }

    function test_bet_revert_tooSmall() public {
        vm.prank(alice);
        vm.expectRevert("Bet too small");
        market.bet{value: 0}(0);
    }

    function test_bet_revert_belowMinimum() public {
        vm.prank(alice);
        vm.expectRevert("Bet too small");
        market.bet{value: 0.0001 ether}(0);
    }

    // ------------------------------------------------------------------
    // Resolution
    // ------------------------------------------------------------------

    function test_resolve() public {
        vm.prank(alice);
        market.bet{value: 1 ether}(0);

        vm.warp(deadline);
        bytes memory sig = _signResolve(0);
        market.resolve(0, sig);

        assertEq(uint256(market.status()), uint256(Market.Status.Resolved));
        assertEq(market.winningOutcome(), 0);
    }

    function test_resolve_revert_tooEarly() public {
        vm.prank(alice);
        market.bet{value: 1 ether}(0);

        bytes memory sig = _signResolve(0);
        vm.expectRevert("Too early");
        market.resolve(0, sig);
    }

    function test_resolve_revert_badSignature() public {
        vm.prank(alice);
        market.bet{value: 1 ether}(0);

        vm.warp(deadline);
        // Sign with wrong key
        uint256 wrongPk = 0xBAD;
        bytes32 messageHash = keccak256(
            abi.encodePacked("resolve", block.chainid, address(market), uint256(0))
        );
        bytes32 ethSignedHash = _toEthSignedMessageHash(messageHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPk, ethSignedHash);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.expectRevert("Invalid signature");
        market.resolve(0, badSig);
    }

    function test_resolve_revert_double() public {
        vm.prank(alice);
        market.bet{value: 1 ether}(0);

        vm.warp(deadline);
        market.resolve(0, _signResolve(0));

        vm.expectRevert("Market not open");
        market.resolve(1, _signResolve(1));
    }

    // ------------------------------------------------------------------
    // Claim — normal payout
    // ------------------------------------------------------------------

    function test_claim_normalPayout() public {
        // Alice bets 3 ETH on outcome 0, Bob bets 2 ETH on outcome 0, Carol bets 5 ETH on outcome 1
        vm.prank(alice);
        market.bet{value: 3 ether}(0);
        vm.prank(bob);
        market.bet{value: 2 ether}(0);
        vm.prank(carol);
        market.bet{value: 5 ether}(1);

        // Total pool = 10 ETH, outcome 0 wins
        vm.warp(deadline);
        market.resolve(0, _signResolve(0));

        // fee = 10 * 500 / 10000 = 0.5 ETH
        // distributable = 9.5 ETH
        // Alice payout = (3/5) * 9.5 = 5.7 ETH
        // Bob payout = (2/5) * 9.5 = 3.8 ETH

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        market.claim();
        uint256 alicePayout = alice.balance - aliceBefore;
        assertEq(alicePayout, 5.7 ether);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        market.claim();
        uint256 bobPayout = bob.balance - bobBefore;
        assertEq(bobPayout, 3.8 ether);
    }

    function test_claim_revert_loser() public {
        vm.prank(alice);
        market.bet{value: 1 ether}(0);
        vm.prank(bob);
        market.bet{value: 1 ether}(1);

        vm.warp(deadline);
        market.resolve(0, _signResolve(0));

        vm.prank(bob);
        vm.expectRevert("No winning bet");
        market.claim();
    }

    function test_claim_revert_doubleClaim() public {
        vm.prank(alice);
        market.bet{value: 1 ether}(0);

        vm.warp(deadline);
        market.resolve(0, _signResolve(0));

        vm.prank(alice);
        market.claim();

        vm.prank(alice);
        vm.expectRevert("Already claimed");
        market.claim();
    }

    // ------------------------------------------------------------------
    // Claim — refund (zero winner pool)
    // ------------------------------------------------------------------

    function test_claim_zeroWinnerRefund() public {
        // Everyone bets on outcome 1, but outcome 0 wins
        vm.prank(alice);
        market.bet{value: 3 ether}(1);
        vm.prank(bob);
        market.bet{value: 2 ether}(1);

        vm.warp(deadline);
        market.resolve(0, _signResolve(0));

        // Zero winner pool → refund mode, no fee
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        market.claim();
        assertEq(alice.balance - aliceBefore, 3 ether);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        market.claim();
        assertEq(bob.balance - bobBefore, 2 ether);
    }

    // ------------------------------------------------------------------
    // Claim — refund (cancelled)
    // ------------------------------------------------------------------

    function test_claim_cancelledRefund() public {
        vm.prank(alice);
        market.bet{value: 3 ether}(0);
        vm.prank(bob);
        market.bet{value: 2 ether}(1);

        market.cancel(_signCancel());

        assertEq(uint256(market.status()), uint256(Market.Status.Cancelled));

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        market.claim();
        assertEq(alice.balance - aliceBefore, 3 ether);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        market.claim();
        assertEq(bob.balance - bobBefore, 2 ether);
    }

    // ------------------------------------------------------------------
    // Claim — refund (expired)
    // ------------------------------------------------------------------

    function test_claim_expiredRefund() public {
        vm.prank(alice);
        market.bet{value: 4 ether}(0);
        vm.prank(bob);
        market.bet{value: 1 ether}(2);

        vm.warp(deadline + gracePeriod + 1);
        market.expire();

        assertEq(uint256(market.status()), uint256(Market.Status.Expired));

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        market.claim();
        assertEq(alice.balance - aliceBefore, 4 ether);
    }

    // ------------------------------------------------------------------
    // Claim — multi-outcome refund
    // ------------------------------------------------------------------

    function test_claim_refundMultiOutcomeBets() public {
        // Alice bets on two outcomes, market gets cancelled
        vm.prank(alice);
        market.bet{value: 1 ether}(0);
        vm.prank(alice);
        market.bet{value: 2 ether}(1);

        market.cancel(_signCancel());

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        market.claim();
        // Gets back total across all outcomes
        assertEq(alice.balance - aliceBefore, 3 ether);
    }

    // ------------------------------------------------------------------
    // Expire
    // ------------------------------------------------------------------

    function test_expire() public {
        vm.warp(deadline + gracePeriod + 1);
        market.expire();
        assertEq(uint256(market.status()), uint256(Market.Status.Expired));
    }

    function test_expire_revert_tooEarly() public {
        vm.warp(deadline + gracePeriod);
        vm.expectRevert("Grace period active");
        market.expire();
    }

    // ------------------------------------------------------------------
    // Fee withdrawal
    // ------------------------------------------------------------------

    function test_withdrawFee() public {
        vm.prank(alice);
        market.bet{value: 6 ether}(0);
        vm.prank(bob);
        market.bet{value: 4 ether}(1);

        vm.warp(deadline);
        market.resolve(0, _signResolve(0));

        uint256 feeBefore = feeRecipient.balance;
        vm.prank(feeRecipient);
        market.withdrawFee();

        // fee = 10 * 500 / 10000 = 0.5 ETH
        assertEq(feeRecipient.balance - feeBefore, 0.5 ether);
        assertTrue(market.feeWithdrawn());
    }

    function test_withdrawFee_revert_notRecipient() public {
        vm.prank(alice);
        market.bet{value: 1 ether}(0);

        vm.warp(deadline);
        market.resolve(0, _signResolve(0));

        vm.prank(alice);
        vm.expectRevert("Not fee recipient");
        market.withdrawFee();
    }

    function test_withdrawFee_revert_zeroWinnerPool() public {
        vm.prank(alice);
        market.bet{value: 1 ether}(1);

        vm.warp(deadline);
        market.resolve(0, _signResolve(0));

        vm.prank(feeRecipient);
        vm.expectRevert("No winners");
        market.withdrawFee();
    }

    function test_withdrawFee_revert_double() public {
        vm.prank(alice);
        market.bet{value: 1 ether}(0);

        vm.warp(deadline);
        market.resolve(0, _signResolve(0));

        vm.prank(feeRecipient);
        market.withdrawFee();

        vm.prank(feeRecipient);
        vm.expectRevert("Fee already withdrawn");
        market.withdrawFee();
    }

    // ------------------------------------------------------------------
    // getClaimable view
    // ------------------------------------------------------------------

    function test_getClaimable_normalPayout() public {
        vm.prank(alice);
        market.bet{value: 5 ether}(0);
        vm.prank(bob);
        market.bet{value: 5 ether}(1);

        vm.warp(deadline);
        market.resolve(0, _signResolve(0));

        // distributable = 10 - 0.5 = 9.5, alice has 100% of winner pool
        assertEq(market.getClaimable(alice), 9.5 ether);
        assertEq(market.getClaimable(bob), 0); // loser
    }

    function test_getClaimable_refund() public {
        vm.prank(alice);
        market.bet{value: 3 ether}(0);
        vm.prank(alice);
        market.bet{value: 2 ether}(1);

        market.cancel(_signCancel());

        assertEq(market.getClaimable(alice), 5 ether);
    }

    function test_getClaimable_afterClaim() public {
        vm.prank(alice);
        market.bet{value: 1 ether}(0);

        vm.warp(deadline);
        market.resolve(0, _signResolve(0));

        vm.prank(alice);
        market.claim();

        assertEq(market.getClaimable(alice), 0);
    }

    // ------------------------------------------------------------------
    // Factory
    // ------------------------------------------------------------------

    function test_factory_createMarket() public view {
        assertEq(factory.marketCount(), 1);
        assertEq(factory.markets(0), address(market));
    }

    function test_factory_revert_notOwner() public {
        string[] memory labels = new string[](2);
        labels[0] = "A";
        labels[1] = "B";

        vm.prank(alice);
        vm.expectRevert("Not owner");
        factory.createMarket("Test?", labels, block.timestamp + 2 days, 7 days);
    }

    function test_factory_revert_tooFewLabels() public {
        string[] memory labels = new string[](1);
        labels[0] = "A";

        vm.expectRevert("Invalid label count");
        factory.createMarket("Test?", labels, block.timestamp + 2 days, 7 days);
    }

    function test_factory_revert_deadlineTooSoon() public {
        string[] memory labels = new string[](2);
        labels[0] = "A";
        labels[1] = "B";

        vm.expectRevert("Deadline too soon");
        factory.createMarket("Test?", labels, block.timestamp + 30 minutes, 7 days);
    }
}
