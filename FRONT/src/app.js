import { services, createInvitationUrl, readInvitationToken } from './api/index.js';
import { createWorkspaceApi } from './workspace.js';
import { createPlayer, mountPlayer } from './player.js';
let localStorage = null, privateStorage = null;
try { localStorage = window.localStorage; privateStorage = window.sessionStorage; } catch {}
const workspace = createWorkspaceApi(services, { storage: localStorage, privateStorage, scope: location.origin });

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const icons = {
  play: '<path d="m9 5 11 7-11 7z"/>',
  pause: '<path d="M9 5v14M16 5v14"/>',
  previous: '<path d="M5 5v14m13-14-10 7 10 7z"/>',
  next: '<path d="M19 5v14M6 5l10 7-10 7z"/>',
  volume: '<path d="M3 9h4l5-4v14l-5-4H3zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  wave: '<path d="M2 12h3l3-8 5 16 4-13 3 5h2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  music: '<path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-3M9 14l6 3"/>',
  link: '<path d="m10 13 4-4m-7 6-1 1a4 4 0 0 0 6 6l4-4a4 4 0 0 0 0-6M17 9l1-1a4 4 0 0 0-6-6l-4 4a4 4 0 0 0 0 6" transform="translate(0 -1) scale(.95)"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-2-4"/>',
  up: '<path d="m7 14 5-5 5 5"/>',
  down: '<path d="m7 10 5 5 5-5"/>',
  logout: '<path d="M9 4H4v16h5m5-13 5 5-5 5m-5-5h10"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  sort: '<path d="M4 7h16M4 12h10M4 17h5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
  refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 2v6h-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.music}</svg>`;
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plural = (n, forms) => `${n} ${forms[n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2]}`;
const initials = (text) => [...String(text || 'В')].slice(0, 2).join('').toUpperCase();
const state = { profile: null, groups: [], group: null, tracks: [], loading: false, error: '', query: '', sort: 'rating', overview: false, epoch: 0, votes: new Set() };
let controller = null;
let authMode = 'login';
let authAttempt = 0;
let voteRefresh = 0;
let pendingInvite = readInvitationToken(location.href);
let modalRequest = null;
let playerKey = '';
let updatePlayer = () => {};
const player = createPlayer({
  audio: document.querySelector('#audio'), tracksApi: services.tracks,
  getToken: () => services.session.getSnapshot().token,
  onError: (message) => toast(message, true),
  onChange: (snapshot) => {
    updatePlayer(snapshot);
    const key = `${snapshot.track?.id}:${snapshot.playing}:${snapshot.loading}`;
    if (key !== playerKey) { playerKey = key; renderRows(); }
  },
});
updatePlayer = mountPlayer({ host: document.querySelector('#player'), player, icon });


function toast(message, error = false) {
  const node = document.createElement('div');
  node.className = `toast${error ? ' error' : ''}`;
  node.textContent = message;
  document.querySelector('#toasts').append(node);
  setTimeout(() => node.remove(), error ? 8000 : 4500);
}

function brand() { return `<a class="brand" href="/" aria-label="Universe Voicee — главная"><span class="brand-mark">${icon('wave')}</span><span class="wordmark"><span class="brand-universe">Universe</span><span class="brand-voice">Voice<span class="echo-e">e<span aria-hidden="true"></span></span></span></span></a>`; }
function signature() { return `<footer class="page-footer"><span>© 2026 Universe Voicee</span><button class="credits-button" data-action="crew" aria-label="О проекте">${icon('wave')}</button></footer>`; }
function showCrew() {
  modal.innerHTML = `<div class="modal-head"><h2 id="modal-title">А вот и мы.</h2><button class="icon-btn" id="modal-close" aria-label="Закрыть">${icon('close')}</button></div><p class="modal-intro">Пять человек, много музыки и один общий проект.</p><div class="crew-names">${['Андрей', 'Саня', 'Ваня', 'Даня', 'Артём'].map((name) => `<span>${name}</span>`).join('')}</div><p class="crew-signoff">Сделано в ГУАП, с любовью к музыке.</p>`;
  modal.querySelector('#modal-close').onclick = () => modal.close();
  if (!modal.open) modal.showModal();
}

function renderAuth(error = '') {
  app.innerHTML = `<main class="auth-page">
    <section class="auth-story">${brand()}<div class="auth-editorial"><h1>Хорошие треки.<br><em>Хорошая компания.</em></h1><p>Соберите любимую музыку в одном плейлисте. <br>Пусть каждый добавит что-то своё.</p><div class="auth-quote"><span>«Скинь, что слушаешь».</span><small>Теперь всё в одном месте.</small></div></div><footer>Музыкой лучше делиться.</footer></section>
    <section class="auth-right"><div class="auth-card"><div class="mobile-brand">${brand()}</div><h2>${authMode === 'login' ? 'С возвращением' : 'Давай знакомиться'}</h2><p class="intro">${authMode === 'login' ? 'Войди, чтобы открыть свои сообщества.' : 'Два поля — и можно собирать музыку вместе.'}</p>
    ${pendingInvite ? `<div class="invite-notice">${icon('link')} У тебя приглашение в сообщество.<br>Войди или создай аккаунт, чтобы присоединиться.</div>` : ''}
    <div class="auth-tabs" role="tablist" aria-label="Вход в аккаунт"><button role="tab" aria-selected="${authMode === 'login'}" class="${authMode === 'login' ? 'active' : ''}" data-auth-mode="login">Вход</button><button role="tab" aria-selected="${authMode === 'register'}" class="${authMode === 'register' ? 'active' : ''}" data-auth-mode="register">Регистрация</button></div>
    <form id="auth-form"><label class="field"><span>Имя пользователя</span><input name="username" autocomplete="username" placeholder="Например, ivan_music" required minlength="2" maxlength="32" pattern="[a-zA-Z0-9_-]+" aria-describedby="username-help"><small id="username-help">Латинские буквы, цифры, дефис и подчёркивание</small></label>
    <label class="field"><span>Пароль</span><div class="password-wrap"><input name="password" type="password" autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" placeholder="${authMode === 'login' ? 'Твой пароль' : 'От 8 до 32 символов'}" required ${authMode === 'register' ? 'minlength="8" maxlength="32"' : ''}><button type="button" id="toggle-password" aria-label="Показать пароль">${icon('eye')}</button></div></label>
    <div class="form-error" role="alert" id="auth-error">${escape(error)}</div><button class="btn full" type="submit">${authMode === 'login' ? 'Войти' : 'Создать аккаунт'} ${icon('arrow')}</button></form><p class="auth-note">Любимые треки становятся общими.</p></div><div class="auth-version"><span>© 2026 Universe Voicee</span><button class="credits-button" data-action="crew" aria-label="О проекте">${icon('wave')}</button></div></section></main>`;
  app.querySelectorAll('[data-action=crew]').forEach((button) => button.onclick = showCrew);
  document.querySelectorAll('[data-auth-mode]').forEach((button) => button.onclick = () => { authAttempt += 1; services.auth.logout(); authMode = button.dataset.authMode; renderAuth(); });
  document.querySelector('#toggle-password').onclick = (event) => {
    const input = document.querySelector('[name="password"]');
    input.type = input.type === 'password' ? 'text' : 'password';
    event.currentTarget.setAttribute('aria-label', input.type === 'password' ? 'Показать пароль' : 'Скрыть пароль');
  };
  document.querySelector('#auth-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('[type="submit"]');
    const username = form.elements.username.value.trim(), password = form.elements.password.value;
    const attempt = ++authAttempt;
    button.disabled = true;
    document.querySelector('#auth-error').textContent = '';
    let registered = false;
    try {
      if (authMode === 'register') { await services.auth.register({ username, password }); registered = true; }
      if (attempt !== authAttempt) return;
      await services.auth.login({ username, password });
      if (attempt !== authAttempt) return;
      await enter();
      if (registered) toast('Добро пожаловать в Universe Voicee');
    } catch (error) {
      if (attempt !== authAttempt) return;
      services.auth.logout();
      const errorNode = document.querySelector('#auth-error');
      if (errorNode) errorNode.textContent = registered ? `Аккаунт создан. Попробуй войти: ${error.message}` : error.message;
      else renderAuth(error.message);
    } finally { if (button.isConnected) button.disabled = false; }
  };
}

function render() {
  if (!state.profile) return;
  const group = state.group;
  app.innerHTML = `<div class="shell"><aside class="sidebar" id="sidebar">${brand()}
    <div class="sidebar-label">Библиотека</div><button class="nav-item ${state.overview || !group ? 'active' : ''}" data-action="overview">${icon('grid')}Мои сообщества<span class="nav-count">${state.groups.length}</span></button><button class="nav-item" data-action="join">${icon('link')}Вступить по ссылке</button>
    <div class="sidebar-label community-label">Сообщества<button class="text-button" data-action="create" aria-label="Создать сообщество">${icon('plus')}</button></div><div class="community-nav">${state.groups.length ? state.groups.map((g) => `<button class="community-link ${group?.id === g.id ? 'active' : ''}" data-action="open-group" data-id="${g.id}"><span class="community-dot">${escape(initials(g.name))}</span><span>${escape(g.name)}</span></button>`).join('') : '<p class="sidebar-empty">Здесь появятся твои сообщества.</p>'}</div>
    <div class="sidebar-bottom"><div class="profile"><div class="avatar">${escape(initials(state.profile.username))}</div><div class="profile-text"><strong>${escape(state.profile.username)}</strong><small>Личный аккаунт</small></div><button class="icon-btn" data-action="logout" aria-label="Выйти из аккаунта">${icon('logout')}</button></div></div></aside>
    <main class="workspace"><header class="topbar"><button class="icon-btn mobile-menu" data-action="menu" aria-label="Меню" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button><div class="breadcrumbs"><button data-action="overview">Мои сообщества</button>${group ? `<span>/</span><strong>${escape(group.name)}</strong>` : ''}</div><button class="btn secondary small" data-action="${group ? 'share' : 'join'}">${icon(group ? 'users' : 'link')}${group ? 'Пригласить друзей' : 'Вступить'}</button></header>
    <div class="content"><div class="section-heading"><div class="heading-identity">${group ? `<div class="group-cover" aria-hidden="true"><span>${escape(initials(group.name))}</span></div>` : ''}<div class="heading-text">${group ? '<div class="eyebrow">Общий плейлист</div>' : ''}<h1>${escape(group?.name || 'Мои сообщества')}</h1><p>${group ? `${plural(group.membersCount, ['участник', 'участника', 'участников'])} <span class="middle-dot">·</span> ${plural(state.tracks.length, ['трек', 'трека', 'треков'])}` : 'Всё, что вы любите слушать. Вместе.'}</p></div></div><button class="btn" data-action="${group ? 'add-track' : 'create'}">${icon('plus')}${group ? 'Добавить трек' : 'Создать сообщество'}</button></div>
    ${state.error ? `<div class="empty-state error-state"><div class="empty-icon">${icon('info')}</div><h3>Не получилось загрузить данные</h3><p>${escape(state.error)}</p><button class="btn secondary" data-action="refresh">${icon('refresh')}Попробовать снова</button></div>` : state.overview || !group ? overview() : playlist()}
    ${signature()}</div></main></div>`;
  app.querySelectorAll('[data-action]').forEach((button) => button.onclick = () => action(button.dataset.action, button.dataset.id));
  const search = document.querySelector('#track-search');
  if (search) search.oninput = () => { state.query = search.value; renderRows(); };
  if (group && !state.error && !state.overview) renderRows();
}

function overview() {
  if (state.loading) return '<div role="status" aria-label="Загружаем сообщества"><div class="skeleton"></div><div class="skeleton"></div></div>';
  return `<div class="collection-toolbar"><span>${plural(state.groups.length, ['сообщество', 'сообщества', 'сообществ'])}</span><button class="icon-btn" data-action="refresh" aria-label="Обновить сообщества">${icon('refresh')}</button></div>${state.groups.length ? `<div class="community-grid">${state.groups.map((g) => `<button class="community-card" data-action="open-group" data-id="${g.id}"><span class="community-cover">${escape(initials(g.name))}</span><span class="community-info"><strong>${escape(g.name)}</strong><small>${plural(g.membersCount, ['участник', 'участника', 'участников'])}</small></span><span class="card-open">${icon('arrow')}</span></button>`).join('')}<button class="community-create" data-action="create">${icon('plus')}Новое сообщество</button></div>` : `<div class="empty-state"><div class="empty-icon">${icon('users')}</div><h3>Начните со своих людей</h3><p>Создай сообщество для друзей или одногруппников.<br>А потом добавьте музыку, которую любите.</p><div class="empty-actions"><button class="btn" data-action="create">${icon('plus')}Создать сообщество</button><button class="btn secondary" data-action="join">У меня есть приглашение</button></div></div>`}${workspace.localGroups ? '<p class="local-note">Здесь сообщества, которые ты открыл в этом браузере. Чтобы добавить другое, открой его приглашение.</p>' : ''}`;
}

function playlist() {
  return `<section class="playlist-panel"><div class="panel-header"><div class="panel-title"><h2>Треки</h2><span class="count-badge">${state.tracks.length}</span></div><div class="tools"><label class="search-field">${icon('search')}<input type="search" id="track-search" placeholder="Найти трек или исполнителя" aria-label="Поиск трека или исполнителя" value="${escape(state.query)}"></label><button class="sort-button" data-action="sort" aria-label="Изменить сортировку">${icon('sort')}${state.sort === 'rating' ? 'По рейтингу' : 'Сначала новые'}</button><button class="icon-btn" data-action="refresh" aria-label="Обновить плейлист">${icon('refresh')}</button></div></div><div class="table-head"><span>№</span><span>Трек и исполнитель</span><span>Голоса</span></div><div id="track-rows" aria-live="polite"></div><button class="add-to-list" data-action="add-track">${icon('plus')}Добавить ещё один трек</button><div class="playlist-foot"><span>Нажми на стрелку повторно, чтобы отменить голос.</span><span>MP3 · музыка вашего сообщества</span></div></section>`;
}

function renderRows() {
  const container = document.querySelector('#track-rows');
  if (!container) return;
  if (state.loading) { container.innerHTML = '<div role="status" aria-label="Загружаем плейлист"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>'; return; }
  const query = state.query.trim().toLocaleLowerCase();
  const ordered = [...state.tracks].sort(state.sort === 'rating' ? (a, b) => b.score - a.score || a.id - b.id : (a, b) => b.id - a.id);
  if (state.group) player.setQueue(ordered.map((track) => ({ ...track, community_id: state.group.id })), state.group.id);
  const rows = ordered.filter((t) => `${t.title} ${t.artist}`.toLocaleLowerCase().includes(query));
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">${icon(query ? 'search' : 'music')}</div><h3>${query ? 'Ничего не нашлось' : 'Здесь будет ваша музыка'}</h3><p>${query ? 'Попробуй другое название или имя исполнителя.' : 'Добавь песню, которую знаешь наизусть. Или ту, что нашёл сегодня утром.'}</p>${query ? '' : '<button class="btn" id="empty-add">Добавить первый трек</button>'}</div>`;
    const button = document.querySelector('#empty-add'); if (button) button.onclick = () => action('add-track');
    return;
  }
  const playback = player.snapshot();
  container.innerHTML = rows.map((track, i) => `<div class="track-row ${playback.track?.id === track.id ? 'current-track' : ''}"><button class="track-play ${playback.track?.id === track.id && playback.playing ? 'is-playing' : ''}" aria-label="${playback.track?.id === track.id && playback.playing ? 'Пауза' : 'Слушать'}: ${escape(track.title)}" data-play="${track.id}" ${track.file_url ? '' : 'disabled'} title="${track.file_url ? 'Слушать MP3' : 'К этому треку пока не прикреплён MP3'}">${playback.track?.id === track.id && playback.loading ? '<span class="audio-spinner"></span>' : icon(playback.track?.id === track.id && playback.playing ? 'pause' : 'play')}</button><div class="track-main"><div class="track-cover c${track.id % 6}" aria-hidden="true"><span>${escape(initials(track.title))}</span></div><div class="track-text"><strong title="${escape(track.title)}">${escape(track.title)}</strong><small title="${escape(track.artist)}">${escape(track.artist)}</small>${!track.file_url && (track.added_by === state.profile?.id || state.group?.ownerId === state.profile?.id) ? `<button class="attach-audio" data-attach="${track.id}">${icon('upload')}Добавить MP3</button>` : ''}</div></div><div class="vote-control" aria-label="Голосование за ${escape(track.title)}"><button class="${track.my_vote === 1 ? 'selected' : ''}" aria-label="Нравится: ${escape(track.title)}" aria-pressed="${track.my_vote === 1}" data-vote="1" data-id="${track.id}" ${state.votes.has(track.id) ? 'disabled' : ''}>${icon('up')}</button><span class="vote-score ${track.score > 0 ? 'positive' : ''}">${track.score}</span><button class="negative ${track.my_vote === -1 ? 'selected' : ''}" aria-label="Не нравится: ${escape(track.title)}" aria-pressed="${track.my_vote === -1}" data-vote="-1" data-id="${track.id}" ${state.votes.has(track.id) ? 'disabled' : ''}>${icon('down')}</button></div></div>`).join('');
  container.querySelectorAll('[data-play]').forEach((button) => button.onclick = () => { const track = state.tracks.find((item) => item.id === Number(button.dataset.play)); if (track?.file_url) player.play({ ...track, community_id: state.group.id }, ordered.map((item) => ({ ...item, community_id: state.group.id }))); });
  container.querySelectorAll('[data-attach]').forEach((button) => button.onclick = () => showAttachAudio(Number(button.dataset.attach)));
  container.querySelectorAll('[data-vote]').forEach((button) => button.onclick = () => vote(Number(button.dataset.id), Number(button.dataset.vote)));
}

