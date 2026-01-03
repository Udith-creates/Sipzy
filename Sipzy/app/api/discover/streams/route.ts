import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const sortBy = searchParams.get('sort') || 'volume'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    
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
      case 'newest':
        orderBy.updatedAt = 'desc'
        break
      default:
        orderBy.totalVolume24h = 'desc'
    }
    
    const [pools, total] = await Promise.all([
      prisma.poolStats.findMany({
        where: { poolType: 'STREAM' },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.poolStats.count({ where: { poolType: 'STREAM' } }),
    ])
    
    // Enrich with video data
    const enrichedPools = await Promise.all(
      pools.map(async (pool: any) => {
        const video = await prisma.video.findFirst({
          where: { coinAddress: pool.poolAddress },
          include: {
            creator: {
              select: {
                channelName: true,
                channelImage: true,
              },
            },
          },
        })
        
        return {
          ...pool,
          video,
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
    console.error('Discover streams error:', error)
    return NextResponse.json({ error: 'Failed to fetch streams' }, { status: 500 })
  }
}

