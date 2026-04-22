import type { QueueRecord } from "@/offline/db";
import { registerProcessor } from "@/offline/drain";
import { apiCall } from "@/api/client";
import { openDb, STORE } from "@/offline/db";

async function setSessionMapping(clientId: string, serverId: string) {
  const db = await openDb();
  await db.put(STORE.meta, serverId, `session:${clientId}`);
}
async function getSessionMapping(clientId: string): Promise<string | null> {
  const db = await openDb();
  return ((await db.get(STORE.meta, `session:${clientId}`)) as string | undefined) ?? null;
}

registerProcessor("task_timer_start", async (entry: QueueRecord) => {
  const p = entry.payload as {
    clientSessionId: string;
    clientId?: string;
    task: string;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    timestamp: string;
  };
  const r = await apiCall<{ session_id: string }>("POST", "fatehhr.api.task.start_timer", {
    task: p.task,
    latitude: p.latitude,
    longitude: p.longitude,
    address: p.address,
    timestamp: p.timestamp,
    client_id: p.clientId,
  });
  await setSessionMapping(p.clientSessionId, r.session_id);
});

registerProcessor("task_timer_stop", async (entry: QueueRecord) => {
  const p = entry.payload as {
    clientSessionId: string;
    serverSessionId?: string | null;
    clientId?: string;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    timestamp: string;
  };
  // Prefer the serverSessionId the client had at stop-time (online start,
  // offline stop). Fall back to the idb mapping (offline start → offline
  // stop, populated once the start processor drains).
  const serverId = p.serverSessionId || (await getSessionMapping(p.clientSessionId));
  if (!serverId) {
    throw new Error("Session start not yet drained; will retry next drain cycle.");
  }
  await apiCall("POST", "fatehhr.api.task.stop_timer", {
    session_id: serverId,
    latitude: p.latitude,
    longitude: p.longitude,
    address: p.address,
    timestamp: p.timestamp,
    client_id: p.clientId,
  });
});
