import test from "node:test";
import assert from "node:assert/strict";
import { createServices, createInvitationUrl, readInvitationToken, ApiError } from "../src/api/index.js";
import { createApiClient } from "../src/api/client.js";
import { createSessionStore } from "../src/auth/session.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
function memoryStorage() {
  const items = new Map();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: (key) => items.delete(key) };
}

test("two independent users: login, create, invitation, join; correct payloads and tokens", async () => {
  const calls = [];
  const fakeServer = async (url, options) => {
    calls.push({ url, ...options });
    if (url.endsWith("/auth/login")) return json({ access_token: new URLSearchParams(options.body).get("username"), token_type: "bearer" });
    const base = { id: 7, name: "Музыка", owner_id: 1, members_count: 1 };
    if (url.endsWith("/communities/join")) return json({ ...base, members_count: 2 });
    return json({ ...base, invite_token: "a+b/&?" }, 201);
  };
  const a = createServices({ fetchImpl: fakeServer });
  const b = createServices({ fetchImpl: fakeServer });
  await a.auth.login({ username: "alice", password: "secret123" });
  const playlist = await a.playlists.create({ name: " Музыка " });
  const invitation = createInvitationUrl(playlist.inviteToken, "http://localhost:5173/?tab=home");
  await b.auth.login({ username: "bob", password: "secret456" });
  const joined = await b.playlists.join(readInvitationToken(invitation));
  assert.equal(joined.id, 7);
  assert.equal(joined.membersCount, 2);
  assert.equal(calls[0].headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[1].headers.Authorization, "Bearer alice");
  assert.deepEqual(JSON.parse(calls[1].body), { name: "Музыка" });
  assert.equal(calls[3].headers.Authorization, "Bearer bob");
  assert.deepEqual(JSON.parse(calls[3].body), { invite_token: "a+b/&?" });
  assert.equal(new URL(invitation).searchParams.get("tab"), "home");
});

test("session survives reload; logout removes it; password never persisted", async () => {
  const storage = memoryStorage();
  const api = createServices({ storage, fetchImpl: async () => json({ access_token: "token", token_type: "bearer" }) });
  await api.auth.login({ username: "alice", password: "secret123" });
  assert.deepEqual(createSessionStore(storage).getSnapshot(), { token: "token", username: "alice" });
  assert.equal(storage.getItem("hackathon.auth.v1").includes("secret123"), false);
  api.auth.logout();
  assert.equal(createSessionStore(storage).getSnapshot().token, null);
});

test("401 on protected request clears session; failed public login does not", async () => {
  const api = createServices({ fetchImpl: async () => json({ detail: "Войдите" }, 401) });
  api.session.set("old", "alice");
  await assert.rejects(api.auth.login({ username: "alice", password: "wrong" }), { status: 401 });
  assert.equal(api.session.getSnapshot().token, "old");
  await assert.rejects(api.playlists.get(7), { status: 401 });
  assert.equal(api.session.getSnapshot().token, null);
});

test("late 401 cannot clear a newer session", async () => {
  let resolve;
  const api = createServices({ fetchImpl: () => new Promise((done) => { resolve = done; }) });
  api.session.set("old", "alice");
  const pending = api.playlists.get(7);
  api.session.set("new", "bob");
  resolve(json({}, 401));
  await assert.rejects(pending);
  assert.equal(api.session.getSnapshot().token, "new");
});

test("logout during login prevents late response from signing user back in", async () => {
  let resolve;
  const api = createServices({ fetchImpl: () => new Promise((done) => { resolve = done; }) });
  const pending = api.auth.login({ username: "alice", password: "secret123" });
  api.auth.logout();
  resolve(json({ access_token: "late", token_type: "bearer" }));
  await assert.rejects(pending, /отменён/);
  assert.equal(api.session.getSnapshot().token, null);
});

test("invalid token response is not stored", async () => {
  const api = createServices({ fetchImpl: async () => json({ token: "wrong-field" }) });
  await assert.rejects(api.auth.login({ username: "alice", password: "secret123" }), ApiError);
  assert.equal(api.session.getSnapshot().token, null);
});

test("validation errors retain status and useful field details", async () => {
  const api = createServices({ fetchImpl: async () => json({ detail: [{ loc: ["body", "name"], msg: "Field required" }] }, 422) });
  await assert.rejects(api.playlists.create({ name: "Music" }), (error) => error.status === 422 && error.message.includes("body.name"));
});

test("network failure, non-JSON errors, malformed success and empty responses", async () => {
  const client = (fetchImpl) => createApiClient({ baseUrl: "http://test", fetchImpl });
  await assert.rejects(client(async () => { throw new TypeError("offline"); })("/"), { status: 0 });
  await assert.rejects(client(async () => new Response("<html>bad gateway</html>", { status: 502 }))("/"), { status: 502 });
  await assert.rejects(client(async () => new Response("not json"))("/"), /не в формате JSON/);
  assert.equal(await client(async () => new Response(null, { status: 204 }))("/"), null);
});

test("abort remains cancellation and is not converted to network error", async () => {
  const request = createApiClient({ baseUrl: "http://test", fetchImpl: async () => { throw new DOMException("aborted", "AbortError"); } });
  await assert.rejects(request("/"), { name: "AbortError" });
});

test("broken or unavailable browser storage does not break session", () => {
  const store = createSessionStore({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } });
  store.set("token", "alice");
  assert.equal(store.getSnapshot().token, "token");
  store.clear();
  assert.equal(store.getSnapshot().token, null);
});
