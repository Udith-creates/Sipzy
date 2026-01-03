import { NextRequest, NextResponse } from 'next/server'
import { generateAuthUrl } from '@/lib/youtube'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }
    
    // Generate OAuth URL with user ID as state
    const authUrl = generateAuthUrl(user.id)
    
    return NextResponse.json({ authUrl })
  } catch (error) {
    console.error('YouTube OAuth error:', error)
    return NextResponse.json(
      { error: 'Failed to generate OAuth URL' },
      { status: 500 }
    )
  }
}

