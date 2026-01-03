import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface RouteParams {
  params: Promise<{ id: string }>
}

// Approve or reject a video
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser()
    
    if (!user || !user.creator) {
      return NextResponse.json({ error: 'Not a creator' }, { status: 401 })
    }
    
    const { id } = await params
    const body = await request.json()
    const { action, coinAddress, metadataUri, rejectedReason } = body
    
    // Find the video
    const video = await prisma.video.findUnique({
      where: { id },
    })
    
    if (!video || video.creatorId !== user.creator.id) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }
    
    if (video.status !== 'PENDING') {
      return NextResponse.json({ error: 'Video already processed' }, { status: 400 })
    }
    
    if (action === 'approve') {
      if (!coinAddress) {
        return NextResponse.json({ error: 'Coin address required' }, { status: 400 })
      }
      
      await prisma.video.update({
        where: { id },
        data: {
          status: 'APPROVED',
          coinAddress,
          metadataUri,
        },
      })
      
      return NextResponse.json({ success: true, status: 'APPROVED' })
    }
    
    if (action === 'reject') {
      await prisma.video.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectedReason,
        },
      })
      
      return NextResponse.json({ success: true, status: 'REJECTED' })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Video action error:', error)
    return NextResponse.json({ error: 'Failed to process video' }, { status: 500 })
  }
}

