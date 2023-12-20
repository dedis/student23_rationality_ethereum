// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "hardhat/console.sol";

/**
 * @title Bribery
 * @dev This contract implements a bribery attack on the Ethereum Proof of Stake (PoS) blockchain.
 * @notice The contract is deployed on the attacking EVM-compatible blockchain. The attacker can use the contract to coordinate an attack on the target blockchain (Ethereum in this case) and distribute the reward among the colluders.
 * @author athenapk
 */
contract Bribery {
    /**
     * @dev Constant representing the maximum integer value.
     */
    uint256 private constant MAX_INT =
        0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    /**
     * @dev Set expiration time for this contract. Arbitrarily set to 42 days after deployment. In practice, it should be long enough to engage enough validators to control a significant percentage of the target blockchain stake.
     */
    uint private expirationTime = block.timestamp + 42 days;

    /**
     * @dev Set the minimum amount each colluder needs to deposit to participate in the attack. This is done to prevent the defection of colluders.
     * For the purpose of this exercise, we set the minimum deposit amount to 0 ETH.
     */
    uint private depositAmount = 0 ether;

    /**
     * @dev Public variable that stores the total number of colluders in the contract.
     */
    uint public totalColluders = 0;

    /**
     * @notice Private variable to store the reward amount, which will be distributed among the colluders. They should be paid more than they would earn by following the honest protocol and be compensated for the risk that they may be slashed if the attack is detected.
     */
    uint private rewardAmount = 0;

    /**
     * @dev Public variable to store the amount of staked ether. It is set initially to MAX_INT to avoid miscalculations before the variable is updated.
     */
    uint private stakedEtherInWei = MAX_INT;

    /**
     * @dev The addressToCensor constant represents the Ethereum address that the attacker requests to be censored.
     */
    address private addressToCensor;

    /**
     * @dev Represents the epoch at which the censorship attack begins.
     */
    uint private epoch;

    /**
     * @dev Represents the duration of the censorship attack in epochs.
     */
    uint private constant attackDurationInEpochs = 42;

    bool public attackHasBegun = false;
    bool public attackSuccess = false;

    /**
     * @dev Struct representing a validator in the Ethereum Proof-of-Stake (PoS) blockchain.
     * @param effectiveBalance Effective balance of the validator (in wei)
     * @param status Status of the validator (e.g. active, inactive, slashed, etc.).
     * @param isSlashed Boolean indicating whether the validator has been slashed in this contract for misbehaviour (low balance, offline, etc.).
     * @param hasBeenCommited Boolean indicating whether the validator has committed to the attack.
     * @param colluderId The ID of the colluder associated with the validator.
     */
    struct Validator {
        uint effectiveBalance;
        string status;
        bool isSlashed;
        bool hasBeenCommited;
        uint colluderId;
    }

    /**
     * @dev Struct representing a colluder in the bribery attack.
     * @param colluderAddress The address of the colluder in the attacking blockchain.
     * @param validatorIds The IDs of the validators associated with the colluder.
     * @param depositAmount The amount of deposit the colluder has made to participate in the attack.
     * @param hasBeenPaid A boolean indicating whether the colluder has been compensated for their participation in the attack.
     */
    struct Colluder {
        address colluderAddress;
        string[] validatorIds;
        uint depositAmount;
        bool hasBeenPaid;
    }

    /**
     * @dev Mapping of colluder IDs to their respective Colluder struct.
     */
    mapping(uint => Colluder) public colluders;

    /**
     * @dev Mapping of validator IDs to their respective Validator struct.
     */
    mapping(string validatorId => Validator) public validators;

    /**
     * @dev A mapping that associates an address with the colluder's address.
     */
    mapping(address => uint) private colluderAddressToId;

    /**
     * @dev Emitted when a new colluder is added to the list of colluders.
     * @param validatorId The ID of the Ethereum validator associated with the colluder.
     */
    event NewColluder(string validatorId, string signature, bytes32 message);

    /**
     * @dev Emitted when the colluding validators control a sufficient percentage of the stake to successfully execute the attack. This event should be picked up by the colluders, who would then begin to censor the target address from any transactions.
     * @param addressToCensor The address that is being targeted for censorship.
     * @param startEpoch The epoch at which the censorship attack begins.
     * @param attackDurationInEpochs The duration of the censorship attack in epochs.
     */
    event BeginAttack(
        address addressToCensor,
        uint startEpoch,
        uint attackDurationInEpochs
    );

    /**
     * @dev A mapping that stores the nonces for each colluder address.
     */
    mapping(address => uint256) public nonces;

    // =========================================
    // ========= Initialisation phase ==========
    // =========================================

    /**
     * @dev The attacker can use this function to deposit the reward amount to the contract. They can deposit money multiple times, increasing the reward if needed. The function is public, allowing for the possibility of crowdfunding the attack.
     */
    function depositReward() public payable {
        rewardAmount += msg.value;
    }

    /**
     * @notice Colluders can use this function to check the reward amount before committing to the attack.
     * @return The reward amount that would be shared among colluders after successfully executing the bribery attack.
     */
    function getRewardAmountInformation() public view returns (uint) {
        return rewardAmount;
    }

    // =========================================
    // ============= Commit phase ==============
    // =========================================

    /**
     * @notice To be called by each colluder to declare their participation in the attack. Reverts if the deposit amount is not met. The function adds the caller to the list of colluding nodes, records the deposit amount and the fact that the node has not received the reward yet.
     * @param _validatorId The ID of the validator associated with the colluder.
     * @param _signature A message, produced by the getMessageHash function and signed with the private key of the validator.
     */
    function commit(
        string calldata _validatorId,
        string calldata _signature
    ) public payable {
        require(block.timestamp < expirationTime, "Contract has expired.");
        require(msg.value == depositAmount, "Deposit amount incorrect.");
        require(
            !validators[_validatorId].hasBeenCommited,
            "Validator already committed."
        );
        require(!attackHasBegun, "Attack has already begun.");
        validators[_validatorId].hasBeenCommited = true;
        if (
            colluders[colluderAddressToId[msg.sender]].colluderAddress ==
            address(0)
        ) {
            totalColluders++;
            colluderAddressToId[msg.sender] = totalColluders;
        }
        uint colluderId = colluderAddressToId[msg.sender];
        colluders[colluderId].validatorIds.push(_validatorId);
        colluders[colluderId] = Colluder(
            msg.sender,
            colluders[colluderId].validatorIds,
            colluders[colluderId].depositAmount + msg.value,
            false
        );
        validators[_validatorId].colluderId = colluderId;
        emit NewColluder(
            _validatorId,
            _signature,
            getMessageHash(msg.sender, _validatorId)
        );
    }

    /**
     * @dev Verify the status of validators and slash validators who are inactive or have insufficient funds.
     */
    function verifyValidators() public {
        for (uint i = 1; i <= totalColluders; i++) {
            for (uint j = 0; j < colluders[i].validatorIds.length; j++) {
                if (
                    !_validatorIsActive(colluders[i].validatorIds[j]) ||
                    !_validatorHasSufficientFunds(colluders[i].validatorIds[j])
                ) {
                    validators[colluders[i].validatorIds[j]].isSlashed = true;
                } else {
                    // we put this here in case the validator has been slashed and then becomes active again
                    validators[colluders[i].validatorIds[j]].isSlashed = false;
                }
            }
        }
    }

    /**
     * @dev Returns the hash of the message to be signed by the validator. To avoid replay attacks, the message includes the address of the contract, the chain ID, and a nonce. (https://programtheblockchain.com/posts/2018/02/17/signing-and-verifying-messages-in-ethereum/)
     */
    function getMessageHash(
        address _signer,
        string memory _validatorId
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    address(this),
                    block.chainid,
                    _signer,
                    nonces[_signer],
                    _validatorId
                )
            );
    }

    // =========================================
    // ============= Attack phase ==============
    // =========================================

    /**
     * @dev Checks if the colluders control a sufficient percentage of the stake to successfully execute the attack.
     * @param _percentage The percentage of the stake that the colluders need to control.
     * @return A boolean indicating whether the colluders control the required percentage of the stake.
     */
    function percentageOfStakedEtherControlledIs(
        uint _percentage
    ) public view returns (bool) {
        _percentage = _floatDivision(_percentage, 100, 4);
        return
            _floatDivision(_stakedEtherControlled(), stakedEtherInWei, 4) >=
            _percentage;
    }

    /**
     * @dev Emits the BeginAttack event if the colluders control a sufficient percentage of the stake to successfully execute the attack.
     */
    function beginAttackIfPossible() public {
        require(!attackHasBegun, "Attack has already begun.");
        require(block.timestamp < expirationTime, "Contract has expired.");
        verifyValidators();
        require(
            percentageOfStakedEtherControlledIs(66),
            "Not enough stake controlled."
        );
        require(addressToCensor != address(0), "No address to censor.");
        require(epoch != 0, "No epoch to censor.");
        emit BeginAttack(addressToCensor, epoch, attackDurationInEpochs);
        attackHasBegun = true;
    }

    // ===============================================
    // ============= Distribution phase ==============
    // ===============================================

    /**
     * @dev Calculates the reward and deposit to be returned for a given colluder address.
     * @param _colluderAddress The address of the colluder.
     * @return rewardForColluder The reward amount to be given to the colluder.
     * @return depositToBeReturned The deposit amount to be returned to the colluder.
     */
    function calculateReward(
        address _colluderAddress
    ) public view returns (uint rewardForColluder, uint depositToBeReturned) {
        uint stakedEther = _stakedEtherControlled();
        uint rewardPerUnitOfStake = _floatDivision(rewardAmount, stakedEther, 4);
        uint colluderId = colluderAddressToId[_colluderAddress];
        depositToBeReturned = colluders[colluderId].depositAmount;
        uint stakeOfColluder = 0;
        for (uint i = 0; i < colluders[colluderId].validatorIds.length; i++) {
            if (!validators[colluders[colluderId].validatorIds[i]].isSlashed) {
                stakeOfColluder += validators[
                    colluders[colluderId].validatorIds[i]
                ].effectiveBalance;
            } else {
                depositToBeReturned -= depositAmount;
            }
        }
        rewardForColluder = _floatMultiplication(
            rewardPerUnitOfStake,
            stakeOfColluder,
            2
        );
        return (rewardForColluder, depositToBeReturned);
    }

    /**
     * @dev Called by each colluder to receive their reward and deposit back. The function reverts if the colluder has already been paid or if the attack has not been successful and the contract has expired.
     */
    function distribute() public payable {
        uint colluderId = colluderAddressToId[msg.sender];
        require(
            colluders[colluderId].hasBeenPaid == false,
            "Colluder has already been paid."
        );
        (uint rewardForColluder, uint depositToBeReturned) = calculateReward(
            msg.sender
        );
        if (attackSuccess) {
            payable(msg.sender).transfer(
                rewardForColluder + depositToBeReturned
            );
            colluders[colluderId].hasBeenPaid = true;
        } else if (block.timestamp > expirationTime && !attackSuccess) {
            payable(msg.sender).transfer(depositToBeReturned);
            colluders[colluderId].hasBeenPaid = true;
        }
    }

    // ====================================================
    // ======== Functions to be used by the oracle ========
    // ====================================================

    // TODO: the following functions should be callable only by the oracle
    // https://ethereum.stackexchange.com/questions/24222/how-can-i-restrict-a-function-to-make-it-only-callable-by-one-contract
    /**
     * @dev Function that the off-chain oracle script uses to post validator information. Also increments the nonce of the validator to prevent replay attacks.
     * @param _validatorId The ID of the validator.
     * @param _effectiveBalance The effective balance of the validator in gwei.
     * @param _status The status of the validator.
     */
    function postValidatorInfo(
        string memory _validatorId,
        uint _effectiveBalance,
        string memory _status
    ) public {
        // We multiply by 1e9 to convert from gwei to wei
        validators[_validatorId].effectiveBalance = _effectiveBalance * 1e9;
        validators[_validatorId].status = _status;
        nonces[
            colluders[validators[_validatorId].colluderId].colluderAddress
        ]++;
    }

    /**
     * @dev Updates the amount of staked ether.
     * @param _amount The new amount of staked ether.
     */
    function updateStakedEther(uint _amount) public {
        stakedEtherInWei = _amount;
    }

    /**
     * @dev Posts information about a bribery attack.
     * @param _addressToCensor The address to be censored.
     * @param _epoch The epoch at which the attack begins.
     */
    function postAttackInfo(address _addressToCensor, uint _epoch) public {
        addressToCensor = _addressToCensor;
        epoch = _epoch;
    }

    /**
     * @dev Sets the success status of the bribery attack.
     * @param _attackSuccess The success status of the bribery attack.
     */
    function postAttackSuccess(bool _attackSuccess) public {
        require(attackHasBegun, "Attack has not begun.");
        attackSuccess = _attackSuccess;
    }

    /**
     * @dev Retrieves the colluding validators.
     * @return A 2-dimensional array of strings representing the colluding validators.
     */
    function getColludingValidators() public view returns (string[][] memory) {
        string[][] memory colludingValidators = new string[][](totalColluders);
        for (uint i = 0; i < totalColluders; i++) {
            colludingValidators[i] = colluders[i + 1].validatorIds;
        }
        return colludingValidators;
    }

    /**
     * @dev Function to post and slash misbehaving validators.
     */
    function postAndSlashMisbehavingValidators(
        string[] memory _misbehavingValidators
    ) public {
        require(attackSuccess, "Attack was not successful.");
        for (uint i = 0; i < _misbehavingValidators.length; i++) {
            validators[_misbehavingValidators[i]].isSlashed = true;
        }
    }

    // ==================================
    // ======== Helper functions ========
    // ==================================

    /**
     * @dev Checks if a validator has sufficient stake to participate in the consensus protocol.
     * @param _validatorId The ID of the validator to check.
     * @return A boolean indicating whether the validator has sufficient funds or not.
     */
    function _validatorHasSufficientFunds(
        string memory _validatorId
    ) private view returns (bool) {
        Validator memory v = validators[_validatorId];
        uint minimumEffectiveBalance = 16000000000000000000;
        return v.effectiveBalance > minimumEffectiveBalance;
    }

    /**
     * @dev Checks if a validator with the given ID is active and online.
     * @param _validatorId The ID of the validator to check.
     * @return A boolean indicating whether the validator is active and online.
     */
    function _validatorIsActive(
        string memory _validatorId
    ) private view returns (bool) {
        Validator memory v = validators[_validatorId];
        // https://ethereum.stackexchange.com/questions/30912/how-to-compare-strings-in-solidity
        return
            keccak256(abi.encodePacked(v.status)) ==
            keccak256(abi.encodePacked("active_online"));
    }

    /**
     * @return The amount of staked ether (in wei) controlled by the contract.
     */
    function _stakedEtherControlled() private view returns (uint) {
        uint stakedEther = 0;
        for (uint i = 1; i <= totalColluders; i++) {
            for (uint j = 0; j < colluders[i].validatorIds.length; j++) {
                if (!validators[colluders[i].validatorIds[j]].isSlashed) {
                    stakedEther += validators[colluders[i].validatorIds[j]]
                        .effectiveBalance;
                }
            }
        }
        return stakedEther;
    }

    // from https://stackoverflow.com/questions/42738640/division-in-ethereum-solidity/42739843#42739843
    /**
     * @dev Performs a floating-point division operation.
     * @param _numerator The numerator of the division.
     * @param _denominator The denominator of the division.
     * @param _precision The precision in digits of the division.
     * @return quotient The result of the division.
     */
    function _floatDivision(
        uint _numerator,
        uint _denominator,
        uint _precision
    ) private pure returns (uint quotient) {
        // caution, check safe-to-multiply here
        uint numerator = _numerator * 10 ** (_precision + 1);
        // with rounding of last digit
        uint _quotient = ((numerator / _denominator) + 5) / 10;
        return (_quotient);
    }

    // https://ethereum.stackexchange.com/questions/41701/tfloating-point-multiplication-then-flooring-result-to-get-uint
    /**
     * @dev Performs floating point multiplication.
     * @param _a The first operand.
     * @param _b The second operand.
     * @param _decimals The number of decimals to use.
     * @return The result of multiplying `a` and `b`.
     */
    function _floatMultiplication(
        uint _a,
        uint _b,
        uint _decimals
    ) private pure returns (uint) {
        uint result = (_a * _b) / (10 ** (_decimals ** 2));
        return result;
    }
}
