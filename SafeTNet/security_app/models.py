from django.db import models
from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from users.models import Geofence


User = get_user_model()


class SOSAlert(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('resolved', 'Resolved'),
    ]

    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]

    ALERT_TYPE_CHOICES = [
        ('emergency', 'Emergency'),
        ('security', 'Security'),
        ('general', 'General'),
        ('area_user_alert', 'Area User Alert'),
    ]

    CREATED_BY_ROLE_CHOICES = [
        ('USER', 'User'),
        ('OFFICER', 'Officer'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='security_app_sos_alerts'
    )
    source_sos_event = models.OneToOneField(
        "users_profile.SOSEvent",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="linked_alert"
    )
    created_by_role = models.CharField(
        max_length=10,
        choices=CREATED_BY_ROLE_CHOICES,
        help_text="Role of the user who created this alert"
    )
    geofence = models.ForeignKey(
        Geofence,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sos_alerts'
    )
    alert_type = models.CharField(
        max_length=20, 
        choices=ALERT_TYPE_CHOICES, 
        default='security'
    )
    message = models.TextField(blank=True, default='')
    description = models.TextField(blank=True, default='')
    location_lat = models.FloatField()
    location_long = models.FloatField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    assigned_officer = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_security_app_alerts',
        limit_choices_to={'role': 'security_officer'},
        help_text="Security officer assigned to this SOS alert (User with role='security_officer')"
    )
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Area-based alert specific fields
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Expiry time for area-based alerts"
    )
    affected_users_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of users affected by this area-based alert"
    )
    notification_sent = models.BooleanField(
        default=False,
        help_text="Whether push notifications have been sent for this alert"
    )
    notification_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when notifications were sent"
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'SOS Alert'
        verbose_name_plural = 'SOS Alerts'

    def __str__(self):
        return f"SOSAlert #{self.id} ({self.status})"


class Case(models.Model):
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('accepted', 'Accepted'),
        ('resolved', 'Resolved'),
    ]

    sos_alert = models.ForeignKey(
        SOSAlert,
        on_delete=models.CASCADE,
        related_name='cases'
    )
    officer = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_cases',
        limit_choices_to={'role': 'security_officer'},
        help_text="Security officer assigned to this case (User with role='security_officer')"
    )
    description = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='open')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'Case'
        verbose_name_plural = 'Cases'

    def __str__(self):
        return f"Case #{self.id} for SOS {self.sos_alert_id} [{self.status}]"


class OfficerProfile(models.Model):
    """Lightweight profile for security officer runtime attributes."""
    officer = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='officer_profile',
        limit_choices_to={'role': 'security_officer'},
        help_text="Security officer user (User with role='security_officer')"
    )
    phone_number = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text='Phone number or mobile phone for the security officer'
    )
    on_duty = models.BooleanField(default=True)
    last_latitude = models.FloatField(null=True, blank=True)
    last_longitude = models.FloatField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    battery_level = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        officer_name = f"{self.officer.first_name} {self.officer.last_name}".strip() or self.officer.username
        return f"Profile({officer_name}) on_duty={self.on_duty}"

    def update_location(self, latitude=None, longitude=None, battery_level=None):
        """Convenience helper for officer apps to update runtime telemetry."""
        if latitude is not None and longitude is not None:
            self.last_latitude = latitude
            self.last_longitude = longitude
            self.last_seen_at = timezone.now()
        if battery_level is not None:
            self.battery_level = max(0, min(100, int(battery_level)))
        self.save(update_fields=['last_latitude', 'last_longitude', 'last_seen_at', 'battery_level', 'updated_at'])


class Incident(models.Model):
    STATUS_CHOICES = [
        ('resolved', 'Resolved'),
        ('manual', 'Manual'),
    ]

    officer = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='security_app_incidents',
        limit_choices_to={'role': 'security_officer'},
        help_text="Security officer who reported this incident (User with role='security_officer')"
    )
    sos_alert = models.ForeignKey(
        SOSAlert,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incidents'
    )
    case = models.ForeignKey(
        Case,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incidents'
    )
    description = models.TextField(blank=True, null=True)
    location_lat = models.FloatField(blank=True, null=True)
    location_long = models.FloatField(blank=True, null=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='resolved')
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Incident'
        verbose_name_plural = 'Incidents'

    def __str__(self):
        return f"Incident #{self.id} ({self.status})"


