import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SipzyVault } from "../target/types/sipzy_vault";
import { expect } from "chai";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";

describe("sipzy_vault", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SipzyVault as Program<SipzyVault>;
  
  // Test data for Creator coin
  const channelId = "UC_test_channel_123";
  const channelName = "Test Creator Channel";
  const metadataUri = "ipfs://QmTest123";
  const creatorWallet = anchor.web3.Keypair.generate();

  // Test data for Stream coin
  const videoId = "dQw4w9WgXcQ";
  const videoTitle = "Test Video Title";

  // Derive PDAs
  const [creatorPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator_pool"), Buffer.from(channelId)],
    program.programId
  );

  const [streamPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stream_pool"), Buffer.from(videoId)],
    program.programId
  );

  before(async () => {
    // Fund creator wallet for rent
    const airdropSig = await provider.connection.requestAirdrop(
      creatorWallet.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);
  });

  describe("Creator Pool (Linear Curve)", () => {
    it("Initializes a creator pool", async () => {
      const tx = await program.methods
        .initializeCreatorPool(
          channelId,
          channelName,
          metadataUri,
          null, // Use default base price
          null  // Use default slope
        )
        .accounts({
          creatorWallet: creatorWallet.publicKey,
        })
        .rpc();

      console.log("Initialize creator pool tx:", tx);

      // Fetch the pool account
      const poolAccount = await program.account.pool.fetch(creatorPoolPda);
      
      expect(poolAccount.identifier).to.equal(channelId);
      expect(poolAccount.displayName).to.equal(channelName);
      expect(poolAccount.creatorWallet.toString()).to.equal(creatorWallet.publicKey.toString());
      expect(poolAccount.totalSupply.toNumber()).to.equal(0);
      expect(poolAccount.reserveSol.toNumber()).to.equal(0);
      expect(poolAccount.isActive).to.equal(true);
      // PoolType.Creator = 0
      expect(poolAccount.poolType).to.deep.equal({ creator: {} });
    });

    it("Buys tokens from creator pool", async () => {
      const amount = new BN(10);
      
      const tx = await program.methods
        .buyTokens(amount)
        .accounts({
          pool: creatorPoolPda,
          trader: provider.wallet.publicKey,
          creatorWallet: creatorWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Buy creator tokens tx:", tx);

      const poolAccount = await program.account.pool.fetch(creatorPoolPda);
      
      expect(poolAccount.totalSupply.toNumber()).to.equal(10);
      expect(poolAccount.reserveSol.toNumber()).to.be.greaterThan(0);
      
      console.log("Creator pool supply:", poolAccount.totalSupply.toNumber());
      console.log("Creator pool reserve (lamports):", poolAccount.reserveSol.toNumber());
    });

    it("Gets current price (linear curve)", async () => {
      const price = await program.methods
        .getPrice()
        .accounts({
          pool: creatorPoolPda,
        })
        .view();

      console.log("Creator token price (lamports):", price.toNumber());
      
      // Price should be base + (supply * slope) = 10M + (10 * 100K) = 11M
      expect(price.toNumber()).to.be.greaterThan(10_000_000);
    });

    it("Sells tokens back to creator pool", async () => {
      const amount = new BN(5);
      
      const poolBefore = await program.account.pool.fetch(creatorPoolPda);
      const supplyBefore = poolBefore.totalSupply.toNumber();
      
      const tx = await program.methods
        .sellTokens(amount)
        .accounts({
          pool: creatorPoolPda,
          trader: provider.wallet.publicKey,
          creatorWallet: creatorWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Sell creator tokens tx:", tx);

      const poolAfter = await program.account.pool.fetch(creatorPoolPda);
      
      expect(poolAfter.totalSupply.toNumber()).to.equal(supplyBefore - 5);
      console.log("Creator pool supply after sell:", poolAfter.totalSupply.toNumber());
    });
  });

  describe("Stream Pool (Exponential Curve)", () => {
    it("Initializes a stream pool", async () => {
      const tx = await program.methods
        .initializeStreamPool(
          videoId,
          channelId, // Parent channel
          videoTitle,
          metadataUri,
          null, // Use default base price
          null  // Use default growth rate
        )
        .accounts({
          creatorWallet: creatorWallet.publicKey,
        })
        .rpc();

      console.log("Initialize stream pool tx:", tx);

      const poolAccount = await program.account.pool.fetch(streamPoolPda);
      
      expect(poolAccount.identifier).to.equal(videoId);
      expect(poolAccount.displayName).to.equal(videoTitle);
      expect(poolAccount.parentIdentifier).to.equal(channelId);
      expect(poolAccount.totalSupply.toNumber()).to.equal(0);
      // PoolType.Stream = 1
      expect(poolAccount.poolType).to.deep.equal({ stream: {} });
    });

    it("Buys tokens from stream pool (exponential)", async () => {
      const amount = new BN(20);
      
      const tx = await program.methods
        .buyTokens(amount)
        .accounts({
          pool: streamPoolPda,
          trader: provider.wallet.publicKey,
          creatorWallet: creatorWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Buy stream tokens tx:", tx);

      const poolAccount = await program.account.pool.fetch(streamPoolPda);
      
      expect(poolAccount.totalSupply.toNumber()).to.equal(20);
      console.log("Stream pool supply:", poolAccount.totalSupply.toNumber());
      console.log("Stream pool reserve (lamports):", poolAccount.reserveSol.toNumber());
    });

    it("Gets current price (exponential curve)", async () => {
      const price = await program.methods
        .getPrice()
        .accounts({
          pool: streamPoolPda,
        })
        .view();

      console.log("Stream token price (lamports):", price.toNumber());
      
      // Exponential curve: base * 1.05^20 should be significantly higher than base
      // 1_000_000 * 1.05^20 ≈ 2_653_298
      expect(price.toNumber()).to.be.greaterThan(2_000_000);
    });

    it("Gets buy cost for stream tokens", async () => {
      const amount = new BN(10);
      
      const cost = await program.methods
        .getBuyCost(amount)
        .accounts({
          pool: streamPoolPda,
        })
        .view();

      console.log("Cost to buy 10 more stream tokens (lamports):", cost.toNumber());
      
      // Should be non-zero and include fee
      expect(cost.toNumber()).to.be.greaterThan(0);
    });
  });
});
