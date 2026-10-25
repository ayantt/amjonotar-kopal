const baseUrl = process.env.MULTIPLAYER_SMOKE_URL?.replace(/\/$/, "");
if (!baseUrl) {
  console.error("Set MULTIPLAYER_SMOKE_URL to a deployed same-origin app URL.");
  process.exit(2);
}

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const suffix = Math.random().toString(36).slice(2, 8);
const created = await request("/api/multiplayer/rooms", {
  method: "POST",
  body: { name: `Smoke host ${suffix}` },
});
assert(created.status === 201, `create room failed: HTTP ${created.status}`);
const { room: initialRoom, token: hostToken } = created.payload;
assert(initialRoom?.code && hostToken, "create room response omitted room code or host token");

const joined = await request(`/api/multiplayer/rooms/${initialRoom.code}/join`, {
  method: "POST",
  body: { name: `Smoke guest ${suffix}`, version: initialRoom.version },
});
assert(joined.status === 201, `join room failed: HTTP ${joined.status}`);
assert(joined.payload.token, "join response omitted guest token");

const started = await request(`/api/multiplayer/rooms/${initialRoom.code}/start`, {
  method: "POST",
  token: hostToken,
  body: { version: joined.payload.room.version },
});
assert(started.status === 200, `start room failed: HTTP ${started.status}`);
const startedRoom = started.payload.room;
const currentPlayerId = startedRoom.state?.players?.[startedRoom.state.currentPlayerIndex]?.id;
const actorToken = currentPlayerId === initialRoom.seats?.[0]?.playerId ? hostToken : joined.payload.token;
const requestId = crypto.randomUUID();

const action = await request(`/api/multiplayer/rooms/${initialRoom.code}/actions`, {
  method: "POST",
  token: actorToken,
  body: { version: startedRoom.version, requestId, action: { type: "roll" } },
});
assert(action.status === 200, `valid turn action failed: HTTP ${action.status}`);
assert(action.payload.room.version === startedRoom.version + 1, "action did not advance the authoritative version");

const duplicate = await request(`/api/multiplayer/rooms/${initialRoom.code}/actions`, {
  method: "POST",
  token: actorToken,
  body: { version: startedRoom.version, requestId, action: { type: "roll" } },
});
assert(duplicate.status === 200 && duplicate.payload.duplicate === true, "duplicate request was not acknowledged idempotently");

const stale = await request(`/api/multiplayer/rooms/${initialRoom.code}/actions`, {
  method: "POST",
  token: actorToken,
  body: { version: startedRoom.version, requestId: crypto.randomUUID(), action: { type: "roll" } },
});
assert(stale.status === 409 && stale.payload.room?.version === action.payload.room.version, "stale version did not return the latest snapshot");

console.log("Multiplayer smoke test passed: create, join, start, authoritative action, idempotent retry, stale-version recovery.");
