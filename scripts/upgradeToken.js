const { ethers } = require("hardhat");
const { getTimeout, upgradeXYZToken } = require("../utils/utils");
require("dotenv").config();

async function main() {
  // ** ENV *** ENV **
  const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
  // ** ENV *** ENV **

  const chainId = await network.provider.send("eth_chainId");
  const timeout = getTimeout(chainId);

  const XYZToken = await ethers.getContractFactory("XYZToken");
  let xyzTokenImplementationAddress = await upgradeXYZToken(TOKEN_ADDRESS, XYZToken);
  await timeout();

  console.log("XYZToken new implementation address", xyzTokenImplementationAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
