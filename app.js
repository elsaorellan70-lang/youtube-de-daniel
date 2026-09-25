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

  /* ---------- Overlay: visibilidad ---------- */
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
    tastePush(item, 0);   // v8: alimenta tu FYP con cada reproducción
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

  /* ---------- Poll ---------- */
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
    /* v8: tap al canal dentro del reproductor → vista de canal */
    $('pChannel').addEventListener('click', () => { if (state.current) openChannel(state.current); });
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

    /* Gestos */
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

    /* Atajos de teclado */
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

    /* Vídeo nativo */
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
    loadIframeAPI();
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

  /* ---------- Overlay: visibilidad ---------- */
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
    tastePush(item, 0);   // v8: alimenta tu FYP con cada reproducción
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

  /* ---------- Poll ---------- */
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
    /* v8: tap al canal dentro del reproductor → vista de canal */
    $('pChannel').addEventListener('click', () => { if (state.current) openChannel(state.current); });
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

    /* Gestos */
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

    /* Atajos de teclado */
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

    /* Vídeo nativo */
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
    loadIframeAPI();
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