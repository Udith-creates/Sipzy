import { NextRequest, NextResponse } from 'next/server'
import { generateNonce, createSignMessage } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const walletAddress = searchParams.get('wallet')
  
  if (!walletAddress) {
    return NextResponse.json(
      { error: 'Wallet address is required' },
      { status: 400 }
    )
  }
  
  try {
    const nonce = await generateNonce(walletAddress)
    const message = createSignMessage(nonce)
    
    return NextResponse.json({ nonce, message })
  } catch (error: any) {
    console.error('Error generating nonce:', error)
    
    // Check if it's a database connection error
    if (error.code === 'P1001' || error.code === 'P1000' || error.message?.includes('database')) {
      return NextResponse.json(
        { error: 'Database not configured', code: 'DB_NOT_CONFIGURED' },
        { status: 503 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to generate nonce' },
      { status: 500 }
    )
  }
}

