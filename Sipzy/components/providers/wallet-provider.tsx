'use client'

import { FC, ReactNode, useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'

import '@solana/wallet-adapter-react-ui/styles.css'

interface Props {
  children: ReactNode
}

export const SolanaWalletProvider: FC<Props> = ({ children }) => {
  const endpoint = useMemo(() => {
    // Use localnet for development, devnet for testing
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl('devnet')
    console.log('Using RPC endpoint:', rpcUrl)
    return rpcUrl
  }, [])

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  )

  // Connection config for better reliability
  const connectionConfig = useMemo(() => {
    // For localhost, use port 8900 for WebSocket (solana-test-validator default)
    let wsEndpoint: string | undefined
    if (endpoint.includes('127.0.0.1:8899') || endpoint.includes('localhost:8899')) {
      wsEndpoint = endpoint.replace('http', 'ws').replace('8899', '8900')
    } else if (endpoint.startsWith('http')) {
      wsEndpoint = endpoint.replace('http', 'ws')
    }
    
    return {
      commitment: 'confirmed' as const,
      confirmTransactionInitialTimeout: 60000, // 60 seconds
      wsEndpoint,
    }
  }, [endpoint])

  return (
    <ConnectionProvider endpoint={endpoint} config={connectionConfig}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

