import { apiCall } from "./client";

export const utilApi = {
  reverseGeocode: (lat: number, lng: number) =>
    apiCall<{ address: string | null; city: string | null; raw: unknown }>(
      "POST",
      "fatehhr.api.util.reverse_geocode",
      { lat, lng },
    ),
  versionCompat: (client_version: string) =>
    apiCall<{ min_client_version: string; server_app_version: string | null }>(
      "POST",
      "fatehhr.api.util.version_compat",
      { client_version },
    ),
};
