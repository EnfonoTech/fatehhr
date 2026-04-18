import { apiCall } from "./client";

export interface AnnouncementRow {
  name: string;
  title: string;
  body: string;
  pinned: 0 | 1;
  published_on: string;
  published_by: string;
}

export const announcementApi = {
  feed: () => apiCall<AnnouncementRow[]>("GET", "fatehhr.api.announcement.feed"),
};
