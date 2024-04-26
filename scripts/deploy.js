const { ethers } = require("hardhat");
const { deployXYZToken, getTimeout, deployVesting } = require("../utils/utils");
require("dotenv").config();

async function main() {
  const chainId = await network.provider.send("eth_chainId");
  const timeout = getTimeout(chainId);

  const [owner] = await ethers.getSigners();

  // ** ENV *** ENV **
  const OWNER = process.env.OWNER;
  // ** ENV *** ENV **

  const token = await deployXYZToken(ethers, "Bookmaker.xyz", "XYZ");
  let tokenAddress = await token.getAddress();
  await timeout();
  console.log("Token deployed to:", tokenAddress);

  console.log(
    "Minted. Owner balance:",
    await token.balanceOf(owner.address),
    await token.decimals(),
    await token.symbol()
  );

  const vesting = await deployVesting(ethers, tokenAddress, owner.address);
  await timeout();
  console.log("Vesting deployed to:", await vesting.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
