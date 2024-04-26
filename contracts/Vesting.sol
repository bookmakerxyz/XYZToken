// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Vesting is OwnableUpgradeable {
    using SafeERC20 for IERC20;

    struct AllocParams {
        address investor;
        uint128 vestAmount;
        uint64 lockupPeriod;
        uint64 vestingPeriod;
    }

    struct VestingParams {
        uint128 vestAmount; // amount of "vestedToken" that is already on vesting
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

    /// @notice Last vesting object ID (1-based)
    uint256 public lastVestingId;

    event Claimed(address indexed account, uint256 indexed id, uint256 amount);
    event VestingBeginSet(uint256 vestingBeginTime);
    event Allocated(address[] investors, uint256[] ids);

    error IncorrectVestingBegin();
    error IncorrectVestingPeriod();
    error ZeroAmount();
    error TimeChangeIsLocked();
    error VestingAlreadyStarted();
    error BeginIsNotSet();
    error NotApplicableForVestedToken();

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
        vestedToken.safeTransfer(account, totalAmount);
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
     * @notice Give vested token allocations to investors
     * @param allocParams Allocations parameters
     */
    function allocate(AllocParams[] calldata allocParams) external onlyOwner {
        _checkVestingBegin();
        uint256 totalAmount;
        uint256 lastId = lastVestingId;
        uint256 length = allocParams.length;
        AllocParams calldata params;
        VestingParams storage vesting;
        address[] memory investors = new address[](length);
        uint256[] memory ids = new uint256[](length);

        for (uint256 i = 0; i < length; ++i) {
            params = allocParams[i];
            if (params.vestAmount == 0) revert ZeroAmount();
            if (params.vestingPeriod == 0) revert IncorrectVestingPeriod();

            totalAmount += params.vestAmount;
            vesting = vestings[++lastId];
            vesting.vestAmount = params.vestAmount;
            vesting.lockupPeriod = params.lockupPeriod;
            vesting.vestingPeriod = params.vestingPeriod;

            vestingIds[params.investor].push(lastId);
            investors[i] = params.investor;
            ids[i] = lastId;
        }
        lastVestingId = lastId;
        emit Allocated(investors, ids);
        vestedToken.safeTransferFrom(msg.sender, address(this), totalAmount);
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
    ) public view returns (uint256 amount) {
        uint256[] memory ids = vestingIds[account];
        for (uint256 i = 0; i < ids.length; ++i) {
            VestingParams storage vestParams = vestings[ids[i]];
            amount += vestParams.vestAmount - vestParams.claimedAmount;
        }
    }

    /**
     * @notice Get amount of available for claim tokens in exact vesting object
     * @param vestingId ID of the vesting object
     * @return amount Amount of available tokens
     */
    function getAvailableBalance(
        uint256 vestingId
    ) public view returns (uint128 amount) {
        VestingParams storage vestParams = vestings[vestingId];
        uint256 userVestingBegin_ = vestingBegin + vestParams.lockupPeriod;
        uint256 userVestingEnd_ = userVestingBegin_ + vestParams.vestingPeriod;

        if (block.timestamp < userVestingBegin_ || vestingBegin == 0) {
            return 0;
        }

        if (block.timestamp >= userVestingEnd_) {
            amount = vestParams.vestAmount - vestParams.claimedAmount;
        } else {
            amount = uint128(
                (vestParams.vestAmount *
                    (block.timestamp - userVestingBegin_)) /
                    (userVestingEnd_ - userVestingBegin_) -
                    vestParams.claimedAmount
            );
        }
        return amount;
    }

    function _checkVestingBegin() internal view {
        if (vestingBegin > 0 && vestingBegin <= block.timestamp)
            revert VestingAlreadyStarted();
    }
}
