import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Connection, PublicKey } from '@solana/web3.js'
import { fetchPoolState, getCurrentPrice } from '@/lib/program'

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true
  return authHeader === `Bearer ${cronSecret}`
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    const connection = new Connection(
      process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com'
    )
    
    // Get all pool stats
    const pools = await prisma.poolStats.findMany()
    
    const results = []
    
    for (const pool of pools) {
      try {
        const poolPubkey = new PublicKey(pool.poolAddress)
        const state = await fetchPoolState(connection, poolPubkey)
        
        if (state) {
          const currentPrice = BigInt(Math.floor(getCurrentPrice(state)))
          const oldPrice = pool.currentPrice
          
          // Calculate price change
          const priceChange24h = oldPrice > 0 
            ? Number(currentPrice - oldPrice) / Number(oldPrice)
            : 0
          
          // Get holder count
          const holders = await prisma.holding.count({
            where: { poolAddress: pool.poolAddress, amount: { gt: 0 } },
          })
          
          // Get 24h volume
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
          const volume24h = await prisma.transaction.aggregate({
            where: {
              poolAddress: pool.poolAddress,
              createdAt: { gte: oneDayAgo },
            },
            _sum: { solAmount: true },
          })
          
          // Calculate market cap
          const marketCap = state.totalSupply.toNumber() > 0
            ? BigInt(Math.floor(getCurrentPrice(state) * state.totalSupply.toNumber()))
            : BigInt(0)
          
          await prisma.poolStats.update({
            where: { poolAddress: pool.poolAddress },
            data: {
              totalSupply: BigInt(state.totalSupply.toString()),
              reserveSol: BigInt(state.reserveSol.toString()),
              currentPrice,
              holders,
              totalVolume24h: volume24h._sum.solAmount || BigInt(0),
              priceChange24h,
              marketCap,
              allTimeHigh: currentPrice > pool.allTimeHigh ? currentPrice : pool.allTimeHigh,
            },
          })
          
          // Create price snapshot
          await prisma.priceSnapshot.create({
            data: {
              poolAddress: pool.poolAddress,
              poolType: pool.poolType,
              price: currentPrice,
              supply: BigInt(state.totalSupply.toString()),
              reserve: BigInt(state.reserveSol.toString()),
              timestamp: new Date(),
            },
          })
          
          results.push({ poolAddress: pool.poolAddress, status: 'updated' })
        }
      } catch (error: any) {
        results.push({ poolAddress: pool.poolAddress, status: 'error', error: error.message })
      }
    }
    
    // Update sync state
    await prisma.syncState.upsert({
      where: { key: 'stats_update' },
      update: { lastSync: new Date() },
      create: { key: 'stats_update', lastSync: new Date() },
    })
    
    return NextResponse.json({
      success: true,
      updated: results.filter(r => r.status === 'updated').length,
      results,
    })
  } catch (error) {
    console.error('Stats update error:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

