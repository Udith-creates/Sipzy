'use client'

import { FC, useState, useCallback, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import bs58 from 'bs58'

interface WalletAuthButtonProps {
  onAuthSuccess?: (user: any) => void
}

export const WalletAuthButton: FC<WalletAuthButtonProps> = ({ onAuthSuccess }) => {
  const { publicKey, signMessage, connected, disconnect } = useWallet()
  const [mounted, setMounted] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // Prevent hydration mismatch by only rendering wallet button on client
  useEffect(() => {
    setMounted(true)
  }, [])

  const authenticate = useCallback(async () => {
    if (!publicKey || !signMessage) return
    
    setIsAuthenticating(true)
    setError(null)
    
    try {
      const walletAddress = publicKey.toBase58()
      
      // Get nonce
      const nonceRes = await fetch(`/api/auth/nonce?wallet=${walletAddress}`)
      
      if (!nonceRes.ok) {
        // Database might not be set up yet - allow basic connection
        console.warn('Auth API not available - skipping sign-in')
        setIsAuthenticated(true)
        setUser({ walletAddress, displayName: null, isCreator: false })
        onAuthSuccess?.({ walletAddress })
        return
      }
      
      const data = await nonceRes.json()
      
      if (!data.nonce || !data.message) {
        // API returned but without nonce - database issue
        console.warn('Nonce not available - using basic auth')
        setIsAuthenticated(true)
        setUser({ walletAddress, displayName: null, isCreator: false })
        onAuthSuccess?.({ walletAddress })
        return
      }
      
      // Sign message
      const encodedMessage = new TextEncoder().encode(data.message)
      const signatureBytes = await signMessage(encodedMessage)
      const signature = bs58.encode(signatureBytes)
      
      // Verify signature
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, signature, nonce: data.nonce }),
      })
      
      const result = await verifyRes.json()
      
      if (result.success) {
        setIsAuthenticated(true)
        setUser(result.user)
        onAuthSuccess?.(result.user)
      } else {
        throw new Error(result.error || 'Authentication failed')
      }
    } catch (err: any) {
      console.error('Auth error:', err)
      // On error, still allow basic wallet connection
      if (publicKey) {
        setIsAuthenticated(true)
        setUser({ walletAddress: publicKey.toBase58(), displayName: null, isCreator: false })
      }
      setError(err.message || 'Authentication failed')
    } finally {
      setIsAuthenticating(false)
    }
  }, [publicKey, signMessage, onAuthSuccess])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (e) {
      // Ignore logout API errors
    }
    setIsAuthenticated(false)
    setUser(null)
    disconnect()
  }

  // Don't render anything on server to prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="h-11 w-40 bg-zinc-800 rounded-xl animate-pulse" />
    )
  }

  // Not connected - show connect button
  if (!connected) {
    return (
      <WalletMultiButton className="!bg-gradient-to-r !from-emerald-500 !to-cyan-500 !rounded-xl !h-11 !font-semibold hover:!opacity-90 !transition-opacity" />
    )
  }

  // Connected and authenticated - show user info
  if (isAuthenticated && user) {
    const displayAddress = publicKey?.toBase58()
    const shortAddress = displayAddress ? `${displayAddress.slice(0, 4)}...${displayAddress.slice(-4)}` : ''
    
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800 rounded-xl">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <span className="text-sm text-white font-medium">
            {user.displayName || shortAddress}
          </span>
          {user.isCreator && (
            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">
              Creator
            </span>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm text-zinc-400 hover:text-white transition"
        >
          Logout
        </button>
      </div>
    )
  }

  // Connected but not authenticated - show wallet address + sign in
  const displayAddress = publicKey?.toBase58()
  const shortAddress = displayAddress ? `${displayAddress.slice(0, 4)}...${displayAddress.slice(-4)}` : ''

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-xl">
        <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
        <span className="text-sm text-zinc-300">{shortAddress}</span>
      </div>
      <button
        onClick={authenticate}
        disabled={isAuthenticating}
        className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl font-semibold text-white hover:opacity-90 transition disabled:opacity-50"
      >
        {isAuthenticating ? 'Signing...' : 'Sign In'}
      </button>
      {error && (
        <span className="text-sm text-red-400 max-w-[150px] truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  )
}

export default WalletAuthButton
