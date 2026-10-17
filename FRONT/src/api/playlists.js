// Адаптер текущего community API. Он не меняет серверную модель данных.
function normalize(data) {
  return { id: data.id, name: data.name, ownerId: data.owner_id, membersCount: data.members_count,
    inviteToken: data.invite_token ?? null };
}

export function createPlaylistApi(request, paths) {
  return {
    async list({ signal } = {}) {
      return (await request("/communities", { signal })).map(normalize);
    },
    invitation(id) {
      return request(`/communities/${encodeURIComponent(id)}/invitation`);
    },
    async create({ name }, { signal } = {}) {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 100) throw new Error("Название должно содержать от 1 до 100 символов");
      return normalize(await request(paths.createPlaylist, { method: "POST", json: { name: trimmed }, signal }));
    },
    async get(id, { signal } = {}) {
      return normalize(await request(paths.getPlaylist(id), { signal }));
    },
    leave(id) {
      return request(`/communities/${encodeURIComponent(id)}/leave`, { method: "POST" });
    },
    async join(inviteToken, { signal } = {}) {
      const token = inviteToken.trim();
      if (!token) throw new Error("Введите код приглашения");
      return normalize(await request(paths.joinPlaylist, { method: "POST", json: { invite_token: token }, signal }));
    },
  };
}

// Ссылку открывает frontend. Затем он вызывает join(token) после входа.
export function createInvitationUrl(inviteToken, frontendUrl) {
  if (!inviteToken) throw new Error("Код приглашения не получен от сервера");
  const url = new URL(frontendUrl);
  url.searchParams.set("invite", inviteToken);
  return url.toString();
}

export function readInvitationToken(frontendUrl) {
  return new URL(frontendUrl).searchParams.get("invite");
}
