import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncCreatorVideos } from '@/lib/youtube'

// Verify cron secret to prevent unauthorized calls
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (!cronSecret) return true // Allow in development
  return authHeader === `Bearer ${cronSecret}`
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    // Get all creators with coins created
    const creators = await prisma.creator.findMany({
      where: { coinCreated: true },
      select: { id: true, channelName: true },
    })
    
    const results = []
    
    for (const creator of creators) {
      try {
        const newVideos = await syncCreatorVideos(creator.id)
        results.push({
          creatorId: creator.id,
          channelName: creator.channelName,
          newVideos,
          status: 'success',
        })
      } catch (error: any) {
        results.push({
          creatorId: creator.id,
          channelName: creator.channelName,
          error: error.message,
          status: 'error',
        })
      }
    }
    
    // Update sync state
    await prisma.syncState.upsert({
      where: { key: 'video_sync' },
      update: { lastSync: new Date() },
      create: { key: 'video_sync', lastSync: new Date() },
    })
    
    return NextResponse.json({
      success: true,
      synced: results.length,
      results,
    })
  } catch (error) {
    console.error('Video sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

