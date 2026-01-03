import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'

// Program ID
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || '22RS3cJfjadwGqLdqCTJ4xfYRbjA5n4baamC28v8675r'
)

// Pool types
export enum PoolType {
  Creator = 0,
  Stream = 1,
}

// Constants (matching lib.rs)
export const LAMPORTS_PER_SOL = 1_000_000_000
export const FEE_BASIS_POINTS = 100 // 1%

// Default curve parameters
export const DEFAULT_CREATOR_BASE_PRICE = 10_000_000 // 0.01 SOL
export const DEFAULT_CREATOR_SLOPE = 100_000 // 0.0001 SOL per token
export const DEFAULT_STREAM_BASE_PRICE = 1_000_000 // 0.001 SOL
export const DEFAULT_STREAM_GROWTH_RATE = 500 // 5%

/**
 * Pool state interface
 */
export interface PoolState {
  poolType: PoolType
  identifier: string
  displayName: string
  parentIdentifier: string
  creatorWallet: PublicKey
  authority: PublicKey
  totalSupply: BN
  reserveSol: BN
  basePrice: BN
  curveParam: BN
  metadataUri: string
  bump: number
  createdAt: BN
  isActive: boolean
}

/**
 * Derive Creator Pool PDA
 */
export function deriveCreatorPoolPDA(channelId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('creator_pool'), Buffer.from(channelId)],
    PROGRAM_ID
  )
}

/**
 * Derive Stream Pool PDA
 */
export function deriveStreamPoolPDA(videoId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('stream_pool'), Buffer.from(videoId)],
    PROGRAM_ID
  )
}

/**
 * Calculate linear price: Price(n) = slope × n + base_price
 */
export function calculateLinearPrice(supply: number, basePrice: number, slope: number): number {
  return basePrice + supply * slope
}

/**
 * Calculate exponential price: Price(n) = base_price × (1 + growth_rate)^n
 */
export function calculateExponentialPrice(
  supply: number,
  basePrice: number,
  growthRateBps: number
): number {
  const rate = 1 + growthRateBps / 10000
  return basePrice * Math.pow(rate, supply)
}

/**
 * Calculate cost for linear curve (integral)
 */
export function calculateLinearIntegral(
  startSupply: number,
  amount: number,
  basePrice: number,
  slope: number
): number {
  if (amount === 0) return 0
  
  const endSupply = startSupply + amount
  const baseCost = amount * basePrice
  
  // Sum of arithmetic sequence
  const first = startSupply
  const last = endSupply - 1
  const sumIndices = (amount * (first + last)) / 2
  const slopeCost = sumIndices * slope
  
  return baseCost + slopeCost
}

/**
 * Calculate cost for exponential curve (integral/sum)
 */
export function calculateExponentialIntegral(
  startSupply: number,
  amount: number,
  basePrice: number,
  growthRateBps: number
): number {
  if (amount === 0) return 0
  
  const rate = 1 + growthRateBps / 10000
  
  // For small amounts, use direct summation
  if (amount <= 100) {
    let total = 0
    for (let i = startSupply; i < startSupply + amount; i++) {
      total += basePrice * Math.pow(rate, i)
    }
    return Math.floor(total)
  }
  
  // Geometric series: base × (r^end - r^start) / (r - 1)
  const rStart = Math.pow(rate, startSupply)
  const rEnd = Math.pow(rate, startSupply + amount)
  const numerator = basePrice * (rEnd - rStart)
  const denominator = rate - 1
  
  return Math.floor(numerator / denominator)
}

/**
 * Get current price for a pool
 */
export function getCurrentPrice(pool: PoolState): number {
  const supply = pool.totalSupply.toNumber()
  const basePrice = pool.basePrice.toNumber()
  const curveParam = pool.curveParam.toNumber()
  
  if (pool.poolType === PoolType.Creator) {
    return calculateLinearPrice(supply, basePrice, curveParam)
  } else {
    return calculateExponentialPrice(supply, basePrice, curveParam)
  }
}

/**
 * Calculate buy cost with fee
 */
export function calculateBuyCost(pool: PoolState, amount: number): { cost: number; fee: number; total: number } {
  const supply = pool.totalSupply.toNumber()
  const basePrice = pool.basePrice.toNumber()
  const curveParam = pool.curveParam.toNumber()
  
  let cost: number
  if (pool.poolType === PoolType.Creator) {
    cost = calculateLinearIntegral(supply, amount, basePrice, curveParam)
  } else {
    cost = calculateExponentialIntegral(supply, amount, basePrice, curveParam)
  }
  
  const fee = Math.floor(cost * FEE_BASIS_POINTS / 10000)
  return { cost, fee, total: cost + fee }
}

/**
 * Calculate sell refund with fee
 */
export function calculateSellRefund(pool: PoolState, amount: number): { gross: number; fee: number; net: number } {
  const supply = pool.totalSupply.toNumber()
  const basePrice = pool.basePrice.toNumber()
  const curveParam = pool.curveParam.toNumber()
  
  let gross: number
  if (pool.poolType === PoolType.Creator) {
    gross = calculateLinearIntegral(supply - amount, amount, basePrice, curveParam)
  } else {
    gross = calculateExponentialIntegral(supply - amount, amount, basePrice, curveParam)
  }
  
  const fee = Math.floor(gross * FEE_BASIS_POINTS / 10000)
  return { gross, fee, net: gross - fee }
}

