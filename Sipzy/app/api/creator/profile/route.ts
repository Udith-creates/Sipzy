import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    if (!user.creator) {
      return NextResponse.json({ error: 'Not a creator' }, { status: 404 })
    }
    
    // Get creator stats
    const videosCount = await prisma.video.count({
      where: { creatorId: user.creator.id },
    })
    
    const approvedVideos = await prisma.video.count({
      where: { creatorId: user.creator.id, status: 'APPROVED' },
    })
    
    const pendingVideos = await prisma.video.count({
      where: { creatorId: user.creator.id, status: 'PENDING' },
    })
    
    return NextResponse.json({
      creator: {
        id: user.creator.id,
        channelId: user.creator.channelId,
        channelName: user.creator.channelName,
        channelImage: user.creator.channelImage,
        subscriberCount: user.creator.subscriberCount,
        coinCreated: user.creator.coinCreated,
        coinAddress: user.creator.coinAddress,
        autoApproveVideos: user.creator.autoApproveVideos,
      },
      stats: {
        totalVideos: videosCount,
        approvedVideos,
        pendingVideos,
      },
    })
  } catch (error) {
    console.error('Creator profile error:', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser()
    
    if (!user || !user.creator) {
      return NextResponse.json({ error: 'Not a creator' }, { status: 401 })
    }
    
    const body = await request.json()
    const { autoApproveVideos, coinAddress, metadataUri } = body
    
    const updated = await prisma.creator.update({
      where: { id: user.creator.id },
      data: {
        ...(autoApproveVideos !== undefined && { autoApproveVideos }),
        ...(coinAddress && { coinAddress, coinCreated: true }),
        ...(metadataUri && { metadataUri }),
      },
    })
    
    return NextResponse.json({ success: true, creator: updated })
  } catch (error) {
    console.error('Creator update error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}

