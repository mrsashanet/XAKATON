// В локальном сервере /api перенаправляется на FastAPI (API_TARGET).
export const API_BASE_URL = "/api";

export const API_PATHS = Object.freeze({
  login: "/auth/login",
  register: "/auth/register",
  createPlaylist: "/communities",
  joinPlaylist: "/communities/join",
  getPlaylist: (id) => `/communities/${encodeURIComponent(id)}`,
});
