require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require('hardhat-contract-sizer');
require("hardhat-gas-reporter");
require("solidity-coverage");
require('hardhat-docgen');
require('dotenv').config();

const MAINNET_PRIVATE_KEY = process.env.MAINNET_PRIVATE_KEY || "";
const POLYGON_PRIVATE_KEY = process.env.POLYGON_PRIVATE_KEY || "";
const GNOSIS_PRIVATE_KEY = process.env.GNOSIS_PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";
const GNOSISSCAN_API_KEY = process.env.GNOSISSCAN_API_KEY || "";
const GOERLI_PRIVATE_KEY = process.env.GOERLI_PRIVATE_KEY || "";
const INFURA_API_KEY = process.env.INFURA_API_KEY || "";


// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const exportNetworks = {
  hardhat: {
  },
}
if (GOERLI_PRIVATE_KEY != "") {
  exportNetworks["goerli"] = {
    url: `https://goerli.infura.io/v3/${INFURA_API_KEY}`,
    accounts: [`${GOERLI_PRIVATE_KEY}`],
    // gasPrice: 7000000000
  }
}
if (MAINNET_PRIVATE_KEY != "") {
  exportNetworks["mainnet"] = {
    url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
    accounts: [`${MAINNET_PRIVATE_KEY}`]
  }
}
if (POLYGON_PRIVATE_KEY != "") {
  exportNetworks["polygon"] = {
    url: "https://polygon-bor-rpc.publicnode.com",
    accounts: [`${POLYGON_PRIVATE_KEY}`],
    gasPrice: 40000000000
  };
}
if (GNOSIS_PRIVATE_KEY != "") {
  exportNetworks["gnosis"] = {
    url: "https://gnosis.drpc.org",
    accounts: [`${GNOSIS_PRIVATE_KEY}`]
  };
}

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000000
          }
        }
      }
    ]
  },
  defaultNetwork: "hardhat",
  networks: exportNetworks,
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      polygon: POLYGONSCAN_API_KEY,
      gnosis: GNOSISSCAN_API_KEY,
    },
    customChains: [
      {
        network: "gnosis",
        chainId: 100,
        urls: {
          apiURL: "https://api.gnosisscan.io/api",
          browserURL: "https://gnosisscan.io/",
        },
      },
    ]
  },
  sourcify: {
    enabled: true
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
  },
  docgen: {
    path: './docs',
    clear: true,
    runOnCompile: true,
  }
};

