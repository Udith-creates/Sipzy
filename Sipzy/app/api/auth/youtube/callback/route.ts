import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, getChannelInfo } from '@/lib/youtube'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state') // User ID
  const error = searchParams.get('error')
  
  // Redirect URL for frontend
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  if (error) {
    return NextResponse.redirect(`${baseUrl}/dashboard?error=oauth_denied`)
  }
  
  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/dashboard?error=invalid_callback`)
  }
  
  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)
    
    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(`${baseUrl}/dashboard?error=no_tokens`)
    }
    
    // Get channel info
    const channelInfo = await getChannelInfo(tokens.access_token)
    
    // Check if channel already registered by another user
    const existingCreator = await prisma.creator.findUnique({
      where: { channelId: channelInfo.channelId },
    })
    
    if (existingCreator && existingCreator.userId !== state) {
      return NextResponse.redirect(`${baseUrl}/dashboard?error=channel_taken`)
    }
    
    // Create or update creator record
    await prisma.creator.upsert({
      where: { userId: state },
      update: {
        channelId: channelInfo.channelId,
        channelName: channelInfo.channelName,
        channelImage: channelInfo.channelImage,
        channelBanner: channelInfo.channelBanner,
        subscriberCount: channelInfo.subscriberCount,
        videoCount: channelInfo.videoCount,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token!,
        tokenExpiry: new Date(tokens.expiry_date || Date.now() + 3600000),
      },
      create: {
        userId: state,
        channelId: channelInfo.channelId,
        channelName: channelInfo.channelName,
        channelImage: channelInfo.channelImage,
        channelBanner: channelInfo.channelBanner,
        subscriberCount: channelInfo.subscriberCount,
        videoCount: channelInfo.videoCount,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token!,
        tokenExpiry: new Date(tokens.expiry_date || Date.now() + 3600000),
      },
    })
    
    return NextResponse.redirect(`${baseUrl}/dashboard?success=youtube_connected`)
  } catch (error) {
    console.error('YouTube callback error:', error)
    return NextResponse.redirect(`${baseUrl}/dashboard?error=callback_failed`)
  }
}

