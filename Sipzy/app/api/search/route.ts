import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { extractVideoId, extractChannelId, getVideoDetails } from '@/lib/youtube'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''
    const type = searchParams.get('type') // 'creator', 'stream', or null for both
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    
    // Check if query is a YouTube URL
    const videoId = extractVideoId(query)
    const channelId = extractChannelId(query)
    
    if (videoId) {
      // Search for existing video coin
      const video = await prisma.video.findUnique({
        where: { videoId },
        include: {
          creator: {
            select: { channelName: true, channelImage: true },
          },
        },
      })
      
      if (video && video.status === 'APPROVED') {
        const poolStats = await prisma.poolStats.findUnique({
          where: { poolAddress: video.coinAddress! },
        })
        
        return NextResponse.json({
          type: 'video',
          video: { ...video, stats: poolStats },
          message: 'Video coin found',
        })
      }
      
      // Video not in our system, fetch from YouTube
      const youtubeVideo = await getVideoDetails(videoId)
      if (youtubeVideo) {
        // Check if creator is opted in
        const creator = await prisma.creator.findUnique({
          where: { channelId: youtubeVideo.channelId },
        })
        
        return NextResponse.json({
          type: 'video',
          video: null,
          youtube: youtubeVideo,
          creatorOptedIn: !!creator?.coinCreated,
          message: creator?.coinCreated 
            ? 'Video found but coin not created yet. Creator can approve it.'
            : 'Video found but creator has not joined Sipzy yet.',
        })
      }
      
      return NextResponse.json({ type: 'video', video: null, message: 'Video not found' })
    }
    
    if (channelId) {
      // Search for creator
      const creator = await prisma.creator.findUnique({
        where: { channelId },
      })
      
      if (creator && creator.coinCreated) {
        const poolStats = await prisma.poolStats.findUnique({
          where: { poolAddress: creator.coinAddress! },
        })
        
        return NextResponse.json({
          type: 'creator',
          creator: { ...creator, stats: poolStats },
          message: 'Creator coin found',
        })
      }
      
      return NextResponse.json({
        type: 'creator',
        creator: null,
        channelId,
        message: creator 
          ? 'Creator found but coin not created yet'
          : 'Creator has not joined Sipzy yet',
      })
    }
    
    // Text search
    const results: any = { creators: [], streams: [] }
    
    if (!type || type === 'creator') {
      const creators = await prisma.creator.findMany({
        where: {
          coinCreated: true,
          channelName: { contains: query, mode: 'insensitive' },
        },
        take: limit,
      })
      
      results.creators = await Promise.all(
        creators.map(async (c: any) => {
          const stats = c.coinAddress 
            ? await prisma.poolStats.findUnique({ where: { poolAddress: c.coinAddress } })
            : null
          return { ...c, stats }
        })
      )
    }
    
    if (!type || type === 'stream') {
      const videos = await prisma.video.findMany({
        where: {
          status: 'APPROVED',
          title: { contains: query, mode: 'insensitive' },
        },
        include: {
          creator: {
            select: { channelName: true, channelImage: true },
          },
        },
        take: limit,
      })
      
      results.streams = await Promise.all(
        videos.map(async (v: any) => {
          const stats = v.coinAddress
            ? await prisma.poolStats.findUnique({ where: { poolAddress: v.coinAddress } })
            : null
          return { ...v, stats }
        })
      )
    }
    
    return NextResponse.json({
      type: 'search',
      query,
      results,
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

