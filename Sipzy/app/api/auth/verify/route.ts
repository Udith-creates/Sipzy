import { NextRequest, NextResponse } from 'next/server'
import { authenticateWallet, setAuthCookie } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { walletAddress, signature, nonce } = await request.json()
    
    if (!walletAddress || !signature || !nonce) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    const result = await authenticateWallet(walletAddress, signature, nonce)
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 401 }
      )
    }
    
    // Set auth cookie
    await setAuthCookie(result.token!)
    
    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        walletAddress: result.user.walletAddress,
        displayName: result.user.displayName,
        isCreator: !!result.user.creator,
        creator: result.user.creator ? {
          channelId: result.user.creator.channelId,
          channelName: result.user.creator.channelName,
          coinCreated: result.user.creator.coinCreated,
        } : null,
      },
    })
  } catch (error) {
    console.error('Auth verify error:', error)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}

