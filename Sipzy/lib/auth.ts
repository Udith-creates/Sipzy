import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { prisma } from './db'

// JWT Configuration
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'sipzy-super-secret-key-change-in-production'
)
const JWT_ISSUER = 'sipzy'
const JWT_AUDIENCE = 'sipzy-users'
const JWT_EXPIRY = '7d'

export interface JWTPayload {
  sub: string // User ID
  wallet: string // Wallet address
  iat: number
  exp: number
}

/**
 * Generate a nonce for wallet signature verification
 */
export async function generateNonce(walletAddress: string): Promise<string> {
  // Upsert user and get/create nonce
  const user = await prisma.user.upsert({
    where: { walletAddress },
    update: { nonce: crypto.randomUUID() },
    create: { 
      walletAddress,
      nonce: crypto.randomUUID()
    },
  })
  
  return user.nonce
}

/**
 * Create the message to be signed by the wallet
 */
export function createSignMessage(nonce: string): string {
  return `Sign this message to authenticate with Sipzy.\n\nNonce: ${nonce}\n\nThis request will not trigger a blockchain transaction or cost any gas fees.`
}

/**
 * Verify a wallet signature
 */
export async function verifySignature(
  walletAddress: string,
  signature: string,
  message: string
): Promise<boolean> {
  try {
    const publicKey = bs58.decode(walletAddress)
    const signatureBytes = bs58.decode(signature)
    const messageBytes = new TextEncoder().encode(message)
    
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey)
  } catch (error) {
    console.error('Signature verification failed:', error)
    return false
  }
}

/**
 * Create a JWT token for authenticated user
 */
export async function createToken(userId: string, walletAddress: string): Promise<string> {
  const token = await new SignJWT({ wallet: walletAddress })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(JWT_SECRET)
  
  return token
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    })
    
    return {
      sub: payload.sub as string,
      wallet: payload.wallet as string,
      iat: payload.iat as number,
      exp: payload.exp as number,
    }
  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

/**
 * Get current user from session cookie
 */
export async function getCurrentUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get('sipzy-auth')?.value
  
  if (!token) {
    return null
  }
  
  const payload = await verifyToken(token)
  if (!payload) {
    return null
  }
  
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: {
      creator: true,
    },
  })
  
  return user
}

/**
 * Set auth cookie
 */
export async function setAuthCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set('sipzy-auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
}

/**
 * Clear auth cookie
 */
export async function clearAuthCookie() {
  const cookieStore = await cookies()
  cookieStore.delete('sipzy-auth')
}

/**
 * Complete authentication flow
 */
export async function authenticateWallet(
  walletAddress: string,
  signature: string,
  nonce: string
): Promise<{ success: boolean; token?: string; user?: any; error?: string }> {
  try {
    // Get user and verify nonce
    const user = await prisma.user.findUnique({
      where: { walletAddress },
      include: { creator: true },
    })
    
    if (!user || user.nonce !== nonce) {
      return { success: false, error: 'Invalid nonce' }
    }
    
    // Verify signature
    const message = createSignMessage(nonce)
    const isValid = await verifySignature(walletAddress, signature, message)
    
    if (!isValid) {
      return { success: false, error: 'Invalid signature' }
    }
    
    // Rotate nonce for next auth
    await prisma.user.update({
      where: { id: user.id },
      data: { nonce: crypto.randomUUID() },
    })
    
    // Create token
    const token = await createToken(user.id, walletAddress)
    
    return { success: true, token, user }
  } catch (error) {
    console.error('Authentication error:', error)
    return { success: false, error: 'Authentication failed' }
  }
}

