const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Bribery", function () {
    let briberyContract;

    async function attackHasBegunFixture() {
        briberyContract = await ethers.deployContract("Bribery");
        const [owner, otherAccount] = await ethers.getSigners();
        await briberyContract.commit("123", "0xsignature", { value: 0 });
        await briberyContract.commit("1234", "0xsignature", { value: 0 });
        await briberyContract.connect(otherAccount).commit("12345", "0xsignature", { value: 0 });
        await briberyContract.postValidatorInfo("12345", 32000000000, "active_online");
        await briberyContract.postValidatorInfo("123", 32000000000, "active_online");
        await briberyContract.postValidatorInfo("1234", 30000000000, "active_online");
        await briberyContract.updateStakedEther(ethers.parseUnits("100", "ether"));
        await briberyContract.postAttackInfo("0x1234567890123456789012345678901234567890", 100);
        await briberyContract.beginAttackIfPossible();
        return briberyContract;
    }

    async function attackReadyToBeginFixture() {
        briberyContract = await ethers.deployContract("Bribery");
        const [owner, otherAccount] = await ethers.getSigners();
        await briberyContract.commit("123", "0xsignature", { value: 0 });
        await briberyContract.commit("1234", "0xsignature", { value: 0 });
        await briberyContract.connect(otherAccount).commit("12345", "0xsignature", { value: 0 });
        await briberyContract.postValidatorInfo("12345", 32000000000, "active_online");
        await briberyContract.postValidatorInfo("123", 32000000000, "active_online");
        await briberyContract.postValidatorInfo("1234", 30000000000, "active_online");
        await briberyContract.updateStakedEther(ethers.parseUnits("100", "ether"));
        return briberyContract;
    }


    beforeEach(async function () {
        briberyContract = await ethers.deployContract("Bribery");

    });

    it("initial reward amount is zero", async function () {
        expect(Number(await briberyContract.getRewardAmountInformation())).to.equal(0);
    });
    it("reward amount is set correctly", async function () {
        await briberyContract.depositReward({ value: 100 });
        expect(Number(await briberyContract.getRewardAmountInformation())).to.equal(100);
    });
    it("reward amount is updated correctly", async function () {
        await briberyContract.depositReward({ value: 100 });
        await briberyContract.depositReward({ value: 100 });
        expect(Number(await briberyContract.getRewardAmountInformation())).to.equal(200);
    });
    it("committing from a new address increments total colluder number", async function () {
        const [owner, otherAccount] = await ethers.getSigners();
        expect(Number(await briberyContract.totalColluders())).to.equal(0);
        await briberyContract.commit("123", "0xsignature");
        expect(Number(await briberyContract.totalColluders())).to.equal(1);
        await briberyContract.connect(otherAccount).commit("1234", "0xsignature");
        expect(Number(await briberyContract.totalColluders())).to.equal(2);
    });
    it("committing from an existing address does not increment total colluder number", async function () {
        expect(Number(await briberyContract.totalColluders())).to.equal(0);
        await briberyContract.commit("123", "0xsignature");
        expect(Number(await briberyContract.totalColluders())).to.equal(1);
        await briberyContract.commit("1234", "0xsignature");
        expect(Number(await briberyContract.totalColluders())).to.equal(1);
    });
    it("committing after the expiration time reverts", async function () {
        expect(Number(await briberyContract.totalColluders())).to.equal(0);
        await briberyContract.commit("123", "0xsignature");
        expect(Number(await briberyContract.totalColluders())).to.equal(1);
        const FORTY_THREE_DAYS_IN_SECS = 43 * 24 * 60 * 60;
        const expirationTime = (await time.latest()) + FORTY_THREE_DAYS_IN_SECS;
        await time.increaseTo(expirationTime);
        await expect(briberyContract.commit("123", "0xsignature")).to.be.revertedWith("Contract has expired.");
    });
    it("committing the same validator twice reverts", async function () {
        const [owner, otherAccount] = await ethers.getSigners();
        expect(Number(await briberyContract.totalColluders())).to.equal(0);
        await briberyContract.commit("123", "0xsignature");
        expect(Number(await briberyContract.totalColluders())).to.equal(1);
        await expect(briberyContract.commit("123", "0xsignature")).to.be.revertedWith("Validator already committed.");
        await expect(briberyContract.connect(otherAccount).commit("123", "0xsignature")).to.be.revertedWith("Validator already committed.");
    });
    it("committing after attack has begun reverts", async function () {
        const briberyContract = await loadFixture(attackHasBegunFixture);
        expect(await briberyContract.percentageOfStakedEtherControlledIs(66)).to.be.true;
        expect(await briberyContract.attackHasBegun()).to.be.true;
        await expect(briberyContract.commit("123456", "0xsignature")).to.be.revertedWith("Attack has already begun.");
    })
    it("committing with incorrect deposit reverts", async function () {
        await expect(briberyContract.commit("123", "0xsignature", { value: 99 })).to.be.revertedWith("Deposit amount incorrect.");
    });
    it("committing adds colluder to colluders list", async function () {
        const [owner, otherAccount] = await ethers.getSigners();
        await briberyContract.commit("123", "0xsignature", { value: 0 });
        let [address, amount, hasBeenPaid] = await briberyContract.colluders(1);
        expect(address).to.equal(owner.address);
        expect(amount).to.equal(0);
        expect(hasBeenPaid).to.be.false;
    });
    it("committing emits NewColluder event", async function () {
        const [owner, otherAccount] = await ethers.getSigners();
        let messageHash = await briberyContract.getMessageHash(owner.address, "123");
        await expect(briberyContract.commit("123", "0xsignature", { value: 0 }))
            .to.emit(briberyContract, "NewColluder")
            .withArgs("123", "0xsignature", messageHash);
    }
    );
    it("verify validators slashes validators that not active_online", async function () {
        await briberyContract.commit("123", "0xsignature", { value: 0 });
        await briberyContract.commit("1234", "0xsignature", { value: 0 });
        await briberyContract.postValidatorInfo("123", 32000000000, "active_online");
        await briberyContract.postValidatorInfo("1234", 32000000000, "active_offline");
        await briberyContract.verifyValidators();
        var [balance, status, isSlashed] = await briberyContract.validators("123");
        expect(isSlashed).to.be.false;
        var [balance, status, isSlashed] = await briberyContract.validators("1234");
        expect(isSlashed).to.be.true;
    }
    );
    it("postValidatorInfo updates validator info", async function () {
        await briberyContract.commit("123", "0xsignature", { value: 0 });
        await briberyContract.commit("1234", "0xsignature", { value: 0 });
        await briberyContract.postValidatorInfo("123", 70, "active_online");
        await briberyContract.postValidatorInfo("1234", 80, "active_offline");
        var [balance, status, isSlashed] = await briberyContract.validators("123");
        expect(status).to.equal("active_online");
        expect(balance).to.equal(70000000000);
        expect(isSlashed).to.be.false;
        var [balance, status, isSlashed] = await briberyContract.validators("1234");
        expect(status).to.equal("active_offline");
        expect(balance).to.equal(80000000000);
        expect(isSlashed).to.be.false;
    }

    );
    it("verify validators slashes validators that do not have sufficient balance", async function () {
        await briberyContract.commit("123", "0xsignature", { value: 0 });
        await briberyContract.commit("1234", "0xsignature", { value: 0 });
        await briberyContract.postValidatorInfo("123", 30000000000, "active_online");
        await briberyContract.postValidatorInfo("1234", 16000000000, "active_online");
        await briberyContract.verifyValidators();
        var [balance, status, isSlashed] = await briberyContract.validators("123");
        expect(isSlashed).to.be.false;
        var [balance, status, isSlashed] = await briberyContract.validators("1234");
        expect(isSlashed).to.be.true;
    }
    );
    it("verifyValidators does not slash validators that have sufficient balance and are active_online", async function () {
        var briberyContract = await loadFixture(attackHasBegunFixture);
        await briberyContract.verifyValidators();
        var [balance, status, isSlashed] = await briberyContract.validators("123");
        expect(isSlashed).to.be.false;
        var [balance, status, isSlashed] = await briberyContract.validators("1234");
        expect(isSlashed).to.be.false;
    }
    );
    it("verifyValidators unslashes previously slashed validators that have now sufficient balance and are active_online", async function () {
        await briberyContract.commit("123", "0xsignature", { value: 0 });
        await briberyContract.commit("1234", "0xsignature", { value: 0 });
        await briberyContract.postValidatorInfo("123", 15000000000, "active_online");
        await briberyContract.postValidatorInfo("1234", 16000000000, "active_offline");
        var [balance, status, isSlashed] = await briberyContract.validators("123");
        expect(isSlashed).to.be.false;
        var [balance, status, isSlashed] = await briberyContract.validators("1234");
        expect(isSlashed).to.be.false;
        await briberyContract.verifyValidators();
        var [balance, status, isSlashed] = await briberyContract.validators("123");
        expect(isSlashed).to.be.true;
        var [balance, status, isSlashed] = await briberyContract.validators("1234");
        expect(isSlashed).to.be.true;
        await briberyContract.postValidatorInfo("123", 32000000000, "active_online");
        await briberyContract.postValidatorInfo("1234", 17000000000, "active_online");
        await briberyContract.verifyValidators();
        var [balance, status, isSlashed] = await briberyContract.validators("123");
        expect(isSlashed).to.be.false;
        var [balance, status, isSlashed] = await briberyContract.validators("1234");
        expect(isSlashed).to.be.false;
    }
    );
    it("percentage of ether controlled is calculated correctly", async function () {
        var briberyContract = await loadFixture(attackReadyToBeginFixture);
        expect(await briberyContract.percentageOfStakedEtherControlledIs(64)).to.be.true;
        expect(await briberyContract.percentageOfStakedEtherControlledIs(95)).to.be.false;
    }
    );
    it("attack is declared when percentage of ether controlled is greater than 66%", async function () {
        var briberyContract = await loadFixture(attackReadyToBeginFixture);
        expect(await briberyContract.percentageOfStakedEtherControlledIs(66)).to.be.true;
        await briberyContract.postAttackInfo("0x1234567890123456789012345678901234567890", 100);
        expect(await briberyContract.attackHasBegun()).to.be.false;
        await briberyContract.beginAttackIfPossible();
        expect(await briberyContract.attackHasBegun()).to.be.true;
    }
    );
    it("percentage of ether controlled does not include validators that are not associated with a colluder", async function () {
        await briberyContract.commit("123", "0xsignature", { value: 0 });
        await briberyContract.postValidatorInfo("123", 32000000000, "active_online");
        await briberyContract.postValidatorInfo("1234", 32000000000, "active_online");
        await briberyContract.updateStakedEther(ethers.parseUnits("100", "ether"));
        expect(await briberyContract.percentageOfStakedEtherControlledIs(64)).to.be.false;
    }
    );
    it("beginAttackIfPossible reverts if attack has already begun", async function () {
        const briberyContract = await loadFixture(attackHasBegunFixture);
        expect(await briberyContract.percentageOfStakedEtherControlledIs(66)).to.be.true;
        expect(await briberyContract.attackHasBegun()).to.be.true;
        await expect(briberyContract.beginAttackIfPossible()).to.be.revertedWith("Attack has already begun.");
    }
    );
    it("begin attack reverts if contract has expired", async function () {
        const briberyContract = await loadFixture(attackReadyToBeginFixture);
        const FORTY_THREE_DAYS_IN_SECS = 43 * 24 * 60 * 60;
        const expirationTime = (await time.latest()) + FORTY_THREE_DAYS_IN_SECS;
        await time.increaseTo(expirationTime);
        await expect(briberyContract.beginAttackIfPossible()).to.be.revertedWith("Contract has expired.");
    }
    );
    it("begin attack reverts if address to censor is empty", async function () {
        const briberyContract = await loadFixture(attackReadyToBeginFixture);
        await expect(briberyContract.beginAttackIfPossible()).to.be.revertedWith("No address to censor.");
    }
    );
    it("begin attack reverts if epoch to attack is zero", async function () {
        const briberyContract = await loadFixture(attackReadyToBeginFixture);
        await briberyContract.postAttackInfo("0x1234567890123456789012345678901234567890", 0);
        await expect(briberyContract.beginAttackIfPossible()).to.be.revertedWith("No epoch to censor.");
    }
    );
    it("get colluding validators returns correct list", async function () {
        const briberyContract = await loadFixture(attackReadyToBeginFixture);
        let colludingValidators = await briberyContract.getColludingValidators();
        colludingValidators = colludingValidators.flat();
        expect(colludingValidators.length).to.equal(3);
        expect(colludingValidators[0]).to.equal("123");
        expect(colludingValidators[1]).to.equal("1234");
        expect(colludingValidators[2]).to.equal("12345");
    }
    );

    it("postAndSlashMisbehavingValidators slashes validators on the misbehaving list", async function () {
        const briberyContract = await loadFixture(attackHasBegunFixture);
        await briberyContract.postAttackSuccess(true);
        await briberyContract.postAndSlashMisbehavingValidators(["123", "1234"]);
        var [balance, status, isSlashed] = await briberyContract.validators("123");
        expect(isSlashed).to.be.true;
        var [balance, status, isSlashed] = await briberyContract.validators("1234");
        expect(isSlashed).to.be.true;
        var [balance, status, isSlashed] = await briberyContract.validators("12345");
        expect(isSlashed).to.be.false;
    }
    );
    it("postAndSlashMisbehavingValidators reverts if attack has not succeeded", async function () {
        const briberyContract = await loadFixture(attackHasBegunFixture);
        await expect(briberyContract.postAndSlashMisbehavingValidators(["123", "1234"])).to.be.revertedWith("Attack was not successful.");
    }
    );
    it("calculateReward returns correct reward amount when slashing validators", async function () {
        const [owner, otherAccount] = await ethers.getSigners();
        const briberyContract = await loadFixture(attackHasBegunFixture);
        await briberyContract.depositReward({ value: ethers.parseUnits("100", "ether") });
        await briberyContract.postAttackSuccess(true);
        await briberyContract.postAndSlashMisbehavingValidators(["123", "1234"]);
        var [reward, deposit] = await briberyContract.calculateReward(owner.address);
        expect(reward).to.equal(ethers.parseUnits("0", "ether"));
        [reward, deposit] = await briberyContract.calculateReward(otherAccount.address);
        expect(reward).to.equal(ethers.parseUnits("100", "ether"));
    }
    );
    it("calculateReward returns correct reward amount", async function () {
        const [owner, otherAccount] = await ethers.getSigners();
        const briberyContract = await loadFixture(attackHasBegunFixture);
        await briberyContract.depositReward({ value: ethers.parseUnits("100", "ether") });
        await briberyContract.postAttackSuccess(true);
        var [reward, deposit] = await briberyContract.calculateReward(owner.address);
        expect(reward).to.equal(ethers.parseUnits("65.9556", "ether"));
        [reward, deposit] = await briberyContract.calculateReward(otherAccount.address);
        expect(reward).to.equal(ethers.parseUnits("34.0416", "ether"));
    }
    );
    it("calculateReward returns correct reward amount when reward is lower than total stake", async function () {
        const [owner, otherAccount] = await ethers.getSigners();
        const briberyContract = await loadFixture(attackHasBegunFixture);
        await briberyContract.depositReward({ value: ethers.parseUnits("10", "ether") });
        await briberyContract.postAttackSuccess(true);
        var [reward, deposit] = await briberyContract.calculateReward(owner.address);
        expect(reward).to.equal(ethers.parseUnits("6.5968", "ether"));
        [reward, deposit] = await briberyContract.calculateReward(otherAccount.address);
        expect(reward).to.equal(ethers.parseUnits("3.4048", "ether"));
    }
    );
    it("percentage of ether controlled is correct for high values", async function () {
        await briberyContract.commit("123", "0xsignature", { value: 0 });
        await briberyContract.postValidatorInfo("123", ethers.parseUnits("20000000000000000", "gwei"), "active_online");
        await briberyContract.updateStakedEther(ethers.parseUnits("28000000", "ether"));
        expect(await briberyContract.percentageOfStakedEtherControlledIs(64)).to.be.true;
    }
    );
    it("distribute() distributes reward correctly when attack is successful", async function () {
        const [owner, otherAccount] = await ethers.getSigners();
        const briberyContract = await loadFixture(attackHasBegunFixture);
        await briberyContract.depositReward({ value: ethers.parseUnits("100", "ether") });
        await briberyContract.postAttackSuccess(true);
        var [address, depositAmount, hasBeenPaid] = await briberyContract.colluders(1);
        var [address2, depositAmount2, hasBeenPaid2] = await briberyContract.colluders(2);
        expect(hasBeenPaid).to.be.false;
        await expect(briberyContract.distribute()).to.changeEtherBalances([owner, briberyContract, otherAccount], [ethers.parseUnits("65.9556", "ether"), ethers.parseUnits("-65.9556", "ether"), 0]);
        var [address, depositAmount, hasBeenPaid] = await briberyContract.colluders(1);
        expect(hasBeenPaid).to.be.true;
        expect(hasBeenPaid2).to.be.false;
        await expect(briberyContract.connect(otherAccount).distribute()).to.changeEtherBalances([owner, briberyContract, otherAccount], [0, ethers.parseUnits("-34.0416", "ether"), ethers.parseUnits("34.0416", "ether")]);
        var [address, depositAmount, hasBeenPaid] = await briberyContract.colluders(2);
        expect(hasBeenPaid).to.be.true;
    }
    );
    it("distribute() reverts if the colluder has already been paid", async function () {
        const [owner, otherAccount] = await ethers.getSigners();
        const briberyContract = await loadFixture(attackHasBegunFixture);
        await briberyContract.depositReward({ value: ethers.parseUnits("100", "ether") });
        await briberyContract.postAttackSuccess(true);
        await briberyContract.calculateReward(owner.address);
        await briberyContract.calculateReward(otherAccount.address);
        await briberyContract.distribute();
        await expect(briberyContract.distribute()).to.be.revertedWith("Colluder has already been paid.");
    }
    );
    it("distribute() distributes only deposits if the attack is not successful and the contract has expired", async function () {
        const [owner, otherAccount] = await ethers.getSigners();
        const briberyContract = await loadFixture(attackHasBegunFixture);
        await briberyContract.depositReward({ value: ethers.parseUnits("100", "ether") });
        const FORTY_THREE_DAYS_IN_SECS = 43 * 24 * 60 * 60;
        const expirationTime = (await time.latest()) + FORTY_THREE_DAYS_IN_SECS;
        await time.increaseTo(expirationTime);
        await expect(briberyContract.distribute()).to.changeEtherBalances([owner, briberyContract, otherAccount], [0, 0, 0]);
    }
    );
    it("distribute() does not distribute deposits if the contract has not expired", async function () {
        const [owner, otherAccount] = await ethers.getSigners();
        const briberyContract = await loadFixture(attackHasBegunFixture);
        await briberyContract.depositReward({ value: ethers.parseUnits("100", "ether") }
        );
        await briberyContract.distribute();
        var [_, _, hasBeenPaid] = await briberyContract.colluders(1);
        expect(hasBeenPaid).to.be.false;
    }
    );


});