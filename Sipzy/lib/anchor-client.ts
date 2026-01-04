import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'

// Program ID
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || 'Aa3NmVN4aHAbRRoR2kQm9xnUonkydrh96tcAa9riJwRP'
)

// Instruction discriminators from IDL
const DISCRIMINATORS = {
  initializeCreatorPool: [60, 170, 63, 129, 229, 100, 8, 105],
  initializeStreamPool: [202, 112, 19, 109, 93, 207, 46, 244],
  buyTokens: [189, 21, 230, 133, 247, 2, 110, 42],
  sellTokens: [114, 242, 25, 12, 62, 126, 92, 2],
}

/**
 * Serialize a Rust String (4-byte little-endian length + UTF-8 bytes)
 */
function serializeString(str: string): Uint8Array {
  const bytes = new TextEncoder().encode(str)
  const result = new Uint8Array(4 + bytes.length)
  // Write length as u32 LE
  result[0] = bytes.length & 0xff
  result[1] = (bytes.length >> 8) & 0xff
  result[2] = (bytes.length >> 16) & 0xff
  result[3] = (bytes.length >> 24) & 0xff
  // Copy string bytes
  result.set(bytes, 4)
  return result
}

/**
 * Serialize Option<u64> - 1 byte discriminant + 8 bytes value if Some
 */
function serializeOptionU64(value: number | null): Uint8Array {
  if (value === null) {
    return new Uint8Array([0]) // None
  }
  const result = new Uint8Array(9)
  result[0] = 1 // Some
  // Write value as u64 LE
  const bn = BigInt(value)
  for (let i = 0; i < 8; i++) {
    result[1 + i] = Number((bn >> BigInt(i * 8)) & BigInt(0xff))
  }
  return result
}

/**
 * Serialize u64
 */
function serializeU64(value: number | bigint): Uint8Array {
  const result = new Uint8Array(8)
  const bn = BigInt(value)
  for (let i = 0; i < 8; i++) {
    result[i] = Number((bn >> BigInt(i * 8)) & BigInt(0xff))
  }
  return result
}

/**
 * Derive Creator Pool PDA
 */
export function deriveCreatorPoolPDA(channelId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      new TextEncoder().encode('creator_pool'),
      new TextEncoder().encode(channelId)
    ],
    PROGRAM_ID
  )
}

/**
 * Derive Stream Pool PDA
 */
export function deriveStreamPoolPDA(videoId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      new TextEncoder().encode('stream_pool'),
      new TextEncoder().encode(videoId)
    ],
    PROGRAM_ID
  )
}

/**
 * Build initialize creator pool transaction
 */
export function createInitializeCreatorPoolTx(
  poolPDA: PublicKey,
  creatorWallet: PublicKey,
  authority: PublicKey,
  channelId: string,
  channelName: string,
  metadataUri: string,
  basePrice: number | null = null,
  slope: number | null = null
): Transaction {
  // Build instruction data
  const parts: Uint8Array[] = [
    new Uint8Array(DISCRIMINATORS.initializeCreatorPool),
    serializeString(channelId),
    serializeString(channelName),
    serializeString(metadataUri),
    serializeOptionU64(basePrice),
    serializeOptionU64(slope),
  ]
  
  // Calculate total length
  const totalLen = parts.reduce((acc, p) => acc + p.length, 0)
  const data = new Uint8Array(totalLen)
  
  // Copy all parts
  let offset = 0
  for (const part of parts) {
    data.set(part, offset)
    offset += part.length
  }
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: creatorWallet, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: Buffer.from(data),
  })
  
  return new Transaction().add(instruction)
}

/**
 * Build initialize stream pool transaction
 */
export function createInitializeStreamPoolTx(
  poolPDA: PublicKey,
  creatorWallet: PublicKey,
  authority: PublicKey,
  videoId: string,
  channelId: string,
  videoTitle: string,
  metadataUri: string,
  basePrice: number | null = null,
  growthRate: number | null = null
): Transaction {
  const parts: Uint8Array[] = [
    new Uint8Array(DISCRIMINATORS.initializeStreamPool),
    serializeString(videoId),
    serializeString(channelId),
    serializeString(videoTitle),
    serializeString(metadataUri),
    serializeOptionU64(basePrice),
    serializeOptionU64(growthRate),
  ]
  
  const totalLen = parts.reduce((acc, p) => acc + p.length, 0)
  const data = new Uint8Array(totalLen)
  
  let offset = 0
  for (const part of parts) {
    data.set(part, offset)
    offset += part.length
  }
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: creatorWallet, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: Buffer.from(data),
  })
  
  return new Transaction().add(instruction)
}

/**
 * Build buy tokens transaction
 */
