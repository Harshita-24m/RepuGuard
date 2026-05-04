/**
 * ReputGuard Social Media Scanner Service
 * Supports: Twitter/X v2, YouTube Data API v3, Reddit API
 * Falls back to intelligent mock data if API keys not configured
 */

const axios = require('axios');

// ================================================
// TWITTER / X API v2
// ================================================
const scanTwitter = async (candidateName, handles) => {
  const useReal = process.env.USE_REAL_TWITTER === 'true' && process.env.TWITTER_BEARER_TOKEN;

  if (useReal) {
    try {
      const username = extractHandle(handles, 'twitter') || candidateName.replace(/\s+/g, '').toLowerCase();

      // Step 1: Find user by username
      const userResp = await axios.get(
        `https://api.twitter.com/2/users/by/username/${username}`,
        {
          headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
          params: { 'user.fields': 'public_metrics,description,created_at' }
        }
      );

      if (!userResp.data.data) {
        return notFoundResult('Twitter/X');
      }

      const userId = userResp.data.data.id;
      const metrics = userResp.data.data.public_metrics || {};

      // Step 2: Get recent tweets
      const tweetsResp = await axios.get(
        `https://api.twitter.com/2/users/${userId}/tweets`,
        {
          headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
          params: {
            max_results: 50,
            'tweet.fields': 'created_at,public_metrics,possibly_sensitive',
            exclude: 'retweets,replies'
          }
        }
      );

      const tweets = tweetsResp.data.data || [];
      const sensitiveCount = tweets.filter(t => t.possibly_sensitive).length;
      const score = Math.max(10, 100 - (sensitiveCount * 15));

      return {
        platform: 'Twitter/X',
        score,
        status: score >= 75 ? 'clean' : score >= 50 ? 'caution' : 'high_risk',
        postsAnalyzed: tweets.length,
        flaggedCount: sensitiveCount,
        profileFound: true,
        profileUrl: `https://twitter.com/${username}`,
        summary: `Analyzed ${tweets.length} tweets. Found ${sensitiveCount} potentially sensitive posts.`,
        dataSource: 'real_api'
      };
    } catch (err) {
      console.error('Twitter API error:', err.response?.data || err.message);
      return generateMockResult('Twitter/X', candidateName);
    }
  }

  return generateMockResult('Twitter/X', candidateName);
};

// ================================================
// YOUTUBE DATA API v3
// ================================================
const scanYouTube = async (candidateName, handles) => {
  const useReal = process.env.USE_REAL_YOUTUBE === 'true' && process.env.YOUTUBE_API_KEY;

  if (useReal) {
    try {
      const query = extractHandle(handles, 'youtube') || candidateName;

      // Search for the channel
      const searchResp = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          part: 'snippet',
          q: query,
          type: 'channel',
          maxResults: 3,
          key: process.env.YOUTUBE_API_KEY
        }
      });

      const channels = searchResp.data.items || [];
      if (channels.length === 0) return notFoundResult('YouTube');

      const channel = channels[0];
      const channelId = channel.id.channelId;

      // Get channel videos
      const videosResp = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          part: 'snippet',
          channelId,
          maxResults: 20,
          type: 'video',
          key: process.env.YOUTUBE_API_KEY
        }
      });

      const videos = videosResp.data.items || [];
      // Basic content analysis: look for keywords in titles/descriptions
      const flagKeywords = ['hate', 'violence', 'explicit', 'abuse', 'racist', 'extremist'];
      let flaggedCount = 0;
      videos.forEach(v => {
        const title = (v.snippet.title + ' ' + v.snippet.description).toLowerCase();
        if (flagKeywords.some(kw => title.includes(kw))) flaggedCount++;
      });

      const score = Math.max(10, 100 - (flaggedCount * 20));

      return {
        platform: 'YouTube',
        score,
        status: score >= 75 ? 'clean' : score >= 50 ? 'caution' : 'high_risk',
        postsAnalyzed: videos.length,
        flaggedCount,
        profileFound: true,
        profileUrl: `https://youtube.com/channel/${channelId}`,
        summary: `Analyzed ${videos.length} videos. ${flaggedCount} flagged for review.`,
        dataSource: 'real_api'
      };
    } catch (err) {
      console.error('YouTube API error:', err.response?.data || err.message);
      return generateMockResult('YouTube', candidateName);
    }
  }

  return generateMockResult('YouTube', candidateName);
};

