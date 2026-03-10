from django.contrib.auth.models import AbstractUser
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
import json
import logging

logger = logging.getLogger(__name__)


class Organization(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name = 'Organization'
        verbose_name_plural = 'Organizations'


class User(AbstractUser):
    ROLE_CHOICES = [
        ('SUPER_ADMIN', 'Super Admin'),
        ('SUB_ADMIN', 'Sub Admin'),
        ('USER', 'User'),
        ('security_officer', 'Security Officer'),
    ]
    
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='USER'
    )
    fcm_tokens = models.JSONField(
        default=list, 
        blank=True, 
        help_text="FCM device tokens for push notifications"
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users'
    )
    geofences = models.ManyToManyField(
        'Geofence',
        blank=True,
        related_name='associated_users',
        help_text='Geofences associated with this user for alert notifications'
    )
    phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text='Phone number or contact information'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.username} ({self.role})"


class Geofence(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    geofence_type = models.CharField(
        max_length=10,
        choices=[
            ('circle', 'Circle'),
            ('polygon', 'Polygon'),
        ],
        default='circle',
        help_text='Type of geofence: circle or polygon'
    )
    # Fields for circle geofences
    center_latitude = models.DecimalField(
        max_digits=10, 
        decimal_places=8, 
        null=True, 
        blank=True,
        help_text='Center latitude for circle geofences'
    )
    center_longitude = models.DecimalField(
        max_digits=11, 
        decimal_places=8, 
        null=True, 
        blank=True,
        help_text='Center longitude for circle geofences'
    )
    radius = models.IntegerField(
        null=True, 
        blank=True,
        help_text='Radius in meters for circle geofences'
    )
    # Fields for polygon geofences
    polygon_json = models.JSONField(help_text="GeoJSON polygon coordinates")
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='geofences'
    )
    active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_geofences'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Geofence'
        verbose_name_plural = 'Geofences'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.name} ({self.organization.name})"
    
    def get_polygon_coordinates(self):
        """Extract coordinates from GeoJSON polygon"""
        try:
            if isinstance(self.polygon_json, dict):
                if self.polygon_json.get('type') == 'Polygon':
                    return self.polygon_json.get('coordinates', [])
                elif self.polygon_json.get('type') == 'Feature':
                    geometry = self.polygon_json.get('geometry', {})
                    if geometry.get('type') == 'Polygon':
                        return geometry.get('coordinates', [])
            return []
        except (json.JSONDecodeError, AttributeError):
            return []
    
    def get_center_point(self):
        """Calculate center point of the polygon"""
        coordinates = self.get_polygon_coordinates()
        if not coordinates or not coordinates[0]:
            return None
        
        # Get the first ring of the polygon
        ring = coordinates[0]
        if not ring:
            return None
        
        # Calculate center
        # GeoJSON format is [longitude, latitude], so coord[0] is lon, coord[1] is lat
        lats = [coord[1] for coord in ring]
        lons = [coord[0] for coord in ring]
        
        center_lat = sum(lats) / len(lats)
        center_lon = sum(lons) / len(lons)
        
        # Return as [latitude, longitude] for frontend compatibility
        return [center_lat, center_lon]


