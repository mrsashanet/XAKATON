export function createPlayer({ audio, tracksApi, getToken, onChange = () => {}, onError = () => {}, urls = URL, random = Math.random }) {
  let state = { track: null, queue: [], loading: false, playing: false, time: 0, duration: 0, volume: .65, shuffle: false, history: [] };
  let controller, objectUrl, revision = 0;
  audio.volume = state.volume;
  const emit = () => onChange({ ...state });
  const release = () => {
    audio.pause(); audio.removeAttribute('src'); audio.load();
    if (objectUrl) urls.revokeObjectURL(objectUrl);
    objectUrl = null;
  };
  const api = {
    snapshot: () => ({ ...state }),
    async play(track, queue = state.queue) {
      if (state.track?.id === track.id && objectUrl && !state.loading) return api.toggle();
      controller?.abort(); const attempt = ++revision; controller = new AbortController();
      const token = getToken();
      release();
      state = { ...state, track, queue: queue.filter((item) => item.file_url), loading: true, playing: false, time: 0, duration: 0 };
      emit();
      try {
        const blob = await tracksApi.audio(track.id, { signal: controller.signal });
        if (attempt !== revision || !token || token !== getToken()) return;
        objectUrl = urls.createObjectURL(blob);
        audio.src = objectUrl;
        state.loading = false; emit();
        await audio.play();
      } catch (error) {
        if (attempt !== revision || error.name === 'AbortError') return;
        state.loading = false; state.playing = false;
        if (!objectUrl) { state.track = null; release(); }
        emit();
        onError(error.name === 'NotAllowedError' ? 'Трек загружен. Нажми «Продолжить», чтобы включить звук.' : error.message || 'Не получилось воспроизвести MP3');
      }
    },
    async toggle() {
      if (!objectUrl || state.loading) return;
      if (audio.paused) {
        try { await audio.play(); }
        catch { onError('Не получилось включить звук. Попробуй ещё раз.'); }
      } else audio.pause();
    },
    next(direction = 1) {
      if (!state.track || !state.queue.length) return;
      if (direction < 0 && audio.currentTime > 3) { api.seek(0); return; }
      if (state.shuffle) {
        if (direction < 0) {
          // «Назад» в режиме перемешивания — к тому треку, что играл до этого
          const previous = state.queue.find((track) => track.id === state.history.at(-1));
          if (!previous) return;
          state.history = state.history.slice(0, -1);
          return api.play(previous, state.queue);
        }
        const others = state.queue.filter((track) => track.id !== state.track.id);
        if (!others.length) return;
        state.history = [...state.history, state.track.id].slice(-50);
        return api.play(others[Math.floor(random() * others.length)], state.queue);
      }
      const index = state.queue.findIndex((track) => track.id === state.track.id);
      const track = state.queue[index + direction];
      if (track) return api.play(track, state.queue);
    },
    seek(time) {
      if (!objectUrl || !Number.isFinite(audio.duration) || !Number.isFinite(Number(time))) return;
      audio.currentTime = Math.max(0, Math.min(Number(time), audio.duration));
      state.time = audio.currentTime; emit();
    },
    toggleShuffle() { state.shuffle = !state.shuffle; state.history = []; emit(); },
    volume(value) { audio.volume = Math.max(0, Math.min(1, Number(value))); state.volume = audio.volume; emit(); },
    setQueue(queue, communityId) {
      if (state.track?.community_id === communityId) { state.queue = queue.filter((track) => track.file_url); emit(); }
    },
    stop() {
      ++revision; controller?.abort(); release();
      state = { ...state, track: null, queue: [], loading: false, playing: false, time: 0, duration: 0, history: [] }; emit();
    },
  };
  audio.addEventListener('play', () => { state.playing = true; emit(); });
  audio.addEventListener('pause', () => { state.playing = false; emit(); });
  const updateDuration = () => { state.duration = Number.isFinite(audio.duration) ? audio.duration : 0; emit(); };
  audio.addEventListener('loadedmetadata', updateDuration);
  audio.addEventListener('durationchange', updateDuration);
  audio.addEventListener('timeupdate', () => { state.time = audio.currentTime; emit(); });
  audio.addEventListener('ended', () => { state.playing = false; emit(); api.next(); });
  audio.addEventListener('error', () => {
    if (!objectUrl || !audio.error) return;
    state.playing = false; state.loading = false; emit();
    onError('Браузер не смог прочитать этот MP3. Попробуй другой файл.');
  });
  return api;
}