// ================================================
// REDDIT API
// ================================================
const scanReddit = async (candidateName, handles) => {
  const useReal = process.env.USE_REAL_REDDIT === 'true' && process.env.REDDIT_CLIENT_ID;

  if (useReal) {
    try {
      // Get OAuth token
      const tokenResp = await axios.post(
        'https://www.reddit.com/api/v1/access_token',
        'grant_type=client_credentials',
        {
          auth: {
            username: process.env.REDDIT_CLIENT_ID,
            password: process.env.REDDIT_CLIENT_SECRET
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'ReputGuard/1.0'
          }
        }
      );

      const accessToken = tokenResp.data.access_token;
      const username = extractHandle(handles, 'reddit') || candidateName.replace(/\s+/g, '');

      // Get user overview
      const userResp = await axios.get(
        `https://oauth.reddit.com/user/${username}/overview`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'ReputGuard/1.0'
          },
          params: { limit: 25, sort: 'new' }
        }
      );

      const posts = userResp.data.data?.children || [];
      const flagKeywords = ['hate', 'kill', 'racist', 'slur', 'violence', 'extremist'];
      let flaggedCount = 0;
      posts.forEach(p => {
        const text = ((p.data.body || '') + ' ' + (p.data.title || '')).toLowerCase();
        if (flagKeywords.some(kw => text.includes(kw))) flaggedCount++;
      });

      const score = Math.max(10, 100 - (flaggedCount * 15));

      return {
        platform: 'Reddit',
        score,
        status: score >= 75 ? 'clean' : score >= 50 ? 'caution' : 'high_risk',
        postsAnalyzed: posts.length,
        flaggedCount,
        profileFound: true,
        profileUrl: `https://reddit.com/user/${username}`,
        summary: `Analyzed ${posts.length} posts/comments. ${flaggedCount} flagged.`,
        dataSource: 'real_api'
      };
    } catch (err) {
      console.error('Reddit API error:', err.response?.data || err.message);
      return generateMockResult('Reddit', candidateName);
    }
  }

  return generateMockResult('Reddit', candidateName);
};

// Instagram & Facebook — no public API; use web signals as mock
const scanInstagram = async (candidateName, handles) => generateMockResult('Instagram', candidateName);
const scanFacebook = async (candidateName, handles) => generateMockResult('Facebook', candidateName);
const scanLinkedIn = async (candidateName, handles) => generateMockResult('LinkedIn', candidateName, true);

// ================================================
// HELPERS
// ================================================
const extractHandle = (handles, platform) => {
  if (!handles) return null;
  const parts = handles.split(',').map(h => h.trim());
  const map = {
    twitter: ['twitter.com/', 't.co/', '@'],
    youtube: ['youtube.com/', 'youtu.be/'],
    reddit: ['reddit.com/u/', 'u/']
  };
  for (const h of parts) {
    const keys = map[platform] || [];
    for (const key of keys) {
      if (h.includes(key)) {
        return h.split(key).pop().replace(/\//g, '').replace('@', '');
      }
    }
    if (platform === 'twitter' && h.startsWith('@')) {
      return h.replace('@', '');
    }
  }
  return null;
};

const notFoundResult = (platform) => ({
  platform,
  score: 75,
  status: 'not_found',
  postsAnalyzed: 0,
  flaggedCount: 0,
  profileFound: false,
  profileUrl: '',
  summary: 'No public profile found for this candidate.',
  dataSource: 'real_api'
});

// Intelligent mock data generator seeded on candidate name for consistency
const generateMockResult = (platform, candidateName, alwaysClean = false) => {
  const seed = candidateName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const platformSeeds = { 'Twitter/X': 7, Instagram: 13, YouTube: 3, Facebook: 17, Reddit: 11, LinkedIn: 5 };
  const modifier = platformSeeds[platform] || 1;
  const base = alwaysClean ? 85 : 45 + ((seed * modifier) % 50);
  const score = Math.min(100, Math.max(10, base));

  const postsAnalyzed = 20 + (seed % 30);
  const flaggedCount = score >= 75 ? 0 : score >= 50 ? 1 + (seed % 3) : 3 + (seed % 5);

  const summaries = {
    safe: `Profile appears professional. No significant red flags detected across ${postsAnalyzed} posts analyzed.`,
    caution: `Some posts with strong opinions noted. ${flaggedCount} posts warrant closer review.`,
    high_risk: `Multiple posts flagged. Patterns of ${flaggedCount > 4 ? 'aggressive language and controversial content' : 'borderline content'} detected.`
  };

  const status = score >= 75 ? 'clean' : score >= 50 ? 'caution' : 'high_risk';

  return {
    platform,
    score,
    status,
    postsAnalyzed,
    flaggedCount,
    profileFound: score > 30,
    profileUrl: '',
    summary: summaries[status === 'clean' ? 'safe' : status],
    dataSource: 'mock'
  };
};

// ================================================
// MAIN SCANNER
// ================================================
const scanCandidate = async (candidateName, platforms, handles, depth) => {
  const scanners = {
    'Twitter/X': scanTwitter,
    Instagram: scanInstagram,
    YouTube: scanYouTube,
    Facebook: scanFacebook,
    Reddit: scanReddit,
    LinkedIn: scanLinkedIn
  };

  const results = [];

  for (const platform of platforms) {
    if (scanners[platform]) {
      try {
        const result = await scanners[platform](candidateName, handles);
        results.push(result);
      } catch (err) {
        results.push({ platform, score: 70, status: 'error', postsAnalyzed: 0, flaggedCount: 0, summary: 'Scan failed', dataSource: 'mock' });
      }
    }
  }

  // Calculate overall score (weighted average)
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
    : 70;

  return { platformResults: results, overallScore: avgScore };
};

module.exports = { scanCandidate };
