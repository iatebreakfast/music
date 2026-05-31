/* ============================================================
   American Billboard Music — player.js
   Fetches track lists from audio.iatebreakfast.com and plays
   them via HTML5 <audio>. No config needed — just add year
   folders to the audio server and they appear automatically.
   ============================================================ */

const AUDIO_BASE = 'https://audio.iatebreakfast.com';

// ─────────────────────────────────────────────────────────────
// Available years (add/remove as needed)
// ─────────────────────────────────────────────────────────────

const DECADES = {
  1940: [1946, 1947, 1948, 1949],
  1950: [1950, 1951, 1952, 1953, 1954, 1955, 1956, 1957, 1958, 1959],
  1960: [1960, 1961, 1962, 1963, 1964, 1965, 1966, 1967, 1968, 1969],
  1970: [1970, 1971, 1972, 1973, 1974, 1975, 1976, 1977, 1978, 1979],
  1980: [1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989],
  1990: [1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999],
  2000: [2000, 2001, 2002, 2003, 2004],
  2010: [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020],
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
let tracks       = [];   // [{name, url}]
let currentTrack = -1;
let isPlaying    = false;

const audio = new Audio();
audio.preload = 'none';

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

// ─────────────────────────────────────────────────────────────
// Fetch track list from audio server
// ─────────────────────────────────────────────────────────────

async function fetchTracks(year) {
  const url = `${AUDIO_BASE}/${year}/`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const files = await res.json();
  const audioExts = /\.(mp3|m4a|aac|flac|ogg|wav)$/i;

  return files
    .filter(f => f.type === 'file' && audioExts.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(f => ({
      name: cleanTrackName(f.name),
      url:  `${AUDIO_BASE}/${year}/${encodeURIComponent(f.name)}`,
    }));
}

function cleanTrackName(filename) {
  // "1946-001 Perry Como - Prisoner Of Love.mp3" → "Perry Como - Prisoner Of Love"
  return filename
    .replace(/\.(mp3|m4a|aac|flac|ogg|wav)$/i, '')
    .replace(/^\d{4}-\d+\s+/, '')
    .trim();
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
    if (tracks.length === 0) {
      renderError('No audio files found for this year.');
    } else {
      renderTrackList(year);
    }
  } catch (err) {
    console.error(err);
    renderError('Could not load tracks. The audio server may be unavailable.');
  }
}

// ─────────────────────────────────────────────────────────────
// Player rendering
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

function renderTrackList(year) {
  const rows = tracks.map((t, i) => `
    <li class="track-row" data-index="${i}" role="button" tabindex="0" aria-label="Play ${escHtml(t.name)}">
      <span class="track-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="track-name">${escHtml(t.name)}</span>
      <button class="track-play-btn" aria-label="Play">▶</button>
    </li>`).join('');

  playerContainer.innerHTML = `
    <div class="audio-player">

      <div class="now-playing" id="nowPlaying">
        <div class="now-playing-label">Select a track to play</div>
        <div class="now-playing-title" id="nowPlayingTitle">—</div>
      </div>

      <div class="controls" id="controls">
        <button class="ctrl-btn" id="prevBtn" title="Previous">⏮</button>
        <button class="ctrl-btn ctrl-btn--play" id="playPauseBtn" title="Play / Pause">▶</button>
        <button class="ctrl-btn" id="nextBtn" title="Next">⏭</button>
        <div class="progress-wrap">
          <span class="time-cur" id="timeCur">0:00</span>
          <input type="range" class="progress-bar" id="progressBar" value="0" min="0" max="100" step="0.1">
          <span class="time-dur" id="timeDur">0:00</span>
        </div>
        <div class="volume-wrap">
          <span class="vol-icon">🔊</span>
          <input type="range" class="volume-bar" id="volumeBar" value="100" min="0" max="100">
        </div>
      </div>

      <ul class="track-list" id="trackList">
        ${rows}
      </ul>

    </div>`;

  document.getElementById('playPauseBtn').addEventListener('click', togglePlayPause);
  document.getElementById('prevBtn').addEventListener('click', playPrev);
  document.getElementById('nextBtn').addEventListener('click', playNext);

  const progressBar = document.getElementById('progressBar');
  progressBar.addEventListener('input', () => {
    if (audio.duration) audio.currentTime = (progressBar.value / 100) * audio.duration;
  });

  document.getElementById('volumeBar').addEventListener('input', e => {
    audio.volume = e.target.value / 100;
  });

  document.querySelectorAll('.track-row').forEach(row => {
    row.addEventListener('click', () => playTrack(Number(row.dataset.index)));
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') playTrack(Number(row.dataset.index));
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Audio playback
// ─────────────────────────────────────────────────────────────

function playTrack(index) {
  if (index < 0 || index >= tracks.length) return;

  document.querySelectorAll('.track-row').forEach(r => r.classList.remove('active'));

  currentTrack = index;
  audio.src = tracks[index].url;
  audio.play().catch(console.error);
  isPlaying = true;

  const row = document.querySelector(`.track-row[data-index="${index}"]`);
  if (row) { row.classList.add('active'); row.scrollIntoView({ block: 'nearest' }); }

  const titleEl = document.getElementById('nowPlayingTitle');
  if (titleEl) titleEl.textContent = tracks[index].name;

  const label = document.querySelector('.now-playing-label');
  if (label) label.textContent = 'Now playing';

  updatePlayPauseBtn();
}

function togglePlayPause() {
  if (currentTrack === -1 && tracks.length > 0) { playTrack(0); return; }
  if (audio.paused) { audio.play().catch(console.error); isPlaying = true; }
  else              { audio.pause(); isPlaying = false; }
  updatePlayPauseBtn();
}

function playPrev() { if (currentTrack > 0) playTrack(currentTrack - 1); }
function playNext() { if (currentTrack < tracks.length - 1) playTrack(currentTrack + 1); }

function stopAudio() {
  audio.pause();
  audio.src = '';
  isPlaying = false;
  currentTrack = -1;
  tracks = [];
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
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
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
// URL hash routing — e.g. music.iatebreakfast.com/#1985
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
