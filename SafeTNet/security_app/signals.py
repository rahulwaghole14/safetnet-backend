from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Case, SOSAlert, Notification, OfficerAlert
from .fcm_service import fcm_service
from .geo_utils import update_user_location
import logging
from django.conf import settings

logger = logging.getLogger(__name__)


@receiver(post_save, sender='users_profile.SOSEvent')
def sync_sos_event_to_security_alert(sender, instance, created, **kwargs):
    """
    Sync SOSEvent to SOSAlert when a new SOSEvent is created.
    Only sync on creation, not updates.
    """
    if not created:
        return
    
    # Skip if SOSAlert already exists for this SOSEvent
    from .models import SOSAlert
    if SOSAlert.objects.filter(source_sos_event=instance).exists():
        logger.info(f"SOSAlert already exists for SOSEvent {instance.id}, skipping sync")
        return
    
    try:
        from django.db import transaction
        from users.utils import get_geofence_from_location
        with transaction.atomic():
            # Validate location data
            if not instance.location or not isinstance(instance.location, dict):
                logger.error(f"SOSEvent {instance.id} has invalid location data: {instance.location}")
                return
            
            # Support multiple coordinate key formats
            latitude = (instance.location.get('latitude') or 
                       instance.location.get('lat'))
            longitude = (instance.location.get('longitude') or 
                        instance.location.get('lng'))
            
            if latitude is None or longitude is None:
                logger.error(f"SOSEvent {instance.id} missing latitude/longitude in location data")
                return
            
            # Validate coordinates are numeric
            try:
                lat_float = float(latitude)
                lon_float = float(longitude)
            except (ValueError, TypeError):
                logger.error(f"SOSEvent {instance.id} has invalid coordinates: lat={latitude}, lon={longitude}")
                return
            
            # Find geofence for this location
            geofence = get_geofence_from_location(lat_float, lon_float)
            
            # Create corresponding SOSAlert
            sos_alert = SOSAlert.objects.create(
                user=instance.user,
                created_by_role="USER",
                message=instance.notes or '',
                location_lat=lat_float,
                location_long=lon_float,
                geofence=geofence,
                status="pending",
                priority="high",
                source_sos_event=instance
            )
            
            logger.info(f"Successfully synced SOSEvent {instance.id} → SOSAlert {sos_alert.id}")
            
            # Sync user location to UserLocation table for real-time tracking on officer map
            update_user_location(instance.user, lat_float, lon_float)
            
    except Exception as e:
        logger.exception(f"Failed to sync SOSEvent {instance.id} to SOSAlert: {str(e)}")
        # Do not re-raise to avoid breaking the original SOSEvent creation


@receiver(post_save, sender=Case)
def update_sos_alert_status_on_case_save(sender, instance, created, **kwargs):
    """
    Update SOSAlert status when Case status changes
    """
    if not created:  # Only on updates, not creation
        sos_alert = instance.sos_alert
        
        # Map case status to SOS alert status
        status_mapping = {
            'accepted': 'accepted',
            'resolved': 'resolved',
            'open': 'pending'  # Keep as pending if case is open
        }
        
        new_status = status_mapping.get(instance.status)
        if new_status and sos_alert.status != new_status:
            sos_alert.status = new_status
            sos_alert.save(update_fields=['status'])


@receiver(post_delete, sender=Case)
def update_sos_alert_status_on_case_delete(sender, instance, **kwargs):
    """
    Reset SOSAlert status to pending when Case is deleted
    """
    sos_alert = instance.sos_alert
    if sos_alert.status != 'pending':
        sos_alert.status = 'pending'
        sos_alert.save(update_fields=['status'])