class Alert(models.Model):
    ALERT_TYPES = [
        ('USER_SOS', 'User SOS Emergency'),
        ('OFFICER_ALERT', 'Officer Alert'),
        ('SYSTEM_ALERT', 'System Alert'),
        ('GEOFENCE_VIOLATION', 'Geofence Violation'),
        ('SECURITY_BREACH', 'Security Breach'),
    ]

    SEVERITY_CHOICES = [
        ('LOW', 'Low'),
        ('MEDIUM', 'Medium'),
        ('HIGH', 'High'),
        ('CRITICAL', 'Critical'),
    ]

    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('PENDING', 'Pending'),
        ('ACCEPTED', 'Accepted'),
        ('RESOLVED', 'Resolved'),
    ]

    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]

    # Who created this alert
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='alerts_created',
        help_text="User who created this alert"
    )

    # Alert type and metadata
    alert_type = models.CharField(
        max_length=20,
        choices=ALERT_TYPES,
        default='USER_SOS',
        help_text="Type of alert"
    )
    severity = models.CharField(
        max_length=10,
        choices=SEVERITY_CHOICES,
        default='MEDIUM'
    )
    priority = models.CharField(
        max_length=10,
        choices=PRIORITY_CHOICES,
        default='medium'
    )

    # Content
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    message = models.TextField(blank=True, null=True, help_text="Additional message content")

    # Location data (unified format)
    location = models.JSONField(
        null=True,
        blank=True,
        help_text="Location data: {'latitude': float, 'longitude': float, 'accuracy': float}"
    )

    # Geofence association (supports both single and multiple)
    geofence = models.ForeignKey(
        Geofence,
        on_delete=models.CASCADE,
        related_name='alerts',
        null=True,
        blank=True,
        help_text='Geofence associated with this alert'
    )

    # Status and resolution
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='ACTIVE'
    )
    is_resolved = models.BooleanField(default=False)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_alerts'
    )

    # Officer assignment (for officer alerts)
    assigned_officer = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_alerts',
        limit_choices_to={'role': 'security_officer'},
        help_text="Security officer assigned to this alert"
    )

    # Read tracking (like SOSEvent)
    read_by = models.ManyToManyField(
        User,
        related_name='read_alerts',
        blank=True,
        help_text="Users who have read this alert"
    )
    read_timestamps = models.JSONField(
        default=dict,
        blank=True,
        help_text="Timestamps when each user read this alert. Format: {'user_id': 'ISO_timestamp'}"
    )

    # Additional metadata
    metadata = models.JSONField(default=dict, blank=True)

    # Legacy fields (deprecated, but keeping for backward compatibility)
    geofences = models.ManyToManyField(
        Geofence,
        blank=True,
        related_name='legacy_alerts',
        help_text='Legacy multiple geofences field (deprecated, use geofence instead)'
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'users_alert'
        verbose_name = 'Alert'
        verbose_name_plural = 'Alerts'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['alert_type', 'status']),
            models.Index(fields=['geofence', 'created_at']),
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['assigned_officer', 'status']),
        ]

    def __str__(self):
        return f"{self.title} ({self.alert_type}) - {self.status}"

    def resolve(self, resolved_by_user):
        """Mark alert as resolved"""
        self.is_resolved = True
        self.status = 'RESOLVED'
        self.resolved_at = timezone.now()
        self.resolved_by = resolved_by_user
        self.save()

    def mark_as_read(self, user):
        """
        Mark this alert as read by a user.
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
        """Check if this alert has been read by the given user."""
        if not user or not user.id:
            return False
        return self.read_by.filter(id=user.id).exists()

    def get_read_timestamp(self, user):
        """Get the timestamp when the user read this alert."""
        if not user or not user.id:
            return None
        if isinstance(self.read_timestamps, dict):
            return self.read_timestamps.get(str(user.id))
        return None




class Incident(models.Model):
    INCIDENT_TYPES = [
        ('SECURITY_BREACH', 'Security Breach'),
        ('UNAUTHORIZED_ACCESS', 'Unauthorized Access'),
        ('SUSPICIOUS_ACTIVITY', 'Suspicious Activity'),
        ('EMERGENCY', 'Emergency'),
        ('MAINTENANCE', 'Maintenance'),
        ('OTHER', 'Other'),
    ]
    
    SEVERITY_CHOICES = [
        ('LOW', 'Low'),
        ('MEDIUM', 'Medium'),
        ('HIGH', 'High'),
        ('CRITICAL', 'Critical'),
    ]
    
    geofence = models.ForeignKey(
        Geofence,
        on_delete=models.CASCADE,
        related_name='incidents'
    )
    officer = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reported_incidents',
        limit_choices_to={'role': 'security_officer'},
        help_text="Security officer who reported this incident (User with role='security_officer')"
    )
    incident_type = models.CharField(
        max_length=20,
        choices=INCIDENT_TYPES,
        default='SUSPICIOUS_ACTIVITY'
    )
    severity = models.CharField(
        max_length=10,
        choices=SEVERITY_CHOICES,
        default='MEDIUM'
    )
    title = models.CharField(max_length=200)
    details = models.TextField()
    location = models.JSONField(
        default=dict,
        help_text="GPS coordinates and location details"
    )
    is_resolved = models.BooleanField(default=False)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_incidents'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Incident'
        verbose_name_plural = 'Incidents'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.title} ({self.severity})"
    
    def resolve(self, resolved_by_user):
        """Mark incident as resolved"""
        self.is_resolved = True
        self.resolved_at = timezone.now()
        self.resolved_by = resolved_by_user
        self.save()


class Notification(models.Model):
    NOTIFICATION_TYPES = [
        ('NORMAL', 'Normal'),
        ('EMERGENCY', 'Emergency'),
    ]
    
    TARGET_TYPES = [
        ('ALL_OFFICERS', 'All Officers'),
        ('GEOFENCE_OFFICERS', 'Geofence Officers'),
        ('SPECIFIC_OFFICERS', 'Specific Officers'),
        ('SUB_ADMIN', 'Sub Admin Only'),
    ]
    
    notification_type = models.CharField(
        max_length=10,
        choices=NOTIFICATION_TYPES,
        default='NORMAL'
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    target_type = models.CharField(
        max_length=20,
        choices=TARGET_TYPES,
        default='ALL_OFFICERS'
    )
    target_geofence = models.ForeignKey(
        Geofence,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications'
    )
    target_geofences = models.JSONField(
        default=list,
        blank=True,
        help_text='List of geofence IDs for multi-geofence notifications'
    )
    target_officers = models.ManyToManyField(
        User,
        blank=True,
        related_name='received_notifications',
        limit_choices_to={'role': 'security_officer'},
        help_text="Security officers who should receive this notification (Users with role='security_officer')"
    )
    read_users = models.ManyToManyField(
        User,
        blank=True,
        related_name='read_notifications',
        help_text='Users who have read this notification'
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    is_sent = models.BooleanField(default=False)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='created_notifications',
        limit_choices_to={'role': 'SUB_ADMIN'}
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.title} ({self.notification_type})"
    
    def mark_as_sent(self):
        """Mark notification as sent"""
        self.is_sent = True
        self.sent_at = timezone.now()
        self.save()


class GlobalReport(models.Model):
    REPORT_TYPES = [
        ('GEOFENCE_ANALYTICS', 'Geofence Analytics'),
        ('USER_ACTIVITY', 'User Activity'),
        ('ALERT_SUMMARY', 'Alert Summary'),
        ('SYSTEM_HEALTH', 'System Health'),
        ('CUSTOM', 'Custom Report'),
    ]
    
    report_type = models.CharField(
        max_length=20,
        choices=REPORT_TYPES,
        default='GEOFENCE_ANALYTICS'
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    date_range_start = models.DateTimeField()
    date_range_end = models.DateTimeField()
    metrics = models.JSONField(default=dict)
    file_path = models.CharField(max_length=500, blank=True, null=True)
    generated_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='generated_reports'
    )
    is_generated = models.BooleanField(default=False)
    generated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Global Report'
        verbose_name_plural = 'Global Reports'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.title} ({self.report_type})"
    
    def mark_as_generated(self, file_path=None):
        """Mark report as generated"""
        self.is_generated = True
        self.generated_at = timezone.now()
        if file_path:
            self.file_path = file_path
        self.save()


class PromoCode(models.Model):
    code = models.CharField(max_length=50, unique=True, help_text="Unique promo code")
    discount_percentage = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Discount percentage (0-100)"
    )
    expiry_date = models.DateTimeField(help_text="Expiry date and time for the promo code")
    is_active = models.BooleanField(default=True, help_text="Whether the promo code is active")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Promo Code'
        verbose_name_plural = 'Promo Codes'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.code} ({self.discount_percentage}%)"
    
    def is_valid(self):
        """Check if promo code is valid (active and not expired)"""
        return self.is_active and timezone.now() < self.expiry_date


class DiscountEmail(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('SENT', 'Sent'),
    ]
    
    email = models.EmailField(help_text="Email address to send discount to")
    discount_code = models.ForeignKey(
        PromoCode,
        on_delete=models.CASCADE,
        related_name='discount_emails',
        help_text="Promo code to send"
    )
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='PENDING',
        help_text="Status of the discount email"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Discount Email'
        verbose_name_plural = 'Discount Emails'
        ordering = ['-created_at']
        unique_together = ['email', 'discount_code']
    
    def __str__(self):
        return f"{self.email} - {self.discount_code.code} ({self.status})"
    
    def mark_as_sent(self):
        """Mark discount email as sent"""
        self.status = 'SENT'
        self.save()
    
    def send_email(self):
        """Send discount email to user"""
        from django.core.mail import send_mail
        from django.conf import settings
        from django.template.loader import render_to_string
        
        try:
            subject = f"Special Discount Code: {self.discount_code.code}"
            
            # Create email message with discount details
            message = f"""
