const BACKEND_URL = "https://blue-wave-axyu.onrender.com";
const esc = v => String(v||"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const fallbackImg = "https://placehold.co/300x300/222/22d3ee?text=♪";

let queue = [];
let queueIdx = -1;
let playingId = null;
let isPlaying = false;
let ytPlayer = null, ytReady = false;
let progressTimer = null;
let pendingVideo = null;
let activeSource = "youtube"; 
let currentPlayingData = null;
let sleepTimerId = null;

const audioEl = document.getElementById("audioPlayer");

function wakeUpServer() { fetch(BACKEND_URL).catch(()=>{}); }
wakeUpServer(); setInterval(wakeUpServer, 10 * 60 * 1000);

window.setSleepTimer = function(minutes) {
  if(sleepTimerId) clearTimeout(sleepTimerId);
  if(minutes === 0) { alert("Timer cancelled."); return; }
  alert("Sleep timer set for " + minutes + " minutes.");
  sleepTimerId = setTimeout(() => {
    if(isPlaying) togglePlayPause();
    alert("Sleep timer completed. Music paused.");
  }, minutes * 60 * 1000);
};

function addToRecentlyPlayed(song) {
  let recent = JSON.parse(localStorage.getItem("recentSongs") || "[]");
  recent = recent.filter(s => s.videoId !== song.videoId);
  recent.unshift(song);
  if(recent.length > 10) recent.pop();
  localStorage.setItem("recentSongs", JSON.stringify(recent));
  renderRecentlyPlayed();
}

window.renderRecentlyPlayed = function() {
  let recent = JSON.parse(localStorage.getItem("recentSongs") || "[]");
  const box = document.getElementById("recentlyPlayed");
  if(!box) return;
  box.innerHTML = "";
  if(recent.length === 0) { box.innerHTML = '<p style="color:var(--muted); font-size:14px;">No songs played yet.</p>'; return; }
  recent.forEach((s, i) => {
    const card = document.createElement("div"); card.className = "card";
    card.innerHTML = `<div class="card-img-wrapper"><img src="${esc(s.artworkUrl100)}" onerror="this.src='${fallbackImg}'"><div class="play-overlay"></div></div><h4>${esc(s.trackName)}</h4><p>${esc(s.artistName)}</p>`;
    card.onclick = () => { queue = recent; queueIdx = i; playCurrentQueueItem(); };
    box.appendChild(card);
  });
};

window.switchTab = function(tab) {
  document.getElementById("tab-home").classList.remove("active");
  document.getElementById("tab-library").classList.remove("active");
  document.getElementById("searchSection").style.display = "none";

  if (tab === 'home') {
    document.getElementById("tab-home").classList.add("active");
    document.getElementById("homeSections").style.display = "block";
    document.getElementById("librarySection").style.display = "none";
  } else {
    document.getElementById("tab-library").classList.add("active");
    document.getElementById("homeSections").style.display = "none";
    document.getElementById("librarySection").style.display = "block";
    if(window.renderLibrary) window.renderLibrary();
  }
};

function loadYT() {
  if (window.YT && window.YT.Player) { onYTReady(); return; }
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady = onYTReady;
function onYTReady() {
  if (ytPlayer) return;
  ytPlayer = new YT.Player("ytPlayer", {
    height: "300", width: "300", playerVars: { autoplay: 0, controls: 1, origin: window.location.origin, enablejsapi: 1 },
    events: {
      onReady: () => {
        ytReady = true;
        if (pendingVideo && pendingVideo.source === "youtube") { playYouTube(pendingVideo.videoId, pendingVideo.title, pendingVideo.artist, pendingVideo.thumbnail); pendingVideo = null; }
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.ENDED) playNext();
        if (e.data === YT.PlayerState.PLAYING) { isPlaying = true; updatePlayIcons("⏸"); startProgress(); }
        if (e.data === YT.PlayerState.PAUSED) { isPlaying = false; updatePlayIcons("▶"); }
      }
    }
  });
}

function startProgress() {
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    let cur = 0, dur = 0;
    if (activeSource === "youtube" && ytPlayer && ytReady && ytPlayer.getCurrentTime) { cur = ytPlayer.getCurrentTime() || 0; dur = ytPlayer.getDuration() || 0; } 
    else if (activeSource === "deezer") { cur = audioEl.currentTime || 0; dur = audioEl.duration || 0; }
    const curStr = fmt(cur), durStr = fmt(dur), pct = dur > 0 ? (cur / dur * 100) : 0;
    document.getElementById("miniCur").textContent = curStr; document.getElementById("miniDur").textContent = durStr;
    document.getElementById("miniFill").style.width = pct + "%";
    document.getElementById("fpCur").textContent = curStr; document.getElementById("fpDur").textContent = durStr;
    document.getElementById("fpFill").style.width = pct + "%";
  }, 500);
}
function fmt(s) { if (!s || isNaN(s)) return "0:00"; const m = Math.floor(s/60), sec = Math.floor(s%60); return m + ":" + (sec < 10 ? "0" : "") + sec; }
function updatePlayIcons(icon) { document.getElementById("miniPlay").textContent = icon; document.getElementById("fpPlay").textContent = icon; }

