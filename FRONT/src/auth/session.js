// Пароль здесь никогда не хранится. sessionStorage ограничивает сессию вкладкой.
export function createSessionStore(storage = null) {
  const key = "hackathon.auth.v1";
  const listeners = new Set();
  let state = Object.freeze({ token: null, username: null });
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? "null");
    if (typeof saved?.token === "string" && saved.token) {
      state = Object.freeze({ token: saved.token, username: typeof saved.username === "string" ? saved.username : null });
    }
  } catch { /* Недоступное хранилище не мешает входу в текущей вкладке. */ }
  function publish(next) {
    state = Object.freeze(next);
    try {
      if (state.token) storage?.setItem(key, JSON.stringify(state));
      else storage?.removeItem(key);
    } catch { /* Сессия продолжает работать в памяти. */ }
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    set(token, username) { publish({ token, username }); },
    clear() { publish({ token: null, username: null }); },
    clearIfToken(token) { if (state.token === token) publish({ token: null, username: null }); },
  };
}
