import type { QueueRecord } from "@/offline/db";
import { registerProcessor } from "@/offline/drain";
import { uploadPhoto } from "@/offline/photos";
import { apiCall } from "@/api/client";

interface CheckinPayload {
  log_type: "IN" | "OUT";
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  task: string | null;
  selfie_photo_id?: string | null;
  selfie_file_url?: string | null;
  timestamp: string;
}

registerProcessor("checkin", async (entry: QueueRecord) => {
  const p = entry.payload as CheckinPayload;

  let selfie_file_url = p.selfie_file_url ?? null;
  if (!selfie_file_url && p.selfie_photo_id) {
    selfie_file_url = await uploadPhoto(p.selfie_photo_id);
  }

  await apiCall("POST", "fatehhr.api.checkin.create", {
    log_type: p.log_type,
    latitude: p.latitude,
    longitude: p.longitude,
    address: p.address,
    task: p.task,
    selfie_file_url,
    timestamp: p.timestamp,
  });
});
