const { ethers } = require("hardhat");
const { deployXYZToken, getTimeout, deployVesting } = require("../utils/utils");
require("dotenv").config();

async function main() {
  const chainId = await network.provider.send("eth_chainId");
  const timeout = getTimeout(chainId);

  // ** ENV *** ENV **
  const OWNER = process.env.OWNER;
  // ** ENV *** ENV **

  const token = await deployXYZToken(ethers, "XYZToken", "XYZ");
  let tokenAddress = await token.getAddress();
  await timeout();
  console.log("Token deployed to:", tokenAddress);

  console.log("Minted. Owner balance:", await token.balanceOf(OWNER), await token.decimals(), await token.symbol());

  const vesting = await deployVesting(ethers, tokenAddress, OWNER);
  await timeout();
  console.log("Vesting deployed to:", await vesting.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
