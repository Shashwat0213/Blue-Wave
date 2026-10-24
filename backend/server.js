require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();

// CORS allow all origins
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ========================
// MULTI-KEY SETUP
// ========================
// Comma-separated keys from environment
const API_KEYS = (process.env.YOUTUBE_KEYS || process.env.YOUTUBE_API_KEY || "")
  .split(",")
  .map(k => k.trim())
  .filter(Boolean);

let currentKeyIndex = 0;
console.log(`Loaded ${API_KEYS.length} YouTube API keys`);

// ========================
// CACHE
// ========================
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

// ========================
// YOUTUBE FETCH (with Key Rotation)
// ========================
async function fetchFromYouTube(query) {
  if (API_KEYS.length === 0) throw new Error("No YouTube keys configured");

  let attempts = 0;
  const startIndex = currentKeyIndex;

  // Try all keys one by one, until one works
  while (attempts < API_KEYS.length) {
    const key = API_KEYS[currentKeyIndex];
    try {
      const url =
        `https://www.googleapis.com/youtube/v3/search` +
        `?part=snippet&q=${encodeURIComponent(query)}` +
        `&type=video&videoCategoryId=10&maxResults=12` +
        `&key=${key}`;

      const response = await fetch(url);
      const data = await response.json();

      // If quota exceeded or error - rotate key and retry
      if (data.error) {
        const msg = data.error.message || "Unknown";
        console.warn(`[Key #${currentKeyIndex + 1}] Failed: ${msg}`);
        currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
        attempts++;
        continue;
      }

      // Success!
      console.log(`[Key #${currentKeyIndex + 1}] Success`);
      return (data.items || []).map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails.medium.url,
        source: "youtube"
      }));
    } catch (err) {
      console.warn(`[Key #${currentKeyIndex + 1}] Network error: ${err.message}`);
      currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
      attempts++;
    }
  }

  // If all keys failed, throw - caller will try Deezer
  throw new Error("All YouTube API keys failed or quota exceeded");
}

// ========================
// DEEZER FALLBACK (No Key Required)
// ========================
async function fetchFromDeezer(query) {
  try {
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=12`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.data || data.data.length === 0) return [];

    return data.data.map(track => ({
      videoId: `dz_${track.id}`, // prefix so frontend knows it's Deezer
      deezerId: track.id,
      title: track.title,
      channel: track.artist.name,
      thumbnail: track.album.cover_medium,
      previewUrl: track.preview, // 30s MP3 URL
      source: "deezer"
    }));
  } catch (err) {
    console.error("Deezer failed:", err.message);
    return [];
  }
}

// ========================
// MAIN SEARCH ENDPOINT
// ========================
app.get("/api/search", async (req, res) => {
  const query = (req.query.q || "").trim();
  if (!query) return res.status(400).json({ error: "Query required" });

  const cacheKey = query.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return res.json({ results: cached.results, cached: true, source: cached.source });
  }

  // Try YouTube first
  try {
    const results = await fetchFromYouTube(query);
    cache.set(cacheKey, { results, time: Date.now(), source: "youtube" });
    return res.json({ results, source: "youtube" });
  } catch (ytErr) {
    console.log("YouTube failed, switching to Deezer:", ytErr.message);

    // Fallback to Deezer
    const dzResults = await fetchFromDeezer(query);
    if (dzResults.length > 0) {
      cache.set(cacheKey, { results: dzResults, time: Date.now(), source: "deezer" });
      return res.json({ results: dzResults, source: "deezer" });
    }

    // Both failed
    return res.status(500).json({
      error: "YouTube quota exhausted and Deezer returned no results"
    });
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "BlueWave API is running ✅",
    youtubeKeys: API_KEYS.length,
    currentKey: currentKeyIndex + 1,
    uptime: process.uptime()
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));