import math
from typing import Optional

EARTH_M = 6_371_000.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
	phi1, phi2 = math.radians(lat1), math.radians(lat2)
	dphi = math.radians(lat2 - lat1)
	dlam = math.radians(lon2 - lon1)
	a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
	c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
	return EARTH_M * c


def classify(
	task_lat: Optional[float],
	task_lng: Optional[float],
	task_radius_m: Optional[int],
	user_lat: Optional[float],
	user_lng: Optional[float],
) -> str:
	"""Return 'disabled' | 'unknown' | 'inside' | 'outside'."""
	if task_lat is None or task_lng is None or not task_radius_m:
		return "disabled"
	if user_lat is None or user_lng is None:
		return "unknown"
	d = haversine_m(task_lat, task_lng, user_lat, user_lng)
	return "inside" if d <= float(task_radius_m) else "outside"
