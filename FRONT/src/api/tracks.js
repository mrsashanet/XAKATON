export function createTracksApi(request) {
  return {
    list(communityId, { signal } = {}) {
      return request(`/communities/${encodeURIComponent(communityId)}/playlist`, { signal });
    },
    add({ title, artist, communityId }) {
      const cleanTitle = title.trim(), cleanArtist = artist.trim();
      if (!cleanTitle || !cleanArtist || cleanTitle.length > 128 || cleanArtist.length > 128) throw new Error('Укажите название и исполнителя: до 128 символов');
      return request('/tracks', { method: 'POST', json: { title: cleanTitle, artist: cleanArtist, community_id: Number(communityId) } });
    },
    upload({ title, artist, communityId, file }, { signal } = {}) {
      const cleanTitle = title.trim(), cleanArtist = artist.trim();
      if (!cleanTitle || !cleanArtist || cleanTitle.length > 128 || cleanArtist.length > 128) throw new Error('Укажите название и исполнителя: до 128 символов');
      validateFile(file);
      const data = new FormData();
      data.set('title', cleanTitle); data.set('artist', cleanArtist);
      data.set('community_id', String(communityId)); data.set('file', file);
      return request('/tracks/upload', { method: 'POST', multipart: data, signal });
    },
    attach(trackId, file, { signal } = {}) {
      validateFile(file);
      const data = new FormData(); data.set('file', file);
      return request(`/tracks/${encodeURIComponent(trackId)}/audio`, { method: 'POST', multipart: data, signal });
    },
    audio(trackId, { signal } = {}) {
      return request(`/tracks/${encodeURIComponent(trackId)}/audio`, { responseType: 'blob', signal });
    },
    remove(trackId) {
      return request(`/tracks/${encodeURIComponent(trackId)}`, { method: 'DELETE' });
    },
    vote(trackId, value) {
      if (![0, 1, -1].includes(value)) throw new Error('Недопустимое значение голоса');
      return request(`/tracks/${encodeURIComponent(trackId)}/vote`, { method: 'POST', json: { value } });
    },
  };
}

function validateFile(file) {
  if (!file || !/\.mp3$/i.test(file.name)) throw new Error('Выберите MP3-файл');
  if (!file.size) throw new Error('Этот файл пустой');
  if (file.size > 30 * 1024 * 1024) throw new Error('Файл должен быть не больше 30 МБ');
}
