"""
Simplified user-related models; rely on the project's AUTH_USER_MODEL.
"""
from django.db import models
import uuid
from django.core.validators import RegexValidator
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

User = get_user_model()

# Free tier limits
FREE_TIER_LIMITS = {
    'MAX_CONTACTS': 5,  # Free users can have up to 5 contacts
    'MAX_LIVE_SHARE_MINUTES': 30,  # Free users get 30 minutes of live sharing
    'MAX_INCIDENT_HISTORY': 5,  # Free users see last 5 incidents
    'COMMUNITY_ALERT_RADIUS_METERS': 500,  # Free users can alert within 500m
    'MAX_GEOFENCES': 0,  # Free users cannot use geofencing
    'MAX_TRUSTED_CIRCLES': 2,  # Free users can have 2 trusted circles
}


class GooglePlaySubscription(models.Model):
    """
    Stores the latest known Google Play subscription status for a purchase token.
    """

    ACCESS_GRANTING_STATES = (
        'SUBSCRIPTION_STATE_ACTIVE',
        'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    )

    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='google_play_subscriptions',
        help_text="User currently associated with this Google Play purchase token"
    )
    package_name = models.CharField(
        max_length=255,
        help_text="Android package name verified with Google Play"
    )
    product_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Subscription product identifier from Google Play"
    )
    purchase_token = models.CharField(
        max_length=512,
        unique=True,
        help_text="Google Play purchase token"
    )
    linked_purchase_token = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        db_index=True,
        help_text="Previous token linked by Google Play for upgrades, downgrades, or re-subscribe flows"
    )
    latest_order_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Latest order identifier reported by Google Play"
    )
    subscription_state = models.CharField(
        max_length=64,
        blank=True,
        help_text="Latest subscription lifecycle state from Google Play"
    )
    acknowledgement_state = models.CharField(
        max_length=64,
        blank=True,
        help_text="Acknowledgement state returned by Google Play"
    )
    auto_renew_enabled = models.BooleanField(
        default=False,
        help_text="Whether the subscription is currently set to auto-renew"
    )
    line_item_index = models.PositiveIntegerField(
        default=0,
        help_text="Index of the line item selected from the subscriptionsv2 response"
    )
    expiry_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Expiry time reported for the selected subscription line item"
    )
    external_account_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Obfuscated external account identifier returned by Google Play"
    )
    external_profile_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Obfuscated external profile identifier returned by Google Play"
    )
    is_test_purchase = models.BooleanField(
        default=False,
        help_text="Whether Google Play reported this as a test purchase"
    )
    last_event_type = models.CharField(
        max_length=64,
        blank=True,
        help_text="Last RTDN event type processed for this token"
    )
    last_notification_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of the last processed RTDN event"
    )
    last_verified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of the last successful verification with Google Play"
    )
    raw_response = models.JSONField(
        default=dict,
        blank=True,
        help_text="Most recent raw subscriptionsv2 payload from Google Play"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'users_google_play_subscription'
        verbose_name = 'Google Play Subscription'
        verbose_name_plural = 'Google Play Subscriptions'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['user', 'subscription_state']),
            models.Index(fields=['product_id', 'subscription_state']),
            models.Index(fields=['linked_purchase_token']),
        ]

    def __str__(self):
        product = self.product_id or 'unknown-product'
        return f"{product} ({self.subscription_state or 'unknown-state'})"

    @property
    def has_access(self):
        if self.subscription_state not in self.ACCESS_GRANTING_STATES:
            return False
        if self.expiry_time and self.expiry_time <= timezone.now():
            return False
        return True




