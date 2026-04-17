const EARTH_M = 6_371_000;
export function haversineM(lat1, lon1, lat2, lon2) {
    const toRad = (x) => (x * Math.PI) / 180;
    const phi1 = toRad(lat1), phi2 = toRad(lat2);
    const dphi = toRad(lat2 - lat1), dlam = toRad(lon2 - lon1);
    const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
    return EARTH_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function classify(taskLat, taskLng, taskRadius, userLat, userLng) {
    if (taskLat == null || taskLng == null || !taskRadius)
        return "disabled";
    if (userLat == null || userLng == null)
        return "unknown";
    return haversineM(taskLat, taskLng, userLat, userLng) <= taskRadius ? "inside" : "outside";
}
