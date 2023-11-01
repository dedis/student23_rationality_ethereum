require("dotenv").config();

require("node-fetch");

const API_URL = process.env.API_URL
const PRIVATE_KEY = process.env.PRIVATE_KEY
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS
const BEACON_API_KEY = process.env.BEACON_API_KEY

/**
 * JSON object representing the compiled Bribery contract.
 * @type {Object}
 */
const contract = require("../artifacts/contracts/Bribery.sol/Bribery.json")

/**
 * Creates a new provider object using the sepolia network.
 * @type {ethers.providers.JsonRpcProvider}
*/
const provider = new ethers.providers.JsonRpcProvider(API_URL);
// uncomment the following line to use the default provider for sepolia
// const provider = ethers.getDefaultProvider("sepolia");


/**
 * Creates a new instance of ethers.Wallet using the provided private key and provider.
 * @param {string} PRIVATE_KEY - The private key to use for signing transactions.
 * @param {object} provider - The provider to use for interacting with the Ethereum network.
 * @returns {object} - A new instance of ethers.Wallet.
 */
const signer = new ethers.Wallet(PRIVATE_KEY, provider)

/**
 * Creates a new instance of the bribery contract using the provided contract address, ABI, and signer.
 * @param {string} CONTRACT_ADDRESS - The address of the bribery contract.
 * @param {Object} contract.abi - The ABI of the bribery contract.
 * @param {Object} signer - The signer object used to sign transactions.
 * @returns {Object} - A new instance of the bribery contract.
 */
const briberyContract = new ethers.Contract(
    CONTRACT_ADDRESS,
    contract.abi,
    signer
)

/**
 * Listens for new colluders and posts their validator information to the bribery contract.
 * @function
 * @async
 * @returns {void}
 */
function listenForNewColluders() {
    briberyContract.on("NewColluder", async (validator_id) => {
        console.log("New colluder: " + validator_id)
        var requestURL = 'https://beaconcha.in/api/v1/validator/' + validator_id + '?apikey=' + BEACON_API_KEY;
        const response = await fetch(requestURL);
        const data = await response.json();
        if (data.status == "OK") {
            console.log("Validator info posted to contract: " + validator_id);
            briberyContract.postValidatorInfo(validator_id, data.data.pubkey, data.data.effectivebalance, data.data.status)
        } else {
            console.log("Error: " + data.status);
        }
    }
    );
}

async function main() {
    console.log("Listening for new colluders...");
    listenForNewColluders();
}

main()
