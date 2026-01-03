import { PinataSDK } from 'pinata-web3'

// Initialize Pinata SDK
const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'gateway.pinata.cloud',
})

/**
 * Token metadata structure for Sipzy coins
 */
export interface TokenMetadata {
  name: string
  symbol: string
  description: string
  image: string
  external_url?: string
  attributes: {
    pool_type: 'creator' | 'stream'
    identifier: string // channel_id or video_id
    parent_identifier?: string // channel_id for stream tokens
    created_at: string
    [key: string]: string | number | boolean | undefined
  }
}

/**
 * Upload token metadata to IPFS via Pinata
 */
export async function uploadTokenMetadata(metadata: TokenMetadata): Promise<string> {
  try {
    const result = await pinata.upload.json(metadata)
    return `ipfs://${result.IpfsHash}`
  } catch (error) {
    console.error('Failed to upload metadata to Pinata:', error)
    throw new Error('Failed to upload metadata')
  }
}

/**
 * Upload an image to IPFS via Pinata
 */
export async function uploadImage(
  imageBuffer: Buffer,
  filename: string
): Promise<string> {
  try {
    const uint8Array = new Uint8Array(imageBuffer)
    const file = new File([uint8Array], filename, { type: 'image/png' })
    const result = await pinata.upload.file(file)
    return `ipfs://${result.IpfsHash}`
  } catch (error) {
    console.error('Failed to upload image to Pinata:', error)
    throw new Error('Failed to upload image')
  }
}

/**
 * Create metadata for a Creator coin
 */
export async function createCreatorCoinMetadata(
  channelId: string,
  channelName: string,
  channelImage: string | null,
  subscriberCount: number
): Promise<string> {
  // If channel image is a URL, we could download and re-upload to IPFS
  // For now, we'll use the YouTube URL directly
  const imageUri = channelImage || 'https://via.placeholder.com/400x400?text=Creator'
  
  const metadata: TokenMetadata = {
    name: `$${channelName.replace(/\s+/g, '').toUpperCase().slice(0, 10)}`,
    symbol: channelName.replace(/\s+/g, '').toUpperCase().slice(0, 5),
    description: `Creator coin for ${channelName} YouTube channel. Hold this token to support the creator and participate in their economy.`,
    image: imageUri,
    external_url: `https://youtube.com/channel/${channelId}`,
    attributes: {
      pool_type: 'creator',
      identifier: channelId,
      created_at: new Date().toISOString(),
      subscribers: subscriberCount,
      platform: 'youtube',
    },
  }
  
  return uploadTokenMetadata(metadata)
}

/**
 * Create metadata for a Stream/Video coin
 */
export async function createStreamCoinMetadata(
  videoId: string,
  videoTitle: string,
  thumbnail: string,
  channelId: string,
  channelName: string,
  isLiveStream: boolean
): Promise<string> {
  const metadata: TokenMetadata = {
    name: `$${videoTitle.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)}`,
    symbol: videoTitle.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5),
    description: `${isLiveStream ? 'Livestream' : 'Video'} coin for "${videoTitle}" by ${channelName}. Trade to show hype and support the creator!`,
    image: thumbnail,
    external_url: `https://youtube.com/watch?v=${videoId}`,
    attributes: {
      pool_type: 'stream',
      identifier: videoId,
      parent_identifier: channelId,
      created_at: new Date().toISOString(),
      is_livestream: isLiveStream,
      platform: 'youtube',
    },
  }
  
  return uploadTokenMetadata(metadata)
}

/**
 * Fetch metadata from IPFS
 */
export async function fetchMetadata(ipfsUri: string): Promise<TokenMetadata | null> {
  try {
    // Convert ipfs:// to gateway URL
    const hash = ipfsUri.replace('ipfs://', '')
    const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'gateway.pinata.cloud'
    const url = `https://${gateway}/ipfs/${hash}`
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('Failed to fetch metadata:', error)
    return null
  }
}

/**
 * Get IPFS gateway URL from ipfs:// URI
 */
export function getGatewayUrl(ipfsUri: string): string {
  const hash = ipfsUri.replace('ipfs://', '')
  const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'gateway.pinata.cloud'
  return `https://${gateway}/ipfs/${hash}`
}