@receiver(post_save, sender=SOSAlert)
def send_sos_alert_notification(sender, instance, created, **kwargs):
    """
    Send FCM notification when a new SOS alert is created
    """        # Notification logic for new alerts
    if created:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        # Get all active security officers (Users with role='security_officer')
        user_org = instance.user.organization
        logger.info(f"--- SOS Alert Signal Debug ---")
        logger.info(f"Triggered by: {instance.user.username} (Org: {user_org})")
        logger.info(f"DEBUG Mode: {settings.DEBUG}")
        
        # Targeted Filter: Only notify officers assigned to the same geofence
        geofence = getattr(instance, 'geofence', None)
        
        if geofence:
            from users.models import OfficerGeofenceAssignment
            assigned_officer_ids = OfficerGeofenceAssignment.objects.filter(
                geofence=geofence,
                is_active=True
            ).values_list('officer_id', flat=True)
            
            officers = User.objects.filter(
                id__in=assigned_officer_ids, 
                is_active=True
            )
            logger.info(f"Targeted Geofence {geofence.name}: Found {officers.count()} assigned officers")
        elif user_org:
            officers = User.objects.filter(
                role='security_officer',
                organization=user_org,
                is_active=True
            )
        else:
            # If no geofence/organization, notify all active security officers as fallback
            officers = User.objects.filter(role='security_officer', is_active=True)
        
        logger.info(f"Found {officers.count()} security officers to notify: {[o.email for o in officers]}")
        
        # Create notifications and send FCM
        for officer in officers:
            tokens = getattr(officer, 'fcm_tokens', [])
            logger.info(f"==> Notifying officer: {officer.email} (Org: {officer.organization.name if officer.organization else 'None'})")
            logger.info(f"    Tokens found: {len(tokens)}")
            if not tokens:
                logger.warning(f"    SKIPPING: No tokens for {officer.email}")
                continue
            try:
                # Create database notification
                notification = Notification.objects.create(
                    officer=officer,
                    title="New SOS Alert",
                    message=f"SOS alert from {instance.user.username} at {instance.location_lat}, {instance.location_long}",
                    notification_type='sos_alert',
                    sos_alert=instance
                )
                
                # Send FCM push notification
                fcm_service.send_to_officer(
                    officer=officer,
                    title="🚨 New SOS Alert",
                    body=f"Emergency alert from {instance.user.username}",
                    data={
                        'type': 'sos_alert',
                        'sos_alert_id': str(instance.id),
                        'notification_id': str(notification.id),
                        'location': f"{instance.location_lat},{instance.location_long}"
                    },
                    sound='siren'
                )
            except Exception as e:
                logger.error(f"Failed to send notification to officer {officer.username}: {str(e)}")

        # Also send user confirmation
        if instance.created_by_role == 'USER':
            try:
                fcm_service.send_to_user(
                    user=instance.user,
                    title="SOS Alert Received",
                    body="Your SOS alert has been received and officers are being notified.",
                    data={
                        'type': 'sos_alert_confirmation',
                        'sos_alert_id': str(instance.id),
                    },
                    sound='siren'
                )
            except Exception as e:
                logger.error(f"Failed to send confirmation to user {instance.user.username}: {str(e)}")

        # Sync ALL new SOSAlerts to the unified users.Alert feed
        # This ensures users see their own SOS and Officer-created alerts in the feed
        try:
            from users.models import Alert
            
            alert_type = 'USER_SOS' if instance.created_by_role == 'USER' else 'OFFICER_ALERT'
            title = "Emergency SOS Triggered" if instance.created_by_role == 'USER' else f"Security Alert: {instance.alert_type.title().replace('_', ' ')}"
            
            # For area alerts, we might want to notify all users in the geofence (already handled for OFFICER alerts below)
            # But for User SOS, it just needs to be in their own feed history.
            
            Alert.objects.create(
                user=instance.user,
                alert_type=alert_type,
                title=title,
                description=instance.description or instance.message,
                message=instance.message,
                location={
                    'latitude': instance.location_lat,
                    'longitude': instance.location_long
                },
                geofence=instance.geofence,
                priority=instance.priority,
                severity='HIGH' if instance.priority == 'high' else 'MEDIUM',
                status='ACTIVE' if instance.status == 'pending' else instance.status.upper(),
                metadata={
                    'sos_alert_id': instance.id,
                    'original_type': instance.alert_type
                }
            )
            logger.info(f"Successfully synced SOSAlert {instance.id} ({instance.created_by_role}) to users.Alert table")

            # If this is an OFFICER alert, broadcast to users in the area
            # 🚨 EXCEPTION: area_user_alert is handled explicitly by its view for precision targeting
            if instance.created_by_role == 'OFFICER' and instance.alert_type != 'area_user_alert':
                logger.info(f"🔄 Broadcasting OFFICER alert {instance.id} to users...")
                if instance.geofence:
                    from .geo_utils import get_users_in_geofence
                    affected_locations = get_users_in_geofence(instance.geofence)
                    users_to_notify = [ul.user for ul in affected_locations]
                    logger.info(f"📍 Found {len(users_to_notify)} users currently in geofence {instance.geofence.name}")
                else:
                    users_to_notify = User.objects.filter(is_active=True)

                fcm_service.send_to_users(
                    users_queryset=users_to_notify,
                    title=f"Security Alert: {instance.alert_type.replace('_', ' ').title()}",
                    body=instance.message[:100],
                    data={
                        'type': 'area_security_alert',
                        'sos_alert_id': str(instance.id),
                    },
                    sound='siren' if instance.priority == 'high' or instance.alert_type == 'emergency' else 'default'
                )
        except Exception as e:
            logger.error(f"Failed to sync/broadcast alert to users: {str(e)}")

    # Status Update Sync (for both new and existing alerts)
    else:
        try:
            from users.models import Alert
            from django.utils import timezone
            
            # 1. Handle Soft Deletion: If SOSAlert is marked deleted, remove from User App feed
            if instance.is_deleted:
                deleted_count, _ = Alert.objects.filter(metadata__sos_alert_id=instance.id).delete()
                if deleted_count > 0:
                    logger.info(f"🗑️ Soft-sync: Deleted {deleted_count} alerts from users.Alert for SOSID {instance.id}")
                return

            # 2. Update the unified feed when SOSAlert status changes
            num_updated = Alert.objects.filter(metadata__sos_alert_id=instance.id).update(
                status='RESOLVED' if instance.status == 'resolved' else instance.status.upper(),
                is_resolved=(instance.status == 'resolved'),
                resolved_at=timezone.now() if instance.status == 'resolved' else None
            )
            if num_updated > 0:
                logger.info(f"Successfully updated status for SOSAlert {instance.id} in users.Alert feed")
        except Exception as e:
            logger.error(f"Failed to sync status update to users.Alert: {str(e)}")


