/* ============ NeonTube — app.js v7 (PARTE 1/2) ============
   Núcleo: prefs, bibliotecas locales (historial, favs, playlists, subs,
   búsquedas), feed multi-fuente (chart/search/favs/subs/playlist),
   cards con ❤ y reorden, fila "Seguir viendo", recientes.
   La PARTE 2 se pega DEBAJO de este texto, en el mismo archivo.
============================================================*/
'use strict';
(() => {

  /* ---------- Utilidades ---------- */
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {} };
  const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
  const KEY_RE = /^[A-Za-z0-9_-]{20,60}$/;
  const API_BASE = 'https://www.googleapis.com/youtube/v3';
  const LS = Object.freeze({
    key: 'neontube.key.v1', queue: 'neontube.queue.v2', hist: 'neontube.hist.v1',
    favs: 'neontube.favs.v1', pls: 'neontube.pls.v1', subs: 'neontube.subs.v1',
    searches: 'neontube.searches.v1', prefs: 'neontube.prefs.v3'
  });
  const RATES = Object.freeze([1, 1.25, 1.5, 1.75, 0.75]);
  const SLEEPS = Object.freeze([0, 15, 30, 60, 'end']);
  const ALLOWED_MEDIA_HOSTS = Object.freeze(['commondatastorage.googleapis.com']);
  const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ICON_UP = '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>';
  const ICON_DOWN = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
  const ICON_HEART = '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-9-9c-1.2-2.8.6-6 3.8-6 2 0 3.2 1.2 5.2 3.4C14 6.2 15.2 5 17.2 5c3.2 0 5 3.2 3.8 6-2 4.5-9 9-9 9z"/></svg>';
  const THUMB_FALLBACK = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="%23050806"/><path d="M6.5 2.5v4l3.5-2z" fill="%2339ff14"/><rect x="0.3" y="0.3" width="15.4" height="8.4" fill="none" stroke="%2339ff14" stroke-opacity="0.35" stroke-width="0.2"/></svg>';
  const QLABELS = Object.freeze({
    'default': 'Automática', highres: 'Máxima (4K+)', hd2160: '2160p', hd1440: '1440p',
    hd1080: '1080p', hd720: '720p', large: '480p', medium: '360p', small: '240p', tiny: '144p'
  });
  const DEFAULT_KEY = 'AIzaSyCQYIC9hnzvA_vf9kSXBmoG61sijPjaQ4c';

  const DEMO_CATALOG = Object.freeze([
    { kind: 'file', id: 'bb', title: 'Big Buck Bunny (CC) — demo sin API key', channel: 'Blender Foundation',
      dur: '9:56', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg', desc: 'Cortometraje libre de Blender Foundation.' },
    { kind: 'file', id: 'ed', title: 'Elephants Dream (CC) — demo sin API key', channel: 'Blender Foundation',
      dur: '10:53', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg', desc: 'Cortometraje libre de Blender Foundation.' },
    { kind: 'file', id: 'si', title: 'Sintel (CC) — demo sin API key', channel: 'Blender Foundation',
      dur: '14:48', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg', desc: 'Cortometraje libre de Blender Foundation.' },
    { kind: 'file', id: 'ts', title: 'Tears of Steel (CC) — demo sin API key', channel: 'Blender Foundation',
      dur: '12:14', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg', desc: 'Cortometraje libre de Blender Foundation.' }
  ]);

  const CHIPS = Object.freeze([
    { label: 'Para ti',        src: { type: 'chart' } },
    { label: 'Tendencias',     src: { type: 'chart', region: 'US' } },
    { label: 'Música',         src: { type: 'search', q: 'mix música completa' } },
    { label: 'Gaming',         src: { type: 'search', q: 'gameplay español' } },
    { label: 'Lo-fi',          src: { type: 'search', q: 'lofi hip hop mix' } },
    { label: 'En vivo',        src: { type: 'search', q: 'en directo', live: true } },
    { label: '❤ Favoritos',    src: { type: 'favs' } },
    { label: '★ Suscripciones', src: { type: 'subs' } }
  ]);

  const state = {
    view: 'feed', chip: 0, query: '', source: CHIPS[0].src,
    items: [], nextPage: null, loading: false,
    queue: [], qIndex: -1, current: null,
    rate: 1, quality: 'default', cc: false,
    vol: 100, muted: false, autoplay: true, repeat: 'off', shuffleOn: false,
    sleep: 0, sleepTimer: 0, theme: 'green', compact: false, dataSaver: false, cine: false,
    audioOnly: false, kind: null, resumeAt: 0
  };

  /* ---------- Storage seguro ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  };
  const loadArr = (k) => {
    try { const a = JSON.parse(store.get(k)); return Array.isArray(a) ? a : []; } catch (_) { return []; }
  };
  const saveArr = (k, a) => store.set(k, JSON.stringify(a));
  const getKey = () => {
    const k = store.get(LS.key);
    if (k && KEY_RE.test(k)) return k;
    return KEY_RE.test(DEFAULT_KEY) ? DEFAULT_KEY : '';
  };
  let PREFS = {};
  try { PREFS = JSON.parse(store.get(LS.prefs)) || {}; } catch (_) { PREFS = {}; }
  const savePrefs = () => store.set(LS.prefs, JSON.stringify(PREFS));

  const HIST = loadArr(LS.hist).filter(validItem);
  const FAVS = loadArr(LS.favs).filter(validItem);
  const PLS  = loadArr(LS.pls).filter(p => p && typeof p.name === 'string' && Array.isArray(p.items));
  const SUBS = loadArr(LS.subs).filter(s => typeof s === 'string').slice(0, 10);
  let SEARCHES = loadArr(LS.searches).filter(s => typeof s === 'string').slice(0, 8);

  function validItem(it) {
    if (!it || typeof it !== 'object') return false;
    if (it.kind === 'yt') return YT_ID_RE.test(String(it.id)) && typeof it.thumb === 'string' && it.thumb.startsWith('https://i.ytimg.com/');
    if (it.kind === 'file') {
      try { return ALLOWED_MEDIA_HOSTS.includes(new URL(it.src).hostname); } catch (_) { return false; }
    }
    return false;
  }
  const sameItem = (a, b) => a && b && a.kind === b.kind && a.id === b.id;

  /* ---------- Toast / debounce ---------- */
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }
  const debounce = (fn, ms) => {
    let h = 0;
    return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
  };

  /* ---------- YouTube Data API v3 ---------- */
  let controller = null;
  async function ytFetch(path, params) {
    const key = getKey();
    if (!key) { const e = new Error('NO_KEY'); e.code = 'NO_KEY'; throw e; }
    const url = new URL(API_BASE + path);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    url.searchParams.set('key', key);
    if (controller) controller.abort();
    controller = new AbortController();
    const res = await fetch(url.href, { signal: controller.signal });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (_) {}
      const e = new Error(msg); e.status = res.status; throw e;
    }
    return res.json();
  }
  const parseISO8601 = (d) => {
    const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(d || ''));
    if (!m) return '';
    const s = (+m[1] * 86400) + (+m[2] * 3600) + (+m[3] * 60) + (+m[4] || 0);
    const h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return h ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
             : `${mm}:${String(ss).padStart(2, '0')}`;
  };
  const fmtSec = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return h ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
             : `${mm}:${String(ss).padStart(2, '0')}`;
  };
  const thumbFor = (it) => (state.dataSaver && it && it.thumb)
    ? it.thumb.replace(/(hqdefault|sddefault|maxresdefault)/, 'mqdefault')
    : (it ? it.thumb : '');

  function mapSearchItem(it) {
    const id = it && it.id && it.id.videoId;
    const sn = it && it.snippet;
    if (!YT_ID_RE.test(String(id)) || !sn) return null;
    const thumb = (sn.thumbnails && (sn.thumbnails.medium || sn.thumbnails.default || {}).url) || '';
    if (!thumb.startsWith('https://i.ytimg.com/')) return null;
    return { kind: 'yt', id, title: sn.title || 'Sin título', channel: sn.channelTitle || 'Canal',
             thumb, desc: sn.description || '', ts: sn.publishTime || '',
             dur: (sn.liveBroadcastContent === 'live') ? 'EN VIVO' : '' };
  }
  function mapChartItem(it) {
    const id = it && it.id;
    const sn = it && it.snippet;
    if (!YT_ID_RE.test(String(id)) || !sn) return null;
    const thumb = (sn.thumbnails && (sn.thumbnails.medium || sn.thumbnails.default || {}).url) || '';
    if (!thumb.startsWith('https://i.ytimg.com/')) return null;
    return { kind: 'yt', id, title: sn.title || 'Sin título', channel: sn.channelTitle || 'Canal',
             thumb, desc: sn.description || '', ts: sn.publishedAt || '',
             dur: parseISO8601(it.contentDetails && it.contentDetails.duration) };
  }

  /* ---------- Skeletons ---------- */
  function renderSkeleton(n = 4) {
    const feed = $('feed');
    feed.replaceChildren();
    for (let i = 0; i < n; i++) {
      const c = el('div', 'card skel');
      c.appendChild(el('div', 'thumb'));
      const meta = el('div', 'meta');
      meta.appendChild(el('div', 'line w60'));
      c.appendChild(meta);
      feed.appendChild(c);
    }
  }

  /* ---------- Feed multi-fuente ---------- */
  async function loadFeed(reset = true) {
    if (state.loading) return;
    const key = getKey();
    const note = $('demoNote');
    if (!key) {
      note.textContent = 'Modo demo (sin API key): catálogo local CC. Añade tu clave en ⚙ Ajustes.';
      note.hidden = false;
      const q = state.query.trim().toLowerCase();
      state.items = q ? DEMO_CATALOG.filter(i => (i.title + i.channel).toLowerCase().includes(q)) : DEMO_CATALOG.slice();
      state.nextPage = null;
      render();
      return;
    }
    note.hidden = true;
    const src = state.query.trim() ? { type: 'search', q: state.query.trim() } : state.source;

    /* Fuentes locales: sin red */
    if (src.type === 'favs') {
      state.items = FAVS.slice(); state.nextPage = null; render(); return;
    }
    if (src.type === 'pl') {
      const pl = PLS[src.idx];
      state.items = pl ? pl.items.slice() : []; state.nextPage = null; render(); return;
    }
    if (src.type === 'subs') {
      if (!SUBS.length) { state.items = []; state.nextPage = null; render(); toast('Sin canales: usa “＋ Canal” dentro del reproductor'); return; }
      state.loading = true; $('topProgress').hidden = false;
      if (reset) renderSkeleton();
      try {
        let acc = [];
        for (const ch of SUBS.slice(0, 5)) {
          const data = await ytFetch('/search', {
            part: 'snippet', type: 'video', videoEmbeddable: 'true', safeSearch: 'moderate',
            maxResults: '6', q: ch, order: 'date'
          });
          acc = acc.concat((data.items || []).map(mapSearchItem).filter(Boolean));
        }
        acc.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
        state.items = acc; state.nextPage = null; render();
      } catch (err) {
        if (!(err && err.name === 'AbortError')) toast('Error cargando suscripciones');
      } finally { state.loading = false; $('topProgress').hidden = true; }
      return;
    }

    state.loading = true;
    $('topProgress').hidden = false;
    const token = reset ? null : state.nextPage;
    if (reset) { state.items = []; state.nextPage = null; renderSkeleton(); }
    try {
      if (src.type === 'chart') {
        const region = src.region || (navigator.language || 'es-MX').split('-')[1] || 'MX';
        const data = await ytFetch('/videos', {
          part: 'snippet,contentDetails,status', chart: 'mostPopular',
          regionCode: region, maxResults: '20', pageToken: token
        });
        const ok = (data.items || []).filter(it => it && it.status && it.status.embeddable === true);
        const mapped = ok.map(mapChartItem).filter(Boolean);
        state.items = reset ? mapped : state.items.concat(mapped);
        state.nextPage = data.nextPageToken || null;
      } else {
        const data = await ytFetch('/search', {
          part: 'snippet', type: 'video', videoEmbeddable: 'true', safeSearch: 'moderate',
          maxResults: '20', q: src.q, pageToken: token,
          eventType: src.live ? 'live' : null
        });
        const mapped = (data.items || []).map(mapSearchItem).filter(Boolean);
        state.items = reset ? mapped : state.items.concat(mapped);
        state.nextPage = data.nextPageToken || null;
      }
      render();
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (err && err.code === 'NO_KEY') toast('Añade tu API key en ⚙ Ajustes');
      else if (err && err.status === 403) toast('Cuota de API excedida (403) o clave restringida.');
      else toast('Sin conexión o error de API: ' + (err && err.message ? err.message : 'desconocido'));
    } finally {
      state.loading = false;
      $('topProgress').hidden = true;
      $('btnMore').hidden = !state.nextPage;
    }
  }

  /* ---------- Bibliotecas locales ---------- */
  function histPush(item) {
    const i = HIST.findIndex(h => sameItem(h, item));
    if (i >= 0) HIST.splice(i, 1);
    HIST.unshift(Object.assign({}, item, { pos: 0, dur: 0, ts: Date.now() }));
    if (HIST.length > 40) HIST.length = 40;
    saveArr(LS.hist, HIST);
    renderContinue();
  }
  function histUpdatePos(sec, dur) {
    const h = HIST[0];
    if (!h || !sameItem(h, state.current)) return;
    h.pos = Math.floor(sec); h.dur = Math.floor(dur || 0);
    saveArr(LS.hist, HIST);
  }
  const histPosOf = (item) => {
    const h = HIST.find(x => sameItem(x, item));
    return (h && h.pos && h.dur && h.pos < h.dur - 15 && h.pos > 15) ? h.pos : 0;
  };
  function renderContinue() {
    const wrap = $('continueWrap'), row = $('continueRow');
    const list = HIST.filter(h => h.pos > 15 && (!h.dur || h.pos < h.dur - 15)).slice(0, 10);
    wrap.hidden = list.length === 0;
    row.replaceChildren();
    list.forEach(it => {
      const b = el('button', 'cont-item');
      b.type = 'button';
      const img = el('img');
      img.src = thumbFor(it); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('error', () => { img.src = THUMB_FALLBACK; }, { once: true });
      b.appendChild(img);
      const bar = el('span', 'cont-bar');
      const fill = el('i');
      fill.style.width = (it.dur ? Math.min(100, (it.pos / it.dur) * 100) : 5).toFixed(0) + '%';
      bar.appendChild(fill);
      b.appendChild(bar);
      b.appendChild(el('span', 't', it.title));
      b.addEventListener('click', () => playItem(it, null));
      row.appendChild(b);
    });
  }
  const isFav = (item) => FAVS.some(f => sameItem(f, item));
  function favToggle(item) {
    const i = FAVS.findIndex(f => sameItem(f, item));
    if (i >= 0) { FAVS.splice(i, 1); toast('Quitado de favoritos'); }
    else { FAVS.unshift(Object.assign({}, item)); toast('Añadido a favoritos ❤'); }
    saveArr(LS.favs, FAVS);
    buzz(10);
    syncFavUI();
    if (state.source.type === 'favs') loadFeed(true);
  }
  function syncFavUI() {
    const b = $('btnFav');
    if (b && state.current) b.setAttribute('aria-pressed', String(isFav(state.current)));
  }
  function subsAdd(channel) {
    const name = String(channel || '').trim();
    if (!name) return;
    if (SUBS.includes(name)) { toast('Ya sigues este canal'); return; }
    if (SUBS.length >= 10) { toast('Máximo 10 canales locales'); return; }
    SUBS.push(name);
    saveArr(LS.subs, SUBS);
    toast('Canal seguido: ' + name + ' ★');
  }
  function pushSearch(q) {
    q = String(q || '').trim();
    if (!q) return;
    SEARCHES = [q].concat(SEARCHES.filter(s => s !== q)).slice(0, 8);
    saveArr(LS.searches, SEARCHES);
    renderRecent();
  }
  function renderRecent() {
    const row = $('recentRow');
    row.replaceChildren();
    SEARCHES.forEach(q => {
      const b = el('button', 'chip', q);
      b.type = 'button';
      b.addEventListener('click', () => {
        $('searchInput').value = q;
        state.query = q; state.view = 'feed';
        row.hidden = true;
        loadFeed(true);
      });
      row.appendChild(b);
    });
  }

  /* ---------- Playlists ---------- */
  const plSave = () => saveArr(LS.pls, PLS);
  function plCreate(name) {
    name = String(name || '').trim();
    if (!name) { toast('Ponle nombre a la playlist'); return; }
    PLS.push({ id: 'pl' + Date.now(), name, items: [] });
    plSave(); renderPlModal(); toast('Playlist creada: ' + name);
  }
  function plAddCurrent(plId) {
    const it = state.current;
    const pl = PLS.find(p => p.id === plId);
    if (!pl || !it) return;
    if (pl.items.some(x => sameItem(x, it))) { toast('Ya está en ' + pl.name); return; }
    pl.items.push(Object.assign({}, it));
    plSave(); renderPlModal(); toast('Añadido a ' + pl.name + ' ▤');
  }
  function plDelete(plId) {
    const i = PLS.findIndex(p => p.id === plId);
    if (i >= 0) { PLS.splice(i, 1); plSave(); renderPlModal(); toast('Playlist eliminada'); }
  }
  function plRename(plId) {
    const pl = PLS.find(p => p.id === plId);
    if (!pl) return;
    const nm = prompt('Nuevo nombre:', pl.name);
    if (nm && nm.trim()) { pl.name = nm.trim().slice(0, 40); plSave(); renderPlModal(); }
  }
  function plReorder(idx, i, dir) {
    const pl = PLS[idx];
    if (!pl) return;
    const j = i + dir;
    if (j < 0 || j >= pl.items.length) return;
    const t = pl.items[i]; pl.items[i] = pl.items[j]; pl.items[j] = t;
    plSave(); render();
  }
  function renderPlModal() {
    const box = $('plList');
    box.replaceChildren();
    if (!PLS.length) box.appendChild(el('p', 'hint', 'Aún no tienes playlists. Crea la primera arriba.'));
    PLS.forEach((p, idx) => {
      const row = el('div', 'plrow');
      const nm = el('span', 'nm', p.name);
      nm.title = 'Renombrar';
      nm.addEventListener('click', () => plRename(p.id));
      row.appendChild(nm);
      row.appendChild(el('span', 'ct', String(p.items.length)));
      const add = el('button', 'pill', '+ Vídeo');
      add.type = 'button';
      add.addEventListener('click', () => plAddCurrent(p.id));
      row.appendChild(add);
      const open = el('button', 'pill', 'Abrir');
      open.type = 'button';
      open.addEventListener('click', () => {
        state.source = { type: 'pl', idx };
        state.view = 'feed';
        setTab('feed', false);
        $('plModal').hidden = true;
        loadFeed(true);
      });
      row.appendChild(open);
      const del = el('button', 'icon-btn');
      del.type = 'button'; del.setAttribute('aria-label', 'Eliminar playlist');
      del.innerHTML = ICON_X;
      del.addEventListener('click', () => plDelete(p.id));
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  /* ---------- Cards + render ---------- */
  function cardFor(item, list, mode, index) {
    const card = el('button', 'card');
    card.type = 'button';
    const thumb = el('div', 'thumb');
    const img = el('img');
    img.src = thumbFor(item); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { img.src = THUMB_FALLBACK; }, { once: true });
    thumb.appendChild(img);
    if (item.dur) thumb.appendChild(el('span', 'duration', item.dur));
    card.appendChild(thumb);
    const meta = el('div', 'meta');
    meta.appendChild(el('span', 'avatar-init', (item.channel || '?').trim().charAt(0).toUpperCase()));
    const txt = el('div');
    txt.appendChild(el('div', 't', item.title));
    txt.appendChild(el('div', 's', item.channel));
    meta.appendChild(txt);
    const fav = el('button', 'fav-btn');
    fav.type = 'button'; fav.setAttribute('aria-label', 'Favorito');
    fav.setAttribute('aria-pressed', String(isFav(item)));
    fav.innerHTML = ICON_HEART;
    fav.addEventListener('click', (ev) => {
      ev.stopPropagation();
      favToggle(item);
      fav.setAttribute('aria-pressed', String(isFav(item)));
    });
    meta.appendChild(fav);
    if (mode === 'queue') {
      const rm = el('button', 'icon-btn row-remove');
      rm.type = 'button'; rm.setAttribute('aria-label', 'Quitar de la cola');
      rm.innerHTML = ICON_X;
      rm.addEventListener('click', (ev) => {
        ev.stopPropagation();
        state.queue.splice(index, 1);
        saveArr(LS.queue, state.queue); renderQueueBadge(); renderUpNext(); render();
        toast('Eliminado de la cola');
      });
      meta.appendChild(rm);
    }
    if (mode === 'pl') {
      const up = el('button', 'icon-btn row-remove');
      up.type = 'button'; up.setAttribute('aria-label', 'Subir');
      up.innerHTML = ICON_UP;
      up.addEventListener('click', (ev) => { ev.stopPropagation(); plReorder(state.source.idx, index, -1); });
      const dn = el('button', 'icon-btn row-remove');
      dn.type = 'button'; dn.setAttribute('aria-label', 'Bajar');
      dn.innerHTML = ICON_DOWN;
      dn.addEventListener('click', (ev) => { ev.stopPropagation(); plReorder(state.source.idx, index, 1); });
      meta.appendChild(up); meta.appendChild(dn);
    }
    card.appendChild(meta);
    card.addEventListener('click', () => playItem(item, list));
    return card;
  }

  function render() {
    if (state.view === 'queue') { renderQueue(); return; }
    const feed = $('feed');
    feed.replaceChildren();
    if (!state.items.length) {
      feed.appendChild(el('p', 's', state.loading ? 'Cargando…' : 'Nada por aquí todavía.'));
      return;
    }
    const list = state.items.slice();
    const mode = state.source.type === 'pl' && !state.query ? 'pl' : 'feed';
    const frag = document.createDocumentFragment();
    list.forEach((it, i) => frag.appendChild(cardFor(it, list, mode, i)));
    feed.appendChild(frag);
    $('btnMore').hidden = !state.nextPage;
  }
  function renderQueue() {
    const feed = $('feed');
    feed.replaceChildren();
    if (!state.queue.length) {
      feed.appendChild(el('p', 's', 'Cola vacía. Añade vídeos con “+ Añadir a la cola”.'));
      return;
    }
    const list = state.queue.slice();
    const frag = document.createDocumentFragment();
    list.forEach((it, i) => frag.appendChild(cardFor(it, list, 'queue', i)));
    feed.appendChild(frag);
  }
  function renderQueueBadge() {
    const b = $('queueBadge');
    b.textContent = String(state.queue.length);
    b.hidden = state.queue.length === 0;
  }
  function renderUpNext() {
    const box = $('upNextList');
    if (!box) return;
    box.replaceChildren();
    if (!state.queue.length) {
      box.appendChild(el('p', 's', 'Cola vacía: añade vídeos y aparecerán aquí.'));
      return;
    }
    state.queue.forEach((it, i) => {
      const b = el('button', 'upitem' + (i === state.qIndex ? ' current' : ''));
      b.type = 'button';
      const img = el('img');
      img.src = thumbFor(it); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('error', () => { img.src = THUMB_FALLBACK; }, { once: true });
      b.appendChild(img);
      const tx = el('div');
      tx.appendChild(el('div', 't', it.title));
      tx.appendChild(el('div', 's', it.channel + (it.dur ? ' · ' + it.dur : '')));
      b.appendChild(tx);
      b.addEventListener('click', () => {
        state.qIndex = i;
        state.current = it;
        openPlayer(it);
        if (it.kind === 'yt') playYT(it); else playFile(it);
      });
      box.appendChild(b);
    });
  }

  /* ---- La PARTE 2 continúa debajo: player, gestos, atajos, bindUI, init ---- */
    /* ============ PLAYER + IFrame API ============ */
  let ytPlayer = null, ytReady = false, pendingId = null, poll = 0, hideTimer = 0;
  let commentsLoadedFor = null, lastHistSave = 0;
  const video = $('video');

  function loadIframeAPI() {
    if (window.YT && window.YT.Player) { ytReady = true; return; }
    window.onYouTubeIframeAPIReady = () => {
      ytReady = true;
      if (pendingId) { createYT(pendingId); pendingId = null; }
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.appendChild(s);
  }
  const levelsFor = () => {
    let lv = (ytPlayer && ytPlayer.getAvailableQualityLevels) ? (ytPlayer.getAvailableQualityLevels() || []) : [];
    lv = lv.filter(l => l && l !== 'auto');
    if (state.dataSaver) lv = lv.filter(l => ['hd720', 'large', 'medium', 'small', 'tiny'].includes(l));
    return ['default'].concat(lv);
  };
  function createYT(id) {
    ytPlayer = new window.YT.Player('ytHost', {
      videoId: id,
      playerVars: Object.assign(
        { controls: 0, rel: 0, playsinline: 1, modestbranding: 1, disablekb: 1 },
        (location.protocol === 'http:' || location.protocol === 'https:') ? { origin: location.origin } : {}
      ),
      events: {
        onReady: (e) => {
          try { e.target.setPlaybackRate(state.rate); } catch (_) {}
          applyVol();
          let q = state.quality;
          if (state.dataSaver && q === 'default') q = 'hd720';
          if (q !== 'default') { try { e.target.setPlaybackQuality(q); } catch (_) {} }
          try { e.target.playVideo(); } catch (_) {}
          if (state.resumeAt > 15) {
            try { e.target.seekTo(state.resumeAt, true); } catch (_) {}
            toast('Retomando en ' + fmtSec(state.resumeAt));
            state.resumeAt = 0;
          }
        },
        onStateChange: (e) => {
          const S = window.YT.PlayerState;
          $('stageSpinner').hidden = (e.data !== S.BUFFERING && e.data !== S.CUED);
          if (e.data === S.ENDED) handleEnd();
          showControls();
          syncPlayIcons();
        },
        onError: (e) => {
          $('stageSpinner').hidden = true;
          const code = e && e.data;
          if (code === 101 || code === 150) toast('El dueño no permite insertar este vídeo → saltando');
          else if (code === 100) toast('Vídeo privado o eliminado → saltando');
          else if (code === 2) toast('ID de vídeo inválido');
          else if (code === 5) toast('Error HTML5 interno del player');
          if (code === 100 || code === 101 || code === 150) setTimeout(next, 900);
        }
      }
    });
  }
  function playYT(item) {
    state.kind = 'yt';
    state.resumeAt = histPosOf(item);
    $('stageSpinner').hidden = false;
    video.hidden = true; video.pause(); video.removeAttribute('src');
    $('ytHost').hidden = false;
    commentsLoadedFor = null;
    if (!ytReady || !ytPlayer) {
      loadIframeAPI();
      if (ytReady && !ytPlayer) createYT(item.id); else pendingId = item.id;
    } else {
      try { ytPlayer.loadVideoById(item.id); } catch (_) { pendingId = item.id; }
      if (state.resumeAt > 15) {
        const waitReady = setInterval(() => {
          if (ytPlayer && ytPlayer.getCurrentTime) {
            clearInterval(waitReady);
            try { ytPlayer.seekTo(state.resumeAt, true); } catch (_) {}
            toast('Retomando en ' + fmtSec(state.resumeAt));
            state.resumeAt = 0;
          }
        }, 400);
        setTimeout(() => clearInterval(waitReady), 8000);
      }
    }
  }
  function playFile(item) {
    state.kind = 'file';
    state.resumeAt = histPosOf(item);
    commentsLoadedFor = null;
    if (ytPlayer && ytPlayer.stopVideo) { try { ytPlayer.stopVideo(); } catch (_) {} }
    $('ytHost').hidden = true;
    video.hidden = false;
    video.src = item.src;
    video.playbackRate = state.rate;
    video.volume = state.vol / 100; video.muted = state.muted;
    if (state.resumeAt > 15) {
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = state.resumeAt;
        toast('Retomando en ' + fmtSec(state.resumeAt));
        state.resumeAt = 0;
      }, { once: true });
    }
    video.play().catch(() => toast('Toca ▶ para iniciar (autobloqueo del navegador)'));
  }

  /* ---------- Controles de overlay ---------- */
  function showControls() {
    const ui = $('stageUI');
    if (!ui) return;
    ui.classList.remove('controls-hidden');
    clearTimeout(hideTimer);
    if (isPlaying()) hideTimer = setTimeout(hideControls, 3500);
  }
  function hideControls() {
    const ui = $('stageUI');
    if (ui) ui.classList.add('controls-hidden');
  }
  function toggleControls() {
    const ui = $('stageUI');
    if (!ui) return;
    if (ui.classList.contains('controls-hidden')) showControls();
    else { clearTimeout(hideTimer); hideControls(); }
  }
  function openPlayer(item) {
    state.current = item;
    $('pTitle').textContent = item.title;
    $('pChannel').textContent = item.channel;
    $('pArt').src = thumbFor(item);
    $('player').hidden = false;
    $('mini').hidden = true;
    $('pDesc').hidden = true;
    $('btnInfo').setAttribute('aria-pressed', 'false');
    $('pComments').hidden = true;
    syncFavUI();
    updatePos();
    renderUpNext();
    showControls();
    histPush(item);
  }
  function playItem(item, list) {
    if (list && list.length) {
      state.queue = list.slice(0, 100);
      state.qIndex = Math.max(0, list.indexOf(item));
      saveArr(LS.queue, state.queue); renderQueueBadge();
    }
    openPlayer(item);
    if (item.kind === 'yt') playYT(item); else playFile(item);
  }
  const currentItem = () => (state.qIndex >= 0 && state.queue[state.qIndex]) || state.current;
  function next() { step(1); }
  function step(d) {
    if (!state.queue.length) return;
    if (state.shuffleOn && state.queue.length > 1) {
      let r = state.qIndex;
      while (r === state.qIndex) r = Math.floor(Math.random() * state.queue.length);
      state.qIndex = r;
    } else {
      state.qIndex = (state.qIndex + d + state.queue.length) % state.queue.length;
    }
    const it = state.queue[state.qIndex];
    state.current = it;
    openPlayer(it);
    if (it.kind === 'yt') playYT(it); else playFile(it);
  }
  function handleEnd() {
    if (state.sleep === 'end') { stopAll(); toast('😴 Fin de la cola: detenido por temporizador'); return; }
    if (state.repeat === 'one') {
      if (state.kind === 'yt' && ytPlayer) { try { ytPlayer.seekTo(0, true); ytPlayer.playVideo(); } catch (_) {} }
      else { video.currentTime = 0; video.play(); }
      return;
    }
    if (state.autoplay || state.repeat === 'all') next();
  }
  function updatePos() { $('pPos').textContent = `${state.qIndex + 1}/${state.queue.length}`; }

  const isPlaying = () => {
    if (state.kind === 'yt' && ytPlayer && ytPlayer.getPlayerState) {
      try { return ytPlayer.getPlayerState() === 1; } catch (_) { return false; }
    }
    return !video.paused && !video.ended;
  };
  function togglePlay() {
    if (state.kind === 'yt' && ytPlayer) {
      if (isPlaying()) ytPlayer.pauseVideo(); else ytPlayer.playVideo();
    } else if (state.kind === 'file') {
      if (video.paused) video.play(); else video.pause();
    }
    syncPlayIcons();
    showControls();
  }
  function syncPlayIcons() {
    const icon = isPlaying() ? ICON_PAUSE : ICON_PLAY;
    $('btnPlay').innerHTML = icon;
    $('mPlay').innerHTML = icon;
  }
  function durationOf() {
    if (state.kind === 'yt' && ytPlayer && ytPlayer.getDuration) { try { return ytPlayer.getDuration() || 0; } catch (_) { return 0; } }
    return isFinite(video.duration) ? video.duration : 0;
  }
  function currentOf() {
    if (state.kind === 'yt' && ytPlayer && ytPlayer.getCurrentTime) { try { return ytPlayer.getCurrentTime() || 0; } catch (_) { return 0; } }
    return video.currentTime || 0;
  }
  function seekTo(t) {
    const d = durationOf();
    t = Math.min(Math.max(0, t), d || t);
    if (state.kind === 'yt' && ytPlayer) { try { ytPlayer.seekTo(t, true); } catch (_) {} }
    else if (state.kind === 'file') video.currentTime = t;
  }
  function seekBy(delta) {
    if (!durationOf()) return;
    seekTo(currentOf() + delta);
    buzz(15);
    const g = delta < 0 ? $('gfxLeft') : $('gfxRight');
    g.hidden = true;
    g.style.animation = 'none'; void g.offsetWidth; g.style.animation = '';
    g.hidden = false;
    setTimeout(() => { g.hidden = true; }, 650);
    showControls();
  }

  /* ---------- Volumen ---------- */
  function applyVol() {
    if (state.kind === 'yt' && ytPlayer) {
      try {
        ytPlayer.setVolume(state.vol);
        if (state.muted) ytPlayer.mute(); else ytPlayer.unMute();
      } catch (_) {}
    } else if (state.kind === 'file') {
      video.volume = state.vol / 100; video.muted = state.muted;
    }
  }
  function setVol(v) {
    state.vol = Math.min(100, Math.max(0, Math.round(v)));
    if (state.vol > 0) state.muted = false;
    PREFS.vol = state.vol; PREFS.muted = state.muted; savePrefs();
    applyVol(); syncVolUI();
  }
  function toggleMute() {
    state.muted = !state.muted;
    PREFS.muted = state.muted; savePrefs();
    applyVol(); syncVolUI(); buzz(10);
  }
  function syncVolUI() {
    $('vol').value = String(state.muted ? 0 : state.vol);
    $('btnMute').setAttribute('aria-pressed', String(state.muted));
  }

  /* ---------- Calidad / CC / sleep / share / info ---------- */
  function cycleQuality() {
    if (state.kind !== 'yt' || !ytPlayer || !ytPlayer.getAvailableQualityLevels) {
      toast('Calidad ajustable solo en vídeos de YouTube');
      return;
    }
    const levels = levelsFor();
    let i = levels.indexOf(state.quality);
    if (i < 0) i = 0;
    state.quality = levels[(i + 1) % levels.length];
    PREFS.quality = state.quality; savePrefs();
    try { ytPlayer.setPlaybackQuality(state.quality); } catch (_) {}
    $('btnQuality').textContent = state.quality === 'default' ? 'HD' : (QLABELS[state.quality] || state.quality);
    toast('Calidad: ' + (QLABELS[state.quality] || state.quality) +
          (state.quality !== 'default' ? ' (YouTube puede autoajustar por red)' : ''));
  }
  function toggleCC() {
    if (state.kind !== 'yt' || !ytPlayer) { toast('Subtítulos solo en vídeos de YouTube'); return; }
    state.cc = !state.cc;
    try {
      if (state.cc) {
        ytPlayer.loadModule('captions');
        const list = ytPlayer.getOption('captions', 'tracklist') || [];
        const pref = list.find(t => t && t.languageCode === 'es') || list[0];
        ytPlayer.setOption('captions', 'track', pref ? { languageCode: pref.languageCode } : {});
      } else {
        ytPlayer.setOption('captions', 'track', {});
        ytPlayer.unloadModule('captions');
      }
    } catch (_) {}
    $('btnCC').setAttribute('aria-pressed', String(state.cc));
    toast(state.cc ? 'Subtítulos activados (CC)' : 'Subtítulos desactivados');
  }
  function sleepLabel() {
    const s = state.sleep;
    $('btnSleep').textContent = s === 0 ? '😴 Off' : (s === 'end' ? '😴 Fin cola' : '😴 ' + s + 'm');
  }
  function cycleSleep() {
    let i = SLEEPS.indexOf(state.sleep);
    state.sleep = SLEEPS[(i + 1) % SLEEPS.length];
    clearTimeout(state.sleepTimer);
    if (typeof state.sleep === 'number' && state.sleep > 0) {
      state.sleepTimer = setTimeout(() => {
        if (isPlaying()) togglePlay();
        toast('😴 Temporizador cumplido: reproducción pausada');
        state.sleep = 0; sleepLabel();
      }, state.sleep * 60000);
    }
    sleepLabel();
    toast('Temporizador: ' + (state.sleep === 0 ? 'off' : state.sleep === 'end' ? 'al fin de la cola' : state.sleep + ' min'));
  }
  function shareCurrent() {
    const it = currentItem();
    if (!it) return;
    const url = it.kind === 'yt' ? ('https://www.youtube.com/watch?v=' + it.id) : it.src;
    if (navigator.share) {
      navigator.share({ title: it.title, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => toast('Link copiado al portapapeles')).catch(() => toast(url));
    } else toast(url);
  }
  function toggleInfo() {
    const box = $('pDesc');
    const on = box.hidden;
    box.hidden = !on;
    $('btnInfo').setAttribute('aria-pressed', String(on));
    if (on) {
      const it = currentItem();
      $('pDescTxt').textContent = (it && it.desc) ? it.desc : 'Sin descripción disponible.';
    }
  }
  async function fetchComments() {
    const it = currentItem();
    if (!it || it.kind !== 'yt') { toast('Comentarios solo en vídeos de YouTube'); return; }
    const box = $('pComments');
    if (!box.hidden && commentsLoadedFor === it.id) { box.hidden = true; return; }
    if (commentsLoadedFor === it.id) { box.hidden = false; return; }
    box.hidden = false;
    box.replaceChildren(el('p', 'hint', 'Cargando comentarios… (gasta ~100 unidades de cuota)'));
    try {
      const data = await ytFetch('/commentThreads', {
        part: 'snippet', videoId: it.id, order: 'relevance', maxResults: '8', textFormat: 'plainText'
      });
      box.replaceChildren();
      (data.items || []).forEach(c => {
        const top = c.snippet && c.snippet.topLevelComment && c.snippet.topLevelComment.snippet;
        if (!top) return;
        const row = el('div', 'comment');
        row.appendChild(el('b', null, top.authorDisplayName + ':'));
        row.appendChild(el('span', null, ' ' + String(top.textDisplay || '').slice(0, 280)));
        box.appendChild(row);
      });
      if (!box.children.length) box.appendChild(el('p', 'hint', 'Sin comentarios públicos.'));
      commentsLoadedFor = it.id;
    } catch (err) {
      box.replaceChildren(el('p', 'hint', 'No se pudieron cargar los comentarios (cuota o desactivados).'));
    }
  }

  /* ---------- Poll (progreso + historial) ---------- */
  function startPoll() {
    clearInterval(poll);
    poll = setInterval(() => {
      const d = durationOf(), c = currentOf();
      const pct = d ? (c / d) * 100 : 0;
      const bar = $('mBarFill');
      if (bar) bar.style.width = pct.toFixed(1) + '%';
      const now = Date.now();
      if (now - lastHistSave > 4000 && d) { lastHistSave = now; histUpdatePos(c, d); }
      if ($('player').hidden && $('mini').hidden) return;
      $('tCur').textContent = fmtSec(c);
      $('tDur').textContent = fmtSec(d);
      if (!$('seek').matches(':active')) $('seek').value = String(Math.round(pct * 10));
    }, 500);
  }

  /* ---------- Bind de UI ---------- */
  function bindUI() {
    const chips = $('chips');
    CHIPS.forEach((c, i) => {
      const b = el('button', 'chip', c.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', i === state.chip ? 'true' : 'false');
      b.addEventListener('click', () => {
        state.chip = i; state.source = c.src; state.view = 'feed';
        chips.querySelectorAll('.chip').forEach((x, j) => x.setAttribute('aria-pressed', j === i ? 'true' : 'false'));
        setTab('feed', false);
        loadFeed(true);
      });
      chips.appendChild(b);
    });

    /* Búsqueda + recientes + voz */
    const onSearch = debounce((v) => {
      state.query = v; state.view = 'feed';
      if (v.trim()) pushSearch(v);
      loadFeed(true);
    }, 450);
    $('searchInput').addEventListener('input', (e) => onSearch(e.target.value));
    $('searchInput').addEventListener('focus', () => { if (!$('searchInput').value) $('recentRow').hidden = !SEARCHES.length; });
    $('searchInput').addEventListener('blur', () => { setTimeout(() => { $('recentRow').hidden = true; }, 180); });
    $('btnClear').addEventListener('click', () => {
      $('searchInput').value = ''; state.query = ''; loadFeed(true);
    });
    $('btnShuffle').addEventListener('click', () => {
      if (!state.items.length) { toast('Nada que mezclar todavía'); return; }
      const list = state.items.slice();
      playItem(list[Math.floor(Math.random() * list.length)], list);
      toast('Reproducción aleatoria ▶');
    });
    $('btnVoice').addEventListener('click', () => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { toast('Tu navegador no soporta búsqueda por voz'); return; }
      const rec = new SR();
      rec.lang = 'es-ES'; rec.interimResults = false; rec.maxAlternatives = 1;
      $('btnVoice').classList.add('listening');
      rec.onresult = (ev) => {
        const q = ev.results[0][0].transcript;
        $('searchInput').value = q;
        state.query = q; pushSearch(q); loadFeed(true);
      };
      rec.onend = () => $('btnVoice').classList.remove('listening');
      rec.onerror = () => { $('btnVoice').classList.remove('listening'); toast('No te escuché bien 🎤'); };
      rec.start();
    });
    $('btnMore').addEventListener('click', () => loadFeed(false));

    /* Tabs */
    $('bottomnav').addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      const name = tab.dataset.tab;
      if (name === 'queue') { state.view = 'queue'; setTab('queue'); render(); return; }
      if (name === 'music') { state.source = { type: 'search', q: 'mix música completa' }; state.query = ''; $('searchInput').value = ''; }
      if (name === 'explore') { state.source = { type: 'chart', region: 'US' }; }
      if (name === 'feed') { state.source = CHIPS[state.chip].src; }
      state.view = 'feed'; setTab(name); loadFeed(true);
    });
    $('btnQueueTop').addEventListener('click', () => { state.view = 'queue'; setTab('queue'); render(); });

    /* Overlay */
    $('btnPlay').addEventListener('click', togglePlay);
    $('mPlay').addEventListener('click', togglePlay);
    $('btnNext').addEventListener('click', () => { next(); showControls(); });
    $('btnBack10').addEventListener('click', () => seekBy(-10));
    $('btnFwd10').addEventListener('click', () => seekBy(10));
    $('btnCC').addEventListener('click', toggleCC);
    $('btnQuality').addEventListener('click', cycleQuality);
    $('btnRate').addEventListener('click', () => {
      const i = (RATES.indexOf(state.rate) + 1) % RATES.length;
      state.rate = RATES[i];
      PREFS.rate = state.rate; savePrefs();
      $('btnRate').textContent = state.rate + 'x';
      if (state.kind === 'yt' && ytPlayer) { try { ytPlayer.setPlaybackRate(state.rate); } catch (_) {} }
      else video.playbackRate = state.rate;
      toast('Velocidad: ' + state.rate + 'x');
    });
    $('btnFull').addEventListener('click', () => {
      const target = state.kind === 'yt' ? $('ytHost') : video;
      if (target && target.requestFullscreen) {
        target.requestFullscreen().then(() => {
          try {
            if (screen.orientation && screen.orientation.lock) {
              screen.orientation.lock('landscape').catch(() => {});
            }
          } catch (_) {}
        }).catch(() => toast('Pantalla completa no disponible'));
      }
    });
    $('btnAudioOnly').addEventListener('click', (e) => {
      state.audioOnly = !state.audioOnly;
      $('player').classList.toggle('audio-only', state.audioOnly);
      $('pArt').hidden = !state.audioOnly;
      e.currentTarget.setAttribute('aria-pressed', String(state.audioOnly));
      toast(state.audioOnly ? 'Modo solo audio (sigue sonando en 2º plano)' : 'Vídeo visible');
    });
    $('btnFav').addEventListener('click', () => { if (state.current) favToggle(state.current); });
    $('btnMute').addEventListener('click', toggleMute);
    $('vol').addEventListener('input', (e) => setVol(Number(e.target.value)));
    $('btnMinimize').addEventListener('click', () => {
      $('player').hidden = true;
      const it = currentItem();
      if (it) {
        $('mThumb').src = thumbFor(it);
        $('mTitle').textContent = it.title;
        $('mChannel').textContent = it.channel;
        $('mini').hidden = false;
      }
    });
    $('mExpand').addEventListener('click', () => { $('mini').hidden = true; $('player').hidden = false; showControls(); });
    $('mClose').addEventListener('click', stopAll);
    $('btnClosePlayer').addEventListener('click', stopAll);
    $('btnQueueAdd').addEventListener('click', () => {
      const it = currentItem();
      if (!it) return;
      if (state.queue.some(q => sameItem(q, it))) { toast('Ya está en la cola'); return; }
      state.queue.push(it);
      saveArr(LS.queue, state.queue); renderQueueBadge(); renderUpNext();
      buzz(10); toast('Añadido a la cola ✓');
    });

    /* Extras */
    $('btnShuffleQ').addEventListener('click', (e) => {
      state.shuffleOn = !state.shuffleOn;
      PREFS.shuffleOn = state.shuffleOn; savePrefs();
      e.currentTarget.setAttribute('aria-pressed', String(state.shuffleOn));
      toast(state.shuffleOn ? 'Shuffle de cola: ON 🔀' : 'Shuffle de cola: OFF');
    });
    $('btnRepeat').addEventListener('click', (e) => {
      state.repeat = state.repeat === 'off' ? 'all' : (state.repeat === 'all' ? 'one' : 'off');
      PREFS.repeat = state.repeat; savePrefs();
      e.currentTarget.textContent = state.repeat === 'off' ? '🔁 Off' : (state.repeat === 'all' ? '🔁 All' : '🔂 One');
      e.currentTarget.setAttribute('aria-pressed', String(state.repeat !== 'off'));
    });
    $('btnAuto').addEventListener('click', (e) => {
      state.autoplay = !state.autoplay;
      PREFS.autoplay = state.autoplay; savePrefs();
      e.currentTarget.setAttribute('aria-pressed', String(state.autoplay));
      toast(state.autoplay ? 'Auto-siguiente: ON' : 'Auto-siguiente: OFF');
    });
    $('btnSleep').addEventListener('click', cycleSleep);
    $('btnShare').addEventListener('click', shareCurrent);
    $('btnInfo').addEventListener('click', toggleInfo);
    $('btnComments').addEventListener('click', fetchComments);
    $('btnPl').addEventListener('click', () => { renderPlModal(); $('plModal').hidden = false; });
    $('btnChannel').addEventListener('click', () => { if (state.current) subsAdd(state.current.channel); });
    const bc = el('button', 'pill', '🎬 Cine');
    bc.type = 'button';
    bc.addEventListener('click', () => {
      state.cine = !state.cine;
      $('player').classList.toggle('cine', state.cine);
      bc.setAttribute('aria-pressed', String(state.cine));
      toast(state.cine ? 'Modo cine: pantalla grande' : 'Modo cine: off');
    });
    document.querySelector('.p-extras').appendChild(bc);

    /* Gestos: tap / doble tap / swipe sobre el overlay */
    const ui = $('stageUI');
    let lastTap = 0, tapTimer = 0, downX = 0, downY = 0, moved = false;
    ui.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; moved = false; });
    ui.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - downX) > 12 || Math.abs(e.clientY - downY) > 12) moved = true;
    });
    ui.addEventListener('pointerup', (e) => {
      if (e.target.closest('button, input')) return;
      const dx = e.clientX - downX, dy = e.clientY - downY;
      if (moved && Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx)) {
        if (dy > 0) $('btnMinimize').click();
        moved = false; return;
      }
      if (moved && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) next(); else step(-1);
        moved = false; return;
      }
      const now = Date.now();
      const rect = ui.getBoundingClientRect();
      const leftHalf = (e.clientX - rect.left) < rect.width / 2;
      if (now - lastTap < 300) {
        clearTimeout(tapTimer);
        lastTap = 0;
        seekBy(leftHalf ? -10 : 10);
      } else {
        lastTap = now;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => { toggleControls(); lastTap = 0; }, 300);
      }
    });

    /* Atajos de teclado (desktop) */
    document.addEventListener('keydown', (e) => {
      if ($('player').hidden) return;
      if (e.target.matches('input, textarea') || !$('modal').hidden || !$('plModal').hidden) return;
      switch (e.key) {
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft': seekBy(-10); break;
        case 'ArrowRight': seekBy(10); break;
        case 'ArrowUp': e.preventDefault(); setVol(state.vol + 10); break;
        case 'ArrowDown': e.preventDefault(); setVol(state.vol - 10); break;
        case 'm': case 'M': toggleMute(); break;
        case 'f': case 'F': $('btnFull').click(); break;
        case 'n': case 'N': next(); break;
        case 'c': case 'C': bc.click(); break;
      }
    });

    /* Vídeo nativo (demo) */
    video.addEventListener('ended', handleEnd);
    video.addEventListener('play', syncPlayIcons);
    video.addEventListener('pause', syncPlayIcons);
    video.addEventListener('waiting', () => { $('stageSpinner').hidden = false; });
    video.addEventListener('playing', () => { $('stageSpinner').hidden = true; });

    /* Playlists modal */
    $('btnPlCreate').addEventListener('click', () => {
      plCreate($('plNameInput').value);
      $('plNameInput').value = '';
    });
    $('btnPlClose').addEventListener('click', () => { $('plModal').hidden = true; });
    $('plModal').addEventListener('click', (e) => { if (e.target === $('plModal')) $('plModal').hidden = true; });

    /* Ajustes */
    $('btnSettings').addEventListener('click', () => {
      $('apiKeyInput').value = getKey();
      $('chkCompact').checked = state.compact;
      $('chkData').checked = state.dataSaver;
      document.querySelectorAll('.swatch').forEach(s =>
        s.setAttribute('aria-pressed', String(s.dataset.theme === state.theme)));
      $('modal').hidden = false;
    });
    $('btnCloseModal').addEventListener('click', () => { $('modal').hidden = true; });
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').hidden = true; });
    $('btnSaveKey').addEventListener('click', () => {
      const v = $('apiKeyInput').value.trim();
      if (!KEY_RE.test(v)) { toast('Clave con formato inválido'); return; }
      store.set(LS.key, v);
      $('modal').hidden = true;
      toast('API key guardada en este dispositivo ✓');
      loadFeed(true);
    });
    $('btnClearKey').addEventListener('click', () => {
      store.del(LS.key); $('apiKeyInput').value = '';
      $('modal').hidden = true; toast('Override borrado: se usa la clave embebida.');
      loadFeed(true);
    });
    document.querySelectorAll('.swatch').forEach(s => {
      s.addEventListener('click', () => {
        state.theme = s.dataset.theme;
        PREFS.theme = state.theme; savePrefs();
        document.body.dataset.theme = state.theme === 'green' ? '' : state.theme;
        document.querySelectorAll('.swatch').forEach(x =>
          x.setAttribute('aria-pressed', String(x === s)));
        buzz(10);
      });
    });
    $('chkCompact').addEventListener('change', (e) => {
      state.compact = e.target.checked;
      PREFS.compact = state.compact; savePrefs();
      document.body.classList.toggle('compact', state.compact);
    });
    $('chkData').addEventListener('change', (e) => {
      state.dataSaver = e.target.checked;
      PREFS.dataSaver = state.dataSaver; savePrefs();
      toast(state.dataSaver ? 'Ahorro de datos: ON (miniaturas ligeras + tope 720p)' : 'Ahorro de datos: OFF');
      render();
    });
  }

  function stopAll() {
    if (ytPlayer && ytPlayer.stopVideo) { try { ytPlayer.stopVideo(); } catch (_) {} }
    video.pause(); video.removeAttribute('src'); video.load();
    $('player').hidden = true; $('mini').hidden = true;
    $('stageSpinner').hidden = true;
    clearTimeout(hideTimer);
    state.current = null; state.kind = null;
    renderContinue();
  }
  function setTab(name, doRender = true) {
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    if (doRender) render();
  }

  /* ---------- Arranque ---------- */
  function init() {
    /* Prefs persistidas */
    state.theme = PREFS.theme || 'green';
    state.compact = !!PREFS.compact;
    state.dataSaver = !!PREFS.dataSaver;
    state.vol = typeof PREFS.vol === 'number' ? PREFS.vol : 100;
    state.muted = !!PREFS.muted;
    state.rate = RATES.includes(PREFS.rate) ? PREFS.rate : 1;
    state.quality = PREFS.quality || 'default';
    state.autoplay = PREFS.autoplay !== false;
    state.repeat = ['off', 'all', 'one'].includes(PREFS.repeat) ? PREFS.repeat : 'off';
    state.shuffleOn = !!PREFS.shuffleOn;
    document.body.dataset.theme = state.theme === 'green' ? '' : state.theme;
    document.body.classList.toggle('compact', state.compact);
    $('btnRate').textContent = state.rate + 'x';
    $('btnQuality').textContent = state.quality === 'default' ? 'HD' : (QLABELS[state.quality] || 'HD');
    $('btnAuto').setAttribute('aria-pressed', String(state.autoplay));
    $('btnShuffleQ').setAttribute('aria-pressed', String(state.shuffleOn));
    $('btnRepeat').textContent = state.repeat === 'off' ? '🔁 Off' : (state.repeat === 'all' ? '🔁 All' : '🔂 One');
    $('btnRepeat').setAttribute('aria-pressed', String(state.repeat !== 'off'));
    sleepLabel();

    if (location.protocol === 'file:') {
      const n = $('demoNote');
      n.textContent = '⚠ file:// detectado: el player de YouTube y el Service Worker necesitan http://localhost o HTTPS.';
      n.hidden = false;
    }
    state.queue = loadArr(LS.queue).filter(validItem);
    renderQueueBadge();
    renderRecent();
    renderContinue();
    bindUI();
    syncVolUI();
    startPoll();
    syncPlayIcons();
    loadIframeAPI();   // warm-up
    loadFeed(true);
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();