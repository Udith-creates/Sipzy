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
  
  const youtubeId = "test_video_123";
  const creatorWallet = anchor.web3.Keypair.generate();

  // Derive PDA for the pool
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sipzy_pool"), Buffer.from(youtubeId)],
    program.programId
  );

  it("Initializes a pool", async () => {
    const tx = await program.methods
      .initializePool(youtubeId, creatorWallet.publicKey)
      .accounts({
        pool: poolPda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Initialize pool tx:", tx);

    // Fetch the pool account
    const poolAccount = await program.account.sipzyPool.fetch(poolPda);
    
    expect(poolAccount.youtubeId).to.equal(youtubeId);
    expect(poolAccount.creatorWallet.toString()).to.equal(creatorWallet.publicKey.toString());
    expect(poolAccount.totalReserveSol.toNumber()).to.equal(0);
    expect(poolAccount.circulatingSupply.toNumber()).to.equal(0);
    expect(poolAccount.isClaimed).to.equal(false);
  });

  it("Buys tokens from the bonding curve", async () => {
    const amount = new BN(10); // Buy 10 tokens
    
    // Fund creator wallet for rent
    const airdropSig = await provider.connection.requestAirdrop(
      creatorWallet.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const buyerBalanceBefore = await provider.connection.getBalance(provider.wallet.publicKey);
    
    const tx = await program.methods
      .buyTokens(amount)
      .accounts({
        pool: poolPda,
        buyer: provider.wallet.publicKey,
        creatorWallet: creatorWallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Buy tokens tx:", tx);

    // Fetch updated pool
    const poolAccount = await program.account.sipzyPool.fetch(poolPda);
    
    expect(poolAccount.circulatingSupply.toNumber()).to.equal(10);
    expect(poolAccount.totalReserveSol.toNumber()).to.be.greaterThan(0);
    
    console.log("New supply:", poolAccount.circulatingSupply.toNumber());
    console.log("Reserve SOL (lamports):", poolAccount.totalReserveSol.toNumber());
  });

  it("Gets current token price", async () => {
    const price = await program.methods
      .getCurrentPrice()
      .accounts({
        pool: poolPda,
      })
      .view();

    console.log("Current price (lamports):", price.toNumber());
    
    // Price should be > base price (10_000_000) since supply > 0
    expect(price.toNumber()).to.be.greaterThan(10_000_000);
  });

  it("Sells tokens back to the curve", async () => {
    const amount = new BN(5); // Sell 5 tokens
    
    const poolBefore = await program.account.sipzyPool.fetch(poolPda);
    const supplyBefore = poolBefore.circulatingSupply.toNumber();
    
    const tx = await program.methods
      .sellTokens(amount)
      .accounts({
        pool: poolPda,
        seller: provider.wallet.publicKey,
        creatorWallet: creatorWallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Sell tokens tx:", tx);

    const poolAfter = await program.account.sipzyPool.fetch(poolPda);
    
    expect(poolAfter.circulatingSupply.toNumber()).to.equal(supplyBefore - 5);
    console.log("Supply after sell:", poolAfter.circulatingSupply.toNumber());
  });
});

