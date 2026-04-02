// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract Market is ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    enum Status {
        Open,
        Resolved,
        Cancelled,
        Expired
    }

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    event BetPlaced(address indexed user, uint256 indexed outcomeIndex, uint256 amount);
    event MarketResolved(uint256 indexed winningOutcome);
    event MarketCancelled();
    event MarketExpired();
    event Claimed(address indexed user, uint256 payout);
    event FeeWithdrawn(uint256 amount);

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------

    Status public status;

    string public question;
    uint256 public immutable outcomeCount;
    uint256 public immutable deadline;
    uint256 public immutable gracePeriod;

    uint256 public winningOutcome;

    mapping(uint256 => uint256) public totalPerOutcome;
    mapping(address => mapping(uint256 => uint256)) public userBets;
    mapping(address => bool) public claimed;

    uint256 public totalPool;

    address public immutable signer;
    address public immutable feeRecipient;
    uint256 public immutable feeBps;

    bool public feeWithdrawn;

    // ------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------

    constructor(
        string memory _question,
        uint256 _outcomeCount,
        uint256 _deadline,
        uint256 _gracePeriod,
        address _signer,
        address _feeRecipient,
        uint256 _feeBps
    ) {
        require(_outcomeCount >= 2 && _outcomeCount <= 10, "Invalid outcome count");
        require(_deadline > block.timestamp, "Deadline in past");
        require(_signer != address(0), "Zero signer");
        require(_feeRecipient != address(0), "Zero fee recipient");
        require(_feeBps <= 1000, "Fee too high"); // max 10%

        question = _question;
        outcomeCount = _outcomeCount;
        deadline = _deadline;
        gracePeriod = _gracePeriod;
        signer = _signer;
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
        status = Status.Open;
    }

    // ------------------------------------------------------------------
    // Betting
    // ------------------------------------------------------------------

    function bet(uint256 outcomeIndex) external payable {
        require(status == Status.Open, "Market not open");
        require(block.timestamp < deadline, "Betting closed");
        require(msg.value >= 0.001 ether, "Bet too small");
        require(outcomeIndex < outcomeCount, "Invalid outcome");

        userBets[msg.sender][outcomeIndex] += msg.value;
        totalPerOutcome[outcomeIndex] += msg.value;
        totalPool += msg.value;

        emit BetPlaced(msg.sender, outcomeIndex, msg.value);
    }

    // ------------------------------------------------------------------
    // Resolution (oracle)
    // ------------------------------------------------------------------

    function resolve(uint256 _winningOutcome, bytes calldata signature) external {
        require(status == Status.Open, "Market not open");
        require(block.timestamp >= deadline, "Too early");
        require(_winningOutcome < outcomeCount, "Invalid outcome");

        bytes32 messageHash = keccak256(
            abi.encodePacked("resolve", block.chainid, address(this), _winningOutcome)
        );
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(signature);
        require(recovered == signer, "Invalid signature");

        status = Status.Resolved;
        winningOutcome = _winningOutcome;

        emit MarketResolved(_winningOutcome);
    }

    // ------------------------------------------------------------------
    // Cancellation (oracle)
    // ------------------------------------------------------------------

    function cancel(bytes calldata signature) external {
        require(status == Status.Open, "Market not open");

        bytes32 messageHash = keccak256(
            abi.encodePacked("cancel", block.chainid, address(this))
        );
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(signature);
        require(recovered == signer, "Invalid signature");

        status = Status.Cancelled;

        emit MarketCancelled();
    }

    // ------------------------------------------------------------------
    // Expiration (anyone, after grace period)
    // ------------------------------------------------------------------

    function expire() external {
        require(status == Status.Open, "Market not open");
        require(block.timestamp > deadline + gracePeriod, "Grace period active");

        status = Status.Expired;

        emit MarketExpired();
    }

    // ------------------------------------------------------------------
    // Claim
    // ------------------------------------------------------------------

    function claim() external nonReentrant {
        require(status != Status.Open, "Market still open");
        require(!claimed[msg.sender], "Already claimed");

        uint256 payout;

        if (status == Status.Resolved && totalPerOutcome[winningOutcome] > 0) {
            // Normal payout: proportional share of pool minus fee
            uint256 userBet = userBets[msg.sender][winningOutcome];
            require(userBet > 0, "No winning bet");

            uint256 fee = (totalPool * feeBps) / 10000;
            uint256 distributable = totalPool - fee;
            payout = (userBet * distributable) / totalPerOutcome[winningOutcome];
        } else {
            // Refund: cancelled, expired, or zero-winner resolved
            uint256 refund;
            for (uint256 i; i < outcomeCount; ++i) {
                refund += userBets[msg.sender][i];
            }
            require(refund > 0, "Nothing to claim");
            payout = refund;
        }

        claimed[msg.sender] = true;

        (bool success,) = msg.sender.call{value: payout}("");
        require(success, "ETH transfer failed");

        emit Claimed(msg.sender, payout);
    }

    // ------------------------------------------------------------------
    // Fee withdrawal
    // ------------------------------------------------------------------

    function withdrawFee() external nonReentrant {
        require(status == Status.Resolved, "Not resolved");
        require(totalPerOutcome[winningOutcome] > 0, "No winners");
        require(totalPool > 0, "Empty pool");
        require(msg.sender == feeRecipient, "Not fee recipient");
        require(!feeWithdrawn, "Fee already withdrawn");

        uint256 fee = (totalPool * feeBps) / 10000;

        feeWithdrawn = true;

        (bool success,) = feeRecipient.call{value: fee}("");
        require(success, "ETH transfer failed");

        emit FeeWithdrawn(fee);
    }

    // ------------------------------------------------------------------
    // View
    // ------------------------------------------------------------------

    function getClaimable(address user) external view returns (uint256) {
        if (status == Status.Open || claimed[user]) return 0;

        if (status == Status.Resolved && totalPerOutcome[winningOutcome] > 0) {
            uint256 userBet = userBets[user][winningOutcome];
            if (userBet == 0) return 0;

            uint256 fee = (totalPool * feeBps) / 10000;
            uint256 distributable = totalPool - fee;
            return (userBet * distributable) / totalPerOutcome[winningOutcome];
        }

        // Refund mode
        uint256 refund;
        for (uint256 i; i < outcomeCount; ++i) {
            refund += userBets[user][i];
        }
        return refund;
    }
}
