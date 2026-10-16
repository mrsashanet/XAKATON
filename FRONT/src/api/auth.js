import { ApiError } from "./client.js";

export function createAuthApi(request, session, paths) {
  let revision = 0;
  return {
    async login({ username, password }, { signal } = {}) {
      const attempt = ++revision;
      // OAuth2PasswordRequestForm в backend требует form, а не JSON.
      const result = await request(paths.login, { method: "POST", form: { username, password }, auth: false, signal });
      if (typeof result?.access_token !== "string" || !result.access_token || result.token_type?.toLowerCase() !== "bearer") {
        throw new ApiError("Ответ входа не содержит корректный Bearer-токен");
      }
      if (attempt !== revision) throw new ApiError("Этот вход отменён более новым действием");
      session.set(result.access_token, username);
      // username взят из формы. Это НЕ загруженный профиль пользователя.
      return { username };
    },
    register({ username, password }, { signal } = {}) {
      return request(paths.register, { method: "POST", json: { username, password }, auth: false, signal });
    },
    logout() { revision += 1; session.clear(); },
  };
}