class FamilyContact(models.Model):
    """
    Family contact model for storing emergency contacts.
    Free users: up to 5 contacts
    Premium users: unlimited contacts
    """
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='family_contacts',
        help_text="User who owns this family contact"
    )
    name = models.CharField(
        max_length=150,
        help_text="Family contact's name"
    )
    phone = models.CharField(
        max_length=15,
        validators=[RegexValidator(
            regex=r'^\+?1?\d{9,15}$',
            message="Phone number must be entered in the format: '+999999999'. Up to 15 digits allowed."
        )],
        help_text="Family contact's phone number"
    )
    relationship = models.CharField(
        max_length=50,
        blank=True,
        help_text="Relationship to the user (e.g., 'Spouse', 'Parent', 'Sibling')"
    )
    is_primary = models.BooleanField(
        default=False,
        help_text="Whether this is the primary emergency contact"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'users_family_contact'
        verbose_name = 'Family Contact'
        verbose_name_plural = 'Family Contacts'
        unique_together = ['user', 'phone']  # Prevent duplicate phone numbers per user
    
    def __str__(self):
        return f"{self.name} ({self.phone}) - {self.user.email if hasattr(self.user, 'email') else 'User'}"
    
    def save(self, *args, **kwargs):
        # Ensure only one primary contact per user
        if self.is_primary:
            FamilyContact.objects.filter(
                user=self.user,
                is_primary=True
            ).exclude(id=self.id).update(is_primary=False)
        
        # Check contact limits based on user's premium status
        if not self.pk:  # Only check on creation
            user = self.user
            is_premium = self._is_user_premium(user)
            current_count = FamilyContact.objects.filter(user=user).count()
            
            if not is_premium and current_count >= FREE_TIER_LIMITS['MAX_CONTACTS']:
                raise ValueError(
                    f"Free plan allows up to {FREE_TIER_LIMITS['MAX_CONTACTS']} emergency contacts. "
                    "Upgrade to Premium for unlimited contacts."
                )
        
        super().save(*args, **kwargs)
    
    @staticmethod
    def _is_user_premium(user):
        """Check if user has premium subscription."""
        # Check is_paid_user property if it exists
        if hasattr(user, 'is_paid_user') and user.is_paid_user:
            return True
        # Check is_premium property
        if hasattr(user, 'is_premium') and user.is_premium:
            return True
        # Check plantype
        if hasattr(user, 'plantype'):
            if user.plantype and user.plantype.lower() == 'premium':
                # Check if plan hasn't expired
                if hasattr(user, 'planexpiry') and user.planexpiry:
                    return user.planexpiry > timezone.now().date()
                return True
        return False


class CommunityMembership(models.Model):
    """
    Model for tracking user participation in communities.
    """
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='community_memberships',
        help_text="User who is a member of the community"
    )
    community_id = models.CharField(
        max_length=100,
        help_text="Unique identifier for the community"
    )
    community_name = models.CharField(
        max_length=200,
        help_text="Name of the community"
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'users_community_membership'
        verbose_name = 'Community Membership'
        verbose_name_plural = 'Community Memberships'
        unique_together = ['user', 'community_id']
    
    def __str__(self):
        return f"{self.user.name} - {self.community_name}"


class SOSEvent(models.Model):
    """
    Model for tracking SOS events triggered by users.
    Free: Basic SOS with location and SMS alerts
    Premium: Advanced features (audio/video recording, cloud backup, priority dispatch)
    """
    
    STATUS_CHOICES = [
        ('triggered', 'Triggered'),
        ('sms_sent', 'SMS Sent'),
        ('police_called', 'Police Called'),
        ('geofence_alerted', 'Geofence Alerted'),
        ('response_center_notified', 'Response Center Notified'),  # Premium only
        ('audio_recording', 'Audio Recording'),  # Premium only
        ('video_recording', 'Video Recording'),  # Premium only
        ('resolved', 'Resolved'),
    ]
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='sos_events',
        help_text="User who triggered the SOS"
    )
    # Use JSONField instead of PointField for location
    location = models.JSONField(
        null=True,
        blank=True,
        help_text="Location where SOS was triggered (longitude, latitude)"
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default='triggered',
        help_text="Current status of the SOS event"
    )
    triggered_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(
        blank=True,
        help_text="Additional notes about the SOS event"
    )
    # Track which admins, sub-admins, and security officers have read this SOS event
    read_by = models.ManyToManyField(
        User,
        related_name='read_sos_events',
        blank=True,
        help_text="Admins, sub-admins, and security officers who have read this SOS event"
    )
    # Track read timestamps (JSON field: {user_id: timestamp})
    read_timestamps = models.JSONField(
        default=dict,
        blank=True,
        help_text="Timestamps when each user read this SOS event. Format: {'user_id': 'ISO_timestamp'}"
    )

    class Meta:
        db_table = 'users_profile_sosevent'
        verbose_name = 'SOS Event'
        verbose_name_plural = 'SOS Events'
        ordering = ['-triggered_at']
    
    def __str__(self):
        user_email = self.user.email if hasattr(self.user, 'email') else 'User'
        return f"SOS Event - {user_email} at {self.triggered_at}"
    
    def mark_as_read(self, user):
        """
        Mark this SOS event as read by a user (admin/sub-admin/security officer).
        Returns True if newly marked, False if already read.
        """
        from django.utils import timezone
        
        if not user or not user.id:
            return False
        
        # Check if already read
        if self.read_by.filter(id=user.id).exists():
            return False
        
        # Add to read_by
        self.read_by.add(user)
        
        # Add timestamp
        if not isinstance(self.read_timestamps, dict):
            self.read_timestamps = {}
        
        self.read_timestamps[str(user.id)] = timezone.now().isoformat()
        self.save(update_fields=['read_timestamps'])
        
        return True
    
    def is_read_by(self, user):
        """Check if this SOS event has been read by the given user."""
        if not user or not user.id:
            return False
        return self.read_by.filter(id=user.id).exists()
    
    def get_read_timestamp(self, user):
        """Get the timestamp when the user read this SOS event."""
        if not user or not user.id:
            return None
        if isinstance(self.read_timestamps, dict):
            return self.read_timestamps.get(str(user.id))
        return None


