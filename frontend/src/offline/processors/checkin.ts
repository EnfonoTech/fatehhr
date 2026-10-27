import type { QueueRecord } from "@/offline/db";
import { registerProcessor } from "@/offline/drain";
import { uploadPhoto } from "@/offline/photos";
import { apiCall, ApiError } from "@/api/client";
import { UnrecoverableError } from "@/offline/drain";

interface CheckinPayload {
  log_type: "IN" | "OUT";
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  task: string | null;
  selfie_photo_id?: string | null;
  selfie_file_url?: string | null;
  timestamp: string;
  client_id?: string;
  activity_log?: string | null;
  project_site?: string | null;
}

registerProcessor("checkin", async (entry: QueueRecord) => {
  const p = entry.payload as CheckinPayload;

  let selfie_file_url = p.selfie_file_url ?? null;
  if (!selfie_file_url && p.selfie_photo_id) {
    try {
      selfie_file_url = await uploadPhoto(p.selfie_photo_id);
    } catch (e) {
      // iOS may clear the stored photo of a queued punch; the punch itself still
      // counts (the selfie is optional on the server), so send it without.
      if (!/photo blob missing/.test((e as Error)?.message || "")) throw e;
    }
  }

  try {
    await callCreate(p, selfie_file_url);
  } catch (e) {
    // 417 = the server refused the punch (a validation rule): retrying never helps,
    // and a stuck item would block the queue for good.
    if (e instanceof ApiError && e.status === 417) throw new UnrecoverableError(e.message);
    throw e;
  }
});

function callCreate(p: CheckinPayload, selfie_file_url: string | null) {
  return apiCall("POST", "fatehhr.api.checkin.create", {
    log_type: p.log_type,
    latitude: p.latitude,
    longitude: p.longitude,
    address: p.address,
    task: p.task,
    selfie_file_url,
    timestamp: p.timestamp,
    client_id: p.client_id,
    activity_log: p.activity_log ?? null,
    project_site: p.project_site ?? null,
  });
}
