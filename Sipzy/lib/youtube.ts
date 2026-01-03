import { google, youtube_v3 } from 'googleapis'
import { prisma } from './db'

// YouTube OAuth Configuration
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID!
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET!
const YOUTUBE_REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/api/auth/youtube/callback'

// Scopes needed for YouTube integration
const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
]

// Create OAuth2 client
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    YOUTUBE_REDIRECT_URI
  )
}

/**
 * Generate YouTube OAuth authorization URL
 */
export function generateAuthUrl(state: string): string {
  const oauth2Client = createOAuth2Client()
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: YOUTUBE_SCOPES,
    state, // Pass user ID or session info
    prompt: 'consent', // Force consent to get refresh token
  })
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = createOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string) {
  const oauth2Client = createOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  
  const { credentials } = await oauth2Client.refreshAccessToken()
  return credentials
}

/**
 * Get YouTube client with valid credentials
 */
async function getYouTubeClient(creatorId: string): Promise<youtube_v3.Youtube> {
  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
  })
  
  if (!creator) {
    throw new Error('Creator not found')
  }
  
  const oauth2Client = createOAuth2Client()
  
  // Check if token needs refresh
  if (new Date() >= creator.tokenExpiry) {
    const newCredentials = await refreshAccessToken(creator.refreshToken)
    
    // Update tokens in database
    await prisma.creator.update({
      where: { id: creatorId },
      data: {
        accessToken: newCredentials.access_token!,
        tokenExpiry: new Date(newCredentials.expiry_date!),
      },
    })
    
    oauth2Client.setCredentials(newCredentials)
  } else {
    oauth2Client.setCredentials({
      access_token: creator.accessToken,
      refresh_token: creator.refreshToken,
    })
  }
  
  return google.youtube({ version: 'v3', auth: oauth2Client })
}

/**
 * Get channel information for authenticated user
 */
export async function getChannelInfo(accessToken: string): Promise<{
  channelId: string
  channelName: string
  channelImage: string | null
  channelBanner: string | null
  subscriberCount: number
  videoCount: number
}> {
  const oauth2Client = createOAuth2Client()
  oauth2Client.setCredentials({ access_token: accessToken })
  
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client })
  
  const response = await youtube.channels.list({
    part: ['snippet', 'statistics', 'brandingSettings'],
    mine: true,
  })
  
  const channel = response.data.items?.[0]
  
  if (!channel) {
    throw new Error('No channel found for this account')
  }
  
  return {
    channelId: channel.id!,
    channelName: channel.snippet?.title || 'Unknown',
    channelImage: channel.snippet?.thumbnails?.high?.url || null,
    channelBanner: channel.brandingSettings?.image?.bannerExternalUrl || null,
    subscriberCount: parseInt(channel.statistics?.subscriberCount || '0'),
    videoCount: parseInt(channel.statistics?.videoCount || '0'),
  }
}

/**
 * Get recent videos from a creator's channel
 */
export async function getChannelVideos(
  creatorId: string,
  maxResults: number = 50
): Promise<Array<{
  videoId: string
  title: string
  description: string | null
  thumbnail: string
  publishedAt: Date
  isLiveStream: boolean
  duration: number | null
  viewCount: number
  likeCount: number
}>> {
  const youtube = await getYouTubeClient(creatorId)
  const creator = await prisma.creator.findUnique({ where: { id: creatorId } })
  
  if (!creator) {
    throw new Error('Creator not found')
  }
  
  // Get channel's upload playlist
  const channelResponse = await youtube.channels.list({
    part: ['contentDetails'],
    id: [creator.channelId],
  })
  
  const uploadPlaylistId = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  
  if (!uploadPlaylistId) {
    return []
  }
  
  // Get videos from upload playlist
  const playlistResponse = await youtube.playlistItems.list({
    part: ['snippet', 'contentDetails'],
    playlistId: uploadPlaylistId,
    maxResults,
  })
  
  const videoIds = playlistResponse.data.items
    ?.map(item => item.contentDetails?.videoId)
    .filter(Boolean) as string[]
  
  if (!videoIds.length) {
    return []
  }
  
  // Get detailed video info
  const videosResponse = await youtube.videos.list({
    part: ['snippet', 'contentDetails', 'statistics', 'liveStreamingDetails'],
    id: videoIds,
  })
  
  return (videosResponse.data.items || []).map(video => ({
    videoId: video.id!,
    title: video.snippet?.title || 'Untitled',
    description: video.snippet?.description || null,
    thumbnail: video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.default?.url || '',
    publishedAt: new Date(video.snippet?.publishedAt || Date.now()),
    isLiveStream: !!video.liveStreamingDetails,
    duration: parseDuration(video.contentDetails?.duration),
    viewCount: parseInt(video.statistics?.viewCount || '0'),
    likeCount: parseInt(video.statistics?.likeCount || '0'),
  }))
}

