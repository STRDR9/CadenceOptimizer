// FORGE-015 SPIKE PROOF — Apple Music BPM pipeline (throwaway; never merges).
//
// THE question: given songs as Apple Music will hand them to us (name + artist
// + ISRC via the catalog song), can we get a BPM for most of them, reliably?
//
// This script tests the candidate BPM routes against ~50 real running songs:
//   1. Probes ReccoBeats /v1/track/search (endpoint exists in their docs nav,
//      params undocumented) with candidate param names, incl. ISRC.
//   2. Resolves each song's ISRC via MusicBrainz (free, no key, 1 req/s) —
//      standing in for what Apple Music's catalog `isrc` attribute will give us.
//   3. Looks each song up on ReccoBeats (ISRC param if step 1 found one, else
//      text search) -> track id -> /v1/audio-features -> tempo.
//   4. Reports hit rate + tempo vs a small table of widely documented BPMs.
//
// Run from the repo root (needs node >= 18, no deps):   node scripts/apple-music-bpm-proof.mjs
// NOTE: could not be executed from the FORGE cloud sandbox — its egress policy
// 403s api.reccobeats.com / musicbrainz.org. Run locally; takes ~2 min
// (MusicBrainz is rate-limited to 1 req/s).

const RB = 'https://api.reccobeats.com/v1';
const MB = 'https://musicbrainz.org/ws/2';
const UA = 'STRDR-CadenceOptimizer-spike/0.1 (andybiesiadecki@gmail.com)'; // MusicBrainz requires a UA
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ~50 real songs off running playlists: mixed era/genre, incl. the half-tempo zone.
// ref = widely documented BPM where one is well known (sanity reference, not gospel).
const SONGS = [
  { artist: 'The Weeknd', title: 'Blinding Lights', ref: 171 },
  { artist: 'Bee Gees', title: "Stayin' Alive", ref: 104 },
  { artist: 'Queen', title: "Don't Stop Me Now", ref: 156 },
  { artist: 'The Killers', title: 'Mr. Brightside', ref: 148 },
  { artist: 'Eminem', title: 'Lose Yourself', ref: 171 },
  { artist: 'Michael Jackson', title: 'Billie Jean', ref: 117 },
  { artist: 'Mark Ronson', title: 'Uptown Funk', ref: 115 },
  { artist: 'Survivor', title: 'Eye of the Tiger', ref: 109 },
  { artist: 'ABBA', title: 'Dancing Queen', ref: 101 },
  { artist: 'Taylor Swift', title: 'Shake It Off', ref: 160 },
  { artist: 'AC/DC', title: 'Thunderstruck', ref: 133 },
  { artist: 'Justin Timberlake', title: "Can't Stop the Feeling!", ref: 113 },
  { artist: 'Dua Lipa', title: "Don't Start Now" },
  { artist: 'Dua Lipa', title: 'Physical' },
  { artist: 'Harry Styles', title: 'As It Was' },
  { artist: 'Miley Cyrus', title: 'Flowers' },
  { artist: 'Doja Cat', title: 'Say So' },
  { artist: 'Lizzo', title: 'About Damn Time' },
  { artist: 'Beyoncé', title: 'Break My Soul' },
  { artist: 'Calvin Harris', title: 'Feel So Close' },
  { artist: 'Avicii', title: 'Levels' },
  { artist: 'Swedish House Mafia', title: "Don't You Worry Child" },
  { artist: 'David Guetta', title: 'Titanium' },
  { artist: 'Zedd', title: 'Clarity' },
  { artist: 'Martin Garrix', title: 'Animals' },
  { artist: 'Kygo', title: 'Firestone' },
  { artist: 'The Chainsmokers', title: 'Closer' },
  { artist: 'Imagine Dragons', title: 'Believer' },
  { artist: 'OneRepublic', title: 'Counting Stars' },
  { artist: 'Coldplay', title: 'Adventure of a Lifetime' },
  { artist: 'Foo Fighters', title: 'The Pretender' },
  { artist: 'Green Day', title: 'American Idiot' },
  { artist: 'Linkin Park', title: 'In the End' },
  { artist: 'Fall Out Boy', title: 'Centuries' },
  { artist: 'Panic! At The Disco', title: 'High Hopes' },
  { artist: 'Kanye West', title: 'Stronger' },
  { artist: 'Jay-Z', title: 'Run This Town' },
  { artist: 'Kendrick Lamar', title: 'HUMBLE.' },
  { artist: 'Drake', title: "God's Plan" },
  { artist: 'Macklemore & Ryan Lewis', title: "Can't Hold Us" },
  { artist: 'Rihanna', title: 'We Found Love' },
  { artist: 'Katy Perry', title: 'Roar' },
  { artist: 'Lady Gaga', title: 'Bad Romance' },
  { artist: 'P!nk', title: 'Raise Your Glass' },
  { artist: 'Kelly Clarkson', title: 'Stronger (What Doesn\'t Kill You)' },
  { artist: 'Journey', title: "Don't Stop Believin'" },
  { artist: 'Bruce Springsteen', title: 'Born to Run' },
  { artist: 'Fleetwood Mac', title: 'Go Your Own Way' },
  { artist: 'Daft Punk', title: 'Harder, Better, Faster, Stronger' },
  { artist: 'M83', title: 'Midnight City' },
];

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = { _raw: text.slice(0, 200) }; }
  return { status: res.status, body };
}

