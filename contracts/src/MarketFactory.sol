// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Market} from "./Market.sol";

contract MarketFactory {
    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    event MarketCreated(
        address indexed market,
        uint256 outcomeCount,
        string[] labels,
        uint256 deadline,
        uint256 gracePeriod
    );

    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------

    address public owner;
    address public feeRecipient;
    uint256 public feeBps;
    address public signer;

    address[] public markets;

    // ------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------

    constructor(address _feeRecipient, address _signer, uint256 _feeBps) {
        require(_feeRecipient != address(0), "Zero fee recipient");
        require(_signer != address(0), "Zero signer");
        require(_feeBps <= 1000, "Fee too high");

        owner = msg.sender;
        feeRecipient = _feeRecipient;
        signer = _signer;
        feeBps = _feeBps;
    }

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ------------------------------------------------------------------
    // Market creation
    // ------------------------------------------------------------------

    function createMarket(
        string calldata question,
        string[] calldata labels,
        uint256 deadline,
        uint256 gracePeriod
    ) external onlyOwner returns (address) {
        require(labels.length >= 2 && labels.length <= 10, "Invalid label count");
        require(deadline > block.timestamp + 1 hours, "Deadline too soon");
        require(gracePeriod >= 1 days, "Grace period too short");

        Market market = new Market(
            question,
            labels.length,
            deadline,
            gracePeriod,
            signer,
            feeRecipient,
            feeBps
        );

        address marketAddr = address(market);
        markets.push(marketAddr);

        emit MarketCreated(marketAddr, labels.length, labels, deadline, gracePeriod);

        return marketAddr;
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    function setSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "Zero signer");
        emit SignerUpdated(signer, _signer);
        signer = _signer;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Zero fee recipient");
        emit FeeRecipientUpdated(feeRecipient, _feeRecipient);
        feeRecipient = _feeRecipient;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function marketCount() external view returns (uint256) {
        return markets.length;
    }
}
