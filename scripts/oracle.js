require("dotenv").config();

require("node-fetch");

const { bls12_381: bls } = require('@noble/curves/bls12-381');

let validatorData = require('../data/validator.json');
let blockData = require('../data/block.json')
let epochData = require('../data/epoch.json')
let lastEpochData = require('../data/lastEpoch.json')
let slots = require('../data/slots.json')
let attestationData = require('../data/attestations.json')
let slotData = require('../data/slot.json')

const API_URL = process.env.API_URL
// TODO: rename API_KEY to something more descriptive
const API_KEY = process.env.API_KEY
const PRIVATE_KEY = process.env.PRIVATE_KEY
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS
const BEACON_API_KEY = process.env.BEACON_API_KEY
const BEACON_NODE_URL = process.env.BEACON_NODE_URL

const addressToCensor = "0x5Dc6f45FeF26b06e3302313F884DAF48e2746FB9"
var epochToAttack;
var attackDurationInEpochs = 2;

var briberyContract;


/**
 * Listens for new colluders and posts their validator information to the bribery contract.
 * @function
 * @async
 * @returns {void}
 */
function listenForNewColluders(handler) {
    console.log("Listening for new colluders...");
    briberyContract.on("NewColluder", handler);
}

/**
 * Handles a new colluder event by verifying the signature and posting validator info to the bribery contract.
 * @param {string} validator_id - The ID of the colluding validator.
 * @param {string} signature - The signature of the message.
 * @param {string} message - The message to be signed.
 * @returns {Promise<void>} - A Promise that resolves when the validator info has been posted to the contract.
 */
async function handleNewColluderEvent(validator_id, signature, message) {
    console.log("New validator declared participation: " + validator_id + "\nSigned message: " + message + "\nSignature: " + signature);
    const endpoint = 'api/v1/validator/' + validator_id + '?apikey=' + BEACON_API_KEY;
    const data = await getDataFromBeaconChainAPI(endpoint);

    if (signatureIsValid(signature, message, data.pubkey)) {
        console.log("Signature is valid!");
        await postValidatorInfoToContract(validator_id, data)
    } else {
        console.log("Signature is not valid!");
        return;
    }
    console.log("Checking if attack can be launched...");
    const finalisedEpochData = await getDataFromBeaconChainAPI('api/v1/epoch/finalized');
    await postTotalStakedEther(finalisedEpochData);
    const latestEpochData = await getDataFromBeaconChainAPI('api/v1/epoch/latest');
    launchAttackIfPossible(latestEpochData);
}

async function postValidatorInfoToContract(validator_id, validatorData) {
    console.log("Posting validator info to contract...");
    await briberyContract.postValidatorInfo(validator_id, validatorData.effectivebalance, validatorData.status)
    console.log("Validator info posted to contract for validator: " + validator_id);
}

async function postTotalStakedEther(epochData) {
    var total = ethers.parseUnits(epochData.totalvalidatorbalance.toString(), "gwei");
    await briberyContract.updateStakedEther(total);
    console.log("Total staked ether (in wei) posted to contract: " + total);
}

// check percentage of ether controlled by colluders and post attack info to contract if yes
async function launchAttackIfPossible(epochData) {
    console.log("Checking if attack can be launched...");
    try {
        var attackReadyToBegin = await briberyContract.attackIsReadyToBegin();
        if (attackReadyToBegin) {
            console.log("Attack ready to begin. Posting attack info...");
            var currentEpoch = epochData.epoch;
            epochToAttack = currentEpoch + 2;
            lastEpoch = epochToAttack + attackDurationInEpochs;
            await briberyContract.postAttackInfo(addressToCensor, epochToAttack);
            console.log("Attack info posted to contract: " + addressToCensor + ", " + epochToAttack);
            await briberyContract.beginAttackIfPossible();
            var attackHasBegun = await briberyContract.attackHasBegun();
            if (attackHasBegun) {
                console.log("Attack has begun");
                await checkAttackSuccessAndPostToContract(epochToAttack, lastEpoch);
            }
        }
    }
    catch (error) {
        console.log(error.message);
        return;
    }
}


async function attackIsFinalized(lastEpoch) {
    const data = await getDataFromBeaconChainAPI('api/v1/epoch/' + lastEpoch);
    return data.finalized;
}



