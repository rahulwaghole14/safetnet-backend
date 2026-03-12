from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Case, SOSAlert, Notification, OfficerAlert
from .fcm_service import fcm_service
import logging

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
    """
    if created:  # Only for new SOS alerts
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        # Get all active security officers (Users with role='security_officer') in the same organization
        if instance.user.organization:
            officers = User.objects.filter(
                role='security_officer',
                organization=instance.user.organization,
                is_active=True
            )
        else:
            # If no organization, notify all active security officers
            officers = User.objects.filter(role='security_officer', is_active=True)
        
        # Create notifications and send FCM
        for officer in officers:
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
                    }
                )
            except Exception as e:
                logger.error(f"Failed to send notification to officer {officer.username}: {str(e)}")
                # Continue with other officers, don't fail the alert creation

        # Also send user notifications based on role
        if instance.created_by_role == 'USER':
            try:
                fcm_service.send_to_user(
                    user=instance.user,
                    title="SOS Alert Received",
                    body="Your SOS alert has been received and officers are being notified.",
                    data={
                        'type': 'sos_alert_confirmation',
                        'sos_alert_id': str(instance.id),
                    }
                )
            except Exception as e:
                logger.error(f"Failed to send confirmation to user {instance.user.username}: {str(e)}")
                
        elif instance.created_by_role == 'OFFICER':
            try:
                logger.info(f"🔄 Syncing OFFICER alert {instance.id} to unified feed...")
                
                # Get users in geofence based on LIVE location, not just static assignment
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
                    }
                )

                # Sync to unified users.Alert table so userapp can see it in the feed
                from users.models import Alert
                Alert.objects.create(
                    user=instance.user,
                    alert_type='OFFICER_ALERT',
                    title=f"Security Alert: {instance.alert_type.title().replace('_', ' ')}",
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
                logger.info(f"Successfully synced SOSAlert {instance.id} to users.Alert table")
            except Exception as e:
                logger.error(f"Failed to broadcast/sync alert to users: {str(e)}")
        else:
            # Handle status updates (sync to users.Alert)
            if instance.created_by_role == 'OFFICER':
                try:
                    from users.models import Alert
                    from django.utils import timezone
                    Alert.objects.filter(metadata__sos_alert_id=instance.id).update(
                        status='RESOLVED' if instance.status == 'resolved' else instance.status.upper(),
                        is_resolved=(instance.status == 'resolved'),
                        resolved_at=timezone.now() if instance.status == 'resolved' else None
                    )
                    logger.info(f"Successfully synced status update for SOSAlert {instance.id} to users.Alert")
                except Exception as e:
                    logger.error(f"Failed to sync status update to users.Alert: {str(e)}")


@receiver(post_save, sender=OfficerAlert)
def send_officer_alert_broadcast(sender, instance, created, **kwargs):
    """
    Send FCM notification when a new OfficerAlert is broadcasted
    """
    if created and getattr(instance, 'is_broadcast', False):
        try:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            
            # Broadcast to all active users
            users_to_notify = User.objects.filter(is_active=True)
                
            fcm_service.send_to_users(
                users_queryset=users_to_notify,
                title=f"🚨 {instance.title}",
                body=instance.message[:100],
                data={
                    'type': 'officer_alert_broadcast',
                    'officer_alert_id': str(instance.id),
                }
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
