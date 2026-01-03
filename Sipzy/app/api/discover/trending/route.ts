import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '10')
    
    // Get top creators
    const topCreators = await prisma.poolStats.findMany({
      where: { poolType: 'CREATOR' },
      orderBy: { totalVolume24h: 'desc' },
      take: limit,
    })
    
    // Get top streams
    const topStreams = await prisma.poolStats.findMany({
      where: { poolType: 'STREAM' },
      orderBy: { totalVolume24h: 'desc' },
      take: limit,
    })
    
    // Get recent transactions
    const recentTxs = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: {
          select: {
            walletAddress: true,
            displayName: true,
          },
        },
      },
    })
    
    // Enrich creator pools
    const enrichedCreators = await Promise.all(
      topCreators.map(async (pool: any) => {
        const creator = await prisma.creator.findFirst({
          where: { coinAddress: pool.poolAddress },
          select: { channelName: true, channelImage: true },
        })
        return { ...pool, creator }
      })
    )
    
    // Enrich stream pools
    const enrichedStreams = await Promise.all(
      topStreams.map(async (pool: any) => {
        const video = await prisma.video.findFirst({
          where: { coinAddress: pool.poolAddress },
          select: { title: true, thumbnail: true },
        })
        return { ...pool, video }
      })
    )
    
    return NextResponse.json({
      topCreators: enrichedCreators,
      topStreams: enrichedStreams,
      recentActivity: recentTxs.map((tx: any) => ({
        id: tx.id,
        type: tx.txType,
        poolType: tx.poolType,
        amount: tx.tokenAmount.toString(),
        solAmount: tx.solAmount.toString(),
        user: tx.user,
        createdAt: tx.createdAt,
      })),
    })
  } catch (error) {
    console.error('Trending error:', error)
    return NextResponse.json({ error: 'Failed to fetch trending' }, { status: 500 })
  }
}

