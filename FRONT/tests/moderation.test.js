import test from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../src/api/index.js';
import { createPlayer } from '../src/player.js';

class FakeAudio extends EventTarget {
  constructor() { super(); this.paused = true; this.currentTime = 0; this.duration = 18; this.volume = 1; this.src = ''; }
  async play() { this.paused = false; this.dispatchEvent(new Event('play')); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() {}
  removeAttribute() { this.src = ''; }
}
const track = (id) => ({ id, title: `Song ${id}`, artist: 'Artist', file_url: `${id}.mp3`, community_id: 7 });

test('удаление трека и выход из сообщества отправляют нужные запросы с JWT', async () => {
  const calls = [];
  const api = createServices({ fetchImpl: async (url, options) => { calls.push({ url, ...options }); return new Response(null, { status: 204 }); } });
  api.session.set('jwt', 'alice');
  assert.equal(await api.tracks.remove(5), null);
  assert.equal(await api.playlists.leave(7), null);
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [['DELETE', '/api/tracks/5'], ['POST', '/api/communities/7/leave']]);
  assert.ok(calls.every((c) => c.headers.Authorization === 'Bearer jwt'));
});

test('перемешивание: «дальше» — случайный другой трек, «назад» — предыдущий сыгранный', async () => {
  const audio = new FakeAudio();
  const picks = [0.99, 0];  // сначала последний из «других», потом первый
  const player = createPlayer({ audio, tracksApi: { audio: async () => new Blob(['mp3']) }, getToken: () => 'jwt',
    urls: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, random: () => picks.shift() });
  const queue = [track(1), track(2), track(3)];
  await player.play(track(1), queue);
  player.toggleShuffle();
  assert.equal(player.snapshot().shuffle, true);
  await player.next();
  assert.equal(player.snapshot().track.id, 3);   // другие: [2, 3] → 0.99 → 3
  await player.next();
  assert.equal(player.snapshot().track.id, 1);   // другие: [1, 2] → 0 → 1
  await player.next(-1);
  assert.equal(player.snapshot().track.id, 3);   // назад по истории
  player.toggleShuffle();
  assert.equal(player.snapshot().shuffle, false);
  await player.next();
  assert.equal(player.snapshot().track.id, 3);   // обычный порядок: после 3 ничего нет — остаёмся
});