function playYouTube(videoId, title, artist, thumbnail) {
  if (!ytPlayer || !ytReady) { pendingVideo = { videoId, title, artist, thumbnail, source: "youtube" }; loadYT(); return; }
  activeSource = "youtube"; audioEl.pause();
  updatePlayerUI(title, artist, thumbnail);
  ytPlayer.loadVideoById(videoId);
  playingId = videoId; updateFavButton();
  addToRecentlyPlayed({ videoId, trackName: title, artistName: artist, artworkUrl100: thumbnail });
}
function playDeezer(previewUrl, title, artist, thumbnail, id) {
  activeSource = "deezer"; if (ytPlayer && ytReady) ytPlayer.stopVideo();
  updatePlayerUI(title, artist + " (Preview)", thumbnail);
  audioEl.src = previewUrl; audioEl.play().then(() => { isPlaying = true; updatePlayIcons("⏸"); startProgress(); }).catch(()=>{});
  playingId = id; updateFavButton();
  addToRecentlyPlayed({ videoId: id, trackName: title, artistName: artist, artworkUrl100: thumbnail });
}
function updatePlayerUI(title, artist, thumbnail) {
  document.getElementById("miniTitle").textContent = title; document.getElementById("miniArtist").textContent = artist;
  document.getElementById("miniImg").src = thumbnail || fallbackImg; document.getElementById("playerBar").classList.add("show");
  document.getElementById("fpTitle").textContent = title; document.getElementById("fpArtist").textContent = artist;
  document.getElementById("fpArt").src = thumbnail || fallbackImg; document.getElementById("fpBgArt").style.backgroundImage = `url(${thumbnail || fallbackImg})`;
  currentPlayingData = { title, artist, thumbnail, id: playingId };
}

window.updateFavButton = function() {
  const btn = document.getElementById("fpFavBtn");
  if(!btn) return;
  if(window.favorites && window.favorites.includes(playingId)) { btn.textContent = "★"; btn.classList.add("active"); }
  else { btn.textContent = "☆"; btn.classList.remove("active"); }
};

window.toggleFavFull = function() {
  if(!window.currentUser) return alert("Please login first.");
  if(window.toggleFavFirestore) window.toggleFavFirestore(playingId);
  updateFavButton();
}

// QUEUE LOGIC
window.addToQueue = function(e, id, title, artist, image) {
  e.stopPropagation();
  queue.push({ videoId: id, trackName: title, artistName: artist, artworkUrl100: image, source: "youtube" });
  alert("Added to Queue!");
};

