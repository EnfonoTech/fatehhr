import { apiCall } from "./client";

export interface NotificationRow {
  name: string;
  subject: string;
  email_content: string;
  type: string;
  document_type: string | null;
  document_name: string | null;
  read: 0 | 1;
  creation: string;
}

export const notificationsApi = {
  feed: () => apiCall<NotificationRow[]>("GET", "fatehhr.api.notifications.feed"),
  unreadCount: () => apiCall<number>("GET", "fatehhr.api.notifications.unread_count"),
  markRead: (name: string) =>
    apiCall<{ name: string; read: 1 }>(
      "POST",
      "fatehhr.api.notifications.mark_read",
      { name },
    ),
};