async function load({ groupId = state.group?.id, overview = state.overview } = {}) {
  const epoch = ++state.epoch;
  controller?.abort(); controller = new AbortController();
  const { signal } = controller;
  state.loading = true; state.error = ''; state.overview = overview; render();
  try {
    let groups = await workspace.list({ signal });
    if (groupId && !groups.some((g) => g.id === Number(groupId))) {
      const requested = await workspace.get(Number(groupId), { signal });
      groups = [requested, ...groups];
    }
    if (epoch !== state.epoch || !state.profile) return;
    state.groups = groups;
    const selected = overview ? null : groups.find((g) => g.id === Number(groupId)) || (!groupId ? groups[0] : null);
    state.group = selected || null;
    if (groupId && !overview && !selected) throw new Error('Это сообщество недоступно. Вступи по приглашению или выбери другую группу.');
    const tracks = selected ? await workspace.tracks(selected.id, { signal }) : [];
    if (epoch !== state.epoch || !state.profile) return;
    state.tracks = tracks;
    if (selected) player.setQueue(tracks.map((track) => ({ ...track, community_id: selected.id })), selected.id);
  } catch (error) {
    if (error.name === 'AbortError' || epoch !== state.epoch) return;
    if (!services.session.getSnapshot().token) return;
    state.error = error.message;
  } finally {
    if (epoch === state.epoch && state.profile) { state.loading = false; render(); }
  }
}

