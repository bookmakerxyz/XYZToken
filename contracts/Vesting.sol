// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Vesting is OwnableUpgradeable {
    struct AllocParams {
        address investor;
        uint128 vestAmount;
        uint64 lockupPeriod;
        uint64 vestingPeriod;
        uint64 instantShare; // 0-100% share of vestAmount tokens to be instantly vested
    }

    struct VestingParams {
        uint128 vestAmount; // amount of "vestedToken" that is already on vesting
        uint128 instantVestAmount; // amount of token to be instant vested
        uint64 lockupPeriod; // period of time in seconds during which tokens cannot be claimed
        uint64 vestingPeriod; // time period of linear tokens unlock
        uint128 claimedAmount; // counter of already claimed vested tokens
    }

    /// @notice Vested token contract
    IERC20 public vestedToken;

    /// @notice True if vesting begin time cannot be changed
    bool public vestingBeginIsLocked;

    /// @notice Timestamp of the overall vesting begin time
    uint64 public vestingBegin;

    /// @notice Mapping of IDs to vesting params
    mapping(uint256 => VestingParams) public vestings;

    /// @notice Mapping of addresses to lists of their vesting IDs
    mapping(address => uint256[]) public vestingIds;

    /// @notice Mapping of addresses to boolean values indicates that it can maintain allocations
    mapping(address => bool) public maintainers;

    /// @notice Last vesting object ID (1-based)
    uint256 public lastVestingId;

    event Claimed(address indexed account, uint256 indexed id, uint256 amount);
    event MaintainerUpdated(address indexed account, bool isMaintainer);
    event VestingBeginSet(uint256 vestingBeginTime);
    event Allocated(
        address indexed allocator,
        address[] investors,
        uint256[] ids
    );

    error IncorrectVestingBegin();
    error IncorrectVestingPeriod();
    error ZeroAmount();
    error TimeChangeIsLocked();
    error VestingAlreadyStarted();
    error BeginIsNotSet();
    error NotApplicableForVestedToken();
    error IncorrectInstantShare();
    error NothingChanged();
    error OnlyMaintainer();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Contract constructor
     * @param vestedToken_ Address of the vested token contract
     * @param owner_ Address of initial owner
     */
    function initialize(
        address vestedToken_,
        address owner_
    ) external initializer {
        __Ownable_init(owner_);
        vestedToken = IERC20(vestedToken_);
    }

    // USER FUNCTIONS

    /**
     * @notice Claim all available vested tokens for account
     * @param account Address to claim tokens for
     */
    function claim(address account) external {
        uint256 totalAmount;
        uint256[] storage ids = vestingIds[account];
        uint256 length = ids.length;
        uint256 id;
        uint128 amount;
        for (uint256 i = 0; i < length; ++i) {
            id = ids[i];
            amount = getAvailableBalance(id);
            if (amount > 0) {
                totalAmount += amount;
                vestings[id].claimedAmount += amount;
                emit Claimed(account, id, amount);
            }
        }
        if (totalAmount == 0) revert ZeroAmount();
        vestedToken.transfer(account, totalAmount);
    }

    // RESTRICTED FUNCTIONS

    /**
     * @notice Lock changing of vesting begin time
     */
    function lockVestingBegin() external onlyOwner {
        if (vestingBegin == 0) revert BeginIsNotSet();
        vestingBeginIsLocked = true;
    }

    /**
     * @notice Change vesting begin time
     * @param vestingBegin_ Timestamp of new time
     */
    function setVestingBegin(uint64 vestingBegin_) external onlyOwner {
        if (vestingBeginIsLocked) revert TimeChangeIsLocked();
        _checkVestingBegin();
        if (vestingBegin_ <= block.timestamp) revert IncorrectVestingBegin();
        vestingBegin = vestingBegin_;
        emit VestingBeginSet(vestingBegin_);
    }

    /**
     * @notice Updates the maintainer status of an account.
     */
    function updateMaintainer(
        address account,
        bool isMaintainer
    ) external onlyOwner {
        if (maintainers[account] == isMaintainer) revert NothingChanged();
        maintainers[account] = isMaintainer;
        emit MaintainerUpdated(account, isMaintainer);
    }

    /**
     * @notice Give vested token allocations to investors
     * @param allocParams Allocations parameters
     */
    function allocate(AllocParams[] calldata allocParams) external {
        if (msg.sender != owner() && !maintainers[msg.sender])
            revert OnlyMaintainer();

        uint256 totalAmount;
        uint256 lastId = lastVestingId;
        uint256 length = allocParams.length;
        AllocParams calldata params;
        VestingParams storage vesting;
        address[] memory investors = new address[](length);
        uint256[] memory ids = new uint256[](length);
        uint128 instantVestAmount_;
        uint128 vestAmount_;

        for (uint256 i = 0; i < length; ++i) {
            params = allocParams[i];
            if (params.vestAmount == 0) revert ZeroAmount();
            if (params.vestingPeriod == 0) revert IncorrectVestingPeriod();
            if (params.instantShare > 100) revert IncorrectInstantShare();

            totalAmount += params.vestAmount;
            vesting = vestings[++lastId];

            instantVestAmount_ = (params.instantShare == 0)
                ? 0
                : ((params.vestAmount * params.instantShare) / 100);
            vestAmount_ = params.vestAmount - instantVestAmount_;

            vesting.vestAmount = vestAmount_;
            vesting.instantVestAmount = instantVestAmount_;
            vesting.lockupPeriod = params.lockupPeriod;
            vesting.vestingPeriod = params.vestingPeriod;

            vestingIds[params.investor].push(lastId);
            investors[i] = params.investor;
            ids[i] = lastId;
        }
        lastVestingId = lastId;
        emit Allocated(msg.sender, investors, ids);
        vestedToken.transferFrom(msg.sender, address(this), totalAmount);
    }

    /**
     * @notice Withdraw accidentally received tokens of the contract to given address
     * @param to Destination address
     */
    function withdraw(address token, address to) external onlyOwner {
        if (token == address(vestedToken)) revert NotApplicableForVestedToken();

        uint256 amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) revert ZeroAmount();
        SafeERC20.safeTransfer(IERC20(token), to, amount);
    }

    // VIEW

    /**
     * @notice Get total amount of available for claim tokens for account
     * @param account Account to calculate amount for
     * @return amount Total amount of available tokens
     */
    function getAvailableBalanceOf(
        address account
    ) external view returns (uint256 amount) {
        uint256[] memory ids = vestingIds[account];
        uint256 length = ids.length;
        for (uint256 i = 0; i < length; ++i) {
            amount += getAvailableBalance(ids[i]);
        }
    }

    /**
     * @notice Get amount of vesting objects for account
     * @param account Address of account
     * @return Amount of vesting objects
     */
    function vestingCountOf(address account) external view returns (uint256) {
        return vestingIds[account].length;
    }

    /**
     * @notice Get array of vesting objects IDs for account
     * @param account Address of account
     * @return Array of vesting objects IDs
     */
    function vestingIdsOf(
        address account
    ) external view returns (uint256[] memory) {
        return vestingIds[account];
    }

    /**
     * @notice Get total amount tokens for claim in future
     * @param account Account to calculate amount for
     * @return amount Total amount of tokens
     */
    function getBalanceOf(
        address account
    ) external view returns (uint256 amount) {
        uint256[] memory ids = vestingIds[account];
        VestingParams storage vestParams;
        for (uint256 i = 0; i < ids.length; ++i) {
            vestParams = vestings[ids[i]];
            amount +=
                vestParams.vestAmount +
                vestParams.instantVestAmount -
                vestParams.claimedAmount;
        }
    }

    /**
     * @notice Get amount of available for claim tokens in exact vesting object
     *         Instant vested tokens available after user lockup (vestingBegin + lockupPeriod) passed
     * @param vestingId ID of the vesting object
     * @return amount Amount of available tokens
     */
    function getAvailableBalance(
        uint256 vestingId
    ) public view returns (uint128 amount) {
        if (vestingBegin == 0) return 0;

        VestingParams storage vestParams = vestings[vestingId];
        uint256 userVestingBegin_ = vestingBegin + vestParams.lockupPeriod;
        if (block.timestamp < userVestingBegin_) return 0;

        uint256 userVestingEnd_ = userVestingBegin_ + vestParams.vestingPeriod;
        uint128 instantVestAmount_ = vestParams.instantVestAmount;
        uint128 vestAmount_ = vestParams.vestAmount;
        uint128 claimedAmount_ = vestParams.claimedAmount;

        amount =
            (
                (block.timestamp < userVestingEnd_)
                    ? uint128(
                        (vestAmount_ * (block.timestamp - userVestingBegin_)) /
                            (userVestingEnd_ - userVestingBegin_)
                    )
                    : vestAmount_
            ) +
            instantVestAmount_ -
            claimedAmount_;
    }

    function _checkVestingBegin() internal view {
        if (vestingBegin > 0 && vestingBegin <= block.timestamp)
            revert VestingAlreadyStarted();
    }
}
