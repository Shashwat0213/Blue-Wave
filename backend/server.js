require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YOUTUBE_API_KEY; // Render ke Environment Variable se aayega

// In-memory cache taaki API quota bache (30 minutes)
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 30; 

// 1. Search Endpoint (YouTube API)
app.get("/api/search", async (req, res) => {
  const query = (req.query.q || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Query required" });
  }

  // Agar pehle search kiya hai toh cache se do
  const cacheKey = query.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return res.json({ results: cached.results, cached: true });
  }

  try {
    // YouTube Data API v3 call
    const url =
      "https://www.googleapis.com/youtube/v3/search" +
      `?part=snippet&q=${encodeURIComponent(query)}` +
      "&type=video&videoCategoryId=10&maxResults=12" + // 10 = Music category
      `&key=${API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error("YouTube API Error:", data.error.message);
      return res.status(500).json({ error: data.error.message });
    }

    // Data ko saaf karke frontend ko bhejo
    const results = (data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.medium.url
    }));

    // Cache mein save karo
    cache.set(cacheKey, { results, time: Date.now() });
    
    res.json({ results });
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: "Search failed: " + err.message });
  }
});

// 2. Health Check Endpoint (Render ke liye)
app.get("/", (req, res) => {
  res.json({ 
    status: "BlueWave Music API is running ✅", 
    uptime: process.uptime() 
  });
});

// Server Start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (!API_KEY) {
    console.warn("⚠️ WARNING: YOUTUBE_API_KEY is missing in Environment Variables!");
  }
});