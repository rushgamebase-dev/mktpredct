# Solidity Spec — Rush Prediction Market (FINAL)

> Status: 10/10 — Ready to implement. Do NOT add features beyond this spec.

You are a senior Solidity engineer.

Your task is to implement a production-ready, minimal, and secure multi-outcome prediction market system for deployment on Base (EVM compatible).

This system MUST be deployable today. No overengineering.

---

## GOAL

Build a parimutuel prediction market system with:

- Multiple outcomes (2–10)
- 5% fee to dev wallet (only on resolved markets with winners)
- Oracle-based resolution (ECDSA signature with type prefix + chain ID)
- Full safety against stuck funds and edge cases
- State machine with 4 terminal states

---

## ARCHITECTURE

### 1. MarketFactory (single deploy)

Stores:

- `address public owner`
- `address public feeRecipient`
- `uint256 public feeBps = 500` (5%)
- `address public signer`

Function:

```solidity
createMarket(
    string calldata question,
    string[] calldata labels,
    uint256 deadline,
    uint256 gracePeriod
) external onlyOwner
```

REQUIRE:

- `labels.length >= 2 && labels.length <= 10`
- `deadline > block.timestamp + 1 hours`
- `gracePeriod >= 1 days`

Deploys Market contract. Emits:

```solidity
event MarketCreated(
    address indexed market,
    uint256 outcomeCount,
    string[] labels,
    uint256 deadline,
    uint256 gracePeriod
);
```

> Labels are stored ONLY in the event log for off-chain indexing. NOT in contract storage.

---

### 2. Market Contract

#### STATE

```solidity
enum Status { Open, Resolved, Cancelled, Expired }

Status public status;

string public question;
uint256 public outcomeCount;
uint256 public deadline;
uint256 public gracePeriod;

uint256 public winningOutcome;

mapping(uint256 => uint256) public totalPerOutcome;
mapping(address => mapping(uint256 => uint256)) public userBets;
mapping(address => bool) public claimed;

uint256 public totalPool;

address public signer;
address public feeRecipient;
uint256 public feeBps;

bool public feeWithdrawn;
```

#### CONSTRUCTOR

Set question, outcomeCount (from labels.length), deadline, gracePeriod, signer, feeRecipient, feeBps. Status = Open.

---

#### STATE MACHINE — Valid transitions

```
Open → Resolved    via resolve()   requires block.timestamp >= deadline + valid sig
Open → Cancelled   via cancel()    requires valid sig (can happen before deadline)
Open → Expired     via expire()    requires block.timestamp > deadline + gracePeriod

Resolved → (terminal)
Cancelled → (terminal)
Expired → (terminal)
```

No other transitions are valid. All mutation functions guard `status == Open`.

---

#### FUNCTIONS

##### 1. `bet(uint256 outcomeIndex) payable`

REQUIRE:
- `status == Open`
- `block.timestamp < deadline`
- `msg.value > 0`
- `outcomeIndex < outcomeCount`

EFFECT:
- `userBets[msg.sender][outcomeIndex] += msg.value`
- `totalPerOutcome[outcomeIndex] += msg.value`
- `totalPool += msg.value`

EMIT: `BetPlaced(msg.sender, outcomeIndex, msg.value)`

---

##### 2. `resolve(uint256 _winningOutcome, bytes calldata signature)`

REQUIRE:
- `status == Open`
- `block.timestamp >= deadline`
- `_winningOutcome < outcomeCount`

VERIFY SIGNATURE:
```solidity
bytes32 message = keccak256(
    abi.encodePacked("resolve", block.chainid, address(this), _winningOutcome)
);
```
Recover signer via ECDSA (use OpenZeppelin ECDSA.recover with toEthSignedMessageHash). Must match stored signer.

EFFECT:
- `status = Resolved`
- `winningOutcome = _winningOutcome`

EMIT: `MarketResolved(_winningOutcome)`

---

##### 3. `cancel(bytes calldata signature)`

REQUIRE:
- `status == Open`