export function mountPlayer({ host, player, icon }) {
  host.innerHTML = `<div class="player-track"><span class="player-cover" aria-hidden="true"></span><div><strong id="player-title"></strong><span id="player-artist"></span></div></div><div class="player-center"><div class="player-buttons"><button class="player-skip player-shuffle" id="player-shuffle" aria-label="Перемешать" aria-pressed="false" title="Перемешать">${icon('shuffle')}</button><button class="player-skip" id="player-prev" aria-label="Предыдущий трек">${icon('previous')}</button><button class="player-toggle" id="player-toggle" aria-label="Пауза">${icon('play')}</button><button class="player-skip" id="player-next" aria-label="Следующий трек">${icon('next')}</button></div><div class="player-timeline"><output id="player-time">0:00</output><input type="range" id="player-seek" min="0" max="0" value="0" step="0.1" aria-label="Позиция воспроизведения"><output id="player-duration">0:00</output></div></div><div class="player-extra"><label class="player-volume">${icon('volume')}<input type="range" id="player-volume" min="0" max="1" step="0.01" value="0.65" aria-label="Громкость"></label><button class="player-close" id="player-close" aria-label="Закрыть плеер">${icon('close')}</button></div>`;
  const $ = (selector) => host.querySelector(selector);
  const format = (value) => { const seconds = Math.max(0, Math.floor(value || 0)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
  $('#player-toggle').onclick = () => player.toggle();
  $('#player-shuffle').onclick = () => player.toggleShuffle();
  $('#player-prev').onclick = () => player.next(-1);
  $('#player-next').onclick = () => player.next(1);
  $('#player-close').onclick = () => player.stop();
  $('#player-seek').oninput = (event) => player.seek(event.target.value);
  $('#player-volume').oninput = (event) => player.volume(event.target.value);
  return (state) => {
    host.hidden = !state.track;
    document.body.classList.toggle('has-player', Boolean(state.track));
    if (!state.track) return;
    $('#player-title').textContent = state.track.title;
    $('#player-title').title = state.track.title;
    $('#player-artist').textContent = state.loading ? 'Загружаем MP3…' : state.track.artist;
    $('.player-cover').textContent = [...state.track.title].slice(0, 2).join('').toUpperCase();
    $('#player-toggle').innerHTML = state.loading ? '<span class="audio-spinner"></span>' : icon(state.playing ? 'pause' : 'play');
    $('#player-toggle').disabled = state.loading;
    $('#player-toggle').setAttribute('aria-label', state.loading ? 'Загрузка аудио' : state.playing ? 'Пауза' : 'Продолжить');
    $('#player-toggle').setAttribute('aria-pressed', String(state.playing));
    const index = state.queue.findIndex((track) => track.id === state.track.id);
    $('#player-shuffle').classList.toggle('active', state.shuffle);
    $('#player-shuffle').setAttribute('aria-pressed', String(state.shuffle));
    $('#player-shuffle').disabled = state.queue.length < 2;
    $('#player-prev').disabled = state.loading || (state.shuffle ? !state.history.length : index <= 0) && state.time <= 3;
    $('#player-next').disabled = state.loading || (state.shuffle ? state.queue.length < 2 : index < 0 || index === state.queue.length - 1);
    $('#player-time').textContent = format(state.time); $('#player-duration').textContent = format(state.duration);
    $('#player-seek').max = state.duration; $('#player-seek').value = state.time;
    $('#player-seek').disabled = !state.duration || state.loading;
    $('#player-seek').setAttribute('aria-valuetext', `${format(state.time)} из ${format(state.duration)}`);
    $('#player-volume').value = state.volume;
  };
}