@receiver(post_delete, sender=SOSAlert)
def cleanup_user_alert_on_sos_delete(sender, instance, **kwargs):
    """
    Ensure users.Alert is removed if SOSAlert is physically deleted
    """
    try:
        from users.models import Alert
        deleted_count, _ = Alert.objects.filter(metadata__sos_alert_id=instance.id).delete()
        if deleted_count > 0:
            logger.info(f"🔥 Hard-sync: Cleaned up {deleted_count} user alerts following SOSAlert {instance.id} deletion")
    except Exception as e:
        logger.error(f"Failed to cleanup users.Alert on SOS delete: {str(e)}")


@receiver(post_save, sender=OfficerAlert)
def send_officer_alert_broadcast(sender, instance, created, **kwargs):
    """
    Send FCM notification when a new OfficerAlert is broadcasted
    """
    if created and getattr(instance, 'is_broadcast', False):
        try:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            
            # Target users based on geofence if location is provided
            if instance.latitude and instance.longitude:
                from users.utils import get_geofence_from_location
                from .geo_utils import get_users_in_geofence
                
                target_geofence = get_geofence_from_location(instance.latitude, instance.longitude)
                if target_geofence:
                    affected_locations = get_users_in_geofence(target_geofence)
                    users_to_notify = [ul.user for ul in affected_locations]
                    logger.info(f"Targeted Broadcast: Found {len(users_to_notify)} users in geofence {target_geofence.name}")
                else:
                    users_to_notify = User.objects.filter(is_active=True)
            else:
                # Fallback to all active users for global broadcasts
                users_to_notify = User.objects.filter(is_active=True)
                
            fcm_service.send_to_users(
                users_queryset=users_to_notify,
                title=f"🚨 {instance.title}",
                body=instance.message[:100],
                data={
                    'type': 'officer_alert_broadcast',
                    'officer_alert_id': str(instance.id),
                },
                sound='siren' if instance.alert_type == 'emergency' else 'default'
            )
        except Exception as e:
            logger.error(f"Failed to broadcast OfficerAlert to users: {str(e)}")


@receiver(post_save, sender=Case)
def send_case_assignment_notification(sender, instance, created, **kwargs):
    """
    Send notification when a case is assigned to an officer
    """
    if created and instance.officer:  # Only for new cases with assigned officer
        # Create database notification
        notification = Notification.objects.create(
            officer=instance.officer,
            title="New Case Assigned",
            message=f"Case #{instance.id} assigned for SOS Alert #{instance.sos_alert.id}",
            notification_type='case_assigned',
            case=instance,
            sos_alert=instance.sos_alert
        )
        
        # Send FCM push notification
        fcm_service.send_to_officer(
            officer=instance.officer,
            title="📋 New Case Assigned",
            body=f"Case #{instance.id} - {instance.sos_alert.user.username if instance.sos_alert else 'Unknown user'}",
            data={
                'type': 'case_assigned',
                'case_id': str(instance.id),
                'sos_alert_id': str(instance.sos_alert.id) if instance.sos_alert else None,
                'notification_id': str(notification.id)
            }
        )


@receiver(post_save, sender='users.User')
def sync_user_location_on_save(sender, instance, **kwargs):
    """
    Sync user location from User model heartbeat to UserLocation table.
    """
    if instance.location and isinstance(instance.location, dict):
        latitude = instance.location.get('latitude') or instance.location.get('lat')
        longitude = instance.location.get('longitude') or instance.location.get('lng')
        
        if latitude is not None and longitude is not None:
            update_user_location(instance, latitude, longitude)


@receiver(post_save, sender='users_profile.LiveLocationShare')
def sync_live_location_on_save(sender, instance, **kwargs):
    """
    Sync live location from LiveLocationShare to UserLocation table.
    Ensures users sharing live are visible on the officer's geofence map.
    """
    if instance.is_active and instance.current_location:
        latitude = instance.current_location.get('latitude') or instance.current_location.get('lat')
        longitude = instance.current_location.get('longitude') or instance.current_location.get('lng')
        
        if latitude is not None and longitude is not None:
            update_user_location(instance.user, latitude, longitude)


@receiver(post_save, sender='users_profile.GeofenceEvent')
def sync_geofence_event_on_save(sender, instance, **kwargs):
    """
    Sync location when a geofence entry/exit event occurs.
    """
    update_user_location(instance.user, instance.latitude, instance.longitude)
