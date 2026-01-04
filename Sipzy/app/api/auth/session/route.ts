import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ authenticated: false })
    }
    
    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        displayName: user.displayName,
        isCreator: !!user.creator,
        creator: user.creator ? {
          channelId: user.creator.channelId,
          channelName: user.creator.channelName,
          coinCreated: user.creator.coinCreated,
        } : null,
      },
    })
  } catch (error) {
    console.error('Session check error:', error)
    return NextResponse.json({ authenticated: false })
  }
}