export function createBuyTokensTx(
  poolPDA: PublicKey,
  trader: PublicKey,
  creatorWallet: PublicKey,
  amount: number
): Transaction {
  const data = new Uint8Array(8 + 8) // discriminator + u64 amount
  data.set(new Uint8Array(DISCRIMINATORS.buyTokens), 0)
  
  // Serialize amount as u64 LE
  const amountBn = BigInt(amount)
  for (let i = 0; i < 8; i++) {
    data[8 + i] = Number((amountBn >> BigInt(i * 8)) & BigInt(0xff))
  }
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: trader, isSigner: true, isWritable: true },
      { pubkey: creatorWallet, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: Buffer.from(data),
  })
  
  return new Transaction().add(instruction)
}

/**
 * Build sell tokens transaction
 */
export function createSellTokensTx(
  poolPDA: PublicKey,
  trader: PublicKey,
  creatorWallet: PublicKey,
  amount: number
): Transaction {
  const data = new Uint8Array(8 + 8) // discriminator + u64 amount
  data.set(new Uint8Array(DISCRIMINATORS.sellTokens), 0)
  
  // Serialize amount as u64 LE
  const amountBn = BigInt(amount)
  for (let i = 0; i < 8; i++) {
    data[8 + i] = Number((amountBn >> BigInt(i * 8)) & BigInt(0xff))
  }
  
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: trader, isSigner: true, isWritable: true },
      { pubkey: creatorWallet, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: Buffer.from(data),
  })
  
  return new Transaction().add(instruction)
}

/**
 * Check if a pool account exists on-chain
 */
export async function poolExists(
  connection: Connection,
  poolAddress: PublicKey
): Promise<boolean> {
  try {
    const accountInfo = await connection.getAccountInfo(poolAddress)
    return accountInfo !== null && accountInfo.data.length > 0
  } catch {
    return false
  }
}

/**
 * Fetch basic pool info
 */
export async function fetchPoolInfo(
  connection: Connection,
  poolAddress: PublicKey
): Promise<{
  totalSupply: number
  reserveSol: number
  basePrice: number
  curveParam: number
  isActive: boolean
} | null> {
  try {
    const accountInfo = await connection.getAccountInfo(poolAddress)
    if (!accountInfo) return null
    
    const data = accountInfo.data
    // Skip 8 byte discriminator
    // Skip pool_type (1 byte)
    // Read identifier length and skip string
    let offset = 9
    const identifierLen = data.readUInt32LE(offset)
    offset += 4 + identifierLen
    
    // Skip display_name
    const displayNameLen = data.readUInt32LE(offset)
    offset += 4 + displayNameLen
    
    // Skip parent_identifier
    const parentIdLen = data.readUInt32LE(offset)
    offset += 4 + parentIdLen
    
    // Skip creator_wallet (32 bytes) and authority (32 bytes)
    offset += 64
    
    // Read total_supply (u64)
    const totalSupply = Number(data.readBigUInt64LE(offset))
    offset += 8
    
    // Read reserve_sol (u64)
    const reserveSol = Number(data.readBigUInt64LE(offset))
    offset += 8
    
    // Read base_price (u64)
    const basePrice = Number(data.readBigUInt64LE(offset))
    offset += 8
    
    // Read curve_param (u64)
    const curveParam = Number(data.readBigUInt64LE(offset))
    offset += 8
    
    // Skip metadata_uri
    const metadataUriLen = data.readUInt32LE(offset)
    offset += 4 + metadataUriLen
    
    // Skip bump (1 byte) and created_at (8 bytes)
    offset += 9
    
    // Read is_active (bool)
    const isActive = data[offset] === 1
    
    return {
      totalSupply,
      reserveSol,
      basePrice,
      curveParam,
      isActive,
    }
  } catch (error) {
    console.error('Error fetching pool info:', error)
    return null
  }
}

// Constants
export const LAMPORTS_PER_SOL = 1_000_000_000
export const DEFAULT_CREATOR_BASE_PRICE = 10_000_000 // 0.01 SOL
export const DEFAULT_CREATOR_SLOPE = 100_000 // 0.0001 SOL per token
export const DEFAULT_STREAM_BASE_PRICE = 1_000_000 // 0.001 SOL
export const DEFAULT_STREAM_GROWTH_RATE = 500 // 5%

/**
 * Format lamports to SOL string
 */
export function formatSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(4)
}

/**
 * Calculate linear bonding curve price
 */
export function calculateLinearPrice(supply: number, basePrice: number, slope: number): number {
  return basePrice + supply * slope
}

/**
 * Calculate exponential bonding curve price
 */
export function calculateExponentialPrice(supply: number, basePrice: number, growthRateBps: number): number {
  const rate = 1 + growthRateBps / 10000
  return basePrice * Math.pow(rate, supply)
}

