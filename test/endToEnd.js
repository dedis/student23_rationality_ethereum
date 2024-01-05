const { expect } = require("chai");

let blockData = require('../data/block.json')

const oracle = require("../scripts/oracle.js");
const exp = require("constants");
const { bls12_381: bls } = require('@noble/curves/bls12-381');

function toHexString(byteArray) {
    return Array.from(byteArray, function(byte) {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('')
  }
describe("End to end tests", function () {
    it("End to end test", async function () {
        let briberyContract = await hre.ethers.getContractAt("Bribery", process.env.CONTRACT_ADDRESS);

        briberyContract.depositReward({ value: ethers.parseUnits("100", "ether") });
        // get signers
        const [owner, otherAccount] = await ethers.getSigners();

        let validator1 = Math.floor(Math.random() * 1000000).toString();
        console.log("validator" + validator1 + " wants to commit, getting message to sign...");
        let messageToSign = await briberyContract.getMessageHash(owner.address, validator1);
        console.log("message to sign: " + messageToSign);
        let signature = bls.sign(messageToSign.slice(2), process.env.PRIVATE_KEY.slice(2));
        console.log("committing to contract...")
        await briberyContract.commit(validator1, "0x" + toHexString(signature), { value: 0 });

        // wait for the oracle to post the validator info to the contract
        await new Promise(resolve => setTimeout(resolve, 10000));
        var [balance, status, isSlashed] = await briberyContract.validators(validator1);
        expect(status).to.equal("active_online");
        expect(balance).to.equal(ethers.parseUnits("32", "ether"));
        expect(isSlashed).to.be.false;

        let validator2 = Math.floor(Math.random() * 1000000).toString();
        console.log("validator" + validator2 + " wants to commit, getting message to sign...");
        messageToSign = await briberyContract.getMessageHash(otherAccount.address, validator2);
        console.log("message to sign: " + messageToSign);
        signature = bls.sign(messageToSign.slice(2), process.env.PRIVATE_KEY.slice(2));
        console.log("committing to contract...")
        await briberyContract.connect(otherAccount).commit(validator2, "0x" + toHexString(signature), { value: 0 });

        // wait for the oracle to post the validator info to the contract
        await new Promise(resolve => setTimeout(resolve, 10000));

        let validator3 = String(11344);
        console.log("validator" + validator3 + " wants to commit, getting message to sign...");
        messageToSign = await briberyContract.getMessageHash(otherAccount.address, validator3);
        console.log("message to sign: " + messageToSign);
        signature = bls.sign(messageToSign.slice(2), process.env.PRIVATE_KEY.slice(2));
        console.log("committing to contract...")
        await briberyContract.connect(otherAccount).commit(validator3, "0x" + toHexString(signature), { value: 0 });

        // wait for the oracle to post the validator info to the contract
        await new Promise(resolve => setTimeout(resolve, 10000));

        expect(await briberyContract.attackSuccess()).to.be.true;


        // await expect(briberyContract.distribute()).to.changeEtherBalances([owner, briberyContract, otherAccount], [0, 0, 0]);

        // await expect(briberyContract.connect(otherAccount).distribute()).to.changeEtherBalances([owner, briberyContract, otherAccount], [0, ethers.parseUnits("-100", "ether"), ethers.parseUnits("100", "ether")]);
        
    });
});