window.showQueue = function() {
  document.getElementById("queueOverlay").classList.add("show");
  const box = document.getElementById("queueList"); box.innerHTML = "";
  
  if(queue.length === 0) { box.innerHTML = '<p style="text-align:center; color:#aaa;">Queue is empty.</p>'; return; }
  
  queue.forEach((s, i) => {
    const isPlayingNow = i === queueIdx;
    const row = document.createElement("div");
    row.className = "song-row" + (isPlayingNow ? " playing" : "");
    row.innerHTML = `
      <img src="${esc(s.artworkUrl100)}" onerror="this.src='${fallbackImg}'">
      <div class="song-info"><h4>${esc(s.trackName)}</h4><p>${esc(s.artistName)}</p></div>
      ${isPlayingNow ? '<span style="color:var(--cyan); font-size:12px; font-weight:bold;">PLAYING</span>' : ''}
    `;
    row.onclick = () => { queueIdx = i; playCurrentQueueItem(); window.showQueue(); };
    box.appendChild(row);
  });
};
window.closeQueue = function() { document.getElementById("queueOverlay").classList.remove("show"); };

// SHARE LOGIC
window.shareSong = function() {
  if(!currentPlayingData) return;
  const shareData = {
    title: 'BlueWave Music',
    text: `Listen to ${currentPlayingData.title} by ${currentPlayingData.artist} on BlueWave!`,
    url: window.location.href
  };
  
  if (navigator.share) {
    navigator.share(shareData).catch(() => {});
  } else {
    navigator.clipboard.writeText(`${shareData.text} - ${shareData.url}`);
    alert("Link copied to clipboard!");
  }
};

function playCurrentQueueItem() {
  const s = queue[queueIdx]; if (!s) return;
  if (s.source === "deezer" || s.previewUrl) playDeezer(s.previewUrl, s.trackName, s.artistName, s.artworkUrl100, s.videoId);
  else playYouTube(s.videoId, s.trackName, s.artistName, s.artworkUrl100);
}
function playNext() { if (!queue.length) return; queueIdx = (queueIdx + 1) % queue.length; playCurrentQueueItem(); }
function playPrev() { if (!queue.length) return; queueIdx = (queueIdx - 1 + queue.length) % queue.length; playCurrentQueueItem(); }
function togglePlayPause() {
  if (activeSource === "youtube") { if (!ytPlayer || !ytReady) return; if (isPlaying) ytPlayer.pauseVideo(); else ytPlayer.playVideo(); }
  else { if (audioEl.paused) audioEl.play().then(() => { isPlaying = true; updatePlayIcons("⏸"); }); else { audioEl.pause(); isPlaying = false; updatePlayIcons("▶"); } }
}

window.openFullPlayer = function() { if(playingId) document.getElementById("fullPlayer").classList.add("active"); }
window.closeFullPlayer = function() { document.getElementById("fullPlayer").classList.remove("active"); document.getElementById("lyricsOverlay").classList.remove("show"); document.getElementById("queueOverlay").classList.remove("show"); }
window.seekMini = function(e) { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); seekTo((e.clientX - rect.left) / rect.width); }
window.seekFull = function(e) { const rect = e.currentTarget.getBoundingClientRect(); seekTo((e.clientX - rect.left) / rect.width); }
function seekTo(pct) { if (activeSource === "youtube" && ytPlayer && ytReady) ytPlayer.seekTo(pct * ytPlayer.getDuration(), true); else if (activeSource === "deezer" && audioEl.duration) audioEl.currentTime = pct * audioEl.duration; }
function setVolume(val) { if (ytPlayer && ytReady) ytPlayer.setVolume(val); audioEl.volume = val / 100; document.getElementById("miniVol").value = val; document.getElementById("fpVol").value = val; }

document.getElementById("miniPlay").onclick = (e) => { e.stopPropagation(); togglePlayPause(); };
document.getElementById("miniNext").onclick = (e) => { e.stopPropagation(); playNext(); };
document.getElementById("miniPrev").onclick = (e) => { e.stopPropagation(); playPrev(); };
document.getElementById("miniVol").oninput = (e) => setVolume(e.target.value);
document.getElementById("fpPlay").onclick = togglePlayPause;
document.getElementById("fpNext").onclick = playNext;
document.getElementById("fpPrev").onclick = playPrev;
document.getElementById("fpVol").oninput = (e) => setVolume(e.target.value);

