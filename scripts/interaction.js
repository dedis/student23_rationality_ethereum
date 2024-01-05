const contract = require("../artifacts/contracts/Bribery.sol/Bribery.json")

const PRIVATE_KEY = process.env.PRIVATE_KEY
const CONTRACT_ADDRESS = "0x99aa73da6309b8ec484ef2c95e96c131c1bbf7a0";
// const provider = ethers.getDefaultProvider("hardhat");

var myContract;
function listenForNewColluders() {
    console.log("Listening for new colluders...");
    myContract.on("NewColluder", console.log("New colluder"));
}

async function main() {
    myContract = await hre.ethers.getContractAt("Bribery", CONTRACT_ADDRESS);

    await myContract.commit("12345678", "0xsignature", { value: 0 })
}

main()