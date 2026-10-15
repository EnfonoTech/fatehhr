import { defineStore } from "pinia";
import {
  leaveApi,
  type LeaveTypeBalance,
  type LeaveRow,
  type ClientApprovalRequired,
  type ClientApprovalReceived,
} from "@/api/leave";
import { ApiError } from "@/api/client";
import { saveItem } from "@/offline/queue";
import { uploadPhoto } from "@/offline/photos";
import { useSyncStore } from "@/stores/sync";
import { v4 as uuid } from "uuid";

export interface PendingLocalLeave {
  draftId: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  status: "pending-sync";
}

export const useLeaveStore = defineStore("leave", {
  state: () => ({
    types: [] as LeaveTypeBalance[],
    mine: [] as LeaveRow[],
    pendingLocal: [] as PendingLocalLeave[],
    /** Site has the cooperheat client-approval fields on Leave Application. */
    clientApprovalEnabled: false,
  }),
  actions: {
    async loadTypes() {
      try {
        this.types = await leaveApi.types_with_balance();
      } catch {
        /* offline */
      }
    },
    async loadFormConfig() {
      try {
        const cfg = await leaveApi.form_config();
        this.clientApprovalEnabled = !!cfg?.client_approval;
      } catch {
        /* offline / older server — keep last known */
      }
    },
    async loadMine() {
      try {
        this.mine = await leaveApi.list_mine();
      } catch {
        /* offline */
      }
    },

    async apply(p: {
      leave_type: string;
      from_date: string;
      to_date: string;
      half_day: 0 | 1;
      reason: string;
      client_approval?: {
        required: ClientApprovalRequired;
        received: ClientApprovalReceived;
        photo_id: string | null;
      } | null;
    }) {
      const sync = useSyncStore();
      const { client_approval: ca, ...base } = p;
      const payload = {
        ...base,
        ...(ca
          ? {
              client_approval_required: ca.required,
              client_approval_received: ca.required === "Yes" ? ca.received : undefined,
            }
          : {}),
      };
      const photoId = ca?.required === "Yes" ? ca.photo_id : null;
      if (sync.isOnline) {
        try {
          const attachment = photoId ? await uploadPhoto(photoId, { isPrivate: true }) : undefined;
          const r = await leaveApi.apply({ ...payload, client_approval_attachment: attachment });
          await this.loadMine();
          return { mode: "online" as const, row: r };
        } catch (err) {
          // ApiError = the server answered with a validation error (e.g.
          // "leave balance exhausted"). Do NOT queue — surface it so the user
          // can fix their input. Only fall through to the offline queue for
          // actual network failures (TypeError "Failed to fetch" etc.).
          if (err instanceof ApiError) throw err;
          /* network failure — queue below */
        }
      }
      const draftId = uuid();
      await saveItem(
        "leave",
        `leave:${draftId}`,
        { ...payload, client_approval_photo_id: photoId },
        photoId ? [photoId] : [],
      );
      this.pendingLocal.push({
        draftId,
        leave_type: p.leave_type,
        from_date: p.from_date,
        to_date: p.to_date,
        status: "pending-sync",
      });
      await sync.refresh();
      return { mode: "queued" as const };
    },

    async cancel(name: string) {
      await leaveApi.cancel(name);
      await this.loadMine();
    },
  },
});
