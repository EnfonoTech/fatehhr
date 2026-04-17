import { apiCall } from "./client";
export const utilApi = {
    reverseGeocode: (lat, lng) => apiCall("POST", "fatehhr.api.util.reverse_geocode", { lat, lng }),
    versionCompat: (client_version) => apiCall("POST", "fatehhr.api.util.version_compat", { client_version }),
};
