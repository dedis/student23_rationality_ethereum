require("dotenv").config();

require("node-fetch");

const { bls12_381: bls } = require('@noble/curves/bls12-381');

const API_URL = process.env.API_URL
const PRIVATE_KEY = process.env.PRIVATE_KEY
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS
const BEACON_API_KEY = process.env.BEACON_API_KEY
const BEACON_NODE_URL = process.env.BEACON_NODE_URL

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
    briberyContract.on("NewColluder", handleNewColluderEvent );
}

/**
 * Fetches information about a validator from the Beaconcha.in API.
 * @param {string} validator_id - The ID of the validator to fetch information for.
 * @returns {Promise<Object>} - A Promise that resolves to an object containing the validator's information.
 */
async function fetchValidatorInfo(validator_id) {
    var requestURL = 'https://beaconcha.in/api/v1/validator/' + validator_id + '?apikey=' + BEACON_API_KEY;
    const response = await fetch(requestURL);
    const data = await response.json();
    return data;
}

/**
 * Handles a new colluder event by verifying the signature and posting validator info to the bribery contract.
 * @param {string} validator_id - The ID of the colluding validator.
 * @param {string} signature - The signature of the message.
 * @param {string} message - The message to be signed.
 * @returns {Promise<void>} - A Promise that resolves when the validator info has been posted to the contract.
 */
async function handleNewColluderEvent(validator_id, signature, message) {
    console.log("New colluder: " + validator_id + "\nMessage to be signed: " + message + "\nSignature: " + signature);
    const data = await fetchValidatorInfo(validator_id);
    if (data.status == "OK") {
        if (signatureIsValid(getHexValue(signature), getHexValue(message), getHexValue(data.data.pubkey))) {
            briberyContract.postValidatorInfo(validator_id, data.data.pubkey, data.data.effectivebalance, data.data.status)
            console.log("Validator info posted to contract: " + validator_id);
        } else {
            console.log("Signature is not valid!");
        }
    } else {
        console.log("Error: " + data.status);
    }
}

/**
 * Checks if a given signature is valid for a given message and public key using BLS verification.
 * @param {string} signature - The signature to be verified.
 * @param {string} message - The message that was signed.
 * @param {string} publicKey - The public key to use for verification.
 * @returns {boolean} - True if the signature is valid, false otherwise.
 */
function signatureIsValid(signature, message, publicKey) {
    // the following line is used for testing purposes only
    // publicKey = bls.getPublicKey(getHexValue(PRIVATE_KEY));
    return bls.verify(signature, message, publicKey);
}

const isHexadecimal = str => str.split('').every(c => '0123456789ABCDEFabcdef'.indexOf(c) !== -1);

function getHexValue(hexString) {
    if (hexString.slice(0, 2) != "0x" || !isHexadecimal(hexString.slice(2))) {
        throw new Error("Invalid hex string");
    }
    return hexString.slice(2);
}

function gweiToEth(gwei) {
    return gwei / 1000000000;
}

async function calculateTotalStakedEther() {
    var total = 0;
    var requestURL = BEACON_NODE_URL+ '/eth/v1/beacon/states/head/validator_balances';
    const response = await fetch(requestURL);
    const data = await response.json();
    for (var i = 0; i < data.data.length; i++) {
        total += gweiToEth(data.data[i].balance);
    }
    return total;
}

async function postTotalStakedEther() {
    var total = await calculateTotalStakedEther();
    briberyContract.updateStakedEther(total);
    console.log("Total staked ether posted to contract: " + total);
}

async function main() {
    console.log("Listening for new colluders...");
    listenForNewColluders();    
}

main()
