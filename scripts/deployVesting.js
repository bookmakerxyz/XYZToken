const { ethers } = require("hardhat");
const { getTimeout, deployVesting } = require("../utils/utils");
require("dotenv").config();

async function main() {
  const chainId = await network.provider.send("eth_chainId");
  const timeout = getTimeout(chainId);

  // ** ENV *** ENV **
  const OWNER = process.env.OWNER;
  const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
  // ** ENV *** ENV **

  const vesting = await deployVesting(ethers, TOKEN_ADDRESS, OWNER);
  await timeout();
  console.log("Vesting deployed to:", await vesting.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
