"""
Geographic utility functions for area-based alert targeting.
This module provides safe, production-ready geospatial calculations.
"""

import math
from typing import List, Tuple, Optional
from decimal import Decimal
from .models import UserLocation, Geofence


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on Earth.
    Returns distance in meters.
    
    Args:
        lat1, lon1: Latitude and longitude of first point in decimal degrees
        lat2, lon2: Latitude and longitude of second point in decimal degrees
    
    Returns:
        Distance in meters
    """
    # Convert decimal degrees to radians
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    # Differences
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    
    # Haversine formula
    a = (math.sin(dlat / 2) ** 2 + 
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    # Earth's radius in meters
    earth_radius = 6371000
    
    return earth_radius * c


def is_point_in_circle_geofence(lat: float, lon: float, geofence: Geofence) -> bool:
    """
    Check if a point is inside a circular geofence.
    
    Args:
        lat, lon: Point coordinates in decimal degrees
        geofence: Geofence object with circle type
    
    Returns:
        True if point is inside the circle, False otherwise
    """
    if geofence.geofence_type != 'circle':
        return False
    
    if not all([geofence.center_latitude, geofence.center_longitude, geofence.radius]):
        return False
    
    # Convert Decimal to float for calculation
    center_lat = float(geofence.center_latitude)
    center_lon = float(geofence.center_longitude)
    radius_meters = geofence.radius
    
    # Calculate distance
    distance = haversine_distance(lat, lon, center_lat, center_lon)
    
    return distance <= radius_meters


def is_point_in_polygon_geofence(lat: float, lon: float, geofence: Geofence) -> bool:
    """
    Check if a point is inside a polygon geofence using ray casting algorithm.
    
    Args:
        lat, lon: Point coordinates in decimal degrees
        geofence: Geofence object with polygon type
    
    Returns:
        True if point is inside the polygon, False otherwise
    """
    if geofence.geofence_type != 'polygon':
        return False
    
    if not geofence.polygon_json:
        return False
    
    try:
        # Extract polygon coordinates
        coordinates = geofence.get_polygon_coordinates()
        if not coordinates or not coordinates[0]:
            return False
        
        # Get the exterior ring (first coordinate array)
        ring = coordinates[0]
        if len(ring) < 3:  # Need at least 3 points for a polygon
            return False
        
        # Ray casting algorithm
        intersections = 0
        n = len(ring)
        
        for i in range(n):
            j = (i + 1) % n
            
            # Extract coordinates (GeoJSON format is [longitude, latitude])
            lon1, lat1 = ring[i]
            lon2, lat2 = ring[j]
            
            # Check if the point's y-coordinate is within the edge's y-range
            if ((lat1 > lat) != (lat2 > lat)):
                # Calculate the x-coordinate of the intersection
                x_intersect = (lon2 - lon1) * (lat - lat1) / (lat2 - lat1) + lon1
                
                if lon < x_intersect:
                    intersections += 1
        
        # Point is inside if intersections is odd
        return intersections % 2 == 1
        
    except (IndexError, ValueError, TypeError, ZeroDivisionError):
        return False


def is_point_in_geofence(lat: float, lon: float, geofence: Geofence) -> bool:
    """
    Check if a point is inside any type of geofence.
    
    Args:
        lat, lon: Point coordinates in decimal degrees
        geofence: Geofence object
    
    Returns:
        True if point is inside the geofence, False otherwise
    """
    if not geofence.active:
        return False
    
    if geofence.geofence_type == 'circle':
        return is_point_in_circle_geofence(lat, lon, geofence)
    elif geofence.geofence_type == 'polygon':
        return is_point_in_polygon_geofence(lat, lon, geofence)
    
    return False


def get_users_in_geofence(geofence: Geofence, max_age_hours: int = 24) -> List[UserLocation]:
    """
    Get all users whose last known location is within the specified geofence.
    
    Args:
        geofence: Geofence object to check against
        max_age_hours: Maximum age of location data in hours (default: 24)
    
    Returns:
        List of UserLocation objects for users inside the geofence
    """
    if not geofence.active:
        return []
    
    # Get all fresh user locations
    from django.utils import timezone
    from datetime import timedelta
    
    cutoff_time = timezone.now() - timedelta(hours=max_age_hours)
    
    fresh_locations = UserLocation.objects.filter(
        location_timestamp__gte=cutoff_time
    ).select_related('user').prefetch_related('user__geofences')
    
    users_in_geofence = []
    checked_users = set()
    
    for user_location in fresh_locations:
        user_id = user_location.user.id
        if user_id in checked_users:
            continue
            
        lat = float(user_location.latitude)
        lon = float(user_location.longitude)
        
        if is_point_in_geofence(lat, lon, geofence):
            users_in_geofence.append(user_location)
            checked_users.add(user_id)
    
    return users_in_geofence


def get_users_in_multiple_geofences(geofences: List[Geofence], max_age_hours: int = 24) -> List[UserLocation]:
    """
    Get all users whose last known location is within any of the specified geofences.
    
    Args:
        geofences: List of Geofence objects to check against
        max_age_hours: Maximum age of location data in hours (default: 24)
    
    Returns:
        List of UserLocation objects for users inside any of the geofences
    """
    if not geofences:
        return []
    
    # Get all fresh user locations
    from django.utils import timezone
    from datetime import timedelta
    
    cutoff_time = timezone.now() - timedelta(hours=max_age_hours)
    
    fresh_locations = UserLocation.objects.filter(
        location_timestamp__gte=cutoff_time
    ).select_related('user').prefetch_related('user__geofences')
    
    users_in_geofences = []
    checked_users = set()  # Avoid duplicates
    
    for user_location in fresh_locations:
        user_id = user_location.user.id
        
        # Skip if we've already checked this user
        if user_id in checked_users:
            continue
        
        lat = float(user_location.latitude)
        lon = float(user_location.longitude)
        
        # Check if user is in any of the geofences
        for geofence in geofences:
            if is_point_in_geofence(lat, lon, geofence):
                users_in_geofences.append(user_location)
                checked_users.add(user_id)
                break  # No need to check other geofences for this user
    
    return users_in_geofences


def validate_gps_coordinates(latitude: float, longitude: float) -> bool:
    """
    Validate GPS coordinates are within valid ranges.
    
    Args:
        latitude: Latitude in decimal degrees (-90 to 90)
        longitude: Longitude in decimal degrees (-180 to 180)
    
    Returns:
        True if coordinates are valid, False otherwise
    """
    try:
        lat = float(latitude)
        lon = float(longitude)
        
        return (-90 <= lat <= 90) and (-180 <= lon <= 180)
    
    except (ValueError, TypeError):
        return False


def calculate_geofence_center(geofence: Geofence) -> Optional[Tuple[float, float]]:
    """
    Calculate the center point of a geofence.
    
    Args:
        geofence: Geofence object
    
    Returns:
        Tuple of (latitude, longitude) or None if calculation fails
    """
    if geofence.geofence_type == 'circle':
        if geofence.center_latitude and geofence.center_longitude:
            return (float(geofence.center_latitude), float(geofence.center_longitude))
    
    elif geofence.geofence_type == 'polygon':
        center = geofence.get_center_point()
        if center and len(center) >= 2:
            return (float(center[0]), float(center[1]))
    
    return None


def get_geofences_for_point(latitude: float, longitude: float) -> List[Geofence]:
    """
    Find all active geofences that contain the given point.
    
    Args:
        latitude, longitude: Point coordinates in decimal degrees
    
    Returns:
        List of matching Geofence objects
    """
    active_geofences = Geofence.objects.filter(active=True)
    matching = []
    
    for gf in active_geofences:
        if is_point_in_geofence(latitude, longitude, gf):
            matching.append(gf)
            
    return matching