async function enter() {
  const token = services.session.getSnapshot().token;
  const profile = await services.request('/auth/me');
  await workspace.initialize(profile);
  if (token !== services.session.getSnapshot().token) return;
  state.profile = profile;
  state.groups = []; state.group = null; state.tracks = []; state.query = ''; state.error = '';
  state.overview = !new URL(location.href).searchParams.get('community');
  await load({ groupId: new URL(location.href).searchParams.get('community'), overview: state.overview });
  if (pendingInvite && state.profile) showJoin(pendingInvite);
}

function routeGroup(id) {
  const url = new URL(location.href);
  url.searchParams.delete('invite');
  if (id) url.searchParams.set('community', id); else url.searchParams.delete('community');
  history.pushState({}, '', url);
  state.query = '';
  load({ groupId: id, overview: !id });
}

function dialog(title, intro, content, submit, label = 'Продолжить') {
  modalRequest?.abort();
  modal.innerHTML = `<div class="modal-head"><h2 id="modal-title">${escape(title)}</h2><button class="icon-btn" type="button" id="modal-close" aria-label="Закрыть">${icon('close')}</button></div><p class="modal-intro">${escape(intro)}</p><form id="modal-form">${content}<div class="form-error" role="alert" id="modal-error"></div><div class="modal-actions"><button type="button" class="btn secondary" id="modal-cancel">Отмена</button><button type="submit" class="btn">${escape(label)}${icon('arrow')}</button></div></form>`;
  modal.querySelector('#modal-close').onclick = () => modal.close();
  modal.querySelector('#modal-cancel').onclick = () => modal.close();
  modal.querySelector('form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('[type=submit]');
    button.disabled = true;
    const originalLabel = button.innerHTML;
    if (form.querySelector('[type=file]')) button.textContent = 'Загружаем MP3…';
    const errorNode = form.querySelector('#modal-error'); errorNode.textContent = '';
    const requestController = new AbortController(); modalRequest = requestController;
    try { await submit(new FormData(form), { signal: requestController.signal }); }
    catch (error) { if (errorNode.isConnected) errorNode.textContent = error.message; }
    finally { if (modalRequest === requestController) modalRequest = null; if (button.isConnected) { button.disabled = false; button.innerHTML = originalLabel; } }
  };
  if (!modal.open) modal.showModal();
}

