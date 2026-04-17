import { apiCall } from "./client";
export const meApi = {
    profile: () => apiCall("GET", "fatehhr.api.me.profile"),
    updateProfile: (patch) => apiCall("POST", "fatehhr.api.me.update_profile", patch),
};
