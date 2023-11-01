// Deployment script taken from https://hardhat.org/tutorial/deploying-to-a-live-network

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contract with the account:", deployer.address);

    const bribery = await ethers.deployContract("Bribery");

    console.log("Contract address:", await bribery.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });  