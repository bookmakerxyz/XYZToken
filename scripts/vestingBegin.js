const { ethers } = require("hardhat");
const { getTimeout } = require("../utils/utils");
const { BigNumber } = require("ethers");

require("dotenv").config();

async function main() {
  const chainId = await network.provider.send("eth_chainId");
  const timeout = getTimeout(chainId);
  const [owner] = await ethers.getSigners();

  // %%% ENV %%% ENV %%% ENV %%%
  const VESTING_ADDRESS = process.env.VESTING_ADDRESS ?? "";
  const VESTING_BEGIN_TIME = process.env.VESTING_BEGIN_TIME ?? "";
  // %%% ENV %%% ENV %%% ENV %%%

  const Vesting = await ethers.getContractFactory("Vesting");
  const vesting = Vesting.attach(VESTING_ADDRESS);
  console.log("Vesting attached to:", await vesting.getAddress());

  await vesting.connect(owner).setVestingBegin(VESTING_BEGIN_TIME);
  await timeout();
  console.log("Vesting begins at", VESTING_BEGIN_TIME);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