window.performSearch = async function() {
  const q = document.getElementById("globalSearch").value.trim(); if (!q) return;
  document.getElementById("loadingOverlay").style.display = "flex";
  document.getElementById("homeSections").style.display = "none";
  document.getElementById("librarySection").style.display = "none";
  document.getElementById("searchSection").style.display = "block";

  try {
    const res = await fetch(`${BACKEND_URL}/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    document.getElementById("loadingOverlay").style.display = "none";
    if (!data.results || !data.results.length) { document.getElementById("searchResults").innerHTML = '<div style="color:#aaa; padding:20px;">No results found.</div>'; return; }
    const mapped = data.results.map(r => ({ videoId: r.videoId, trackName: r.title, artistName: r.channel, artworkUrl100: r.thumbnail || fallbackImg, previewUrl: r.previewUrl || null, source: r.source || "youtube" }));
    queue = mapped; renderList(mapped, "searchResults");
  } catch (e) { document.getElementById("loadingOverlay").style.display = "none"; alert("Search failed. Server so raha hai."); }
}

function renderList(list, containerId) {
  const box = document.getElementById(containerId); box.innerHTML = "";
  list.forEach((s, i) => {
    const id = s.videoId; const isFav = window.favorites && window.favorites.includes(id);
    const dlUrl = `https://pagalworld.is/search?q=${encodeURIComponent(s.trackName)}`;
    const row = document.createElement("div");
    row.className = "song-row" + (playingId === id ? " playing" : "");
    row.dataset.id = id;
    row.innerHTML = `
      <img src="${esc(s.artworkUrl100)}" alt="" onerror="this.src='${fallbackImg}'">
      <div class="song-info"><h4>${esc(s.trackName)}</h4><p>${esc(s.artistName)}</p></div>
      <div class="action-btns">
        <button class="queue-btn" title="Play Next" onclick="window.addToQueue(event, '${id}', '${esc(s.trackName)}', '${esc(s.artistName)}', '${esc(s.artworkUrl100)}')">⏭</button>
        <button class="add-pl-btn" title="Add to Playlist" onclick="window.showAddToPlaylist(event, '${id}', '${esc(s.trackName)}', '${esc(s.artistName)}', '${esc(s.artworkUrl100)}')">➕</button>
        <button class="fav-btn ${isFav ? 'active' : ''}">${isFav ? '❤️' : '🤍'}</button>
        <a href="${dlUrl}" target="_blank" title="Download">⬇</a>
      </div>`;
    row.querySelector(".fav-btn").onclick = (e) => { e.stopPropagation(); window.toggleFavFirestore(id); renderList(list, containerId); };
    row.onclick = () => { queue = list; queueIdx = i; playCurrentQueueItem(); };
    box.appendChild(row);
  });
}

function renderCardList(list, containerId) {
  const box = document.getElementById(containerId); box.innerHTML = "";
  list.forEach((s, i) => {
    const card = document.createElement("div"); card.className = "card";
    card.innerHTML = `<div class="card-img-wrapper"><img src="${esc(s.artworkUrl100)}" alt="" onerror="this.src='${fallbackImg}'"><div class="play-overlay"></div></div><h4>${esc(s.trackName)}</h4><p>${esc(s.artistName)}</p>`;
    card.onclick = () => { queue = list; queueIdx = i; playCurrentQueueItem(); };
    box.appendChild(card);
  });
}

