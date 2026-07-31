const { ethers } = require("hardhat");

/**
 * Illustrative deployment script. Shows the wiring order the whole system
 * depends on:
 *
 *   1. Uniswap v4 PoolManager (assumed already deployed on the target chain —
 *      pons does not deploy its own; see @uniswap/v4-core for the real one).
 *   2. FeeEscrow and BuybackVault (need each other's + the factory's address,
 *      so the factory address is deployed last but referenced by both).
 *   3. LaunchLocker (needs the PoolManager + factory address).
 *   4. MemeHook (needs the PoolManager + factory + escrow + vault). NOTE: a
 *      real deployment must mine a CREATE2 salt so this contract's deployed
 *      address encodes exactly the hook permission flags declared in
 *      `getHookPermissions()` — that mining step is NOT implemented here.
 *   5. LaunchFactory (wires everything together).
 *   6. Authorize the factory's curves, the hook, and the vault to credit the
 *      escrow; authorize the curves and the hook to lock into the vault.
 *
 * This script has not been run end-to-end against a live PoolManager
 * deployment (see README) — treat it as documentation of the wiring, not a
 * turnkey deploy command.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const POOL_MANAGER_ADDRESS = process.env.POOL_MANAGER_ADDRESS;
  if (!POOL_MANAGER_ADDRESS) {
    throw new Error("Set POOL_MANAGER_ADDRESS to an already-deployed Uniswap v4 PoolManager");
  }

  // --- Step 1: predict the factory address so escrow/vault/locker/hook can
  // be told about it before it exists (a nonce-based CREATE prediction; a
  // real script should use a deterministic deployer or CREATE2 instead). ---
  const nonce = await ethers.provider.getTransactionCount(deployer.address);
  const predictedFactory = ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 4 });

  const FeeEscrow = await ethers.getContractFactory("FeeEscrow");
  const escrow = await FeeEscrow.deploy(deployer.address);
  await escrow.waitForDeployment();
  console.log("FeeEscrow:", await escrow.getAddress());

  const BuybackVault = await ethers.getContractFactory("BuybackVault");
  const vault = await BuybackVault.deploy(deployer.address, predictedFactory, await escrow.getAddress());
  await vault.waitForDeployment();
  console.log("BuybackVault:", await vault.getAddress());

  const LaunchLocker = await ethers.getContractFactory("LaunchLocker");
  const locker = await LaunchLocker.deploy(predictedFactory, POOL_MANAGER_ADDRESS);
  await locker.waitForDeployment();
  console.log("LaunchLocker:", await locker.getAddress());

  const MemeHook = await ethers.getContractFactory("MemeHook");
  // See NOTE above: this address will almost certainly NOT satisfy v4's hook
  // permission-flag requirement on a real PoolManager without CREATE2 mining.
  const hook = await MemeHook.deploy(
    POOL_MANAGER_ADDRESS,
    predictedFactory,
    await escrow.getAddress(),
    await vault.getAddress(),
    deployer.address
  );
  await hook.waitForDeployment();
  console.log("MemeHook:", await hook.getAddress());

  const LaunchFactory = await ethers.getContractFactory("LaunchFactory");
  const factory = await LaunchFactory.deploy(
    deployer.address,
    POOL_MANAGER_ADDRESS,
    await escrow.getAddress(),
    await vault.getAddress(),
    await locker.getAddress(),
    await hook.getAddress()
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("LaunchFactory:", factoryAddress);

  if (factoryAddress.toLowerCase() !== predictedFactory.toLowerCase()) {
    console.warn(
      "WARNING: predicted factory address did not match the deployed one — " +
        "escrow/vault/locker/hook are pointing at the wrong factory. Re-deploy " +
        "with an accurate nonce prediction (or switch to CREATE2) before using " +
        "this on a real network."
    );
  }

  await (await escrow.setAuthorized(await hook.getAddress(), true)).wait();
  await (await escrow.setAuthorized(await vault.getAddress(), true)).wait();
  await (await vault.setAuthorized(await hook.getAddress(), true)).wait();

  // LaunchFactory.launchToken() authorizes each curve it deploys to credit
  // the escrow / lock into the vault, which requires the factory itself to
  // be the owner of both.
  await (await escrow.transferOwnership(factoryAddress)).wait();
  await (await vault.transferOwnership(factoryAddress)).wait();

  console.log("\nDeployment wiring complete. Curves are authorized on the escrow");
  console.log("and vault individually by LaunchFactory at launch time.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