Hello,

We're excited to offer you an exclusive discount!

Use code: {self.discount_code.code}
Discount: {self.discount_code.discount_percentage}% OFF

This discount code expires on: {self.discount_code.expiry_date.strftime('%B %d, %Y at %I:%M %p')}

Thank you for being part of SafeTNet!

Best regards,
The SafeTNet Team
            """
            
            # Send email
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[self.email],
                fail_silently=False,
            )
            
            # Mark as sent
            self.mark_as_sent()
            return True
            
        except Exception as e:
            logger.error(f"Failed to send discount email to {self.email}: {str(e)}")
            return False


class UserReply(models.Model):
    email = models.EmailField(help_text="Email address of the user who replied")
    message = models.TextField(help_text="Reply message from the user")
    date_time = models.DateTimeField(auto_now_add=True, help_text="Date and time when the reply was received")
    # Link to SOS event if this reply is related to an SOS alert
    sos_event = models.ForeignKey(
        'users_profile.SOSEvent',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='user_replies',
        help_text="Related SOS event if this reply is about an SOS alert",
        db_constraint=True
    )
    # Track which admins, sub-admins, and security officers have read this reply
    read_by = models.ManyToManyField(
        User,
        related_name='read_user_replies',
        blank=True,
        help_text="Admins, sub-admins, and security officers who have read this reply"
    )
    # Track read timestamps (JSON field: {user_id: timestamp})
    read_timestamps = models.JSONField(
        default=dict,
        blank=True,
        help_text="Timestamps when each user read this reply. Format: {'user_id': 'ISO_timestamp'}"
    )
    
    class Meta:
        verbose_name = 'User Reply'
        verbose_name_plural = 'User Replies'
        ordering = ['-date_time']
    
    def __str__(self):
        return f"{self.email} - {self.date_time.strftime('%Y-%m-%d %H:%M')}"
    
    def mark_as_read(self, user):
        """
        Mark this reply as read by a user (admin/sub-admin/security officer).
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
        """Check if this reply has been read by the given user."""
        if not user or not user.id:
            return False
        return self.read_by.filter(id=user.id).exists()
    
    def get_read_timestamp(self, user):
        """Get the timestamp when the user read this reply."""
        if not user or not user.id:
            return None
        if isinstance(self.read_timestamps, dict):
            return self.read_timestamps.get(str(user.id))
        return None


