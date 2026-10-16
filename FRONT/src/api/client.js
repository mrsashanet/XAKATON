export class ApiError extends Error {
  constructor(message, { status = 0, details = null, cause } = {}) {
    super(message, { cause });
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function errorMessage(body, status) {
  if (typeof body?.detail === "string") return body.detail;
  if (Array.isArray(body?.detail)) {
    return body.detail.map((item) => `${(item.loc ?? []).join(".")}: ${item.msg}`).join("; ");
  }
  return ({ 401: "Войдите в аккаунт заново", 403: "Нет доступа", 404: "Не найдено", 409: "Данные конфликтуют с существующими" })[status]
    ?? `Ошибка сервера (${status})`;
}

export function createApiClient({ baseUrl, fetchImpl = globalThis.fetch, getToken = () => null, onUnauthorized = () => {} }) {
  return async function request(path, { method = "GET", json, form, auth = true, signal } = {}) {
    if (json !== undefined && form !== undefined) throw new TypeError("Выберите JSON или form");
    const headers = { Accept: "application/json" };
    const token = auth ? getToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    let body;
    if (json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(json);
    } else if (form !== undefined) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(form).toString();
    }
    let response;
    let raw;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`, { method, headers, body, signal });
      raw = await response.text();
    } catch (cause) {
      if (cause.name === "AbortError") throw cause;
      throw new ApiError("Не удалось связаться с сервером", { cause });
    }
    let data = null;
    let invalidJson = false;
    if (raw) {
      try { data = JSON.parse(raw); } catch { invalidJson = true; }
    }
    if (!response.ok) {
      // Старый запрос не должен удалить токен нового входа.
      if (response.status === 401 && token) onUnauthorized(token);
      throw new ApiError(errorMessage(data, response.status), { status: response.status, details: data });
    }
    if (invalidJson) throw new ApiError("Сервер вернул ответ не в формате JSON", { status: response.status });
    return data;
  };
}
