import logging
from django.utils import timezone
from datetime import timedelta
from django.contrib.auth import get_user_model
from .fcm_service import fcm_service
from .models import SOSAlert, OfficerAlert

User = get_user_model()
logger = logging.getLogger(__name__)

def handle_geofence_entry(user, geofence):
    """
    Handle a user entering a geofence.
    1. Notify assigned security officers.
    2. Synchronize active alerts for the user (Catch-up).
    """
    logger.info(f"User {user.email} entered geofence {geofence.name}")
    
    # 1. Notify assigned Security Officers
    # ONLY notify officers assigned to THIS specific geofence
    from users.models import OfficerGeofenceAssignment
    
    assigned_officer_ids = OfficerGeofenceAssignment.objects.filter(
        geofence=geofence,
        is_active=True
    ).values_list('officer_id', flat=True)
    
    officers = User.objects.filter(
        id__in=assigned_officer_ids,
        role='security_officer',
        is_active=True
    )
    
    if officers.exists():
        logger.info(f"Notifying {officers.count()} officers about entry into {geofence.name}")
        display_name = user.get_full_name() or user.username
        fcm_service.send_to_users(
            officers,
            title="Geofence Entry Alert",
            body=f"Security Alert: User {display_name} has entered the {geofence.name} area.",
            data={
                "type": "GE_ENTRY",
                "user_id": str(user.id),
                "geofence_id": str(geofence.id),
                "geofence_name": geofence.name
            }
        )

    # 2. Synchronize Active Alerts (Catch-up)
    # Check for active SOS alerts in this geofence
    active_sos = SOSAlert.objects.filter(
        geofence=geofence,
        status='pending',
        is_deleted=False
    ).first()
    
    if active_sos:
        logger.info(f"Pushing active SOS catch-up alert to user {user.email}")

        fcm_service.send_to_user(
            user,
            title="Security Warning: Active Alert",
            body=f"You have entered an area with an active SOS alert. Please stay alert and follow instructions.",
            data={
                "type": "CATCHUP_ALERT",
                "alert_id": str(active_sos.id),
                "geofence_id": str(geofence.id)
            }
        )
        
    # Also check for active broadcast alerts
    active_broadcast = OfficerAlert.objects.filter(
        is_active=True,
        latitude__isnull=False, # Basic check for location-based alerts
        created_at__gte=timezone.now() - timedelta(hours=6) # Only recent ones
    ).first()
    
    # Note: Currently OfficerAlert doesn't have a direct ForeignKey to Geofence, 
    # but we can filter by broad area or implement it in a follow-up. 
    # For now, SOS catch-up is the priority.