/**
 * Fetch pool state from chain
 */
export async function fetchPoolState(
  connection: Connection,
  poolAddress: PublicKey
): Promise<PoolState | null> {
  try {
    const accountInfo = await connection.getAccountInfo(poolAddress)
    
    if (!accountInfo) {
      return null
    }
    
    // Parse account data (skip 8-byte discriminator)
    const data = accountInfo.data.slice(8)
    let offset = 0
    
    // Pool type (1 byte)
    const poolType = data[offset] as PoolType
    offset += 1
    
    // Identifier (4 bytes length + string)
    const identifierLen = data.readUInt32LE(offset)
    offset += 4
    const identifier = data.slice(offset, offset + identifierLen).toString('utf8')
    offset += identifierLen
    
    // Display name (4 bytes length + string)
    const displayNameLen = data.readUInt32LE(offset)
    offset += 4
    const displayName = data.slice(offset, offset + displayNameLen).toString('utf8')
    offset += displayNameLen
    
    // Parent identifier (4 bytes length + string)
    const parentIdentifierLen = data.readUInt32LE(offset)
    offset += 4
    const parentIdentifier = data.slice(offset, offset + parentIdentifierLen).toString('utf8')
    offset += parentIdentifierLen
    
    // Creator wallet (32 bytes)
    const creatorWallet = new PublicKey(data.slice(offset, offset + 32))
    offset += 32
    
    // Authority (32 bytes)
    const authority = new PublicKey(data.slice(offset, offset + 32))
    offset += 32
    
    // Total supply (8 bytes)
    const totalSupply = new BN(data.slice(offset, offset + 8), 'le')
    offset += 8
    
    // Reserve SOL (8 bytes)
    const reserveSol = new BN(data.slice(offset, offset + 8), 'le')
    offset += 8
    
    // Base price (8 bytes)
    const basePrice = new BN(data.slice(offset, offset + 8), 'le')
    offset += 8
    
    // Curve param (8 bytes)
    const curveParam = new BN(data.slice(offset, offset + 8), 'le')
    offset += 8
    
    // Metadata URI (4 bytes length + string)
    const metadataUriLen = data.readUInt32LE(offset)
    offset += 4
    const metadataUri = data.slice(offset, offset + metadataUriLen).toString('utf8')
    offset += metadataUriLen
    
    // Bump (1 byte)
    const bump = data[offset]
    offset += 1
    
    // Created at (8 bytes)
    const createdAt = new BN(data.slice(offset, offset + 8), 'le')
    offset += 8
    
    // Is active (1 byte)
    const isActive = data[offset] === 1
    
    return {
      poolType,
      identifier,
      displayName,
      parentIdentifier,
      creatorWallet,
      authority,
      totalSupply,
      reserveSol,
      basePrice,
      curveParam,
      metadataUri,
      bump,
      createdAt,
      isActive,
    }
  } catch (error) {
    console.error('Error fetching pool state:', error)
    return null
  }
}

/**
 * Build initialize creator pool instruction data
 */
export function buildInitializeCreatorPoolData(
  channelId: string,
  channelName: string,
  metadataUri: string,
  basePrice: number | null,
  slope: number | null
): Buffer {
  // Discriminator from IDL (will need to update after rebuild)
  const discriminator = Buffer.from([/* TBD after anchor build */])
  
  // Serialize arguments
  const channelIdBytes = Buffer.from(channelId, 'utf8')
  const channelIdLen = Buffer.alloc(4)
  channelIdLen.writeUInt32LE(channelIdBytes.length)
  
  const channelNameBytes = Buffer.from(channelName, 'utf8')
  const channelNameLen = Buffer.alloc(4)
  channelNameLen.writeUInt32LE(channelNameBytes.length)
  
  const metadataUriBytes = Buffer.from(metadataUri, 'utf8')
  const metadataUriLen = Buffer.alloc(4)
  metadataUriLen.writeUInt32LE(metadataUriBytes.length)
  
  // Option<u64> for base_price
  const basePriceOption = Buffer.alloc(9)
  if (basePrice !== null) {
    basePriceOption[0] = 1
    basePriceOption.writeBigUInt64LE(BigInt(basePrice), 1)
  }
  
  // Option<u64> for slope
  const slopeOption = Buffer.alloc(9)
  if (slope !== null) {
    slopeOption[0] = 1
    slopeOption.writeBigUInt64LE(BigInt(slope), 1)
  }
  
  return Buffer.concat([
    discriminator,
    channelIdLen, channelIdBytes,
    channelNameLen, channelNameBytes,
    metadataUriLen, metadataUriBytes,
    basePriceOption,
    slopeOption,
  ])
}

/**
 * Format SOL amount for display
 */
export function formatSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(4)
}

/**
 * Format price change as percentage
 */
export function formatPriceChange(change: number): string {
  const sign = change >= 0 ? '+' : ''
  return `${sign}${(change * 100).toFixed(2)}%`
}
