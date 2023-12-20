/**
 * @type import('hardhat/config').HardhatUserConfig
 */

require("dotenv").config()
require('solidity-coverage');
require("@nomicfoundation/hardhat-chai-matchers")


const { API_URL, PRIVATE_KEY } = process.env

module.exports = {
  solidity: "0.8.19",
  defaultNetwork: "sepolia",
  networks: {
    hardhat: {
    },
    sepolia: {
      url: API_URL,
      accounts: [PRIVATE_KEY],
    },
    goerli: {
      url: 'https://ethereum-goerli.publicnode.com',
      accounts: [PRIVATE_KEY],
    },
  },
}
