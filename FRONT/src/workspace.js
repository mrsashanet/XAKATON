// Адаптация к опубликованному API без изменений серверного кода.
export function createWorkspaceApi(services, { storage = null, privateStorage = null, scope = 'default' } = {}) {
  let key, privateKey, known = [], invitations = {}, votes = {}, capabilities = {};
  const read = (store, name, fallback) => { try { return JSON.parse(store?.getItem(name) ?? 'null') ?? fallback; } catch { return fallback; } };
  const save = () => {
    try { storage?.setItem(key, JSON.stringify({ ids: known, votes })); } catch { /* Доступна работа в памяти. */ }
    try { privateStorage?.setItem(privateKey, JSON.stringify(invitations)); } catch { /* Ссылка остаётся в текущей сессии. */ }
  };
  const remember = (group, token) => {
    if (!known.includes(group.id)) known.push(group.id);
    if (token || group.inviteToken) invitations[group.id] = token || group.inviteToken;
    save(); return group;
  };
  return {
    get localGroups() { return !capabilities.list; },
    async initialize(user) {
      key = `universe.workspace.v1:${scope}:${user.id}`; privateKey = `${key}:invitations`;
      const cached = read(storage, key, {});
      known = Array.isArray(cached.ids) ? cached.ids.filter(Number.isSafeInteger) : [];
      votes = cached.votes && typeof cached.votes === 'object' ? cached.votes : {};
      invitations = read(privateStorage, privateKey, {});
      const schema = await services.request('/openapi.json', { auth: false });
      capabilities = { list: Boolean(schema.paths?.['/communities']?.get), invitation: Boolean(schema.paths?.['/communities/{community_id}/invitation']?.get) };
    },
    async list({ signal } = {}) {
      if (capabilities.list) return services.playlists.list({ signal });
      const groups = await Promise.all([...known].reverse().map(async (id) => {
        try { return await services.playlists.get(id, { signal }); }
        catch (error) {
          if ([403, 404].includes(error.status)) { known = known.filter((item) => item !== id); save(); return null; }
          throw error;
        }
      }));
      return groups.filter(Boolean);
    },
    async get(id, options) { return remember(await services.playlists.get(id, options)); },
    async create(data) { return remember(await services.playlists.create(data)); },
    async join(token) { return remember(await services.playlists.join(token), token); },
    async leave(id) {
      await services.playlists.leave(id);
      known = known.filter((item) => item !== id); delete invitations[id]; save();
    },
    async invitation(id) {
      if (capabilities.invitation) return services.playlists.invitation(id);
      if (invitations[id]) return { invite_token: invitations[id] };
      throw new Error('На этом устройстве нет ссылки приглашения. Открой исходное приглашение, по которому ты вступил, — после этого им можно будет поделиться.');
    },
    async tracks(id, options) {
      const tracks = await services.tracks.list(id, options);
      return tracks.map((track) => ({ ...track, my_vote: track.my_vote ?? votes[track.id] ?? 0 }));
    },
    async vote(id, value) { await services.tracks.vote(id, value); votes[id] = value; save(); },
  };
}
