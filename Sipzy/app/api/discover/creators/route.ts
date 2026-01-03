import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const sortBy = searchParams.get('sort') || 'volume' // volume, holders, price_change
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    
    // Get creator pool stats
    const orderBy: any = {}
    switch (sortBy) {
      case 'volume':
        orderBy.totalVolume24h = 'desc'
        break
      case 'holders':
        orderBy.holders = 'desc'
        break
      case 'price_change':
        orderBy.priceChange24h = 'desc'
        break
      default:
        orderBy.totalVolume24h = 'desc'
    }
    
    const [pools, total] = await Promise.all([
      prisma.poolStats.findMany({
        where: { poolType: 'CREATOR' },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.poolStats.count({ where: { poolType: 'CREATOR' } }),
    ])
    
    // Enrich with creator data
    const enrichedPools = await Promise.all(
      pools.map(async (pool: any) => {
        const creator = await prisma.creator.findFirst({
          where: { coinAddress: pool.poolAddress },
          select: {
            channelName: true,
            channelImage: true,
            subscriberCount: true,
          },
        })
        
        return {
          ...pool,
          creator,
        }
      })
    )
    
    return NextResponse.json({
      pools: enrichedPools,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Discover creators error:', error)
    return NextResponse.json({ error: 'Failed to fetch creators' }, { status: 500 })
  }
}

