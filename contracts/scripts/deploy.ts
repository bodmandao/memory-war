import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying MemoryWarRegistry to network "${network.name}" from ${await deployer.getAddress()}`);

  const RegistryFactory = await ethers.getContractFactory("InvestigatorRegistry");
  const investigatorRegistry = await RegistryFactory.deploy();
  await investigatorRegistry.waitForDeployment();
  const investigatorRegistryAddress = await investigatorRegistry.getAddress();
  console.log(`InvestigatorRegistry deployed at: ${investigatorRegistryAddress}`);

  const Factory = await ethers.getContractFactory("MemoryWarRegistry");
  const registry = await Factory.deploy(investigatorRegistryAddress);
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log(`MemoryWarRegistry deployed at: ${address}`);
  console.log(`Network: ${network.name}`);

  try {
    const dataDir = join(__dirname, "..", "..", ".data");
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    const outPath = join(dataDir, "deployment.json");
    writeFileSync(
      outPath,
      JSON.stringify({ network: network.name, address, investigatorRegistryAddress, deployedAt: new Date().toISOString() }, null, 2),
    );
    console.log(`Wrote deployment record to ${outPath}`);
    console.log(`\nSet in .env: MEMORY_WAR_CONTRACT_ADDRESS=${address}`);
    console.log(`Set in .env: INVESTIGATOR_REGISTRY_ADDRESS=${investigatorRegistryAddress}`);
  } catch (err) {
    console.log("(could not write .data/deployment.json)", err);
  }

  if (network.name === "hardhat" || network.name === "localhost") {
    console.log("\nThis is a LOCAL devnet deployment — real EVM execution, not the live 0G testnet.");
  } else {
    console.log(`\nThis IS a live deployment to ${network.name}. Save this address to MEMORY_WAR_CONTRACT_ADDRESS in .env.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
