const EARTH_M = 6_371_000;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const phi1 = toRad(lat1), phi2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1), dlam = toRad(lon2 - lon1);
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  return EARTH_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function classify(
  taskLat: number | null,
  taskLng: number | null,
  taskRadius: number | null,
  userLat: number | null,
  userLng: number | null,
): "disabled" | "unknown" | "inside" | "outside" {
  if (taskLat == null || taskLng == null || !taskRadius) return "disabled";
  if (userLat == null || userLng == null) return "unknown";
  return haversineM(taskLat, taskLng, userLat, userLng) <= taskRadius ? "inside" : "outside";
}
