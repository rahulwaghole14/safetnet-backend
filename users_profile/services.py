"""
Simplified services for SMS functionality (without geospatial dependencies).
Use this file if you're having trouble with GDAL installation.
"""
import logging
from django.conf import settings
from django.db.models import Q
import requests
import json

logger = logging.getLogger(__name__)


class SMSService:
    """
    Service for sending SMS messages via Twilio and Exotel.
    """
    
    def __init__(self):
        self.twilio_client = None
        self.exotel_sid = getattr(settings, 'EXOTEL_SID', None)
        self.exotel_token = getattr(settings, 'EXOTEL_TOKEN', None)
        self.exotel_app_id = getattr(settings, 'EXOTEL_APP_ID', None)
        self.twilio_phone_number = getattr(settings, 'TWILIO_PHONE_NUMBER', None)
        
        # Initialize Twilio client if credentials are available
        twilio_sid = getattr(settings, 'TWILIO_ACCOUNT_SID', None)
        twilio_token = getattr(settings, 'TWILIO_AUTH_TOKEN', None)
        if twilio_sid and twilio_token:
            try:
                from twilio.rest import Client as TwilioClient
                self.twilio_client = TwilioClient(
                    twilio_sid,
                    twilio_token
                )
            except Exception as e:
                logger.error(f"Failed to initialize Twilio client: {str(e)}")
    
    def send_sos_alert(self, to_phone, user_name, user_phone, location=None):
        """
        Send SOS alert SMS to family contact.
        """
        message = self._format_sos_message(user_name, user_phone, location)
        
        # Try Twilio first, then Exotel
        if self.twilio_client:
            return self._send_via_twilio(to_phone, message)
        elif self.exotel_sid and self.exotel_token:
            return self._send_via_exotel(to_phone, message)
        else:
            logger.error("No SMS service configured")
            raise Exception("SMS service not configured")
    
    def _format_sos_message(self, user_name, user_phone, location=None):
        """Format SOS alert message."""
        message = f"🚨 SOS ALERT 🚨\n\n{user_name} has triggered an emergency alert!\n"
        message += f"Contact: {user_phone}\n"
        
        if location:
            if isinstance(location, dict):
                lat = location.get('latitude')
                lng = location.get('longitude')
            else:
                # Handle case where location might be a different format
                lat = getattr(location, 'y', None) if hasattr(location, 'y') else None
                lng = getattr(location, 'x', None) if hasattr(location, 'x') else None
            
            if lat is not None and lng is not None:
                message += f"Location: {lat:.6f}, {lng:.6f}\n"
                message += f"Google Maps: https://maps.google.com/?q={lat},{lng}\n"
        
        message += "\nPlease contact them immediately and call emergency services if needed."
        return message
    
    def _send_via_twilio(self, to_phone, message):
        """Send SMS via Twilio."""
        try:
            message_obj = self.twilio_client.messages.create(
                body=message,
                from_=self.twilio_phone_number or '+1234567890',  # Fallback if not set
                to=to_phone
            )
            logger.info(f"SMS sent via Twilio to {to_phone}: {message_obj.sid}")
            return True
        except Exception as e:
            logger.error(f"Twilio SMS failed to {to_phone}: {str(e)}")
            raise
    
    def _send_via_exotel(self, to_phone, message):
        """Send SMS via Exotel."""
        try:
            url = f"https://api.exotel.com/v1/Accounts/{self.exotel_sid}/Sms/send.json"
            
            data = {
                'From': self.twilio_phone_number or '+1234567890',  # Use configured phone number or fallback
                'To': to_phone,
                'Body': message
            }
            
            response = requests.post(
                url,
                data=data,
                auth=(self.exotel_sid, self.exotel_token),
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )
            
            if response.status_code == 200:
                logger.info(f"SMS sent via Exotel to {to_phone}")
                return True
            else:
                logger.error(f"Exotel SMS failed to {to_phone}: {response.text}")
                raise Exception(f"Exotel API error: {response.text}")
                
        except Exception as e:
            logger.error(f"Exotel SMS failed to {to_phone}: {str(e)}")
            raise


class GeofenceService:
    """
    Simplified geofencing service without geospatial dependencies.
    """
    
    def __init__(self):
        self.radius_meters = getattr(settings, 'GEOFENCE_RADIUS_METERS', 100)
    
    def check_and_alert_geofence(self, user, location, sos_event):
        """
        Check if user is within authorized geofence zones and send alerts.
        """
        # This is a simplified implementation
        # In a real application, you would have a GeofenceZone model
        # and check against authorized zones for the user
        
        # For now, we'll just log the geofence check
        logger.info(f"Geofence check for user {user.email} at location {location}")
        
        # Update SOS event status
        sos_event.status = 'geofence_alerted'
        sos_event.save()
        
        # In a real implementation, you would:
        # 1. Query GeofenceZone model for user's authorized zones
        # 2. Check if current location is within any authorized zone
        # 3. Send alerts to community members if within authorized zone
        # 4. Send alerts to security officers if outside authorized zone
        
        return True
    
    def is_within_geofence(self, location, geofence_center, radius_meters=None):
        """
        Check if a location is within a geofence using simple distance calculation.
        """
        if radius_meters is None:
            radius_meters = self.radius_meters
        
        # Simple distance calculation (not as accurate as proper geospatial)
        if isinstance(location, dict) and isinstance(geofence_center, dict):
            lat1, lng1 = location.get('latitude', 0), location.get('longitude', 0)
            lat2, lng2 = geofence_center.get('latitude', 0), geofence_center.get('longitude', 0)
            
            # Simple distance calculation (approximate)
            import math
            distance = math.sqrt((lat2 - lat1)**2 + (lng2 - lng1)**2) * 111000  # Rough conversion to meters
            return distance <= radius_meters
        
        return False
    
    def get_nearby_geofences(self, location, radius_meters=None):
        """
        Get geofences within a certain radius of a location.
        """
        if radius_meters is None:
            radius_meters = self.radius_meters
        
        # This would query a GeofenceZone model in a real implementation
        # For now, return empty list
        return []