function showCreate() {
  dialog('Новое сообщество', 'Для группы, факультета или просто своих людей.', '<label class="field"><span>Название</span><input name="name" maxlength="100" required placeholder="Например, Звуки нашего факультета" autofocus></label>', async (data) => {
    const group = await workspace.create({ name: data.get('name') });
    modal.close(); toast('Сообщество создано. Теперь добавим музыку!'); routeGroup(group.id);
  }, 'Создать');
}

function showJoin(value = '') {
  dialog('Присоединиться к сообществу', 'Вставь ссылку или код приглашения от друга.', `<label class="field"><span>Приглашение</span><input name="invitation" required placeholder="Ссылка или код" value="${escape(value)}" autofocus></label>`, async (data) => {
    const value = data.get('invitation').trim();
    let token = value;
    if (/^https?:\/\//i.test(value)) { token = readInvitationToken(value); if (!token) throw new Error('В этой ссылке нет кода приглашения'); }
    const group = await workspace.join(token);
    pendingInvite = null; modal.close(); toast('Готово, ты в сообществе!'); routeGroup(group.id);
  }, 'Присоединиться');
}

function fileField() {
  return `<label class="field file-field"><span>Аудиофайл</span><div class="file-picker"><span class="file-picker-icon">${icon('upload')}</span><strong id="file-label">Выбрать MP3</strong><small>До 30 МБ · файл останется в плейлисте</small><input type="file" name="file" accept=".mp3,audio/mpeg" required aria-label="MP3-файл"></div></label>`;
}
function bindFileField() {
  const input = modal.querySelector('[name=file]');
  input.onchange = () => {
    const file = input.files[0];
    modal.querySelector('#file-label').textContent = file?.name || 'Выбрать MP3';
    const title = modal.querySelector('[name=title]');
    if (file && title && !title.value.trim()) title.value = file.name.replace(/\.mp3$/i, '').slice(0,128);
  };
}
function showAddTrack() {
  const groupId = state.group?.id;
  if (!groupId) return;
  dialog('Добавить музыку', 'Выбери MP3 и укажи название. Остальные участники смогут послушать и проголосовать.', fileField() + '<label class="field"><span>Название трека</span><input name="title" maxlength="128" required placeholder="Как называется песня?"></label><label class="field"><span>Исполнитель</span><input name="artist" maxlength="128" required placeholder="Кто её исполняет?"></label>', async (data, { signal }) => {
    const token = services.session.getSnapshot().token;
    await services.tracks.upload({ title: data.get('title'), artist: data.get('artist'), communityId: groupId, file: data.get('file') }, { signal });
    if (token !== services.session.getSnapshot().token) return;
    modal.close(); toast('Трек загружен. Можно слушать!'); await load({ groupId, overview: false });
  }, 'Загрузить трек');
  bindFileField();
}
function showAttachAudio(id) {
  const track = state.tracks.find((item) => item.id === id);
  if (!track) return;
  const groupId = state.group.id;
  dialog('Добавить MP3', `${track.title} — ${track.artist}`, fileField(), async (data, { signal }) => {
    const token = services.session.getSnapshot().token;
    await services.tracks.attach(id, data.get('file'), { signal });
    if (token !== services.session.getSnapshot().token) return;
    modal.close(); toast('MP3 прикреплён. Можно слушать!'); await load({ groupId, overview: false });
  }, 'Загрузить MP3');
  bindFileField();
}

async function showShare() {
  const group = state.group; if (!group) return;
  try {
    const result = await workspace.invitation(group.id);
    if (!state.profile) return;
    const base = new URL(location.href); base.search = ''; base.hash = '';
    const url = createInvitationUrl(result.invite_token, base.href);
    modal.innerHTML = `<div class="modal-head"><h2 id="modal-title">Свои люди — по ссылке</h2><button class="icon-btn" id="modal-close" aria-label="Закрыть">${icon('close')}</button></div><p class="modal-intro">Пригласи друзей в «${escape(group.name)}». Ссылка не истекает; для вступления понадобится аккаунт.</p><label class="field"><span>Приглашение</span><div class="share-link"><input readonly aria-label="Ссылка приглашения" value="${escape(url)}" id="invitation-url"></div></label><button class="btn full" id="copy-invite">${icon('link')}Скопировать ссылку</button><p class="modal-intro" style="margin:15px 0 0">Отправляй ссылку тем, кого хочешь видеть в сообществе.</p>`;
    modal.querySelector('#modal-close').onclick = () => modal.close();
    modal.querySelector('#copy-invite').onclick = async () => {
      try { await navigator.clipboard.writeText(url); toast('Приглашение скопировано'); }
      catch { const input = document.querySelector('#invitation-url'); input.select(); toast('Ссылка выделена — скопируй её вручную'); }
    };
    if (!modal.open) modal.showModal();
  } catch (error) { toast(error.message, true); }
}

async function vote(id, requested) {
  if (state.votes.has(id)) return;
  const track = state.tracks.find((t) => t.id === id); if (!track) return;
  const groupId = state.group.id, epoch = state.epoch;
  const value = track.my_vote === requested ? 0 : requested;
  state.votes.add(id); renderRows();
  try {
    await workspace.vote(id, value);
    const refresh = ++voteRefresh;
    const tracks = await workspace.tracks(groupId);
    if (refresh === voteRefresh && state.epoch === epoch && state.profile && state.group?.id === groupId) { state.tracks = tracks; renderRows(); }
  } catch (error) { if (state.profile) toast(error.message, true); }
  finally { state.votes.delete(id); renderRows(); }
}

function action(name, id) {
  switch (name) {
    case 'crew': return showCrew();
    case 'create': return showCreate();
    case 'join': return showJoin();
    case 'add-track': return showAddTrack();
    case 'share': return showShare();
    case 'open-group': return routeGroup(Number(id));
    case 'overview': return routeGroup(null);
    case 'refresh': return load();
    case 'sort': state.sort = state.sort === 'rating' ? 'new' : 'rating'; render(); return;
    case 'menu': { const open = document.querySelector('#sidebar').classList.toggle('open'); document.querySelector('[data-action=menu]').setAttribute('aria-expanded', String(open)); return; }
    case 'logout': {
      ++state.epoch; ++authAttempt; controller?.abort(); state.profile = null; state.groups = []; state.group = null; state.tracks = []; state.votes.clear();
      player.stop(); services.auth.logout(); modal.close(); const url = new URL(location.href); url.searchParams.delete('community'); history.replaceState({}, '', url); renderAuth(); return;
    }
  }
}

services.session.subscribe(() => {
  if (!services.session.getSnapshot().token) player.stop();
  if (!services.session.getSnapshot().token && state.profile) {
    ++state.epoch; controller?.abort(); state.profile = null; state.groups = []; state.group = null; state.tracks = [];
    modal.close(); renderAuth('Сессия закончилась. Войди ещё раз.');
  }
});
window.addEventListener('popstate', () => {
  pendingInvite = readInvitationToken(location.href);
  if (state.profile) {
    if (pendingInvite) showJoin(pendingInvite);
    else { const id = new URL(location.href).searchParams.get('community'); load({ groupId: id, overview: !id }); }
  } else renderAuth();
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.sidebar') && !event.target.closest('[data-action="menu"]')) { document.querySelector('#sidebar')?.classList.remove('open'); document.querySelector('[data-action=menu]')?.setAttribute('aria-expanded', 'false'); }
});

if (services.session.getSnapshot().token) {
  enter().catch((error) => {
    if (error.status === 401) { services.auth.logout(); renderAuth('Сессия закончилась. Войди ещё раз.'); }
    else {
      app.innerHTML = `<main class="auth-right" style="min-height:100vh"><div class="auth-card">${brand()}<h2>Пока нет связи</h2><p class="intro">${escape(error.message)}</p><button class="btn" id="retry-connection">Попробовать снова</button><button class="btn secondary" id="reset-session">Сменить аккаунт</button></div></main>`;
      document.querySelector('#retry-connection').onclick = () => location.reload();
      document.querySelector('#reset-session').onclick = () => { services.auth.logout(); renderAuth(); };
    }
  });
} else renderAuth();

document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { document.querySelector('#sidebar')?.classList.remove('open'); document.querySelector('[data-action=menu]')?.setAttribute('aria-expanded', 'false'); } });
modal.addEventListener('click', (event) => { if (event.target === modal) { const box = modal.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) modal.close(); } });

modal.addEventListener('close', () => { if (!modal.open) modalRequest?.abort(); });
