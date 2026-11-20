import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

const root = (label: string) => ethers.keccak256(ethers.toUtf8Bytes(`root:${label}`));
const chain = (label: string) => ethers.keccak256(ethers.toUtf8Bytes(`chain:${label}`));

describe("AnchorRegistry", () => {
  async function deployFixture() {
    const [owner, anchorer, attacker, other] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("AnchorRegistry");
    const registry = await Registry.deploy(anchorer.address);
    await registry.waitForDeployment();
    return { registry, owner, anchorer, attacker, other };
  }

  async function withTwoBatchesFixture() {
    const ctx = await deployFixture();
    const r = ctx.registry.connect(ctx.anchorer);
    await r.anchor(0, root("b0"), chain("b0"), 1, 100);
    await r.anchor(1, root("b1"), chain("b1"), 101, 250);
    return ctx;
  }

  describe("deployment", () => {
    it("sets owner, initial anchorer and starts at batch 0", async () => {
      const { registry, owner, anchorer, attacker } = await loadFixture(deployFixture);
      expect(await registry.owner()).to.equal(owner.address);
      expect(await registry.isAnchorer(anchorer.address)).to.equal(true);
      expect(await registry.isAnchorer(attacker.address)).to.equal(false);
      expect(await registry.nextBatchId()).to.equal(0n);
      expect(await registry.batchCount()).to.equal(0n);
    });

    it("rejects a zero-address anchorer", async () => {
      const Registry = await ethers.getContractFactory("AnchorRegistry");
      await expect(Registry.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        Registry,
        "ZeroAddress",
      );
    });
  });

  describe("anchor()", () => {
    it("stores a batch and emits Anchored", async () => {
      const { registry, anchorer } = await loadFixture(deployFixture);
      const tx = registry.connect(anchorer).anchor(0, root("b0"), chain("b0"), 1, 100);
      await expect(tx)
        .to.emit(registry, "Anchored")
        .withArgs(0n, root("b0"), chain("b0"), 1n, 100n, anyValue);

      const receipt = await (await tx).wait();
      const b = await registry.getBatch(0);
      expect(b.batchId).to.equal(0n);
      expect(b.merkleRoot).to.equal(root("b0"));
      expect(b.lastChainHash).to.equal(chain("b0"));
      expect(b.startSeq).to.equal(1n);
      expect(b.endSeq).to.equal(100n);
      expect(b.blockNumber).to.equal(BigInt(receipt!.blockNumber));
      expect(b.timestamp).to.be.greaterThan(0n);
      expect(await registry.nextBatchId()).to.equal(1n);
    });

    it("accepts consecutive batches 0, 1, 2", async () => {
      const { registry, anchorer } = await loadFixture(deployFixture);
      const r = registry.connect(anchorer);
      await r.anchor(0, root("b0"), chain("b0"), 1, 10);
      await r.anchor(1, root("b1"), chain("b1"), 11, 20);
      await r.anchor(2, root("b2"), chain("b2"), 21, 30);
      expect(await registry.batchCount()).to.equal(3n);
      expect((await registry.getBatch(2)).merkleRoot).to.equal(root("b2"));
    });

    it("accepts a single-entry batch (startSeq == endSeq)", async () => {
      const { registry, anchorer } = await loadFixture(deployFixture);
      await expect(registry.connect(anchorer).anchor(0, root("one"), chain("one"), 7, 7)).to.emit(
        registry,
        "Anchored",
      );
    });

    it("accepts a heartbeat batch with an empty range (startSeq == endSeq + 1)", async () => {
      const { registry, anchorer } = await loadFixture(withTwoBatchesFixture);
      // No new logs since seq 250: empty range 251..250, same chain head as batch 1.
      await expect(
        registry.connect(anchorer).anchor(2, ethers.ZeroHash, chain("b1"), 251, 250),
      ).to.emit(registry, "Anchored");
      const hb = await registry.getBatch(2);
      expect(hb.startSeq).to.equal(251n);
      expect(hb.endSeq).to.equal(250n);
      expect(hb.lastChainHash).to.equal(chain("b1"));
    });

    it("rejects an inverted range", async () => {
      const { registry, anchorer } = await loadFixture(deployFixture);
      await expect(registry.connect(anchorer).anchor(0, root("x"), chain("x"), 10, 5))
        .to.be.revertedWithCustomError(registry, "InvalidRange")
        .withArgs(10n, 5n);
    });
  });

  describe("append-only rules (attack 8: stolen key)", () => {
    it("rejects overwriting an existing batch", async () => {
      const { registry, anchorer } = await loadFixture(withTwoBatchesFixture);
      await expect(registry.connect(anchorer).anchor(0, root("forged"), chain("forged"), 1, 100))
        .to.be.revertedWithCustomError(registry, "BadBatchId")
        .withArgs(2n, 0n);
    });

    it("leaves the original batch unchanged after a failed overwrite", async () => {
      const { registry, anchorer } = await loadFixture(withTwoBatchesFixture);
      await expect(registry.connect(anchorer).anchor(1, root("forged"), chain("forged"), 101, 249))
        .to.be.reverted;
      const b1 = await registry.getBatch(1);
      expect(b1.merkleRoot).to.equal(root("b1"));
      expect(b1.lastChainHash).to.equal(chain("b1"));
      expect(b1.endSeq).to.equal(250n);
      expect(await registry.nextBatchId()).to.equal(2n);
    });

    it("rejects re-anchoring the latest batch id", async () => {
      const { registry, anchorer } = await loadFixture(deployFixture);
      const r = registry.connect(anchorer);
      await r.anchor(0, root("b0"), chain("b0"), 1, 10);
      await expect(r.anchor(0, root("b0"), chain("b0"), 1, 10))
        .to.be.revertedWithCustomError(registry, "BadBatchId")
        .withArgs(1n, 0n);
    });

    it("rejects a skipped batch id (gap)", async () => {
      const { registry, anchorer } = await loadFixture(deployFixture);
      await expect(registry.connect(anchorer).anchor(1, root("b1"), chain("b1"), 1, 10))
        .to.be.revertedWithCustomError(registry, "BadBatchId")
        .withArgs(0n, 1n);
    });

    it("rejects a skipped batch id after some history", async () => {
      const { registry, anchorer } = await loadFixture(withTwoBatchesFixture);
      await expect(registry.connect(anchorer).anchor(5, root("b5"), chain("b5"), 251, 300))
        .to.be.revertedWithCustomError(registry, "BadBatchId")
        .withArgs(2n, 5n);
    });
  });

  describe("access control", () => {
    it("rejects anchor() from a non-anchorer", async () => {
      const { registry, attacker } = await loadFixture(deployFixture);
      await expect(registry.connect(attacker).anchor(0, root("b0"), chain("b0"), 1, 10))
        .to.be.revertedWithCustomError(registry, "NotAnchorer")
        .withArgs(attacker.address);
    });

    it("does not make the owner an anchorer by default", async () => {
      const { registry, owner } = await loadFixture(deployFixture);
      await expect(
        registry.connect(owner).anchor(0, root("b0"), chain("b0"), 1, 10),
      ).to.be.revertedWithCustomError(registry, "NotAnchorer");
    });

    it("lets the owner add and revoke anchorers", async () => {
      const { registry, anchorer, other } = await loadFixture(deployFixture);
      await expect(registry.setAnchorer(other.address, true))
        .to.emit(registry, "AnchorerSet")
        .withArgs(other.address, true);
      await registry.connect(other).anchor(0, root("b0"), chain("b0"), 1, 10);

      await registry.setAnchorer(anchorer.address, false);
      await expect(
        registry.connect(anchorer).anchor(1, root("b1"), chain("b1"), 11, 20),
      ).to.be.revertedWithCustomError(registry, "NotAnchorer");
    });

    it("rejects setAnchorer() from a non-owner", async () => {
      const { registry, attacker } = await loadFixture(deployFixture);
      await expect(registry.connect(attacker).setAnchorer(attacker.address, true))
        .to.be.revertedWithCustomError(registry, "NotOwner")
        .withArgs(attacker.address);
    });

    it("transfers ownership; the old owner loses admin rights", async () => {
      const { registry, owner, other } = await loadFixture(deployFixture);
      await expect(registry.transferOwnership(other.address))
        .to.emit(registry, "OwnershipTransferred")
        .withArgs(owner.address, other.address);
      expect(await registry.owner()).to.equal(other.address);
      await expect(registry.setAnchorer(owner.address, true)).to.be.revertedWithCustomError(
        registry,
        "NotOwner",
      );
    });
  });

  describe("getBatch()", () => {
    it("reverts for a batch that has not been anchored", async () => {
      const { registry } = await loadFixture(withTwoBatchesFixture);
      await expect(registry.getBatch(2))
        .to.be.revertedWithCustomError(registry, "BatchNotFound")
        .withArgs(2n);
    });

    it("reverts on an empty registry", async () => {
      const { registry } = await loadFixture(deployFixture);
      await expect(registry.getBatch(0)).to.be.revertedWithCustomError(registry, "BatchNotFound");
    });
  });
});