class LiveLocationShare(models.Model):
    """
    Model for tracking live location sharing sessions.
    Free: 15-30 minutes max
    Premium: Unlimited
    Can be used by both regular users and security officers.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='live_location_sessions',
        null=True,
        blank=True,
        help_text="User sharing their location (null if security_officer is set)"
    )
    security_officer = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='officer_live_location_sessions',
        null=True,
        blank=True,
        limit_choices_to={'role': 'security_officer'},
        help_text="Security officer sharing their location (User with role='security_officer', null if user is set)"
    )
    shared_with = models.ManyToManyField(
        User,
        related_name='shared_locations',
        help_text="Users who can see this live location"
    )
    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(
        help_text="When the live sharing session expires"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether the session is currently active"
    )
    current_location = models.JSONField(
        null=True,
        blank=True,
        help_text="Current location (longitude, latitude)"
    )
    plan_type = models.CharField(
        max_length=20,
        blank=True,
        help_text="Plan type when session started (free/premium)"
    )
    stop_reason = models.CharField(
        max_length=30,
        blank=True,
        help_text="Reason session ended (user, limit, expired)"
    )
    share_token = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        help_text="Public token used to access the live location session"
    )
    last_broadcast_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of the last location update broadcast"
    )
    
    class Meta:
        db_table = 'users_live_location_share'
        verbose_name = 'Live Location Share'
        verbose_name_plural = 'Live Location Shares'
        ordering = ['-started_at']
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(user__isnull=False, security_officer__isnull=True) |
                    models.Q(user__isnull=True, security_officer__isnull=False)
                ),
                name='user_or_security_officer_required'
            )
        ]
    
    def __str__(self):
        if self.user:
            user_email = self.user.email if hasattr(self.user, 'email') else 'User'
            return f"Live Share - {user_email}"
        elif self.security_officer:
            officer_name = f"{self.security_officer.first_name} {self.security_officer.last_name}".strip() or self.security_officer.username
            return f"Live Share - {officer_name}"
        return "Live Share - Unknown"


class LiveLocationTrackPoint(models.Model):
    """
    Historical track points captured during a live location session.
    """
    share = models.ForeignKey(
        LiveLocationShare,
        related_name='track_points',
        on_delete=models.CASCADE,
        help_text="Live location session this point belongs to"
    )
    latitude = models.FloatField(help_text="Latitude component of the recorded point")
    longitude = models.FloatField(help_text="Longitude component of the recorded point")
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'users_live_location_track_point'
        verbose_name = 'Live Location Track Point'
        verbose_name_plural = 'Live Location Track Points'
        ordering = ['recorded_at']

    def __str__(self):
        return f"{self.share_id} @ {self.recorded_at}"


class CommunityAlert(models.Model):
    """
    Model for community alerts.
    Free: 500m radius
    Premium: Unlimited radius, verified responders
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='community_alerts',
        help_text="User who sent the alert"
    )
    message = models.TextField(
        help_text="Alert message"
    )
    location = models.JSONField(
        help_text="Location where alert was sent (longitude, latitude)"
    )
    radius_meters = models.IntegerField(
        default=500,
        help_text="Alert radius in meters"
    )
    sent_at = models.DateTimeField(auto_now_add=True)
    is_premium_alert = models.BooleanField(
        default=False,
        help_text="Whether this is a premium alert (reaches verified responders)"
    )
    
    class Meta:
        db_table = 'users_community_alert'
        verbose_name = 'Community Alert'
        verbose_name_plural = 'Community Alerts'
        ordering = ['-sent_at']
    
    def __str__(self):
        user_email = self.user.email if hasattr(self.user, 'email') else 'User'
        return f"Community Alert - {user_email} at {self.sent_at}"


