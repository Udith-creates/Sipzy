import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Connection, PublicKey } from '@solana/web3.js'
import { fetchPoolState, getCurrentPrice, LAMPORTS_PER_SOL } from '@/lib/program'

interface RouteParams {
  params: Promise<{ address: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { address } = await params
    
    // Validate address
    let poolPubkey: PublicKey
    try {
      poolPubkey = new PublicKey(address)
    } catch {
      return NextResponse.json({ error: 'Invalid pool address' }, { status: 400 })
    }
    
    // Fetch on-chain state
    const connection = new Connection(
      process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com'
    )
    
    const poolState = await fetchPoolState(connection, poolPubkey)
    
    if (!poolState) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
    }
    
    // Get database stats
    const stats = await prisma.poolStats.findUnique({
      where: { poolAddress: address },
    })
    
    // Get related data based on pool type
    let metadata: any = null
    if (poolState.poolType === 0) { // Creator
      const creator = await prisma.creator.findFirst({
        where: { coinAddress: address },
        select: {
          channelName: true,
          channelImage: true,
          subscriberCount: true,
        },
      })
      metadata = { creator }
    } else { // Stream
      const video = await prisma.video.findFirst({
        where: { coinAddress: address },
        include: {
          creator: {
            select: { channelName: true, channelImage: true },
          },
        },
      })
      metadata = { video }
    }
    
    // Get recent transactions
    const recentTxs = await prisma.transaction.findMany({
      where: { poolAddress: address },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: {
          select: { walletAddress: true, displayName: true },
        },
      },
    })
    
    // Get holders count
    const holders = await prisma.holding.count({
      where: { poolAddress: address, amount: { gt: 0 } },
    })
    
    return NextResponse.json({
      pool: {
        address,
        type: poolState.poolType === 0 ? 'creator' : 'stream',
        identifier: poolState.identifier,
        displayName: poolState.displayName,
        parentIdentifier: poolState.parentIdentifier,
        creatorWallet: poolState.creatorWallet.toString(),
        totalSupply: poolState.totalSupply.toString(),
        reserveSol: poolState.reserveSol.toString(),
        currentPrice: getCurrentPrice(poolState),
        currentPriceSol: getCurrentPrice(poolState) / LAMPORTS_PER_SOL,
        basePrice: poolState.basePrice.toString(),
        curveParam: poolState.curveParam.toString(),
        metadataUri: poolState.metadataUri,
        isActive: poolState.isActive,
        createdAt: new Date(poolState.createdAt.toNumber() * 1000),
      },
      stats,
      metadata,
      holders,
      recentTransactions: recentTxs.map((tx: any) => ({
        id: tx.id,
        type: tx.txType,
        amount: tx.tokenAmount.toString(),
        solAmount: tx.solAmount.toString(),
        signature: tx.signature,
        user: tx.user,
        createdAt: tx.createdAt,
      })),
    })
  } catch (error) {
    console.error('Pool fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch pool' }, { status: 500 })
  }
}

