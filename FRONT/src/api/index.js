import { createTracksApi } from "./tracks.js";
import { API_BASE_URL, API_PATHS } from "./config.js";
import { createApiClient } from "./client.js";
import { createSessionStore } from "../auth/session.js";
import { createAuthApi } from "./auth.js";
import { createPlaylistApi } from "./playlists.js";

export function createServices({ baseUrl = API_BASE_URL, paths = API_PATHS, storage = null, fetchImpl = globalThis.fetch } = {}) {
  const session = createSessionStore(storage);
  const request = createApiClient({ baseUrl, fetchImpl, getToken: () => session.getSnapshot().token,
    onUnauthorized: (token) => session.clearIfToken(token) });
  return { session, request, tracks: createTracksApi(request), auth: createAuthApi(request, session, paths), playlists: createPlaylistApi(request, paths) };
}

let storage = null;
try { if (typeof window !== "undefined") storage = window.sessionStorage; } catch { /* Работаем в памяти. */ }
export const services = createServices({ storage });
export { createInvitationUrl, readInvitationToken } from "./playlists.js";
export { ApiError } from "./client.js";