async function addressIsIncludedInEpochTransactions(address, epochData) {
    for (var i = 0; i < epochData.length; i++) {
        var blockNumber = epochData[i].exec_block_number;
        var blockData = await getExecutionLayerBlock(blockNumber);
        if (addressIsIncludedInBlockTransactions(addressToCensor, blockData)) {
            return true;
        }
    }
    return false;
}

async function checkAttackSuccessAndPostToContract(epochToAttack, lastEpoch) {
    console.log("Checking if attack was successful...");
    await waitUntil(async () => await attackIsFinalized(lastEpoch) === true);
    console.log("Attack has been finalized");
    for (var epoch = epochToAttack; epoch < lastEpoch; epoch++) {
        console.log("Epoch: " + epoch + "\n");
        const data = await getDataFromBeaconChainAPI("api/v1/epoch/" + epoch + "/slots");
        if (await addressIsIncludedInEpochTransactions(addressToCensor, data)) {
            console.log("Address has not been censored. Transaction(s) involving this address is included in epoch " + epoch);
            return;
        }
    }
    console.log("Address has been censored. No transaction involving this address is included in any block between epoch " + epochToAttack + " and epoch " + lastEpoch + " (exclusive)");
    await briberyContract.postAttackSuccess(true);
    await postAndSlashMisbehavingValidators(epochToAttack, lastEpoch - epochToAttack);
}


function addressIsIncludedInBlockTransactions(address, blockData) {
    var addressesFrom = [];
    var addressesTo = [];
    var transactions = blockData.transactions;
    addressesFrom = addressesFrom.concat(transactions.map(function (item) { return item["from"]; }));
    addressesTo = addressesTo.concat(transactions.map(function (item) { return item["to"]; }));
    var addresses = [...new Set(addressesFrom.concat(addressesTo))];
    return addresses.some(x => parseInt(x, 16) == parseInt(address, 16));
}

async function postAndSlashMisbehavingValidators(epochToAttack, attackDurationInEpochs) {
    // get validator info from contract
    // check if they have colluded
    // if they have, slash them and post to contract
    console.log("Checking for misbehaving validators...");
    var colludingValidators = await briberyContract.getColludingValidators();
    console.log("Colluding validators: " + colludingValidators);
    colludingValidators = colludingValidators.flat();
    var misbehavingValidators = [];
    var validatorAttestations = await getValidatorAttestations(colludingValidators, epochToAttack, attackDurationInEpochs);
    for (validator of colludingValidators) {
        var validatorColluded = await validatorHasColluded(validator, validatorAttestations);
        if (!validatorColluded) {
            misbehavingValidators.push(validator);
        }
    }
    await briberyContract.postAndSlashMisbehavingValidators(misbehavingValidators);
    console.log("Posted misbehaving validators to contract: " + misbehavingValidators);
}

async function validatorHasColluded(validator_id, validatorAttestations) {
    console.log("Checking if validator " + validator_id + " has colluded...");
    // if validator has not attested in any of the blocks in the required epoch, then they have not colluded
    if (!validatorAttestations[validator_id]) {
        return false;
    }
    for (blockhash of validatorAttestations[validator_id]) {

        const data = await getDataFromBeaconChainAPI("api/v1/slot/" + blockhash);

        if (data.epoch >= epochToAttack && data.epoch < epochToAttack + attackDurationInEpochs && addressIsIncludedInBlockTransactions(addressToCensor, data.exec_block_number)) {
            return false;
        }
        // look for validator with validator_id
        // check the beaconblockroot that they voted for
        // get slot by its root hash and check the transactions included if it is in the required epoch
    }
    return true;
}

async function getValidatorAttestations(colludingValidators, epochToAttack, attackDurationInEpochs) {
    var validatorAttestations = {};
    console.log("Getting validator attestations...");
    console.log("Epoch to attack: " + epochToAttack);
    console.log("Attack duration in epochs: " + attackDurationInEpochs);
    for (var epoch = epochToAttack; epoch <= epochToAttack + attackDurationInEpochs; epoch++) {
        const slotData = await getDataFromBeaconChainAPI("api/v1/epoch/" + epoch + "/slots");
        for (var i = 0; i < slotData.length; i++) {
            const attestationsData = await getDataFromBeaconChainAPI("api/v1/slot/" + slotData[i].slot + "/attestations")
            for (var j = 0; j < attestationsData.length; j++) {
                for (const validator of attestationsData[j].validators) {
                    if (colludingValidators.includes(String(validator))) {
                        addValueToList(validatorAttestations, validator, attestationsData[j].beaconblockroot);
                    }
                }
            }
        }
    }
    return validatorAttestations;
}