class EmergencyService:
    """
    Service for emergency response coordination.
    """
    
    def __init__(self):
        self.sms_service = SMSService()
    
    def trigger_emergency_response(self, user, sos_event):
        """
        Coordinate emergency response for SOS event.
        """
        try:
            if not user or not sos_event:
                logger.warning("Emergency response called with None user or sos_event")
                return False
            
            # NOTE: SMS sending is now handled by the frontend app for faster response
            # Backend SMS sending was removed to prevent timeout issues
            # Each SMS call to Twilio/Exotel takes 1-3 seconds, which was blocking responses
            logger.info(f"Emergency response triggered - SMS will be sent by frontend app for user: {getattr(user, 'email', 'unknown')}")
            
            security_payload = self._notify_security_officers(user, sos_event)
            
            logger.info(
                "Emergency response triggered for user %s (security payload: %s)",
                getattr(user, 'email', 'unknown'),
                security_payload or 'no security officers available'
            )
            return security_payload or True
            
        except Exception as e:
            logger.error(f"Emergency response failed for user {getattr(user, 'email', 'unknown') if user else 'None'}: {str(e)}")
            return False

    def _notify_security_officers(self, user, sos_event):
        """
        Create SOS alerts for security officers and push in-app notifications.
        """
        try:
            from security_app.models import SOSAlert as SecuritySOSAlert, Notification as OfficerNotification
            from django.contrib.auth import get_user_model
        except Exception as import_error:
            logger.warning("Security app dependencies missing: %s", import_error)
            return None

        location = getattr(sos_event, 'location', None)
        latitude, longitude = self._extract_coordinates(location)
        primary_geofence = self._get_primary_geofence(user)

        if (latitude is None or longitude is None) and primary_geofence:
            center_point = primary_geofence.get_center_point()
            if center_point and len(center_point) == 2:
                latitude = latitude if latitude is not None else center_point[0]
                longitude = longitude if longitude is not None else center_point[1]

        latitude = latitude if latitude is not None else 0.0
        longitude = longitude if longitude is not None else 0.0

        # Note: SOSAlert creation is now handled by the sync_sos_event_to_security_alert signal 
        # in security_app/signals.py which triggers on SOSEvent.objects.create().
        # We only need to handle FCM notifications here if we want bypass logic or keep it clean.
        # However, signals.py also handles notifications for SOSAlert.
        
        # Let's get the security alert if it exists (created by signal)
        from .models import SOSEvent
        try:
            from security_app.models import SOSAlert
            security_alert = SOSAlert.objects.filter(source_sos_event=sos_event).first()
        except:
            security_alert = None

        User = get_user_model()
        officers_qs = User.objects.filter(role='security_officer', is_active=True)
        if user.organization:
            officers_qs = officers_qs.filter(organization=user.organization)
        if primary_geofence:
            officers_qs = officers_qs.filter(geofences=primary_geofence)

        notified = 0
        message = self._build_officer_message(user, latitude, longitude, primary_geofence)
        for officer in officers_qs:
            try:
                OfficerNotification.objects.create(
                    officer=officer,
                    title="Emergency SOS alert",
                    message=message,
                    notification_type='sos_alert',
                    sos_alert=security_alert,
                )
                notified += 1
            except Exception as notification_error:
                logger.error("Failed to notify officer %s: %s", officer.id, notification_error)

        alert_id = security_alert.id if security_alert else "SYNC_IN_PROGRESS"
        logger.info(
            "Security SOS alert #%s created for %s (officers notified: %s)",
            alert_id,
            getattr(user, 'email', 'unknown'),
            notified
        )

        return {
            'security_alert_id': security_alert.id,
            'officers_notified': notified,
            'geofence_id': primary_geofence.id if primary_geofence else None,
        }

    @staticmethod
    def _extract_coordinates(location):
        if not location:
            return None, None
        latitude = None
        longitude = None

        try:
            if isinstance(location, dict):
                latitude = location.get('latitude') or location.get('lat')
                longitude = location.get('longitude') or location.get('lng')
            else:
                longitude = getattr(location, 'x', None)
                latitude = getattr(location, 'y', None)
        except Exception as coord_error:
            logger.warning("Could not extract coordinates from %s: %s", location, coord_error)

        return latitude, longitude

    @staticmethod
    def _get_primary_geofence(user):
        try:
            if hasattr(user, 'geofences'):
                return user.geofences.first()
        except Exception as geo_error:
            logger.warning("Failed to fetch primary geofence for %s: %s", getattr(user, 'email', 'unknown'), geo_error)
        return None

    @staticmethod
    def _is_premium_user(user):
        if hasattr(user, 'is_paid_user') and user.is_paid_user:
            return True
        if hasattr(user, 'is_premium') and user.is_premium:
            return True
        plan = getattr(user, 'plantype', '') or ''
        return plan.lower() == 'premium'

    @staticmethod
    def _build_officer_message(user, latitude, longitude, geofence):
        parts = [
            f"{getattr(user, 'name', user.username)} triggered an SOS.",
            f"Coords: {latitude:.5f}, {longitude:.5f}",
        ]
        if geofence:
            parts.append(f"Geofence: {geofence.name}")
        return " ".join(parts)