// ---- Step 1: discover what /v1/track/search accepts --------------------------
async function probeSearch() {
  console.log('== Probe: ReccoBeats /v1/track/search param discovery');
  const candidates = [
    ['searchText', 'searchText=' + encodeURIComponent('Blinding Lights The Weeknd')],
    ['q',          'q=' + encodeURIComponent('Blinding Lights The Weeknd')],
    ['query',      'query=' + encodeURIComponent('Blinding Lights The Weeknd')],
    ['term',       'term=' + encodeURIComponent('Blinding Lights The Weeknd')],
    ['isrc',       'isrc=USUG11904206'], // Blinding Lights
    ['ids(ISRC)',  null], // tested against /v1/track instead
  ];
  let textParam = null;
  let isrcParam = null;
  for (const [name, qs] of candidates) {
    const url = qs === null ? `${RB}/track?ids=USUG11904206` : `${RB}/track/search?${qs}`;
    const { status, body } = await getJson(url);
    const content = body?.content ?? body?.data ?? (Array.isArray(body) ? body : null);
    const hit = status === 200 && Array.isArray(content) && content.length > 0;
    console.log(`   ${name.padEnd(10)} -> ${status}${hit ? ` (${content.length} results)` : ''} ${!hit && body ? JSON.stringify(body).slice(0, 120) : ''}`);
    if (hit && name === 'isrc') isrcParam = 'isrc';
    if (hit && !textParam && name !== 'isrc' && name !== 'ids(ISRC)') textParam = qs.split('=')[0];
    await sleep(300);
  }
  return { textParam, isrcParam };
}

// ---- Step 2: ISRC per song via MusicBrainz (stand-in for Apple's isrc attr) --
async function isrcFor(song) {
  const q = `recording:"${song.title}" AND artist:"${song.artist}"`;
  const url = `${MB}/recording?query=${encodeURIComponent(q)}&inc=isrcs&fmt=json&limit=3`;
  const { status, body } = await getJson(url, { 'User-Agent': UA });
  if (status !== 200) return null;
  for (const rec of body?.recordings ?? []) {
    if (rec.isrcs?.length) return rec.isrcs[0];
  }
  return null;
}

// ---- Step 3: ReccoBeats lookup -> audio features -----------------------------
async function reccoTrack(song, isrc, { textParam, isrcParam }) {
  if (isrcParam && isrc) {
    const { status, body } = await getJson(`${RB}/track/search?${isrcParam}=${isrc}`);
    const content = body?.content ?? body?.data;
    if (status === 200 && content?.length) return { track: content[0], via: 'isrc' };
  }
  if (textParam) {
    const q = encodeURIComponent(`${song.title} ${song.artist}`);
    const { status, body } = await getJson(`${RB}/track/search?${textParam}=${q}`);
    const content = body?.content ?? body?.data;
    if (status === 200 && content?.length) {
      // prefer an exact ISRC match in results, else first result
      const byIsrc = isrc && content.find((t) => t.isrc === isrc);
      return { track: byIsrc || content[0], via: byIsrc ? 'text+isrc-match' : 'text-first' };
    }
  }
  return null;
}

async function tempoFor(trackId) {
  const { status, body } = await getJson(`${RB}/audio-features?ids=${trackId}`);
  const feat = (body?.content ?? [])[0];
  return status === 200 && typeof feat?.tempo === 'number' ? feat.tempo : null;
}

// ---- Main --------------------------------------------------------------------
const params = await probeSearch();
console.log(`\n   -> text search param: ${params.textParam ?? 'NONE FOUND'}; ISRC param: ${params.isrcParam ?? 'NONE FOUND'}`);
if (!params.textParam && !params.isrcParam) {
  console.log('\nVERDICT INPUT: ReccoBeats offers no usable lookup from Apple-side data (no text/ISRC search).');
  console.log('Route (a) is dead -> evaluate GetSongBPM / on-device detection per the design note.');
  process.exit(0);
}

console.log('\n== 50-song pipeline (MusicBrainz ISRC -> ReccoBeats -> tempo)');
let isrcHits = 0, trackHits = 0, tempoHits = 0, refChecked = 0, refClose = 0;
for (const song of SONGS) {
  const isrc = await isrcFor(song);          // Apple will hand us this for free
  await sleep(1100);                          // MusicBrainz: max 1 req/s
  if (isrc) isrcHits++;
  const found = await reccoTrack(song, isrc, params);
  let tempo = null;
  if (found) {
    trackHits++;
    tempo = await tempoFor(found.track.id);
    if (tempo) tempoHits++;
    await sleep(300);
  }
  let refNote = '';
  if (tempo && song.ref) {
    refChecked++;
    const d = Math.min(Math.abs(tempo - song.ref), Math.abs(tempo * 2 - song.ref), Math.abs(tempo / 2 - song.ref));
    if (d <= 3) refClose++;
    refNote = ` ref=${song.ref} (${d <= 3 ? 'OK' : 'OFF by ' + Math.round(d)})`;
  }
  console.log(`   ${(song.artist + ' — ' + song.title).padEnd(55).slice(0, 55)} isrc=${isrc ?? '—'} tempo=${tempo ? Math.round(tempo) : '—'}${found ? ' via ' + found.via : ''}${refNote}`);
}

console.log(`\n== RESULTS over ${SONGS.length} songs`);
console.log(`   ISRC resolved:        ${isrcHits}/${SONGS.length}  (stand-in; Apple Music gives ISRC natively, expect ~100%)`);
console.log(`   ReccoBeats track hit: ${trackHits}/${SONGS.length}`);
console.log(`   Tempo returned:       ${tempoHits}/${SONGS.length}  <- THE hit rate for the verdict`);
console.log(`   Tempo vs known BPM:   ${refClose}/${refChecked} within ±3 (half/double-time counted as a match)`);
console.log('\nInterpretation guide: >=80% tempo hit rate and >=90% ref agreement -> GO.');
console.log('50-79% -> GO-with-caveats (GetSongBPM fallback for misses). <50% -> NO-GO on route (a).');
