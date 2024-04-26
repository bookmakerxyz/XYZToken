const { BigNumber } = require("@ethersproject/bignumber");
const { expect } = require("chai");

const tokens = ethers.parseEther;
const TOKENS_001 = tokens("0.001");

async function expectTuple(txRes, ...args) {
  const [...results] = await txRes;

  results.forEach((element, index) => {
    if (index >= args.length) return;
    expect(element).to.eq(args[index]);
  });
}

function getTimeout(chainId) {
  let timeout;
  switch (chainId) {
    case "0x2a":
      timeout = 8000;
      break; // Kovan
    case "0x4d":
      timeout = 35000;
      break; // Sokol
    case "0x7a69":
      timeout = 800;
      break; // Hardhat
    default:
      timeout = 20000;
  }

  return () => {
    return new Promise((resolve) => setTimeout(resolve, timeout));
  };
}

async function timeShift(time) {
  await network.provider.send("evm_setNextBlockTimestamp", [time]);
  await network.provider.send("evm_mine");
}

async function timeShiftBy(ethers, timeDelta) {
  let time = (await getBlockTime(ethers)) + timeDelta;
  await network.provider.send("evm_setNextBlockTimestamp", [time]);
  await network.provider.send("evm_mine");
}

async function getBlockTime(ethers) {
  const blockNumBefore = await ethers.provider.getBlockNumber();
  const blockBefore = await ethers.provider.getBlock(blockNumBefore);
  const time = blockBefore.timestamp;
  return time;
}

function expectCloseTo(value, amountTo) {
  expect(value).to.be.closeTo(amountTo, TOKENS_001);
}

async function deployXYZToken(ethers, name, symbol) {
  const XYZToken = await ethers.getContractFactory("XYZToken");
  let token = await upgrades.deployProxy(XYZToken, [name, symbol], { initializer: "initialize" });
  await token.waitForDeployment();
  return token;
}

async function upgradeXYZToken(xyzTokenProxyAddress, Token) {
  let xyzToken = await upgrades.upgradeProxy(xyzTokenProxyAddress, Token);
  const xyzTokenImplAddress = await upgrades.erc1967.getImplementationAddress(xyzTokenProxyAddress);
  await xyzToken.waitForDeployment();
  return xyzTokenImplAddress;
}

async function deployVesting(ethers, tokenAddress, ownerAddress) {
  const VESTING = await ethers.getContractFactory("Vesting");
  let vesting = await upgrades.deployProxy(VESTING, [tokenAddress, ownerAddress], { initializer: "initialize" });
  await vesting.waitForDeployment();
  return vesting;
}

function initFixtureTree(provider) {
  let currentTestLayer = 0;

  function wrapLayer(fixture) {
    let myLayer = 0;
    let snapshotBefore = 0;
    let snapshotBeforeEach = 0;

    before(async () => {
      myLayer = ++currentTestLayer;
      snapshotBefore = await provider.send("evm_snapshot", []);
      await fixture();
    });

    beforeEach(async () => {
      if (currentTestLayer == myLayer) snapshotBeforeEach = await provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      if (currentTestLayer == myLayer) await provider.send("evm_revert", [snapshotBeforeEach]);
    });

    after(async () => {
      await provider.send("evm_revert", [snapshotBefore]);
      currentTestLayer--;
    });
  }

  return wrapLayer;
}

module.exports = {
  initFixtureTree,
  expectTuple,
  getTimeout,
  timeShift,
  timeShiftBy,
  getBlockTime,
  expectCloseTo,
  tokens,
  deployXYZToken,
  upgradeXYZToken,
  deployVesting,
};
