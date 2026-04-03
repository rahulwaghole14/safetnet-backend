import firebase_admin
from firebase_admin import credentials, messaging
from django.conf import settings
import logging
import os

logger = logging.getLogger(__name__)

class FCMService:
    """Firebase Cloud Messaging service for sending push notifications using FCM v1"""
    
    _initialized = False

    def __init__(self):
        self.initialize_sdk()
    
    def initialize_sdk(self):
        """Initialize Firebase Admin SDK if not already initialized"""
        if FCMService._initialized:
            return True
            
        firebase_config = getattr(settings, 'FIREBASE_CONFIG', None)
        
        if not firebase_config or not firebase_config.get('project_id'):
            logger.warning("FIREBASE_CONFIG not configured. Push notifications will be disabled.")
            return False
            
        try:
            if not firebase_admin._apps:
                cred = credentials.Certificate(firebase_config)
                firebase_admin.initialize_app(cred)
            FCMService._initialized = True
            logger.info("Firebase Admin SDK initialized successfully for FCM v1 (Env Based)")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize Firebase Admin SDK from config: {str(e)}")
            return False

    def send_notification(self, registration_tokens, title, body, data=None, sound='default'):
        """
        Send push notification to FCM tokens using FCM v1 Multicast
        """
        if not self.initialize_sdk():
            return False
            
        if not registration_tokens:
            logger.info("No registration tokens provided. Skipping notification.")
            return False

        # Ensure tokens is a list
        if isinstance(registration_tokens, str):
            registration_tokens = [registration_tokens]

        # Filter out empty tokens and deduplicate
        registration_tokens = list(set([t for t in registration_tokens if t]))
        if not registration_tokens:
            return False

        # Use messaging.send_each_for_multicast (newer, doesn't use the deprecated batch API)
        try:
            # Prepare data payload (must be strings)
            data_payload = {
                'title': str(title),
                'body': str(body),
            }
            if data:
                for k, v in data.items():
                    data_payload[str(k)] = str(v)

            # Android-specific configuration for high priority and loud alerts
            android_notif_args = {
                'sound': sound,
            }
            
            # Only specify the channel if it's for the siren (high priority)
            # In Python SDK, use channel_id, not notification_channel_id
            if sound == 'siren':
                android_notif_args['channel_id'] = 'sos_alerts'
                android_notif_args['notification_priority'] = 'max'
            
            android_config = messaging.AndroidConfig(
                priority='high',
                notification=messaging.AndroidNotification(**android_notif_args)
            )

            # Apple-specific configuration
            apns_config = messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        sound=sound,
                        content_available=True,
                        category='SOS_ALERT'
                    ),
                ),
            )

            # Convert each token to a Message object
            logger.info(f"FCM v1: Preparing to send to {len(registration_tokens)} tokens: {registration_tokens}")
            messages = [
                messaging.Message(
                    notification=messaging.Notification(
                        title=title,
                        body=body,
                    ),
                    data=data_payload,
                    android=android_config,
                    apns=apns_config,
                    token=token,
                ) for token in registration_tokens
            ]
            
            # send_each is the modern batch replacement in Firebase Admin SDK 6.x+
            response = messaging.send_each(messages)
            
            logger.info(f"FCM v1: Successfully sent {response.success_count} messages. Failures: {response.failure_count}")
            
            first_error = None
            if response.failure_count > 0:
                for index, resp in enumerate(response.responses):
                    if not resp.success:
                        token_snippet = registration_tokens[index][:15] if index < len(registration_tokens) else "Unknown"
                        error_msg = str(resp.exception)
                        if not first_error:
                            first_error = error_msg
                        logger.warning(f"Token {token_snippet}... failed: {error_msg}")
            
            return {
                'success': response.success_count > 0,
                'success_count': response.success_count,
                'failure_count': response.failure_count,
                'first_error': first_error
            }
                
        except Exception as e:
            logger.error(f"FCM v1 transmission error: {str(e)}")
            return {
                'success': False,
                'success_count': 0,
                'failure_count': len(registration_tokens),
                'first_error': str(e)
            }
    
    def send_to_officer(self, officer, title, body, data=None, sound='default'):
        """Send notification to a specific officer"""
        registration_tokens = getattr(officer, 'fcm_tokens', [])
        return self.send_notification(registration_tokens, title, body, data, sound=sound)

    def send_to_user(self, user, title, body, data=None, sound='default'):
        """Send notification to a specific user"""
        registration_tokens = getattr(user, 'fcm_tokens', [])
        return self.send_notification(registration_tokens, title, body, data, sound=sound)
        
    def send_to_users(self, users_queryset, title, body, data=None, sound='default'):
        """Send notification to multiple users"""
        all_tokens = []
        for user in users_queryset:
            tokens = getattr(user, 'fcm_tokens', [])
            if tokens and isinstance(tokens, list):
                all_tokens.extend(tokens)
                
        if not all_tokens:
            return False
            
        # FCM Multicast handles up to 500 tokens per call
        chunk_size = 500
        success = False
        for i in range(0, len(all_tokens), chunk_size):
            chunk = all_tokens[i:i + chunk_size]
            if self.send_notification(chunk, title, body, data, sound=sound):
                success = True
                
        return success

# Global FCM service instance
fcm_service = FCMService()