window.renderLibrary = function() {
  const favBox = document.getElementById("favList"); favBox.innerHTML = "";
  if (window.favorites.length === 0) { favBox.innerHTML = '<p style="color:var(--muted); font-size:14px;">No favorites yet.</p>'; }
  else {
    window.favorites.forEach(id => {
      const row = document.createElement("div"); row.className = "song-row";
      row.innerHTML = `<div class="song-info"><h4>Song ID: ${id}</h4><p>Saved in favorites</p></div><button onclick="window.toggleFavFirestore('${id}')" style="background:transparent; border:none; color:#ec4899; cursor:pointer;">Remove</button>`;
      favBox.appendChild(row);
    });
  }

  const plBox = document.getElementById("playlistsContainer"); plBox.innerHTML = "";
  if (window.userPlaylists.length === 0) { plBox.innerHTML = '<p style="color:var(--muted); font-size:14px;">No playlists yet. Create one!</p>'; }
  else {
    window.userPlaylists.forEach((pl, index) => {
      const card = document.createElement("div");
      card.style = "background:var(--surface); padding:15px; border-radius:10px; border:1px solid var(--line);";
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h4 style="cursor:pointer; color:var(--cyan);" onclick="window.viewPlaylistSongs(${index})">📁 ${esc(pl.name)}</h4>
            <button onclick="window.deletePlaylist(${index})" style="background:transparent; border:none; color:#ef4444; cursor:pointer;">Delete</button>
        </div>
        <p style="color:var(--muted); font-size:13px; margin-top:5px;">${pl.songs.length} songs</p>
        <div id="playlist-songs-${index}" style="display:none; margin-top:10px;"></div>
      `;
      plBox.appendChild(card);
    });
  }
};

window.viewPlaylistSongs = function(index) {
  const box = document.getElementById(`playlist-songs-${index}`);
  const pl = window.userPlaylists[index];
  if(box.style.display === "block") { box.style.display = "none"; return; }
  box.style.display = "block"; box.innerHTML = "";
  
  if(pl.songs.length === 0) { box.innerHTML = '<p style="color:var(--muted); font-size:12px;">Empty playlist.</p>'; return; }
  pl.songs.forEach((s, i) => {
    const row = document.createElement("div"); row.className = "song-row";
    row.style = "padding: 8px; background: var(--bg); margin-bottom: 5px; border-radius: 5px;";
    row.innerHTML = `
      <img src="${esc(s.image || fallbackImg)}" style="width:40px; height:40px; border-radius:4px;">
      <div class="song-info"><h4 style="font-size:13px;">${esc(s.title)}</h4><p style="font-size:11px;">${esc(s.artist)}</p></div>
      <button onclick="window.playPlaylistSong(${index}, ${i})" style="background:var(--blue); border:none; color:#fff; padding:5px 10px; border-radius:5px; cursor:pointer;">▶</button>
    `;
    box.appendChild(row);
  });
};

window.playPlaylistSong = function(plIndex, songIndex) {
  const pl = window.userPlaylists[plIndex];
  const mappedQueue = pl.songs.map(song => ({ videoId: song.id, trackName: song.title, artistName: song.artist, artworkUrl100: song.image, source: "youtube" }));
  queue = mappedQueue; queueIdx = songIndex; playCurrentQueueItem();
};

window.createNewPlaylist = function() {
  if(!window.currentUser) return alert("Login first!");
  const name = prompt("Enter playlist name:");
  if(name) { window.savePlaylistsFirestore([...window.userPlaylists, { name: name, songs: [] }]); }
}

window.deletePlaylist = function(index) {
  if(!confirm("Delete this playlist?")) return;
  window.savePlaylistsFirestore(window.userPlaylists.filter((_, i) => i !== index));
}

window.showAddToPlaylist = function(e, id, title, artist, image) {
  e.stopPropagation();
  if(!window.currentUser) return alert("Login first!");
  if(window.userPlaylists.length === 0) return alert("Create a playlist first in Library tab.");
  
  let opts = window.userPlaylists.map((p, i) => `${i+1}. ${p.name}`).join("\n");
  let choice = prompt(`Select playlist to add "${title}":\n\n${opts}\n\nEnter number:`);
  let idx = parseInt(choice) - 1;
  
  if(window.userPlaylists[idx]) {
    let newPl = [...window.userPlaylists];
    if(newPl[idx].songs.some(s => s.id === id)) return alert("Song already in this playlist!");
    newPl[idx].songs.push({ id, title, artist, image });
    window.savePlaylistsFirestore(newPl);
    alert("Added to playlist!");
  }
};

window.fetchLyrics = async function() {
  if(!currentPlayingData) return;
  document.getElementById("lyricsOverlay").classList.add("show");
  document.getElementById("lyricsText").innerHTML = '<div style="text-align:center; padding:20px;">Fetching lyrics...</div>';
  try {
    let rawArtist = currentPlayingData.artist.split("·")[0].trim().replace(" (Preview)", "");
    let rawTitle = currentPlayingData.title;
    if(rawTitle.includes(" - ")) {
        let parts = rawTitle.split(" - ");
        rawArtist = parts[1].split("(")[0].split("|")[0].trim();
        rawTitle = parts[0].split("(")[0].split("|")[0].trim();
    } else { rawTitle = rawTitle.split("(")[0].split("|")[0].split("Lyrical")[0].split("Full Video")[0].trim(); }

    const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(rawArtist)}/${encodeURIComponent(rawTitle)}`);
    const data = await res.json();
    if(data.lyrics) { document.getElementById("lyricsText").textContent = data.lyrics; } 
    else {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(rawArtist + " " + rawTitle + " lyrics")}`;
      document.getElementById("lyricsText").innerHTML = `<div style="text-align:center; padding:20px;"><p style="margin-bottom:20px; color:#aaa;">Lyrics not found on API.</p><a href="${searchUrl}" target="_blank" class="glass-btn" style="background:var(--blue); color:#fff; text-decoration:none;">🔍 Search on Google</a></div>`;
    }
  } catch (err) {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(currentPlayingData.title + " lyrics")}`;
    document.getElementById("lyricsText").innerHTML = `<div style="text-align:center; padding:20px;"><p style="margin-bottom:20px; color:#aaa;">Error fetching lyrics.</p><a href="${searchUrl}" target="_blank" class="glass-btn" style="background:var(--blue); color:#fff; text-decoration:none;">🔍 Search on Google</a></div>`;
  }
}
window.closeLyrics = function() { document.getElementById("lyricsOverlay").classList.remove("show"); }

const quickPicksData = [
  { videoId: "Umqb9KENgmk", trackName: "Mere Mehboob", artistName: "KID Boi", artworkUrl100: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop", source: "youtube" },
  { videoId: "BddP6PYo2gs", trackName: "Shiv Shiv Shankar", artistName: "Nikhar Juneja", artworkUrl100: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop", source: "youtube" },
  { videoId: "7Ii7l6y7c3U", trackName: "Jai Bajrang", artistName: "Rapperiya Baalam", artworkUrl100: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop", source: "youtube" },
];
const trendingData = [
  { videoId: "284Ov7ysmfA", trackName: "Kanchi Keri", artistName: "Rapperiya Baalam", artworkUrl100: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop", source: "youtube" },
  { videoId: "ElZfdU54Cp8", trackName: "So Swaag", artistName: "Yo Yo", artworkUrl100: "https://images.unsplash.com/photo-1516280440502-8638b02e11f1?w=300&h=300&fit=crop", source: "youtube" },
  { videoId: "BddP6PYo2gs", trackName: "Duvidha 2", artistName: "Allows Music", artworkUrl100: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&h=300&fit=crop", source: "youtube" },
];
const artistData = [
  { name: "Arijit Singh", genre: "Playback", img: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop" },
  { name: "Shreya Ghoshal", genre: "Playback", img: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop" },
  { name: "Sonu Nigam", genre: "Playback", img: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop" },
  { name: "Lata Mangeshkar", genre: "Legend", img: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop" }
];

window.renderHome = function() {
  renderCardList(quickPicksData, "quickPicks");
  renderCardList(trendingData, "trendingSongs");
  renderRecentlyPlayed();
  const artistBox = document.getElementById("topArtists"); artistBox.innerHTML = "";
  artistData.forEach(a => {
    const card = document.createElement("div"); card.className = "card";
    card.innerHTML = `<div class="card-img-wrapper" style="border-radius: 50%;"><img src="${esc(a.img)}" style="border-radius: 50%;" onerror="this.src='${fallbackImg}'"></div><h4 style="text-align:center;">${esc(a.name)}</h4><p style="text-align:center;">${esc(a.genre)}</p>`;
    card.onclick = () => { document.getElementById("globalSearch").value = a.name; window.performSearch(); };
    artistBox.appendChild(card);
  });
};

renderHome(); 
loadYT();