// ======================================================
// ================== API functions =====================
// ======================================================

// async function getDataFromBeaconChainAPI(endpoint) {
//     var requestURL = 'https://beaconcha.in/' + endpoint;
//     try {
//         const response = await fetch(requestURL);
//         const data = await response.json();
//         if (data.status != "OK") {
//             console.log("Error: " + data.status);
//             return;
//         }
//         return data.data;
//     }
//     catch (error) {
//         console.log(error.message);
//         return;
//     }
// }


// async function getExecutionLayerBlock(blockNumber) {
//     try {
//         const body = {
//             "id": 1,
//             "jsonrpc": "2.0",
//             "method": "eth_getBlockByNumber",
//             "params": [
//                 "0x" + blockNumber.toString(16),
//                 true
//             ]
//         };
//         const blockResponse = await fetch(' https://eth-mainnet.g.alchemy.com/v2/' + API_KEY, {
//             method: 'post',
//             body: JSON.stringify(body),
//             headers: { 'Content-Type': 'application/json' }
//         });
//         const blockData = await blockResponse.json();
//         return blockData.result;

//     }
//     catch (error) {
//         console.log(error.message);
//         return;
//     }
// }

// mock functions used for testing

async function getDataFromBeaconChainAPI(endpoint) {
    if (endpoint.includes("api/v1/validator/")) {
        return validatorData;
    } else if (endpoint.includes("api/v1/epoch/251154")) {
        return lastEpochData;
    } else if (endpoint.includes("attestations")) {
        return attestationData;
    } else if (endpoint.includes("slots")) {
        return slots;
    } else if (endpoint.includes("api/v1/slot/")) {
        return slotData;
    } else if (endpoint.includes("api/v1/epoch/")) {
        return epochData;
    }
}

async function getExecutionLayerBlock(blockNumber) {
    return blockData;
}

// ======================================================
// ================== Helper functions ==================
// ======================================================



async function waitUntil(condition) {
    console.log("Waiting for condition to be true...");
    while (!await condition()) {
        console.log("Condition is ");
        console.log(await condition());
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
}

function addValueToList(map, key, value) {
    //if the list is already created for the "key", then uses it
    //else creates new list for the "key" to store multiple values in it.
    map[key] = map[key] || [];
    map[key].push(value);
}

/**
 * Checks if a given signature is valid for a given message and public key using BLS verification.
 * @param {string} signature - The signature to be verified.
 * @param {string} message - The message that was signed.
 * @param {string} publicKey - The public key to use for verification.
 * @returns {boolean} - True if the signature is valid, false otherwise.
 */
function signatureIsValid(signature, message, publicKey) {
    try {
        // NOTE: the following line should be uncommented for testing and demo purposes only
        // publicKey = bls.getPublicKey(getHexValue(PRIVATE_KEY));
        publicKey = getHexValue(publicKey);
        signature = Uint8Array.from(hexToBytes(getHexValue(signature)));
        message = getHexValue(message);
        return bls.verify(signature, message, publicKey);
    }
    catch (error) {
        console.log(error.message);
        return false;
    }
}

function hexToBytes(hex) {
    let bytes = [];
    for (let c = 0; c < hex.length; c += 2)
        bytes.push(parseInt(hex.substr(c, 2), 16));
    return bytes;
}

const isHexadecimal = str => str.split('').every(c => '0123456789ABCDEFabcdef'.indexOf(c) !== -1);



function getHexValue(hexString) {
    try {
        if (hexString.slice(0, 2) != "0x" || !isHexadecimal(hexString.slice(2))) throw new Error("Invalid hex string");
        return hexString.slice(2);
    } catch (error) {
        console.log(error);
    }
}

async function main() {
    briberyContract = await hre.ethers.getContractAt("Bribery", CONTRACT_ADDRESS);
    listenForNewColluders(handleNewColluderEvent);
}

main()



module.exports = {
    signatureIsValid,
    getHexValue,
    handleNewColluderEvent,
    isHexadecimal,
    CONTRACT_ADDRESS,
    main,
    briberyContract,
    handleNewColluderEvent,
    listenForNewColluders,
    signatureIsValid,
    postValidatorInfoToContract,
    postTotalStakedEther,
    launchAttackIfPossible,
    attackIsFinalized,
    waitUntil,
    addressIsIncludedInBlockTransactions,
}