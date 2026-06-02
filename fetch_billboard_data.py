#!/usr/bin/env python3
"""
fetch_billboard_data.py
Scrapes Wikipedia Billboard Year-End Hot 100 pages and fetches album art
from Last.fm, outputting billboard_data.json.

Usage:
    python fetch_billboard_data.py                  # all years
    python fetch_billboard_data.py --test           # test years only (1970, 1980, 1990)
    python fetch_billboard_data.py --years 1970 1985 2000
"""

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

# ──────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────

LASTFM_KEY  = 'e44eff34c786df9f96c58920764bbd43'
LASTFM_API  = 'https://ws.audioscrobbler.com/2.0/'

ALL_YEARS = (
    list(range(1946, 2005)) +   # 1946–2004
    list(range(2012, 2021))      # 2012–2020
)

TEST_YEARS = [1970, 1980, 1990]

SLEEP_BETWEEN_ART   = 0.5   # seconds between Last.fm calls
SLEEP_BETWEEN_SONGS = 0.0   # optional extra delay per song
SLEEP_BETWEEN_YEARS = 1.0   # seconds between Wikipedia page fetches

OUTPUT_FILE = 'billboard_data.json'

# ──────────────────────────────────────────────────────────
# Minimal HTML parser — extract first <table> rows
# ──────────────────────────────────────────────────────────

class TableParser(HTMLParser):
    """Extracts text cells from all <tr> rows inside <table> tags."""

    def __init__(self):
        super().__init__()
        self.in_table = False
        self.in_cell  = False   # td or th
        self.rows     = []
        self._current_row  = []
        self._current_cell = []
        self._depth   = 0       # table nesting depth

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self._depth += 1
            if self._depth == 1:
                self.in_table = True
                self.rows = []
        if self.in_table and tag in ('td', 'th'):
            self.in_cell = True
            self._current_cell = []
        if self.in_table and tag == 'tr':
            self._current_row = []

    def handle_endtag(self, tag):
        if tag == 'table':
            self._depth -= 1
            if self._depth == 0:
                self.in_table = False
        if self.in_table and tag in ('td', 'th'):
            self._current_row.append(' '.join(self._current_cell).strip())
            self.in_cell = False
        if self.in_table and tag == 'tr' and self._current_row:
            self.rows.append(self._current_row[:])
            self._current_row = []

    def handle_data(self, data):
        if self.in_cell:
            text = data.strip()
            if text:
                self._current_cell.append(text)


def fetch_url(url, retries=3):
    """Fetch a URL, return response text or None on failure."""
    headers = {
        'User-Agent': 'BillboardDataBot/1.0 (educational project; contact christopher.head@gmail.com)',
        'Accept': 'text/html,application/json',
    }
    for attempt in range(retries):
        try:
            req  = urllib.request.Request(url, headers=headers)
            resp = urllib.request.urlopen(req, timeout=15)
            return resp.read().decode('utf-8', errors='replace')
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                print(f'  ERROR fetching {url}: {e}', file=sys.stderr)
                return None


def clean_title(raw):
    """Strip surrounding quotes and extra whitespace from a song title."""
    t = raw.strip()
    # Remove Wikipedia-style quotation marks  "Title" or "Title"
    t = re.sub(r'^[“”"\'"\']+|[“”"\'"\']+$', '', t).strip()
    # Remove trailing disambiguation e.g.  [A] or (2)
    t = re.sub(r'\s*[\[\(][^\]\)]*[\]\)]\s*$', '', t).strip()
    return t


def clean_rank(raw):
    """Extract leading integer from a rank cell like '1 (1)' or '3'."""
    m = re.match(r'(\d+)', raw.strip())
    return int(m.group(1)) if m else None


# ──────────────────────────────────────────────────────────
# Wikipedia scraping
# ──────────────────────────────────────────────────────────

WIKI_BASE = 'https://en.wikipedia.org/wiki/Billboard_Year-End_Hot_100_singles_of_{year}'