VERIFY SIGNATURE:
```solidity
bytes32 message = keccak256(
    abi.encodePacked("cancel", block.chainid, address(this))
);
```
Recover signer via ECDSA. Must match stored signer.

EFFECT:
- `status = Cancelled`

EMIT: `MarketCancelled()`

> Note: cancel can happen BEFORE deadline (e.g. wrong question, event voided).

---

##### 4. `expire()`

REQUIRE:
- `status == Open`
- `block.timestamp > deadline + gracePeriod`

EFFECT:
- `status = Expired`

EMIT: `MarketExpired()`

> Callable by anyone. This is the fallback if oracle disappears.

---

##### 5. `claim()`

REQUIRE:
- `status != Open`
- `claimed[msg.sender] == false`

COMPUTE:

```
uint256 payout;

IF status == Resolved AND totalPerOutcome[winningOutcome] > 0:
    // Normal payout mode
    uint256 userBet = userBets[msg.sender][winningOutcome];
    require(userBet > 0);  // losers revert here

    uint256 fee = totalPool * feeBps / 10000;
    uint256 distributable = totalPool - fee;
    payout = (userBet * distributable) / totalPerOutcome[winningOutcome];

ELSE IF status == Resolved AND totalPerOutcome[winningOutcome] == 0:
    // Zero-winner refund mode — no fee
    uint256 refund = sum of userBets[msg.sender][i] for i in 0..outcomeCount-1
    require(refund > 0);
    payout = refund;

ELSE IF status == Cancelled OR status == Expired:
    // Full refund mode — no fee
    uint256 refund = sum of userBets[msg.sender][i] for i in 0..outcomeCount-1
    require(refund > 0);
    payout = refund;
```

> The loop is bounded by outcomeCount (max 10). Safe for gas.

EFFECT:
- `claimed[msg.sender] = true`

INTERACTION:
- Send ETH using `call{value: payout}("")`
- Require success

EMIT: `Claimed(msg.sender, payout)`

---

##### 6. `withdrawFee()`

REQUIRE:
- `status == Resolved`
- `totalPerOutcome[winningOutcome] > 0`
- `totalPool > 0`
- `msg.sender == feeRecipient`
- `feeWithdrawn == false`

COMPUTE:
- `fee = totalPool * feeBps / 10000`

EFFECT:
- `feeWithdrawn = true`

INTERACTION:
- Send fee to feeRecipient using `call`

EMIT: `FeeWithdrawn(fee)`

---

##### 7. `getClaimable(address user) external view returns (uint256)`

Returns the payout amount the user would receive if they called `claim()` now.
Returns 0 if:
- status is Open
- user already claimed
- user has no bets (or lost in normal resolution mode)

> This is a convenience view for the frontend. No state changes.

---

#### EVENTS

```solidity
event BetPlaced(address indexed user, uint256 indexed outcomeIndex, uint256 amount);
event MarketResolved(uint256 indexed winningOutcome);
event MarketCancelled();
event MarketExpired();
event Claimed(address indexed user, uint256 payout);
event FeeWithdrawn(uint256 amount);
```

---

## SECURITY REQUIREMENTS

- Use OpenZeppelin ReentrancyGuard on claim() and withdrawFee()
- Checks-Effects-Interactions pattern on ALL functions
- Prevent double claim via claimed mapping
- Prevent betting after deadline OR after status change
- Prevent resolving/cancelling more than once (status == Open guard)
- Strict signature verification with type prefix + chain ID
- Use call() for ALL ETH transfers, never transfer() or send()

---

## SIMPLICITY RULES

- ETH only — NO ERC20, NO ERC1155
- NO external dependencies beyond OpenZeppelin (ECDSA, ReentrancyGuard)
- NO price curves, NO orderbook, NO AMM
- NO unnecessary abstraction
- Clean, readable code

---

## DELIVERABLES

- `MarketFactory.sol`
- `Market.sol`
- Minimal interfaces if needed
- Clean, documented code
- Ready to compile and deploy on Base

---

## IMPORTANT

This must be minimal, safe, gas efficient, and deployable TODAY.
Do NOT add features beyond this specification.
Do NOT deviate from the state machine defined above.
