/* ============================================================
   American Billboard Music — player.js
   80s Synthwave Neon theme
   ============================================================ */

const AUDIO_BASE   = 'https://audio.iatebreakfast.com';
const LASTFM_KEY   = 'e44eff34c786df9f96c58920764bbd43';
const LASTFM_API   = 'https://ws.audioscrobbler.com/2.0/';

// Synthwave fallback art
const ART_FALLBACK = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#160022"/>
        <stop offset="100%" stop-color="#0d0018"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" fill="url(#g)"/>
    <text x="150" y="165" font-size="80" text-anchor="middle" fill="#4a0070">♬</text>
  </svg>`);

// ─────────────────────────────────────────────────────────────
// Decades / years
// ─────────────────────────────────────────────────────────────

const DECADES = {
  1940: [1946, 1947, 1948, 1949],
  1950: [1950, 1951, 1952, 1953, 1954, 1955, 1956, 1957, 1958, 1959],
  1960: [1960, 1961, 1962, 1963, 1964, 1965, 1966, 1967, 1968, 1969],
  1970: [1970, 1971, 1972, 1973, 1974, 1975, 1976, 1977, 1978, 1979],
  1980: [1980, 1981, 1982, 1983, 1984, 1985, 1986, 1988, 1989],
  1990: [1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999],
  2000: [2000, 2001, 2002, 2003, 2004],
  2010: [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020],
};

const DECADE_LABELS = {
  1940: '1940s', 1950: '1950s', 1960: '1960s', 1970: '1970s',
  1980: '1980s', 1990: '1990s', 2000: '2000s', 2010: '2010s',
};

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let activeDECADE = null;
let activeYEAR   = null;
let tracks       = [];
let currentTrack = -1;

const audio = new Audio();
audio.preload = 'none';

// Art cache so we don't re-fetch on re-render
const artCache = {};

// ── Playlist state ────────────────────────────────────────────
let playlist     = [];   // [{title, artist, url, art}]
let playlistMode = false; // true while navigating playlist queue
let playlistIdx  = -1;   // current position in playlist[]

// ─────────────────────────────────────────────────────────────
// DOM refs
// ─────────────────────────────────────────────────────────────

const decadeNav       = document.getElementById('decadeNav');
const yearSection     = document.getElementById('yearSection');
const yearGrid        = document.getElementById('yearGrid');
const decadeTitle     = document.getElementById('decadeTitle');
const playerSection   = document.getElementById('playerSection');
const playerTitle     = document.getElementById('playerTitle');
const playerContainer = document.getElementById('playerContainer');
const backBtn         = document.getElementById('backBtn');
const hero            = document.getElementById('hero');

// Playlist panel DOM refs
const playlistPanel    = document.getElementById('playlistPanel');
const playlistBackdrop = document.getElementById('playlistBackdrop');
const playlistToggle   = document.getElementById('playlistToggle');
const playlistBadge    = document.getElementById('playlistBadge');
const playlistBody     = document.getElementById('playlistBody');
const playlistCountLbl = document.getElementById('playlistCountLabel');
const playlistPlayBtn  = document.getElementById('playlistPlay');
const playlistClearBtn = document.getElementById('playlistClear');
const playlistClose    = document.getElementById('playlistClose');

// ─────────────────────────────────────────────────────────────
// Back-to-top button
// ─────────────────────────────────────────────────────────────

const backToTopBtn = document.createElement('button');
backToTopBtn.className = 'back-to-top';
backToTopBtn.id = 'backToTop';
backToTopBtn.textContent = '▲ TOP';
backToTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
document.body.appendChild(backToTopBtn);

window.addEventListener('scroll', () => {
  backToTopBtn.classList.toggle('visible', window.scrollY > 300);
}, { passive: true });

// ─────────────────────────────────────────────────────────────
// Audio server — fetch track list
// ─────────────────────────────────────────────────────────────

async function fetchTracks(year) {
  const res = await fetch(`${AUDIO_BASE}/${year}/`, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const files = await res.json();
  const audioExts = /\.(mp3|m4a|aac|flac|ogg|wav)$/i;
  return files
    .filter(f => f.type === 'file' && audioExts.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(f => {
      // Strip extension, then strip leading YYYY-NNN or NNN prefix
      let clean = f.name.replace(/\.(mp3|m4a|aac|flac|ogg|wav)$/i, '');
      clean = clean
        .replace(/^\d{4}[-_]\d+\s+/, '')   // 2011-001 or 2011_001
        .replace(/^\d+[-_.]\s*/, '')         // 001. or 001 -
        .replace(/^\d+\s+/, '')              // 001 (bare number prefix)
        .trim();
      const dashIdx = clean.indexOf(' - ');
      const artist = dashIdx !== -1 ? clean.slice(0, dashIdx).trim() : clean;
      const title  = dashIdx !== -1 ? clean.slice(dashIdx + 3).trim() : clean;
      return {
        name:   clean,
        artist, title,
        url:    `${AUDIO_BASE}/${year}/${encodeURIComponent(f.name)}`,
        art:    null,
      };
    });
}

// ─────────────────────────────────────────────────────────────
// Last.fm — fetch album art (with artist image fallback)
// ─────────────────────────────────────────────────────────────

async function fetchArt(artist, title) {
  const key = `${artist}|||${title}`;
  if (artCache[key] !== undefined) return artCache[key];

  // 1. Try track.getInfo — has album art
  try {
    const params = new URLSearchParams({
      method:  'track.getInfo',
      api_key: LASTFM_KEY,
      artist, track: title,
      format:  'json',
      autocorrect: 1,
    });
    const res  = await fetch(`${LASTFM_API}?${params}`);
    const data = await res.json();
    const images = data?.track?.album?.image;
    if (images) {
      const img = images.find(i => i.size === 'extralarge') ||
                  images.find(i => i.size === 'large') ||
                  images[images.length - 1];
      const url = img?.['#text'];
      if (url) { artCache[key] = url; return url; }
    }
  } catch (_) {}

  // 2. Fallback: artist.getInfo — important for 2010s tracks
  try {
    const params = new URLSearchParams({
      method:  'artist.getInfo',
      api_key: LASTFM_KEY,
      artist,
      format:  'json',
      autocorrect: 1,
    });
    const res  = await fetch(`${LASTFM_API}?${params}`);
    const data = await res.json();
    const images = data?.artist?.image;
    if (images) {
      const img = images.find(i => i.size === 'extralarge') ||
                  images.find(i => i.size === 'large') ||
                  images[images.length - 1];
      const url = img?.['#text'];
      if (url) { artCache[key] = url; return url; }
    }
  } catch (_) {}

  artCache[key] = null;
  return null;
}

// ─────────────────────────────────────────────────────────────
// Playlist helpers
// ─────────────────────────────────────────────────────────────

function isInPlaylist(track) {
  return !!track.url && playlist.some(p => p.url === track.url);
}

function togglePlaylistItem(trackIdx) {
  const t = tracks[trackIdx];
  if (!t || !t.url) return;

  const i = playlist.findIndex(p => p.url === t.url);
  if (i !== -1) {
    if (playlistMode && i === playlistIdx) {
      // Removing the currently playing item — drop out of playlist mode
      playlistMode = false;
      playlistIdx  = -1;
    } else if (playlistMode && i < playlistIdx) {
      playlistIdx--;
    }
    playlist.splice(i, 1);
  } else {
    if (playlist.length >= 20) return;
    playlist.push({ title: t.title, artist: t.artist, url: t.url, art: t.art || null });
  }

  updateCardAddButtons();
  renderPlaylistPanel();
  updatePlaylistToggle();
}

function updateCardAddButtons() {
  document.querySelectorAll('.art-card').forEach(card => {
    const idx = Number(card.dataset.index);
    const t   = tracks[idx];
    if (!t) return;
    const btn = card.querySelector('.card-add-btn');
    if (!btn) return;
    const inPL = isInPlaylist(t);
    btn.classList.toggle('in-playlist', inPL);
    btn.textContent = inPL ? '✓' : '+';
    btn.title       = inPL ? 'Remove from playlist' : 'Add to playlist';
    btn.disabled    = !t.url || (!inPL && playlist.length >= 20);
  });
}

function updatePlaylistToggle() {
  const n = playlist.length;
  playlistBadge.textContent = n;
  playlistBadge.hidden = n === 0;
  playlistToggle.classList.toggle('has-songs', n > 0);
}

function renderPlaylistPanel() {
  playlistCountLbl.textContent = `${playlist.length} / 20`;
  playlistPlayBtn.disabled     = playlist.length === 0;
  playlistClearBtn.disabled    = playlist.length === 0;

  if (!playlist.length) {
    playlistBody.innerHTML = `<div class="playlist-empty-msg">NO SONGS QUEUED<br>CLICK + ON ANY CARD</div>`;
    return;
  }

  playlistBody.innerHTML = playlist.map((p, i) => `
    <div class="playlist-item${playlistMode && i === playlistIdx ? ' playing' : ''}" data-pl-idx="${i}">
      <span class="playlist-item-num">${playlistMode && i === playlistIdx ? '▶' : i + 1}</span>
      <img class="playlist-item-art" src="${p.art ? escHtml(p.art) : ART_FALLBACK}" alt="">
      <div class="playlist-item-info">
        <div class="playlist-item-title">${escHtml(p.title)}</div>
        <div class="playlist-item-artist">${escHtml(p.artist)}</div>
      </div>
      <button class="playlist-remove-btn" data-pl-remove="${i}" title="Remove">✕</button>
    </div>`).join('');

  // Click item → play it
  playlistBody.querySelectorAll('.playlist-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.playlist-remove-btn')) return;
      playPlaylistTrack(Number(item.dataset.plIdx));
    });
  });

  // Remove buttons
  playlistBody.querySelectorAll('[data-pl-remove]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const i = Number(btn.dataset.plRemove);
      if (playlistMode && i === playlistIdx) { playlistMode = false; playlistIdx = -1; }
      else if (playlistMode && i < playlistIdx) { playlistIdx--; }
      playlist.splice(i, 1);
      updateCardAddButtons();
      renderPlaylistPanel();
      updatePlaylistToggle();
    });
  });
}

function openPlaylist()  { playlistPanel.classList.add('open'); playlistBackdrop.classList.add('open'); }
function closePlaylist() { playlistPanel.classList.remove('open'); playlistBackdrop.classList.remove('open'); }

function playPlaylist() {
  if (!playlist.length) return;
  playlistMode = true;
  playlistIdx  = 0;
  playPlaylistTrack(0);
  closePlaylist();
}

function playPlaylistTrack(idx) {
  if (idx < 0 || idx >= playlist.length) return;
  playlistMode = true;
  playlistIdx  = idx;

  const p = playlist[idx];
  audio.src = p.url;
  audio.play().catch(console.error);

  // Update sticky bar
  const stickyArt    = document.getElementById('stickyArt');
  const stickyTitle  = document.getElementById('stickyTitle');
  const stickyArtist = document.getElementById('stickyArtist');
  if (stickyArt)    stickyArt.src           = p.art || ART_FALLBACK;
  if (stickyTitle)  stickyTitle.textContent  = p.title;
  if (stickyArtist) stickyArtist.textContent = p.artist;

  // Highlight the matching card in the current year view (if visible)
  document.querySelectorAll('.art-card').forEach(c => {
    const t = tracks[Number(c.dataset.index)];
    c.classList.toggle('active', !!t && t.url === p.url);
  });
  currentTrack = -1;
  updatePlayPauseBtn();
  renderPlaylistPanel();
}

// ─────────────────────────────────────────────────────────────
// Decade selection
// ─────────────────────────────────────────────────────────────

function selectDecade(decade) {
  activeDECADE = decade;
  activeYEAR   = null;

  document.querySelectorAll('.decade-btn').forEach(btn =>
    btn.classList.toggle('active', Number(btn.dataset.decade) === decade));

  decadeTitle.textContent = DECADE_LABELS[decade];
  yearGrid.innerHTML = '';

  DECADES[decade].forEach(year => {
    const btn = document.createElement('button');
    btn.className = 'year-btn';
    btn.textContent = year;
    btn.dataset.year = year;
    btn.addEventListener('click', () => selectYear(year));
    yearGrid.appendChild(btn);
  });

  yearSection.hidden = false;
  playerSection.hidden = true;
  hero.hidden = true;
  yearSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─────────────────────────────────────────────────────────────
// Year selection
// ─────────────────────────────────────────────────────────────

async function selectYear(year) {
  activeYEAR = year;
  stopAudio();

  document.querySelectorAll('.year-btn').forEach(btn =>
    btn.classList.toggle('active', Number(btn.dataset.year) === year));

  playerTitle.textContent = `Billboard Hot 100 · ${year}`;
  playerSection.hidden = false;
  playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderLoading(year);

  try {
    tracks = await fetchTracks(year);
    if (!tracks.length) { renderError('No audio files found for this year.'); return; }

    renderGrid();
    loadArtProgressively();
  } catch (err) {
    console.error(err);
    renderError('Could not load tracks. The audio server may be unavailable.');
  }
}

// ─────────────────────────────────────────────────────────────
// Progressive art loading
// ─────────────────────────────────────────────────────────────

async function loadArtProgressively() {
  const BATCH = 5;
  for (let i = 0; i < tracks.length; i += BATCH) {
    const batch = tracks.slice(i, i + BATCH);
    await Promise.all(batch.map(async (t, offset) => {
      const idx = i + offset;
      const url = await fetchArt(t.artist, t.title);
      tracks[idx].art = url;
      const img = document.querySelector(`.art-card[data-index="${idx}"] .card-art`);
      if (img && url) {
        img.src = url;
        img.classList.add('loaded');
      }
    }));
    await new Promise(r => setTimeout(r, 120));
  }
}

// ─────────────────────────────────────────────────────────────
// Render states
// ─────────────────────────────────────────────────────────────

function renderLoading(year) {
  playerContainer.innerHTML = `
    <div class="player-state">
      <div class="spinner"></div>
      <p>Loading ${year} tracks…</p>
    </div>`;
}

function renderError(msg) {
  playerContainer.innerHTML = `
    <div class="player-state player-state--error">
      <div class="player-state-icon">⚠</div>
      <p>${msg}</p>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// Render album art grid + player bar (bar at TOP of grid)
// ─────────────────────────────────────────────────────────────

function renderGrid() {
  const cards = tracks.map((t, i) => {
    const inPL     = isInPlaylist(t);
    const addDis   = !t.url || (!inPL && playlist.length >= 20);
    return `
    <div class="art-card" data-index="${i}" role="button" tabindex="0" aria-label="Play ${escHtml(t.name)}">
      <div class="card-art-wrap">
        <img class="card-art" src="${ART_FALLBACK}" alt="${escHtml(t.name)}" loading="lazy" />
        <div class="card-overlay">
          <div class="card-play-icon">▶</div>
        </div>
        <div class="card-rank">${String(i + 1).padStart(2, '0')}</div>
        <button class="card-add-btn${inPL ? ' in-playlist' : ''}"
                data-add-index="${i}"
                title="${inPL ? 'Remove from playlist' : 'Add to playlist'}"
                ${addDis ? 'disabled' : ''}>${inPL ? '✓' : '+'}</button>
      </div>
      <div class="card-info">
        <div class="card-title">${escHtml(t.title)}</div>
        <div class="card-artist">${escHtml(t.artist)}</div>
      </div>
    </div>`;
  }).join('');

  playerContainer.innerHTML = `
    <div class="grid-player">

      <div class="art-grid" id="artGrid">
        ${cards}
      </div>

      <div class="sticky-bar" id="stickyBar">
        <div class="sticky-art-wrap">
          <img class="sticky-art" id="stickyArt" src="${ART_FALLBACK}" alt="" />
        </div>
        <div class="sticky-info">
          <div class="sticky-title" id="stickyTitle">—</div>
          <div class="sticky-artist" id="stickyArtist">Select a track to play</div>
        </div>
        <div class="sticky-controls">
          <button class="ctrl-btn" id="prevBtn" title="Previous">⏮</button>
          <button class="ctrl-btn ctrl-btn--play" id="playPauseBtn">▶</button>
          <button class="ctrl-btn" id="nextBtn" title="Next">⏭</button>
        </div>
        <div class="sticky-progress">
          <span class="time-cur" id="timeCur">0:00</span>
          <input type="range" class="progress-bar" id="progressBar" value="0" min="0" max="100" step="0.1" />
          <span class="time-dur" id="timeDur">0:00</span>
        </div>
        <div class="volume-wrap">
          <span class="vol-icon">🔊</span>
          <input type="range" class="volume-bar" id="volumeBar" value="100" min="0" max="100" />
        </div>
      </div>

    </div>`;

  // Wire controls
  document.getElementById('playPauseBtn').addEventListener('click', togglePlayPause);
  document.getElementById('prevBtn').addEventListener('click', playPrev);
  document.getElementById('nextBtn').addEventListener('click', playNext);

  document.getElementById('progressBar').addEventListener('input', e => {
    if (audio.duration) audio.currentTime = (e.target.value / 100) * audio.duration;
  });

  document.getElementById('volumeBar').addEventListener('input', e => {
    audio.volume = e.target.value / 100;
  });

  // Wire cards — intercept + button clicks before treating as play
  document.querySelectorAll('.art-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.card-add-btn')) {
        togglePlaylistItem(Number(card.dataset.index));
        return;
      }
      playlistMode = false;  // clicking a card exits playlist queue
      playTrack(Number(card.dataset.index));
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        playlistMode = false;
        playTrack(Number(card.dataset.index));
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Playback
// ─────────────────────────────────────────────────────────────

function playTrack(index) {
  if (index < 0 || index >= tracks.length) return;

  document.querySelectorAll('.art-card').forEach(c => c.classList.remove('active'));

  currentTrack = index;
  const t = tracks[index];

  audio.src = t.url;
  audio.play().catch(console.error);

  const card = document.querySelector(`.art-card[data-index="${index}"]`);
  if (card) { card.classList.add('active'); card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }

  // Update sticky bar
  const artSrc = t.art || ART_FALLBACK;
  const stickyArt = document.getElementById('stickyArt');
  if (stickyArt) stickyArt.src = artSrc;

  const stickyTitle  = document.getElementById('stickyTitle');
  const stickyArtist = document.getElementById('stickyArtist');
  if (stickyTitle)  stickyTitle.textContent  = t.title;
  if (stickyArtist) stickyArtist.textContent = t.artist;

  updatePlayPauseBtn();
}

function togglePlayPause() {
  if (currentTrack === -1 && tracks.length > 0) { playTrack(0); return; }
  if (audio.paused) audio.play().catch(console.error);
  else              audio.pause();
  updatePlayPauseBtn();
}

function playPrev() {
  if (playlistMode) {
    if (playlistIdx > 0) playPlaylistTrack(playlistIdx - 1);
    return;
  }
  if (currentTrack > 0) playTrack(currentTrack - 1);
}

function playNext() {
  if (playlistMode) {
    if (playlistIdx < playlist.length - 1) playPlaylistTrack(playlistIdx + 1);
    else { playlistMode = false; renderPlaylistPanel(); } // end of playlist
    return;
  }
  if (currentTrack < tracks.length - 1) playTrack(currentTrack + 1);
}

function stopAudio() {
  audio.pause();
  audio.src = '';
  currentTrack = -1;
  tracks = [];
  // Preserve playlist but exit playback mode
  playlistMode = false;
  playlistIdx  = -1;
}

function updatePlayPauseBtn() {
  const btn = document.getElementById('playPauseBtn');
  if (btn) btn.textContent = audio.paused ? '▶' : '⏸';
}

audio.addEventListener('timeupdate', () => {
  const bar = document.getElementById('progressBar');
  const cur = document.getElementById('timeCur');
  if (!bar || !audio.duration) return;
  bar.value = (audio.currentTime / audio.duration) * 100;
  if (cur) cur.textContent = formatTime(audio.currentTime);
});

audio.addEventListener('loadedmetadata', () => {
  const dur = document.getElementById('timeDur');
  if (dur) dur.textContent = formatTime(audio.duration);
});

audio.addEventListener('ended', playNext);
audio.addEventListener('pause', updatePlayPauseBtn);
audio.addEventListener('play',  updatePlayPauseBtn);

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function formatTime(secs) {
  if (!isFinite(secs)) return '0:00';
  return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────────────────────
// Back button
// ─────────────────────────────────────────────────────────────

backBtn.addEventListener('click', () => {
  stopAudio();
  document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
  playerSection.hidden = true;
  yearSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ─────────────────────────────────────────────────────────────
// Decade buttons
// ─────────────────────────────────────────────────────────────

decadeNav.querySelectorAll('.decade-btn').forEach(btn =>
  btn.addEventListener('click', () => selectDecade(Number(btn.dataset.decade))));

// ─────────────────────────────────────────────────────────────
// Hash routing
// ─────────────────────────────────────────────────────────────

function handleHash() {
  const year = parseInt(window.location.hash.replace('#', ''), 10);
  if (!year) return;
  for (const [decade, years] of Object.entries(DECADES)) {
    if (years.includes(year)) {
      selectDecade(Number(decade));
      setTimeout(() => selectYear(year), 50);
      return;
    }
  }
}

window.addEventListener('hashchange', handleHash);
handleHash();

// ─────────────────────────────────────────────────────────────
// Playlist panel — wire events
// ─────────────────────────────────────────────────────────────

playlistToggle.addEventListener('click', openPlaylist);
playlistClose.addEventListener('click', closePlaylist);
playlistBackdrop.addEventListener('click', closePlaylist);

playlistPlayBtn.addEventListener('click', playPlaylist);

playlistClearBtn.addEventListener('click', () => {
  playlist.length = 0;
  playlistMode = false;
  playlistIdx  = -1;
  updateCardAddButtons();
  renderPlaylistPanel();
  updatePlaylistToggle();
});

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePlaylist();
});