class ChatGroup(models.Model):
    """
    Model for chat groups.
    """
    name = models.CharField(
        max_length=200,
        help_text="Name of the chat group"
    )
    description = models.TextField(
        blank=True,
        null=True,
        help_text="Description of the group"
    )
    members = models.ManyToManyField(
        User,
        related_name='chat_groups',
        help_text="Members of the chat group"
    )
    admin = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='admin_chat_groups',
        null=True,
        blank=True,
        help_text="Admin of the group (can be different from creator)"
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='created_chat_groups',
        help_text="User who created the group"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'users_chat_group'
        verbose_name = 'Chat Group'
        verbose_name_plural = 'Chat Groups'
        ordering = ['-updated_at']
        # Add unique constraint on name per creator (or globally if preferred)
        # For now, we'll check uniqueness in the view
    
    def __str__(self):
        return f"{self.name} ({self.members.count()} members)"


class ChatMessage(models.Model):
    """
    Model for chat messages.
    """
    group = models.ForeignKey(
        ChatGroup,
        on_delete=models.CASCADE,
        related_name='messages',
        help_text="Chat group this message belongs to"
    )
    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='sent_messages',
        help_text="User who sent the message"
    )
    text = models.TextField(
        blank=True,
        help_text="Message text content"
    )
    image = models.ImageField(
        upload_to='chat_images/',
        null=True,
        blank=True,
        help_text="Image attachment for the message"
    )
    file = models.FileField(
        upload_to='chat_files/',
        null=True,
        blank=True,
        help_text="File attachment for the message"
    )
    file_name = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Original file name"
    )
    file_size = models.IntegerField(
        null=True,
        blank=True,
        help_text="File size in bytes"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'users_chat_message'
        verbose_name = 'Chat Message'
        verbose_name_plural = 'Chat Messages'
        ordering = ['created_at']
    
    def __str__(self):
        sender_name = self.sender.name if hasattr(self.sender, 'name') else 'User'
        return f"{sender_name} in {self.group.name}: {self.text[:50]}"
