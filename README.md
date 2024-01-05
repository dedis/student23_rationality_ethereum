# Running the project

First, install all dependencies with 
```
$ npm install
```

Then, use the deploy script to deploy the contract:
```
$ npx hardhat run scripts/deploy.js --network <network>
```
where `<network>` is the name of the network you want to deploy to.  The default network is `localhost`.

In the .env file, you will need to set the following variables:
```
PRIVATE_KEY=<private key of the account you are using to deploy the contract>
CONTRACT_ADDRESS=<address of the deployed contract, provided by the deploy script output>
```

To run the oracle, run the following command in the root directory of the project:
```
$ npx hardhat run scripts/oracle.js --network <network>
```

You can now interact with the public contract functions and observe the oracle's behaviour. An example is provided in `scripts/interaction.js`. 

# Running the tests
To run the tests for the contract, run the following command in the root directory of the project:

```
$ npx hardhat node
```
Then, open another terminal window and run:

```
$ npx hardhat test test/bribery.js --network localhost
```

Since some functions are callable only by the oracle, whose address is hardhoded in the contract, you will need to change the address in the contract to the address of the account you are using to run the tests.  You can find the address of the account in the terminal window where you ran `npx hardhat node`.

You can also run end-to-end tests that model the attack from start to finish by:
```
$ npx hardhat run scripts/endToEnd.js --network <network>
```

Make sure to uncomment the mock API functions in the oracle.js file before running the end-to-end tests.