def scrape_year(year):
    """Return list of {rank, title, artist} dicts for the given year."""
    url  = WIKI_BASE.format(year=year)
    html = fetch_url(url)
    if not html:
        return []

    parser = TableParser()
    parser.feed(html)

    songs = []
    seen_ranks = set()

    for row in parser.rows:
        if len(row) < 3:
            continue
        rank_raw, title_raw, artist_raw = row[0], row[1], row[2]

        rank = clean_rank(rank_raw)
        if rank is None:
            continue
        # Skip header rows
        if title_raw.lower() in ('title', 'song'):
            continue

        title  = clean_title(title_raw)
        artist = artist_raw.strip()

        if not title or not artist:
            continue

        # Deduplicate: keep first occurrence of each rank
        if rank in seen_ranks:
            continue
        seen_ranks.add(rank)

        songs.append({'rank': rank, 'title': title, 'artist': artist, 'art': None})

    # Sort by rank just in case
    songs.sort(key=lambda s: s['rank'])
    return songs


# ──────────────────────────────────────────────────────────
# Last.fm art lookup
# ──────────────────────────────────────────────────────────

def fetch_art_lastfm(artist, title):
    """Return a cover-art URL string from Last.fm, or None."""
    params = urllib.parse.urlencode({
        'method':      'track.getInfo',
        'api_key':     LASTFM_KEY,
        'artist':      artist,
        'track':       title,
        'format':      'json',
        'autocorrect': 1,
    })
    url  = f'{LASTFM_API}?{params}'
    text = fetch_url(url)
    if not text:
        return None
    try:
        data   = json.loads(text)
        images = data.get('track', {}).get('album', {}).get('image', [])
        for size in ('extralarge', 'large', 'medium', 'small'):
            for img in images:
                if img.get('size') == size and img.get('#text'):
                    return img['#text']
    except (json.JSONDecodeError, KeyError):
        pass
    return None


# ──────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--test',  action='store_true', help='Run only test years (1970, 1980, 1990)')
    ap.add_argument('--years', nargs='+', type=int,  help='Specific years to fetch')
    ap.add_argument('--no-art', action='store_true', help='Skip Last.fm art lookup (faster)')
    ap.add_argument('--output', default=OUTPUT_FILE, help=f'Output JSON file (default: {OUTPUT_FILE})')
    args = ap.parse_args()

    if args.years:
        years = sorted(args.years)
    elif args.test:
        years = TEST_YEARS
    else:
        years = ALL_YEARS

    print(f'Fetching {len(years)} year(s): {years[0]}–{years[-1]}')
    print(f'Art lookup: {"disabled" if args.no_art else "Last.fm"}')
    print()

    # Load existing data so we can resume / merge
    existing = {}
    try:
        with open(args.output) as f:
            existing = json.load(f)
        print(f'Loaded existing data: {len(existing)} year(s) already present\n')
    except FileNotFoundError:
        pass

    result = dict(existing)

    for year in years:
        year_str = str(year)
        print(f'── {year} ', end='', flush=True)

        songs = scrape_year(year)
        if not songs:
            print(f'  SKIPPED (no data found)')
            result[year_str] = []
            continue

        print(f'{len(songs)} songs', end='', flush=True)

        if not args.no_art:
            art_found = 0
            for i, song in enumerate(songs):
                art = fetch_art_lastfm(song['artist'], song['title'])
                if art:
                    song['art'] = art
                    art_found += 1
                time.sleep(SLEEP_BETWEEN_ART)
                if (i + 1) % 10 == 0:
                    print('.', end='', flush=True)
            print(f'  {art_found}/{len(songs)} art found')
        else:
            print()

        result[year_str] = songs

        # Save after each year so progress is preserved on interrupt
        with open(args.output, 'w') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        time.sleep(SLEEP_BETWEEN_YEARS)

    print(f'\nDone. Saved {len(result)} year(s) to {args.output}')


if __name__ == '__main__':
    main()
