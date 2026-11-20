import { createHash } from "node:crypto";

export interface MerkleProofStep {
  position: "left" | "right";
  hash: string;
}

export class MerkleTree {
  readonly leaves: string[];
  readonly layers: string[][];

  constructor(leaves: string[]) {
    this.leaves = leaves.map(MerkleTree.normalizeHash);
    this.layers = this.buildLayers(this.leaves);
  }

  static normalizeHash(h: string): string {
    const raw = h.startsWith("0x") || h.startsWith("0X") ? h.slice(2) : h;
    return raw.toLowerCase();
  }

  static hashPair(a: string, b: string): string {
    const bufA = Buffer.from(MerkleTree.normalizeHash(a), "hex");
    const bufB = Buffer.from(MerkleTree.normalizeHash(b), "hex");
    return createHash("sha256").update(Buffer.concat([bufA, bufB])).digest("hex");
  }

  private buildLayers(leaves: string[]): string[][] {
    if (leaves.length === 0) return [["0".repeat(64)]];
    const layers: string[][] = [leaves];
    let current = leaves;

    while (current.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < current.length; i += 2) {
        if (i + 1 < current.length) {
          next.push(MerkleTree.hashPair(current[i], current[i + 1]));
        } else {
          next.push(MerkleTree.hashPair(current[i], current[i]));
        }
      }
      layers.push(next);
      current = next;
    }
    return layers;
  }

  get root(): string {
    const top = this.layers[this.layers.length - 1];
    return top && top.length > 0 ? top[0] : "0".repeat(64);
  }

  get rootWith0x(): string {
    return "0x" + this.root;
  }

  getProof(leafIndex: number): MerkleProofStep[] {
    const proof: MerkleProofStep[] = [];
    let idx = leafIndex;

    for (let layerIdx = 0; layerIdx < this.layers.length - 1; layerIdx++) {
      const layer = this.layers[layerIdx];
      const isRightChild = idx % 2 === 1;
      const siblingIdx = isRightChild ? idx - 1 : idx + 1;

      if (siblingIdx < layer.length) {
        proof.push({
          position: isRightChild ? "left" : "right",
          hash: layer[siblingIdx],
        });
      } else {
        proof.push({
          position: "right",
          hash: layer[idx],
        });
      }
      idx = Math.floor(idx / 2);
    }
    return proof;
  }

  static verifyProof(leafHash: string, proof: MerkleProofStep[], expectedRoot: string): boolean {
    let curr = MerkleTree.normalizeHash(leafHash);
    const target = MerkleTree.normalizeHash(expectedRoot);

    for (const step of proof) {
      const stepHash = MerkleTree.normalizeHash(step.hash);
      if (step.position === "left") {
        curr = MerkleTree.hashPair(stepHash, curr);
      } else {
        curr = MerkleTree.hashPair(curr, stepHash);
      }
    }
    return curr.toLowerCase() === target.toLowerCase();
  }
}
