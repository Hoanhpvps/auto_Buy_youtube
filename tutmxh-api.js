const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const { parseStringPromise } = require('xml2js');
const { google } = require('googleapis');
const db = require('./database');

const API_URL = 'https://tutmxh.com/api/v2';

// Initialize YouTube API
let youtube = null;
if (process.env.YOUTUBE_API_KEY) {
  youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY
  });
}

// Call TUTMXH API
async function callAPI(params) {
  const formData = new URLSearchParams();
  for (const key in params) {
    formData.append(key, params[key]);
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString()
  });

  if (!response.ok) {
    throw new Error(`Lỗi kết nối tới TUTMXH: HTTP ${response.status}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Phản hồi không phải JSON: ${text.substring(0, 200)}`);
  }
}

// Check balance
async function checkBalance(apiKey) {
  // ✅ FIX: Ném lỗi thực sự thay vì trả về null
  const data = await callAPI({
    key: apiKey,
    action: 'balance'
  });

  if (data.error) {
    throw new Error(data.error);
  }

  if (data.balance !== undefined) {
    db.setConfig('last_balance', data.balance.toString());
    return parseFloat(data.balance);
  }

  throw new Error('Phản hồi API không hợp lệ: ' + JSON.stringify(data));
}

// Get services
async function getServices(apiKey) {
  // ✅ FIX: Ném lỗi thực sự thay vì trả về []
  const data = await callAPI({
    key: apiKey,
    action: 'services'
  });

  if (data.error) {
    throw new Error(data.error);
  }

  if (Array.isArray(data)) {
    const youtubeServices = data.filter(s =>
      s.category && s.category.toLowerCase().includes('youtube')
    );
    db.setConfig('services', JSON.stringify(youtubeServices));
    return youtubeServices;
  }

  throw new Error('Phản hồi services không hợp lệ: ' + JSON.stringify(data));
}

// Create order
async function createOrder(apiKey, link, serviceId, quantity) {
  const data = await callAPI({
    key: apiKey,
    action: 'add',
    service: serviceId,
    link: link,
    quantity: quantity
  });

  if (data.order) {
    return data.order;
  } else if (data.error) {
    throw new Error(data.error);
  }
  return null;
}

// Fetch latest video from YouTube RSS
async function fetchLatestVideo(channelId) {
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const response = await fetch(rssUrl);
    const text = await response.text();

    const result = await parseStringPromise(text);

    if (!result.feed || !result.feed.entry || result.feed.entry.length === 0) {
      return null;
    }

    const entry = result.feed.entry[0];

    const videoId = entry['yt:videoId'][0];
    const title = entry.title[0];
    const published = new Date(entry.published[0]);
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    return { videoId, title, url, published };
  } catch (error) {
    console.error('Error fetching video:', error);
    return null;
  }
}

// Check if video is recent (published in last N minutes)
function isRecentVideo(publishedDate, maxMinutes = 15) {
  const now = new Date();
  const diffMinutes = (now - publishedDate) / 1000 / 60;
  return diffMinutes <= maxMinutes;
}

// Check if video is livestream using YouTube Data API
async function checkIfLivestream(videoId) {
  if (!youtube) return null;

  try {
    const response = await youtube.videos.list({
      part: 'snippet,liveStreamingDetails',
      id: videoId
    });

    if (!response.data.items || response.data.items.length === 0) return null;

    const video = response.data.items[0];
    const snippet = video.snippet;
    const broadcastContent = snippet.liveBroadcastContent;
    const isLivestream = broadcastContent === 'live' || broadcastContent === 'upcoming' ||
      (video.liveStreamingDetails !== undefined);

    return {
      isLivestream,
      status: broadcastContent,
      scheduledStartTime: video.liveStreamingDetails?.scheduledStartTime || null,
      actualStartTime: video.liveStreamingDetails?.actualStartTime || null
    };
  } catch (error) {
    console.error('Error checking livestream status:', error);
    return null;
  }
}

module.exports = {
  callAPI,
  checkBalance,
  getServices,
  createOrder,
  fetchLatestVideo,
  isRecentVideo,
  checkIfLivestream
};
