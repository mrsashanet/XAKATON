// Адрес и пути собраны здесь, чтобы согласовать их с фактическим /docs.
export const API_BASE_URL = "http://127.0.0.1:8000";

// Это существующие пути в репозитории, НЕ подтверждение нового API плейлистов.
export const API_PATHS = Object.freeze({
  login: "/auth/login",
  register: "/auth/register",
  createPlaylist: "/communities",
  joinPlaylist: "/communities/join",
  getPlaylist: (id) => `/communities/${encodeURIComponent(id)}`,
});