/**
 * Get video details by video ID (public API, no auth needed)
 */
export async function getVideoDetails(videoId: string): Promise<{
  title: string
  description: string | null
  thumbnail: string
  channelId: string
  channelName: string
  publishedAt: Date
  isLiveStream: boolean
  duration: number | null
  viewCount: number
  likeCount: number
} | null> {
  const youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY, // Use API key for public data
  })
  
  const response = await youtube.videos.list({
    part: ['snippet', 'contentDetails', 'statistics', 'liveStreamingDetails'],
    id: [videoId],
  })
  
  const video = response.data.items?.[0]
  
  if (!video) {
    return null
  }
  
  return {
    title: video.snippet?.title || 'Untitled',
    description: video.snippet?.description || null,
    thumbnail: video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.default?.url || '',
    channelId: video.snippet?.channelId || '',
    channelName: video.snippet?.channelTitle || 'Unknown',
    publishedAt: new Date(video.snippet?.publishedAt || Date.now()),
    isLiveStream: !!video.liveStreamingDetails,
    duration: parseDuration(video.contentDetails?.duration),
    viewCount: parseInt(video.statistics?.viewCount || '0'),
    likeCount: parseInt(video.statistics?.likeCount || '0'),
  }
}

/**
 * Extract video ID from YouTube URL
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /^[a-zA-Z0-9_-]{11}$/, // Direct video ID
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) {
      return match[1] || match[0]
    }
  }
  
  return null
}

/**
 * Extract channel ID from YouTube URL
 */
export function extractChannelId(url: string): string | null {
  const patterns = [
    /youtube\.com\/channel\/([^\/\n?#]+)/,
    /youtube\.com\/@([^\/\n?#]+)/,
    /^UC[a-zA-Z0-9_-]{22}$/, // Direct channel ID
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) {
      return match[1] || match[0]
    }
  }
  
  return null
}

/**
 * Parse ISO 8601 duration to seconds
 */
function parseDuration(duration: string | null | undefined): number | null {
  if (!duration) return null
  
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return null
  
  const hours = parseInt(match[1] || '0')
  const minutes = parseInt(match[2] || '0')
  const seconds = parseInt(match[3] || '0')
  
  return hours * 3600 + minutes * 60 + seconds
}

/**
 * Sync videos for a creator (used by cron job)
 */
export async function syncCreatorVideos(creatorId: string): Promise<number> {
  const videos = await getChannelVideos(creatorId)
  
  let newCount = 0
  
  for (const video of videos) {
    const existing = await prisma.video.findUnique({
      where: { videoId: video.videoId },
    })
    
    if (!existing) {
      await prisma.video.create({
        data: {
          videoId: video.videoId,
          creatorId,
          title: video.title,
          description: video.description,
          thumbnail: video.thumbnail,
          duration: video.duration,
          viewCount: video.viewCount,
          likeCount: video.likeCount,
          publishedAt: video.publishedAt,
          isLiveStream: video.isLiveStream,
          status: 'PENDING',
        },
      })
      newCount++
    } else {
      // Update stats
      await prisma.video.update({
        where: { videoId: video.videoId },
        data: {
          viewCount: video.viewCount,
          likeCount: video.likeCount,
        },
      })
    }
  }
  
  return newCount
}