class PasswordResetOTP(models.Model):
    """Model to store OTP for password reset"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_reset_otps')
    otp = models.CharField(max_length=6, help_text="6-digit OTP code")
    email = models.EmailField(help_text="Email address for verification")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(help_text="OTP expiration time")
    is_used = models.BooleanField(default=False, help_text="Whether OTP has been used")
    
    class Meta:
        verbose_name = 'Password Reset OTP'
        verbose_name_plural = 'Password Reset OTPs'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"OTP for {self.email} - {self.otp}"
    
    def is_valid(self):
        """Check if OTP is valid (not used and not expired)"""
        return not self.is_used and timezone.now() < self.expires_at


class UserDetails(models.Model):
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('INACTIVE', 'Inactive'),
        ('SUSPENDED', 'Suspended'),
    ]
    
    username = models.CharField(max_length=150, unique=True, help_text="Username of the user")
    price = models.DecimalField(max_digits=10, decimal_places=2, help_text="Price associated with the user")
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='ACTIVE',
        help_text="Status of the user"
    )
    date = models.DateTimeField(auto_now_add=True, help_text="Date when the user details were created")
    
    class Meta:
        verbose_name = 'User Detail'
        verbose_name_plural = 'User Details'
        ordering = ['-date']
    
    def __str__(self):
        return f"{self.username} - {self.status} (${self.price})"


class OfficerGeofenceAssignment(models.Model):
    """Model to track geofence assignments to security officers"""
    
    officer = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        limit_choices_to={'role': 'security_officer'},
        related_name='geofence_assignments'
    )
    
    geofence = models.ForeignKey(
        'Geofence',
        on_delete=models.CASCADE,
        related_name='officer_assignments'
    )
    
    assigned_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'role__in': ['SUPER_ADMIN', 'SUB_ADMIN']},
        related_name='made_geofence_assignments'
    )
    
    assigned_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'users_officer_geofence_assignment'
        unique_together = ['officer', 'geofence', 'is_active']
        ordering = ['-assigned_at']
        indexes = [
            models.Index(fields=['officer', 'is_active']),
            models.Index(fields=['geofence', 'is_active']),
            models.Index(fields=['assigned_at']),
        ]
    
    def __str__(self):
        return f"{self.officer.username} -> {self.geofence.name} ({'Active' if self.is_active else 'Inactive'})"