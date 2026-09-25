/* ============ NeonTube — app.js FINAL ============
   YouTube Data API v3 + IFrame Player API + cola persistente + PWA.
   Seguridad: DOM sin innerHTML remoto (solo SVG constantes), videoId validado,
   allowlist de hosts media, AbortController, manejo de cuota/errores, storage try/catch.
================================********************/
'use strict';
(() => {

  /* ---------- Utilidades ---------- */
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;   // siempre textContent: XSS-free
    return n;
  };
  const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
  const KEY_RE = /^[A-Za-z0-9_-]{20,60}$/;
  const API_BASE = 'https://www.googleapis.com/youtube/v3';
  const LS_KEY = 'neontube.key.v1';
  const LS_QUEUE = 'neontube.queue.v2';
  const RATES = Object.freeze([1, 1.25, 1.5, 1.75, 0.75]);
  const ALLOWED_MEDIA_HOSTS = Object.freeze(['commondatastorage.googleapis.com']);
  const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const THUMB_FALLBACK = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="%23050806"/><path d="M6.5 2.5v4l3.5-2z" fill="%2339ff14"/><rect x="0.3" y="0.3" width="15.4" height="8.4" fill="none" stroke="%2339ff14" stroke-opacity="0.35" stroke-width="0.2"/></svg>';

  /* Clave embebida (uso personal). El modal ⚙ permite sobreescribirla en este dispositivo. */
  const DEFAULT_KEY = 'AIzaSyCQYIC9hnzvA_vf9kSXBmoG61sijPjaQ4c';

  const DEMO_CATALOG = Object.freeze([
    { kind: 'file', id: 'bb', title: 'Big Buck Bunny (CC) — demo sin API key', channel: 'Blender Foundation',
      dur: '9:56', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg' },
    { kind: 'file', id: 'ed', title: 'Elephants Dream (CC) — demo sin API key', channel: 'Blender Foundation',
      dur: '10:53', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg' },
    { kind: 'file', id: 'si', title: 'Sintel (CC) — demo sin API key', channel: 'Blender Foundation',
      dur: '14:48', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg' },
    { kind: 'file', id: 'ts', title: 'Tears of Steel (CC) — demo sin API key', channel: 'Blender Foundation',
      dur: '12:14', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg' }
  ]);

  const CHIPS = Object.freeze([
    { label: 'Para ti',    src: { type: 'chart' } },
    { label: 'Tendencias', src: { type: 'chart', region: 'US' } },
    { label: 'Música',     src: { type: 'search', q: 'mix música completa' } },
    { label: 'Gaming',     src: { type: 'search', q: 'gameplay español' } },
    { label: 'Lo-fi',      src: { type: 'search', q: 'lofi hip hop mix' } },
    { label: 'En vivo',    src: { type: 'search', q: 'en directo', live: true } }
  ]);

  const state = {
    view: 'feed', chip: 0, query: '', source: CHIPS[0].src,
    items: [], nextPage: null, loading: false,
    queue: [], qIndex: -1, current: null,
    rate: 1, audioOnly: false, kind: null
  };

  /* ---------- Storage seguro ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  };
  const getKey = () => {
    const k = store.get(LS_KEY);
    if (k && KEY_RE.test(k)) return k;
    return KEY_RE.test(DEFAULT_KEY) ? DEFAULT_KEY : '';
  };
  const loadQueue = () => {
    try {
      const raw = store.get(LS_QUEUE);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(validItem).slice(0, 100) : [];
    } catch (_) { return []; }
  };
  const saveQueue = () => store.set(LS_QUEUE, JSON.stringify(state.queue.slice(0, 100)));

  function validItem(it) {
    if (!it || typeof it !== 'object') return false;
    if (it.kind === 'yt') return YT_ID_RE.test(String(it.id)) && typeof it.thumb === 'string' && it.thumb.startsWith('https://i.ytimg.com/');
    if (it.kind === 'file') {
      try { return ALLOWED_MEDIA_HOSTS.includes(new URL(it.src).hostname); } catch (_) { return false; }
    }
    return false;
  }

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

  function mapSearchItem(it) {
    const id = it && it.id && it.id.videoId;
    const sn = it && it.snippet;
    if (!YT_ID_RE.test(String(id)) || !sn) return null;
    const thumb = (sn.thumbnails && (sn.thumbnails.medium || sn.thumbnails.default || {}).url) || '';
    if (!thumb.startsWith('https://i.ytimg.com/')) return null;
    return { kind: 'yt', id, title: sn.title || 'Sin título', channel: sn.channelTitle || 'Canal',
             thumb, dur: (sn.liveBroadcastContent === 'live') ? 'EN VIVO' : '' };
  }
  function mapChartItem(it) {
    const id = it && it.id;
    const sn = it && it.snippet;
    if (!YT_ID_RE.test(String(id)) || !sn) return null;
    const thumb = (sn.thumbnails && (sn.thumbnails.medium || sn.thumbnails.default || {}).url) || '';
    if (!thumb.startsWith('https://i.ytimg.com/')) return null;
    return { kind: 'yt', id, title: sn.title || 'Sin título', channel: sn.channelTitle || 'Canal',
             thumb, dur: parseISO8601(it.contentDetails && it.contentDetails.duration) };
  }

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
    state.loading = true;
    const token = reset ? null : state.nextPage;
    if (reset) { state.items = []; state.nextPage = null; render(); }
    try {
      const src = state.query.trim() ? { type: 'search', q: state.query.trim() } : state.source;
      if (src.type === 'chart') {
        const region = src.region || (navigator.language || 'es-MX').split('-')[1] || 'MX';
        const data = await ytFetch('/videos', {
          part: 'snippet,contentDetails', chart: 'mostPopular',
          regionCode: region, maxResults: '20', pageToken: token
        });
        state.items = reset ? (data.items || []).map(mapChartItem).filter(Boolean)
                            : state.items.concat((data.items || []).map(mapChartItem).filter(Boolean));
        state.nextPage = data.nextPageToken || null;
      } else {
        const data = await ytFetch('/search', {
          part: 'snippet', type: 'video', videoEmbeddable: 'true', safeSearch: 'moderate',
          maxResults: '20', q: src.q, pageToken: token,
          eventType: src.live ? 'live' : null
        });
        state.items = reset ? (data.items || []).map(mapSearchItem).filter(Boolean)
                            : state.items.concat((data.items || []).map(mapSearchItem).filter(Boolean));
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
      $('btnMore').hidden = !state.nextPage;
    }
  }

  /* ---------- Renderizado (DOM seguro) ---------- */
  function cardFor(item, list, removable, index) {
    const card = el('button', 'card');
    card.type = 'button';
    const thumb = el('div', 'thumb');
    const img = el('img');
    img.src = item.thumb; img.alt = ''; img.loading = 'lazy';
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
    if (removable) {
      const rm = el('button', 'icon-btn row-remove');
      rm.type = 'button'; rm.setAttribute('aria-label', 'Quitar de la cola');
      rm.innerHTML = ICON_X; // constante estática, segura
      rm.addEventListener('click', (ev) => {
        ev.stopPropagation();
        state.queue.splice(index, 1);
        saveQueue(); renderQueueBadge(); render();
        toast('Eliminado de la cola');
      });
      meta.appendChild(rm);
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
      feed.appendChild(el('p', 's', state.loading ? 'Cargando…' : 'Sin resultados.'));
      return;
    }
    const list = state.items.slice();
    const frag = document.createDocumentFragment();
    list.forEach(it => frag.appendChild(cardFor(it, list, false, -1)));
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
    list.forEach((it, i) => frag.appendChild(cardFor(it, list, true, i)));
    feed.appendChild(frag);
  }
  function renderQueueBadge() {
    const b = $('queueBadge');
    b.textContent = String(state.queue.length);
    b.hidden = state.queue.length === 0;
  }

  /* ---------- IFrame Player API ---------- */
  let ytPlayer = null, ytReady = false, pendingId = null, poll = 0;
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
  function createYT(id) {
    ytPlayer = new window.YT.Player('ytHost', {
      playerVars: { controls: 0, rel: 0, playsinline: 1, modestbranding: 1, disablekb: 1 },
      events: {
        onReady: (e) => { try { e.target.setPlaybackRate(state.rate); } catch (_) {} },
        onStateChange: (e) => {
          if (e.data === window.YT.PlayerState.ENDED) next();
          syncPlayIcons();
        }
      }
    });
  }
  function playYT(item) {
    state.kind = 'yt';
    video.hidden = true; video.pause(); video.removeAttribute('src');
    $('ytHost').hidden = false;
    if (!ytReady || !ytPlayer) {
      loadIframeAPI();
      if (ytReady && !ytPlayer) createYT(item.id); else pendingId = item.id;
    } else {
      try { ytPlayer.loadVideoById(item.id); } catch (_) { pendingId = item.id; }
    }
  }
  function playFile(item) {
    state.kind = 'file';
    if (ytPlayer && ytPlayer.stopVideo) { try { ytPlayer.stopVideo(); } catch (_) {} }
    $('ytHost').hidden = true;
    video.hidden = false;
    video.src = item.src;
    video.playbackRate = state.rate;
    video.play().catch(() => toast('Toca ▶ para iniciar (autobloqueo del navegador)'));
  }

  function openPlayer(item) {
    state.current = item;
    $('pTitle').textContent = item.title;
    $('pChannel').textContent = item.channel;
    $('pArt').src = item.thumb;
    $('player').hidden = false;
    $('mini').hidden = true;
    updatePos();
  }
  function playItem(item, list) {
    if (list && list.length) {
      state.queue = list.slice(0, 100);
      state.qIndex = Math.max(0, list.indexOf(item));
      saveQueue(); renderQueueBadge();
    }
    openPlayer(item);
    if (item.kind === 'yt') playYT(item); else playFile(item);
  }
  const currentItem = () => (state.qIndex >= 0 && state.queue[state.qIndex]) || state.current;
  function next() { step(1); }
  function prev() { step(-1); }
  function step(d) {
    if (!state.queue.length) return;
    state.qIndex = (state.qIndex + d + state.queue.length) % state.queue.length;
    const it = state.queue[state.qIndex];
    state.current = it;
    openPlayer(it);
    if (it.kind === 'yt') playYT(it); else playFile(it);
  }
  function updatePos() { $('pPos').textContent = `${state.qIndex + 1}/${state.queue.length}`; }

  /* ---------- Controles unificados ---------- */
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
  function startPoll() {
    clearInterval(poll);
    poll = setInterval(() => {
      if ($('player').hidden && $('mini').hidden) return;
      const d = durationOf(), c = currentOf();
      $('tCur').textContent = fmtSec(c);
      $('tDur').textContent = fmtSec(d);
      if (!$('seek').matches(':active')) $('seek').value = d ? String(Math.round((c / d) * 1000)) : '0';
    }, 500);
  }

  /* ---------- Eventos de UI ---------- */
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

    const onSearch = debounce((v) => { state.query = v; state.view = 'feed'; loadFeed(true); }, 450);
    $('searchInput').addEventListener('input', (e) => onSearch(e.target.value));
    $('btnClear').addEventListener('click', () => {
      $('searchInput').value = ''; state.query = ''; loadFeed(true);
    });
    $('btnShuffle').addEventListener('click', () => {
      if (!state.items.length) { toast('Nada que mezclar todavía'); return; }
      const list = state.items.slice();
      playItem(list[Math.floor(Math.random() * list.length)], list);
      toast('Reproducción aleatoria ▶');
    });
    $('btnMore').addEventListener('click', () => loadFeed(false));

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

    $('btnPlay').addEventListener('click', togglePlay);
    $('mPlay').addEventListener('click', togglePlay);
    $('btnNext').addEventListener('click', next);
    $('btnPrev').addEventListener('click', prev);
    $('seek').addEventListener('input', (e) => {
      const d = durationOf();
      const t = (Number(e.target.value) / 1000) * d;
      if (state.kind === 'yt' && ytPlayer) { try { ytPlayer.seekTo(t, true); } catch (_) {} }
      else if (state.kind === 'file') video.currentTime = t;
    });
    $('btnRate').addEventListener('click', () => {
      const i = (RATES.indexOf(state.rate) + 1) % RATES.length;
      state.rate = RATES[i];
      $('btnRate').textContent = state.rate + 'x';
      if (state.kind === 'yt' && ytPlayer) { try { ytPlayer.setPlaybackRate(state.rate); } catch (_) {} }
      else video.playbackRate = state.rate;
    });
    $('btnFull').addEventListener('click', () => {
      const target = state.kind === 'yt' ? $('ytHost') : video;
      if (target && target.requestFullscreen) {
        target.requestFullscreen().catch(() => toast('Pantalla completa no disponible'));
      }
    });
    $('btnAudioOnly').addEventListener('click', (e) => {
      state.audioOnly = !state.audioOnly;
      $('player').classList.toggle('audio-only', state.audioOnly);
      $('pArt').hidden = !state.audioOnly;
      e.currentTarget.setAttribute('aria-pressed', String(state.audioOnly));
      toast(state.audioOnly ? 'Modo solo audio (sigue sonando en 2º plano)' : 'Vídeo visible');
    });
    $('btnMinimize').addEventListener('click', () => {
      $('player').hidden = true;
      const it = currentItem();
      if (it) {
        $('mThumb').src = it.thumb;
        $('mTitle').textContent = it.title;
        $('mChannel').textContent = it.channel;
        $('mini').hidden = false;
      }
    });
    $('mExpand').addEventListener('click', () => { $('mini').hidden = true; $('player').hidden = false; });
    $('mClose').addEventListener('click', stopAll);
    $('btnClosePlayer').addEventListener('click', stopAll);
    $('btnQueueAdd').addEventListener('click', () => {
      const it = currentItem();
      if (!it) return;
      if (state.queue.some(q => q.kind === it.kind && q.id === it.id)) { toast('Ya está en la cola'); return; }
      state.queue.push(it); saveQueue(); renderQueueBadge(); toast('Añadido a la cola ✓');
    });

    video.addEventListener('ended', next);
    video.addEventListener('play', syncPlayIcons);
    video.addEventListener('pause', syncPlayIcons);

    $('btnSettings').addEventListener('click', () => {
      $('apiKeyInput').value = getKey();
      $('modal').hidden = false;
      $('apiKeyInput').focus();
    });
    $('btnCloseModal').addEventListener('click', () => { $('modal').hidden = true; });
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').hidden = true; });
    $('btnSaveKey').addEventListener('click', () => {
      const v = $('apiKeyInput').value.trim();
      if (!KEY_RE.test(v)) { toast('Clave con formato inválido'); return; }
      store.set(LS_KEY, v);
      $('modal').hidden = true;
      toast('API key guardada en este dispositivo ✓');
      loadFeed(true);
    });
    $('btnClearKey').addEventListener('click', () => {
      store.del(LS_KEY); $('apiKeyInput').value = '';
      $('modal').hidden = true; toast('Override borrado: se usa la clave embebida.');
      loadFeed(true);
    });
  }
  function stopAll() {
    if (ytPlayer && ytPlayer.stopVideo) { try { ytPlayer.stopVideo(); } catch (_) {} }
    video.pause(); video.removeAttribute('src'); video.load();
    $('player').hidden = true; $('mini').hidden = true;
    state.current = null; state.kind = null;
  }
  function setTab(name, doRender = true) {
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    if (doRender) render();
  }

  /* ---------- Arranque ---------- */
  function init() {
    state.queue = loadQueue();
    renderQueueBadge();
    bindUI();
    startPoll();
    syncPlayIcons();
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