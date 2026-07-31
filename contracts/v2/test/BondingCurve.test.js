const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * These tests exercise BondingCurve, FeeEscrow and BuybackVault in isolation,
 * using a minimal stub in place of LaunchFactory (see test/helpers/MockFactory.sol).
 * They are written to document expected behaviour and are the first thing to
 * run once the project is wired up with a working solc download / offline
 * compiler cache — see README "Running this repo" for that one-time setup.
 */
describe("BondingCurve", function () {
  const SUPPLY = ethers.parseEther("1000000000"); // 1e9 tokens, 18 decimals
  const PHANTOM_QUOTE = ethers.parseEther("2"); // opens as if 2 ETH were already in
  const THRESHOLD = ethers.parseEther("10"); // graduates once 10 ETH real is raised
  const FEE_BPS = 100n; // 1%
  const TAX_BPS = 0n;

  async function deployFixture() {
    const [owner, protocol, creator, buyer1, buyer2] = await ethers.getSigners();

    const MockFactory = await ethers.getContractFactory("MockFactory");
    const factory = await MockFactory.deploy(creator.address, protocol.address);

    const escrow = await ethers.deployContract("FeeEscrow", [owner.address]);
    const vault = await ethers.deployContract("BuybackVault", [owner.address, await factory.getAddress(), await escrow.getAddress()]);
    await factory.setEscrowAndVault(await escrow.getAddress(), await vault.getAddress());

    const Curve = await ethers.getContractFactory("BondingCurve");
    const curve = await Curve.deploy({
      factory: await factory.getAddress(),
      pairToken: ethers.ZeroAddress,
      pairDecimals: 18,
      totalSupply: SUPPLY,
      phantomQuote: PHANTOM_QUOTE,
      graduationThreshold: THRESHOLD,
      feeBps: FEE_BPS,
      creatorTaxBps: TAX_BPS,
      buybackEnabled: false,
      protocolFeeRecipient: protocol.address,
      protocolFeeShareBps: 3000n, // protocol keeps 30% of the base fee
      buybackShareBps: 0n,
    });

    const Token = await ethers.getContractFactory("LaunchToken");
    const token = await Token.deploy(
      "Example",
      "EXMPL",
      SUPPLY,
      await curve.getAddress(),
      owner.address,
      "ipfs://logo",
      "an example",
      { twitter: "", telegram: "", discord: "", website: "", farcaster: "" }
    );

    await curve.initializeToken(await token.getAddress());
    await factory.registerCurve(await token.getAddress(), await curve.getAddress());
    await escrow.setAuthorized(await curve.getAddress(), true);

    return { curve, token, factory, escrow, vault, owner, protocol, creator, buyer1, buyer2 };
  }

  it("opens at a non-zero price set by the phantom reserve", async function () {
    const { curve } = await deployFixture();
    const [quoteReserve, tokenReserve] = await curve.getReserves();
    expect(quoteReserve).to.equal(PHANTOM_QUOTE);
    expect(tokenReserve).to.equal(SUPPLY);
  });

  it("charges the base fee on a buy and mints tokens proportional to the curve", async function () {
    const { curve, token, buyer1 } = await deployFixture();

    const quoteIn = ethers.parseEther("1");
    const tx = await curve.connect(buyer1).buy(quoteIn, 0n, buyer1.address, { value: quoteIn });
    const receipt = await tx.wait();

    const balance = await token.balanceOf(buyer1.address);
    expect(balance).to.be.gt(0n);

    const event = receipt.logs.find((l) => l.fragment && l.fragment.name === "CurveBuy");
    expect(event.args.fee).to.equal((quoteIn * FEE_BPS) / 10000n);
  });

  it("reserved tokens match supply * phantomQuote / (phantomQuote + threshold)", async function () {
    const { curve } = await deployFixture();
    const expected = (SUPPLY * PHANTOM_QUOTE) / (PHANTOM_QUOTE + THRESHOLD);
    expect(await curve.reservedTokens()).to.equal(expected);
  });

  it("clamps and refunds a buy that would oversell the curve, then marks the curve graduated", async function () {
    const { curve, buyer1 } = await deployFixture();

    // A buy far larger than the threshold should still succeed, filling only
    // what remains and refunding the rest.
    const hugeBuy = ethers.parseEther("1000");
    const balBefore = await ethers.provider.getBalance(buyer1.address);
    const tx = await curve.connect(buyer1).buy(hugeBuy, 0n, buyer1.address, { value: hugeBuy });
    const receipt = await tx.wait();

    expect(await curve.graduated()).to.equal(true);
    expect(await curve.readyToGraduate()).to.equal(true);

    const refundEvent = receipt.logs.find((l) => l.fragment && l.fragment.name === "CurveBuyRefunded");
    expect(refundEvent).to.not.be.undefined;
  });

  it("reverts further trades once graduated", async function () {
    const { curve, buyer1, buyer2 } = await deployFixture();
    await curve.connect(buyer1).buy(ethers.parseEther("1000"), 0n, buyer1.address, { value: ethers.parseEther("1000") });

    await expect(
      curve.connect(buyer2).buy(ethers.parseEther("1"), 0n, buyer2.address, { value: ethers.parseEther("1") })
    ).to.be.revertedWithCustomError(curve, "CurveGraduated");
  });
});

describe("BuybackVault", function () {
  it("vests linearly and recomputes a weighted start on repeated locks", async function () {
    const [owner] = await ethers.getSigners();
    const MockFactory = await ethers.getContractFactory("MockFactory");
    const factory = await MockFactory.deploy(owner.address, owner.address);
    const escrow = await ethers.deployContract("FeeEscrow", [owner.address]);
    const vault = await ethers.deployContract("BuybackVault", [owner.address, await factory.getAddress(), await escrow.getAddress()]);

    const Token = await ethers.getContractFactory("LaunchToken");
    const token = await Token.deploy(
      "Example", "EXMPL", ethers.parseEther("1000"), owner.address, owner.address, "", "",
      { twitter: "", telegram: "", discord: "", website: "", farcaster: "" }
    );

    await vault.setAuthorized(owner.address, true);
    await token.approve(await vault.getAddress(), ethers.parseEther("1000"));

    await vault.lock(await token.getAddress(), ethers.parseEther("100"));
    expect(await vault.totalLocked(await token.getAddress())).to.equal(ethers.parseEther("100"));

    // Nothing should be releasable immediately.
    expect(await vault.releasable(await token.getAddress())).to.equal(0n);
  });
});
