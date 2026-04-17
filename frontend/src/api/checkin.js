import { apiCall } from "./client";
export const checkinApi = {
    create: (p) => apiCall("POST", "fatehhr.api.checkin.create", p),
    list: (p) => apiCall("POST", "fatehhr.api.checkin.list_mine", p),
};