class Notification(models.Model):
    TYPE_CHOICES = [
        ('sos_alert', 'SOS Alert'),
        ('case_assigned', 'Case Assigned'),
        ('case_resolved', 'Case Resolved'),
        ('system', 'System'),
    ]

    officer = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='security_app_notifications',
        limit_choices_to={'role': 'security_officer'},
        help_text="Security officer who should receive this notification (User with role='security_officer')"
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    notification_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='system')
    is_read = models.BooleanField(default=False)
    sos_alert = models.ForeignKey(
        SOSAlert,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications'
    )
    case = models.ForeignKey(
        Case,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'

    def __str__(self):
        officer_name = f"{self.officer.first_name} {self.officer.last_name}".strip() or self.officer.username if self.officer else "Unknown"
        return f"Notification for {officer_name}: {self.title}"

    def mark_as_read(self):
        from django.utils import timezone
        self.is_read = True
        self.read_at = timezone.now()
        self.save(update_fields=['is_read', 'read_at'])


class UserLocation(models.Model):
    """
    Stores the last known GPS coordinates of users for area-based alert targeting.
    This model enables precise geographic targeting of evacuation alerts.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='last_location',
        help_text="User whose location is being tracked"
    )
    latitude = models.DecimalField(
        max_digits=10,
        decimal_places=8,
        help_text="Last known latitude of the user"
    )
    longitude = models.DecimalField(
        max_digits=11,
        decimal_places=8,
        help_text="Last known longitude of the user"
    )
    accuracy = models.FloatField(
        null=True,
        blank=True,
        help_text="GPS accuracy in meters"
    )
    altitude = models.FloatField(
        null=True,
        blank=True,
        help_text="Altitude in meters above sea level"
    )
    speed = models.FloatField(
        null=True,
        blank=True,
        help_text="Speed in meters per second"
    )
    heading = models.FloatField(
        null=True,
        blank=True,
        help_text="Heading in degrees (0-360)"
    )
    location_timestamp = models.DateTimeField(
        help_text="Timestamp when the GPS location was recorded"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'User Location'
        verbose_name_plural = 'User Locations'
        ordering = ['-updated_at']

    def __str__(self):
        return f"UserLocation for {self.user.username}: {self.latitude}, {self.longitude}"

    def update_location(self, latitude, longitude, accuracy=None, altitude=None, speed=None, heading=None, location_timestamp=None):
        """Update user's GPS location with new coordinates."""
        self.latitude = latitude
        self.longitude = longitude
        if accuracy is not None:
            self.accuracy = accuracy
        if altitude is not None:
            self.altitude = altitude
        if speed is not None:
            self.speed = speed
        if heading is not None:
            self.heading = heading
        if location_timestamp is not None:
            self.location_timestamp = location_timestamp
        else:
            from django.utils import timezone
            self.location_timestamp = timezone.now()
        self.save()

    def is_location_fresh(self, max_age_hours=24):
        """Check if the location data is fresh enough for alert targeting."""
        from django.utils import timezone
        from datetime import timedelta
        
        if not self.location_timestamp:
            return False
        
        age = timezone.now() - self.location_timestamp
        return age.total_seconds() <= (max_age_hours * 3600)


class LiveLocation(models.Model):
    """
    Live location tracking for SOSAlert.
    One location per alert, updated in-place.
    """
    sos_alert = models.OneToOneField(
        SOSAlert,
        on_delete=models.CASCADE,
        related_name='live_location',
        help_text="SOS alert this location belongs to"
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='alert_live_locations',
        help_text="Alert creator who owns this location"
    )
    latitude = models.FloatField(help_text="Current latitude")
    longitude = models.FloatField(help_text="Current longitude")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'SOS Alert Live Location'
        verbose_name_plural = 'SOS Alert Live Locations'

    def __str__(self):
        return f"LiveLocation for Alert #{self.sos_alert_id}"


class OfficerAlert(models.Model):
    """
    Alerts/broadcasts sent by security officers to users.
    This is what officers send to warn/inform users.
    """
    ALERT_TYPES = (
        ('warning', 'Warning'),
        ('emergency', 'Emergency'),
        ('info', 'Information'),
        ('all_clear', 'All Clear'),
    )
    
    officer = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='sent_alerts',
        help_text="Security officer who sent the alert"
    )
    
    # Target users (can be specific users or broadcast to all)
    users = models.ManyToManyField(
        User, 
        related_name='received_alerts', 
        blank=True,
        help_text="Specific users. Leave empty for broadcast to all."
    )
    
    alert_type = models.CharField(max_length=20, choices=ALERT_TYPES, default='info')
    title = models.CharField(max_length=200)
    message = models.TextField()
    location = models.CharField(max_length=255, blank=True, null=True)
    latitude = models.FloatField(blank=True, null=True)
    longitude = models.FloatField(blank=True, null=True)
    
    is_broadcast = models.BooleanField(
        default=False,
        help_text="If True, alert is sent to all users"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-created_at']
        
    def __str__(self):
        return f"{self.alert_type.upper()}: {self.title}"


class AlertRead(models.Model):
    """Track which users have read which alerts"""
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    officer_alert = models.ForeignKey(
        OfficerAlert, 
        on_delete=models.CASCADE, 
        blank=True, 
        null=True
    )
    read_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['user', 'officer_alert']


class DutySession(models.Model):
    """Tracks security officer duty sessions for active hours calculation."""
    officer = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='duty_sessions',
        limit_choices_to={'role': 'security_officer'}
    )
    start_time = models.DateTimeField(auto_now_add=True)
    end_time = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-start_time']
        verbose_name = 'Duty Session'
        verbose_name_plural = 'Duty Sessions'
    
    def __str__(self):
        return f"Session of {self.officer.username} (Active: {self.is_active})"
    
    def end_session(self):
        """End the current session."""
        from django.utils import timezone
        self.end_time = timezone.now()
        self.is_active = False
        self.save(update_fields=['end_time', 'is_active'])

    @property
    def duration_hours(self):
        """Get duration of this session in hours."""
        from django.utils import timezone
        end = self.end_time or timezone.now()
        delta = end - self.start_time
        return delta.total_seconds() / 3600.0