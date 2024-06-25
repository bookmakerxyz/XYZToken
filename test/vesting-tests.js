const { ethers } = require("hardhat");
const { expect } = require("chai");
const {
  getBlockTime,
  timeShiftBy,
  expectTuple,
  timeShift,
  initFixtureTree,
  expectCloseTo,
  tokens,
  deployXYZToken,
  deployVesting,
  calcAmounts,
} = require("../utils/utils");
const { BigNumber } = require("ethers");

describe("Vesting", () => {
  const wrapLayer = initFixtureTree(ethers.provider);

  let vesting, token, testToken;
  let owner, adr1, adr2, adr3, adr4;
  let alloc1, alloc2, alloc3, alloc4, alloc5;
  let vestingAddress, testTokenAddress;

  const MINUTE = 60;
  const HOUR = MINUTE * 60;
  const DAY = HOUR * 24;
  const YEAR = DAY * 365;

  const TOKENS_14500 = tokens("14500");
  const TOKENS_1000 = tokens("1000");
  const TOKENS_600 = tokens("600");
  const TOKENS_500 = tokens("500");
  const TOKENS_400 = tokens("400");
  const TOKENS_200 = tokens("200");
  const TOKENS_150 = tokens("150");
  const TOKENS_100 = tokens("100");
  const TOKENS_50 = tokens("50");
  const ZERO = tokens("0");
  const BN = BigInt;

  async function deploy() {
    [owner, adr1, adr2, adr3, adr4] = await ethers.getSigners();

    token = await deployXYZToken(ethers, "XYZToken", "XYZ");
    vesting = await deployVesting(ethers, await token.getAddress(), owner.address);
    vestingAddress = await vesting.getAddress();
    const TESTTOKEN = await ethers.getContractFactory("TestToken");
    testToken = await TESTTOKEN.deploy("TestToken", "TESTTOKEN");
    testTokenAddress = await testToken.getAddress();

    alloc1 = {
      investor: adr1.address,
      vestAmount: TOKENS_1000,
      lockupPeriod: DAY * 100,
      vestingPeriod: YEAR,
      instantShare: 0,
    };

    alloc2 = {
      investor: adr2.address,
      vestAmount: TOKENS_600,
      lockupPeriod: DAY * 50,
      vestingPeriod: DAY * 150,
      instantShare: 0,
    };

    alloc3 = {
      investor: adr1.address,
      vestAmount: TOKENS_500,
      lockupPeriod: DAY * 50,
      vestingPeriod: DAY * 200,
      instantShare: 0,
    };

    alloc4 = {
      investor: adr3.address,
      vestAmount: TOKENS_200,
      lockupPeriod: DAY * 50,
      vestingPeriod: DAY * 200,
      instantShare: 0,
    };

    alloc5 = {
      investor: adr4.address,
      vestAmount: TOKENS_200,
      lockupPeriod: DAY * 50,
      vestingPeriod: DAY * 200,
      instantShare: 0,
    };
  }

  wrapLayer(deploy);

  it("Should give allocations to investors by the owner", async () => {
    expect(await vesting.lastVestingId()).to.be.eq(0);
    const balanceBefore = await token.balanceOf(owner.address);
    const balanceVestingBefore = await token.balanceOf(vestingAddress);
    expect(await vesting.vestingCountOf(adr1.address)).to.be.eq(0);
    expect(await vesting.vestingCountOf(adr2.address)).to.be.eq(0);

    await token.approve(vestingAddress, tokens("2600"));
    await vesting.allocate([alloc1, alloc2, alloc3, alloc4, alloc5]);

    expect(await vesting.lastVestingId()).to.be.eq(5);
    expect(await vesting.vestingCountOf(adr1.address)).to.be.eq(2);
    expect(await vesting.vestingIdsOf(adr1.address)).to.eql([BN(1), BN(3)]);
    expect(await vesting.vestingCountOf(adr2.address)).to.be.eq(1);
    expect(await vesting.vestingIdsOf(adr2.address)).to.eql([BN(2)]);
    await expectTuple(await vesting.vestings(1), TOKENS_1000, 0, DAY * 100, YEAR);
    await expectTuple(await vesting.vestings(2), TOKENS_600, 0, DAY * 50, DAY * 150);
    await expectTuple(await vesting.vestings(3), TOKENS_500, 0, DAY * 50, DAY * 200);
    await expectTuple(await vesting.vestings(4), TOKENS_200, 0, DAY * 50, DAY * 200);
    await expectTuple(await vesting.vestings(5), TOKENS_200, 0, DAY * 50, DAY * 200);
    expect(await token.balanceOf(owner.address)).to.be.eq(balanceBefore - tokens("2500"));
    expect(await token.balanceOf(vestingAddress)).to.be.eq(balanceVestingBefore + tokens("2500"));
  });

  it("Should give allocations to investors by a maintainer", async () => {
    const balanceBefore = await token.balanceOf(owner.address);
    const balanceVestingBefore = await token.balanceOf(vestingAddress);
    expect(await vesting.vestingCountOf(adr1.address)).to.be.eq(0);

    await vesting.connect(owner).updateMaintainer(adr1.address, true);
    await token.connect(owner).transfer(adr1.address, TOKENS_1000);
    await token.connect(adr1).approve(vestingAddress, TOKENS_1000);
    await vesting.connect(adr1).allocate([alloc1]);

    expect(await vesting.lastVestingId()).to.be.eq(1);
    expect(await vesting.vestingCountOf(adr1.address)).to.be.eq(1);
    await expectTuple(await vesting.vestings(1), TOKENS_1000, 0, DAY * 100, YEAR);
    expect(await token.balanceOf(owner.address)).to.be.eq(balanceBefore - TOKENS_1000);
    expect(await token.balanceOf(vestingAddress)).to.be.eq(balanceVestingBefore + TOKENS_1000);

    // Remove maintenance
    await vesting.connect(owner).updateMaintainer(adr1.address, false);
    await expect(vesting.connect(adr1).allocate([alloc1])).to.be.revertedWithCustomError(vesting, "OnlyMaintainer");
  });

  it("Should allocate big array and claim", async () => {
    const allocArray = Array(100).fill(alloc1);
    await token.approve(vestingAddress, alloc1.vestAmount * 100n);
    await vesting.allocate(allocArray);
    expect(await vesting.lastVestingId()).to.be.eq(100);
    expect(await vesting.vestingCountOf(adr1.address)).to.be.eq(100);

    const time = (await getBlockTime(ethers)) + DAY;
    await vesting.setVestingBegin(time);

    await timeShiftBy(ethers, DAY * 200);
    await vesting.connect(adr1).claim(adr1.address);

    await timeShiftBy(ethers, YEAR);
    await vesting.connect(adr1).claim(adr1.address);
    expect(await vesting.getBalanceOf(adr1.address)).to.eq(0);
    expect(await token.balanceOf(adr1.address)).to.be.eq(alloc1.vestAmount * 100n);
  });

  it("Should revert wrong allocation params", async () => {
    await token.approve(vestingAddress, tokens("2000"));

    const badAlloc = {
      investor: adr1.address,
      vestAmount: 0,
      lockupPeriod: 0,
      vestingPeriod: 0,
      instantShare: 0,
    };

    await expect(vesting.allocate([badAlloc])).to.be.revertedWithCustomError(vesting, "ZeroAmount()");

    badAlloc.vestAmount = TOKENS_500;
    await expect(vesting.allocate([badAlloc])).to.be.revertedWithCustomError(vesting, "IncorrectVestingPeriod()");

    badAlloc.lockupPeriod = DAY * 50;
    await expect(vesting.allocate([badAlloc])).to.be.revertedWithCustomError(vesting, "IncorrectVestingPeriod()");

    badAlloc.vestingPeriod = 1;
    badAlloc.instantShare = 101;
    await expect(vesting.allocate([badAlloc])).to.be.revertedWithCustomError(vesting, "IncorrectInstantShare()");
  });

  it("Should set vesting begin time", async () => {
    expect(await vesting.vestingBegin()).to.be.eq(0);
    const time = (await getBlockTime(ethers)) + DAY;
    await vesting.setVestingBegin(time);
    expect(await vesting.vestingBegin()).to.be.eq(time);
  });

  it("Should revert setting begin time if function is locked", async () => {
    await vesting.setVestingBegin((await getBlockTime(ethers)) + DAY);
    await vesting.lockVestingBegin();
    await expect(vesting.setVestingBegin((await getBlockTime(ethers)) + DAY * 2)).to.be.revertedWithCustomError(
      vesting,
      "TimeChangeIsLocked()"
    );
  });

  it("Should revert setting lock flag if begin time is not set yet", async () => {
    await expect(vesting.lockVestingBegin()).to.be.revertedWithCustomError(vesting, "BeginIsNotSet()");
  });

  it("Should revert setting time if argument is less than current time", async () => {
    await expect(vesting.setVestingBegin((await getBlockTime(ethers)) - DAY)).to.be.revertedWithCustomError(
      vesting,
      "IncorrectVestingBegin()"
    );
  });

  it("Should revert setting the maintainer's status to the previous state", async () => {
    await expect(vesting.updateMaintainer(adr1.address, false)).to.be.revertedWithCustomError(
      vesting,
      "NothingChanged"
    );

    await vesting.updateMaintainer(adr1.address, true);
    await expect(vesting.updateMaintainer(adr1.address, true)).to.be.revertedWithCustomError(vesting, "NothingChanged");
  });

  it("Checks restricted access", async () => {
    await expect(vesting.connect(adr1).lockVestingBegin())
      .to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount")
      .withArgs(adr1.address);
    await expect(vesting.connect(adr1).setVestingBegin(0))
      .to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount")
      .withArgs(adr1.address);
    await expect(vesting.connect(adr1).allocate([alloc1])).to.be.revertedWithCustomError(vesting, "OnlyMaintainer");
    await expect(vesting.connect(adr1).withdraw(testTokenAddress, adr1.address))
      .to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount")
      .withArgs(adr1.address);
    await expect(vesting.connect(adr1).updateMaintainer(adr1.address, true))
      .to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount")
      .withArgs(adr1.address);
  });

  context("Allocated", () => {
    async function allocate() {
      await token.approve(vestingAddress, tokens("2600"));
      await vesting.allocate([alloc1, alloc2, alloc3, alloc4, alloc5]);
    }

    wrapLayer(allocate);

    it("Should withdraw accidentally received tokens for owner", async () => {
      await testToken.connect(owner).mint(owner.address, TOKENS_14500);
      await testToken.connect(owner).transfer(vestingAddress, TOKENS_14500);

      const balanceBefore = await testToken.balanceOf(owner.address);
      await vesting.withdraw(testTokenAddress, owner.address);
      expect(await testToken.balanceOf(owner.address)).to.be.eq(balanceBefore + TOKENS_14500);
      expect(await testToken.balanceOf(vestingAddress)).to.be.eq(0);
    });

    it("Should revert empty withdraw", async () => {
      await expect(vesting.withdraw(testTokenAddress, owner.address)).to.be.revertedWithCustomError(
        vesting,
        "ZeroAmount()"
      );
    });

    context("Vesting begin set", () => {
      let beginTime;

      async function vestingBegin() {
        beginTime = (await getBlockTime(ethers)) + DAY;
        await vesting.setVestingBegin(beginTime);
      }

      wrapLayer(vestingBegin);

      it("Should revert setting time if vesting started", async () => {
        await timeShiftBy(ethers, DAY * 2);
        await expect(vesting.setVestingBegin((await getBlockTime(ethers)) + DAY)).to.be.revertedWithCustomError(
          vesting,
          "VestingAlreadyStarted()"
        );
      });

      context("Claim tokens", () => {
        it("Should claim unlocked tokens", async () => {
          await timeShiftBy(ethers, DAY * 60);
          const balanceBefore1 = await token.balanceOf(adr1.address);
          const balanceBefore2 = await token.balanceOf(adr2.address);
          const balanceBefore3 = await token.balanceOf(adr3.address);
          await vesting.connect(adr1).claim(adr1.address);
          await vesting.connect(adr3).claim(adr2.address);
          await vesting.connect(adr2).claim(adr3.address);
          expect(await token.balanceOf(adr1.address)).to.be.gt(balanceBefore1);
          expect(await token.balanceOf(adr2.address)).to.be.gt(balanceBefore2);
          expect(await token.balanceOf(adr3.address)).to.be.gt(balanceBefore3);
        });

        it("Should revert empty claim", async () => {
          await timeShiftBy(ethers, YEAR * 2);
          await vesting.connect(adr1).claim(adr1.address);
          await expect(vesting.connect(adr1).claim(adr1.address)).to.be.revertedWithCustomError(
            vesting,
            "ZeroAmount()"
          );
        });

        it("Should claim tokens according to formula and check votes", async () => {
          const balanceBefore = await token.balanceOf(adr2.address);
          const balanceVestingBefore = await token.balanceOf(vestingAddress);

          // vesting start - no tokens available
          await timeShift(beginTime);
          await expect(vesting.connect(adr2).claim(adr2.address)).to.be.revertedWithCustomError(
            vesting,
            "ZeroAmount()"
          );

          // passing unlock (1/4 of full vesting time)
          await timeShiftBy(ethers, DAY * 50);
          expect(await vesting.getBalanceOf(adr2.address)).to.eq(TOKENS_600);
          // 1/4 of time passed => unlocked, but no amount available
          expectCloseTo(await vesting.getAvailableBalanceOf(adr2.address), ZERO);
          await vesting.connect(adr2).claim(adr2.address);

          expectCloseTo(await token.balanceOf(adr2.address), balanceBefore);
          expectCloseTo(await token.balanceOf(vestingAddress), balanceVestingBefore);
          expectCloseTo(await vesting.getBalanceOf(adr2.address), TOKENS_600);
          expect(await vesting.getAvailableBalanceOf(adr2.address)).to.eq(0);

          // more time passed (3/4 of full vesting time)
          await timeShiftBy(ethers, DAY * 100);
          expectCloseTo(await vesting.getBalanceOf(adr2.address), TOKENS_600);
          // 3/4 of time passed => 2/3 of amount available
          expectCloseTo(await vesting.getAvailableBalanceOf(adr2.address), TOKENS_400);
          await vesting.connect(adr2).claim(adr2.address);

          expectCloseTo(await token.balanceOf(adr2.address), balanceBefore + TOKENS_400);
          expectCloseTo(await token.balanceOf(vestingAddress), balanceVestingBefore - TOKENS_400);
          expectCloseTo(await vesting.getBalanceOf(adr2.address), TOKENS_200);
          expect(await vesting.getAvailableBalanceOf(adr2.address)).to.eq(0);

          // all time passed
          await timeShiftBy(ethers, DAY * 200);
          expectCloseTo(await vesting.getBalanceOf(adr2.address), TOKENS_200);
          // all remaining amount available
          expectCloseTo(await vesting.getAvailableBalanceOf(adr2.address), TOKENS_200);
          await vesting.connect(adr2).claim(adr2.address);

          expect(await token.balanceOf(adr2.address)).to.be.eq(balanceBefore + TOKENS_600);
          expect(await token.balanceOf(vestingAddress)).to.be.eq(balanceVestingBefore - TOKENS_600);
          expect(await vesting.getBalanceOf(adr2.address)).to.be.eq(0);
          expect(await vesting.getAvailableBalanceOf(adr2.address)).to.eq(0);
        });

        it("Calculate claim amount correctly in mid-vesting", async () => {
          const balanceBefore = await token.balanceOf(adr4.address);
          const balanceVestingBefore = await token.balanceOf(vestingAddress);

          // vesting start - no tokens available
          await timeShift(beginTime);
          await expect(vesting.connect(adr4).claim(adr4.address)).to.be.revertedWithCustomError(
            vesting,
            "ZeroAmount()"
          );

          // passing unlock (1/5 of full vesting time)
          await timeShiftBy(ethers, DAY * 50);
          expect(await vesting.getBalanceOf(adr4.address)).to.eq(TOKENS_200);
          // 1/5 of time passed => unlocked, but no amount available
          expectCloseTo(await vesting.getAvailableBalanceOf(adr4.address), ZERO);
          await vesting.connect(adr4).claim(adr4.address);

          expectCloseTo(await token.balanceOf(adr4.address), balanceBefore);
          expectCloseTo(await token.balanceOf(vestingAddress), balanceVestingBefore);
          expectCloseTo(await vesting.getBalanceOf(adr4.address), TOKENS_200);
          expect(await vesting.getAvailableBalanceOf(adr4.address)).to.eq(0);

          // more time passed (2/5 of full vesting time)
          await timeShiftBy(ethers, DAY * 50);
          expectCloseTo(await vesting.getBalanceOf(adr4.address), TOKENS_200);
          // 2/5 of time passed => 1/4 of amount available
          expectCloseTo(await vesting.getAvailableBalanceOf(adr4.address), TOKENS_50);
          await vesting.connect(adr4).claim(adr4.address);

          expectCloseTo(await token.balanceOf(adr4.address), balanceBefore + TOKENS_50);
          expectCloseTo(await token.balanceOf(vestingAddress), balanceVestingBefore - TOKENS_50);
          expectCloseTo(await vesting.getBalanceOf(adr4.address), TOKENS_150);
          expect(await vesting.getAvailableBalanceOf(adr4.address)).to.eq(0);

          // more time passed (3/5 of full vesting time)
          await timeShiftBy(ethers, DAY * 50);
          expectCloseTo(await vesting.getBalanceOf(adr4.address), TOKENS_150);

          // 3/5 of time passed => (2/4 - claimed) of amount available
          expectCloseTo(await vesting.getAvailableBalanceOf(adr4.address), TOKENS_50);
          expectCloseTo(await vesting.getBalanceOf(adr4.address), TOKENS_150);

          // 3/5 of time passed => 50 (from earlier) + 100*1/2 of amount available
          expectCloseTo(await vesting.getAvailableBalanceOf(adr4.address), TOKENS_50);
          await vesting.connect(adr4).claim(adr4.address);

          expectCloseTo(await token.balanceOf(adr4.address), balanceBefore + TOKENS_100);
          expectCloseTo(await token.balanceOf(vestingAddress), balanceVestingBefore - TOKENS_100);
          expectCloseTo(await vesting.getBalanceOf(adr4.address), TOKENS_100);
          expect(await vesting.getAvailableBalanceOf(adr4.address)).to.eq(0);

          // all time passed
          await timeShiftBy(ethers, DAY * 200);
          expectCloseTo(await vesting.getBalanceOf(adr4.address), TOKENS_100);
          // all remaining amount available
          expectCloseTo(await vesting.getAvailableBalanceOf(adr4.address), TOKENS_100);
          await vesting.connect(adr4).claim(adr4.address);

          expect(await token.balanceOf(adr4.address)).to.be.eq(balanceBefore + TOKENS_200);
          expect(await token.balanceOf(vestingAddress)).to.be.eq(balanceVestingBefore - TOKENS_200);
          expect(await vesting.getBalanceOf(adr4.address)).to.be.eq(0);
          expect(await vesting.getAvailableBalanceOf(adr4.address)).to.eq(0);
        });
      });
    });
  });
  context("Allocated with instant vesting", () => {
    async function allocateAndBegin() {
      await token.approve(vestingAddress, tokens("2600"));
      alloc1.instantShare = 90n;
      alloc2.instantShare = 70n;
      alloc3.instantShare = 100n;
      alloc4.instantShare = 10n;
      alloc5.instantShare = 0n;
      await vesting.allocate([alloc1, alloc2, alloc3, alloc4, alloc5]);

      let { instantAmount, vestAmount } = calcAmounts(alloc1.vestAmount, alloc1.instantShare);
      await expectTuple(
        await vesting.vestings(1),
        vestAmount,
        instantAmount,
        alloc1.lockupPeriod,
        alloc1.vestingPeriod
      );

      beginTime = (await getBlockTime(ethers)) + MINUTE;
      await vesting.setVestingBegin(beginTime);
    }

    wrapLayer(allocateAndBegin);
    it("vesting stsart, get instant payouts vesting pass, get the rest of all vested amounts", async () => {
      const balanceBefore1 = await token.balanceOf(adr1.address);
      const balanceBefore2 = await token.balanceOf(adr2.address);
      const balanceBefore3 = await token.balanceOf(adr3.address);
      const balanceBefore4 = await token.balanceOf(adr4.address);
      await timeShiftBy(ethers, DAY * 50 + MINUTE);

      await vesting.connect(adr2).claim(adr2.address);
      await vesting.connect(adr3).claim(adr3.address);
      await vesting.connect(adr4).claim(adr4.address);

      let Adr2Instant = (alloc2.vestAmount * BigInt(alloc2.instantShare)) / 100n;
      let Adr3Instant = (alloc4.vestAmount * BigInt(alloc4.instantShare)) / 100n;
      let Adr4Instant = (alloc5.vestAmount * BigInt(alloc5.instantShare)) / 100n;

      expect(await token.balanceOf(adr2.address)).to.be.gt(balanceBefore2 + Adr2Instant);
      expect(await token.balanceOf(adr3.address)).to.be.gt(balanceBefore3 + Adr3Instant);
      expect(await token.balanceOf(adr4.address)).to.be.gt(balanceBefore4 + Adr4Instant);

      // Allocation #2 pass rest of the time of lockup + vesting period
      await timeShiftBy(ethers, DAY * 200);

      await vesting.connect(adr2).claim(adr2.address);
      expect(await token.balanceOf(adr2.address)).to.be.eq(balanceBefore2 + alloc2.vestAmount);

      // Allocation #4, #5 pass rest of the time of lockup + vesting period
      await timeShiftBy(ethers, DAY * 50);
      await vesting.connect(adr3).claim(adr3.address);
      await vesting.connect(adr4).claim(adr4.address);

      expect(await token.balanceOf(adr3.address)).to.be.eq(balanceBefore3 + alloc4.vestAmount);
      expect(await token.balanceOf(adr4.address)).to.be.eq(balanceBefore4 + alloc5.vestAmount);

      // Allocation #1 pass 465 of lockup 100 + vesting period 365
      // already passed 250, so pass 215 = 465 - 250
      await timeShiftBy(ethers, DAY * 215);
      await vesting.connect(adr1).claim(adr1.address);
      expect(await token.balanceOf(adr1.address)).to.be.eq(balanceBefore1 + alloc1.vestAmount + alloc3.vestAmount);

      // all claimed
      expect(await vesting.getAvailableBalanceOf(adr1.address)).to.be.eq(0);
      expect(await vesting.getAvailableBalanceOf(adr2.address)).to.be.eq(0);
      expect(await vesting.getAvailableBalanceOf(adr3.address)).to.be.eq(0);
      expect(await vesting.getAvailableBalanceOf(adr4.address)).to.be.eq(0);
    });
  });
});
