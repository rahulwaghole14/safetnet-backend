import logging
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import SOSAlert, Case, Incident, OfficerProfile, Notification, LiveLocation, OfficerAlert, AlertRead, UserLocation

from users.models import Geofence
import math

User = get_user_model()
logger = logging.getLogger(__name__)


class SOSAlertSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source='user.username', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    geofence_name = serializers.CharField(source='geofence.name', read_only=True)
    assigned_officer_name = serializers.SerializerMethodField()
    created_by_role = serializers.SerializerMethodField()
    
    def get_assigned_officer_name(self, obj):
        if obj.assigned_officer:
            name = f"{obj.assigned_officer.first_name} {obj.assigned_officer.last_name}".strip()
            return name or obj.assigned_officer.username
        return None
    
    def get_created_by_role(self, obj):
        """Ensure created_by_role always has a value"""
        if obj.created_by_role:
            return obj.created_by_role
            
        # Fallback logic based on user role if field is not set
        if hasattr(obj.user, 'role') and obj.user.role == 'security_officer':
            return 'OFFICER'
            
        return 'USER'

    def update(self, instance, validated_data):
        """Apply officer field restrictions and auto-assign officer on acceptance"""
        request = self.context.get('request')
        user = request.user if request and hasattr(request, 'user') else None
        
        # 1. AUTO-ASSIGN OFFICER: If status is being changed to 'accepted' and no officer assigned
        if (user and 
            user.role == 'security_officer' and 
            validated_data.get('status') == 'accepted' and 
            not instance.assigned_officer):
            
            logger.info(f"👮 Auto-assigning officer {user.username} to alert {instance.id}")
            validated_data['assigned_officer'] = user

        # 2. RESTRICTIONS: Only apply restrictions for security officers updating USER-created alerts
        if (user and 
            user.role == 'security_officer' and
            instance and 
            hasattr(instance, 'created_by_role') and 
            instance.created_by_role == 'USER'):
            
            # Make user-provided fields read-only for officers updating USER-created alerts
            user_fields = ['message', 'description', 'location_lat', 'location_long']
            for field in user_fields:
                if field in validated_data:
                    # Allow the update if the field value is the same (preventing false errors)
                    if getattr(instance, field) != validated_data[field]:
                        logger.warning(f"⚠️ Officer {user.username} tried to modify restricted field '{field}' on alert {instance.id}")
                        raise serializers.ValidationError({
                            field: f"Security officers cannot modify {field} on USER-created alerts"
                        })
        
        return super().update(instance, validated_data)


    class Meta:
        model = SOSAlert
        fields = (
            'id', 'user', 'user_username', 'user_email', 'geofence', 'geofence_name',
            'alert_type', 'message', 'description', 'location_lat', 'location_long', 'status', 'priority',
            'assigned_officer', 'assigned_officer_name', 'created_by_role', 'created_at', 'updated_at',
            # Area-based alert fields
            'expires_at', 'affected_users_count', 'notification_sent', 'notification_sent_at'
        )
        read_only_fields = ('id', 'user', 'user_username', 'user_email', 'created_by_role', 'created_at', 'updated_at', 
                           'affected_users_count', 'notification_sent', 'notification_sent_at')


class SOSAlertCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SOSAlert
        fields = (
            'id', 'alert_type', 'message', 'description', 'geofence', 
            'location_lat', 'location_long', 'priority', 'status', 'created_at',
            # Area-based alert fields
            'expires_at'
        )
        read_only_fields = ('id', 'status', 'created_at')

    def validate_alert_type(self, value):
        """Validate alert type is one of the allowed choices."""
        valid_types = [choice[0] for choice in SOSAlert.ALERT_TYPE_CHOICES]
        if value not in valid_types:
            raise serializers.ValidationError(f"Invalid alert type. Must be one of: {valid_types}")
        return value

    def validate_expires_at(self, value):
        """Validate expiry time for area-based alerts."""
        if value is None:
            return value
        
        from django.utils import timezone
        if value <= timezone.now():
            raise serializers.ValidationError("Expiry time cannot be in the past.")
        
        return value

    def validate(self, attrs):
        """Cross-field validation for alerts based on user role."""
        request = self.context.get("request")
        user = request.user if request else None

        alert_type = attrs.get('alert_type')
        location_lat = attrs.get('location_lat')
        location_long = attrs.get('location_long')
        expires_at = attrs.get('expires_at')

        # If alert is from normal user → require location
        if user and hasattr(user, 'role') and user.role == "user":
            if not location_lat or not location_long:
                raise serializers.ValidationError({
                    "location": "User alerts require location."
                })

        # If alert is area based → require expiry
        if alert_type == 'area_user_alert' and not expires_at:
            raise serializers.ValidationError({
                'expires_at': 'Expiry time is required for area-based alerts.'
            })

        # Regular alerts should not have expiry time
        if alert_type != 'area_user_alert' and expires_at:
            raise serializers.ValidationError({
                'expires_at': 'Expiry time is only allowed for area-based alerts.'
            })

        # Validate GPS coordinates for area-based alerts
        if alert_type == 'area_user_alert':
            # Area alerts use geofence targeting, GPS is optional
            # Set default coordinates if not provided
            if not attrs.get('location_lat'):
                attrs['location_lat'] = 0.0
            if not attrs.get('location_long'):
                attrs['location_long'] = 0.0

        return attrs

    def create(self, validated_data):
        """
        Create alert with backend-authoritative logic.
        For area-based alerts, the backend handles all geofence and user targeting.
        """
        request_user = self.context['request'].user
        validated_data['user'] = request_user
        
        # Set created_by_role based on user role
        if hasattr(request_user, 'role') and request_user.role == 'security_officer':
            validated_data['created_by_role'] = 'OFFICER'
        else:
            validated_data['created_by_role'] = 'USER'
        
        # For area-based alerts, don't auto-assign geofence - backend will handle it
        if validated_data.get('alert_type') == 'area_user_alert':
            # Backend will determine geofence assignment based on officer's assigned areas
            logger.info(f"🚨 Creating area-based alert, backend will handle geofence assignment")
        else:
            # Regular alerts: maintain existing geofence assignment logic
            officer = request_user
            validated_data['assigned_officer'] = officer
            
            # Auto-assign geofence if not provided (existing logic)
            if not validated_data.get('geofence'):
                if officer.geofences.exists():
                    validated_data['geofence'] = officer.geofences.first()
                    logger.info(f"✅ Assigned geofence: {validated_data['geofence'].name}")
                else:
                    logger.warning("⚠️ Officer has no geofences assigned")
        
        return super().create(validated_data)


class CaseSerializer(serializers.ModelSerializer):
    sos_user_username = serializers.CharField(source='sos_alert.user.username', read_only=True)
    officer_name = serializers.SerializerMethodField()
    
    def get_officer_name(self, obj):
        if obj.officer:
            name = f"{obj.officer.first_name} {obj.officer.last_name}".strip()
            return name or obj.officer.username
        return None
    sos_alert_status = serializers.CharField(source='sos_alert.status', read_only=True)

    class Meta:
        model = Case
        fields = (
            'id', 'sos_alert', 'sos_user_username', 'officer', 'officer_name',
            'description', 'status', 'sos_alert_status', 'updated_at'
        )
        read_only_fields = ('id', 'updated_at')


class CaseCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Case
        fields = ('sos_alert', 'description')

    def create(self, validated_data):
        # Auto-assign the current user (who must be a security officer)
        request_user = self.context['request'].user
        if request_user.role == 'security_officer':
            validated_data['officer'] = request_user
        return super().create(validated_data)


class CaseUpdateStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Case
        fields = ('status', 'description')

    def validate_status(self, value):
        if value not in dict(Case.STATUS_CHOICES):
            raise serializers.ValidationError('Invalid status value.')
        return value


class IncidentSerializer(serializers.ModelSerializer):
    officer_name = serializers.SerializerMethodField()
    
    def get_officer_name(self, obj):
        if obj.officer:
            name = f"{obj.officer.first_name} {obj.officer.last_name}".strip()
            return name or obj.officer.username
        return None
    sos_status = serializers.CharField(source='sos_alert.status', read_only=True)

    class Meta:
        model = Incident
        fields = (
            'id', 'officer', 'officer_name', 'sos_alert', 'case', 'description',
            'location_lat', 'location_long', 'status', 'sos_status', 'timestamp'
        )
        read_only_fields = ('id', 'timestamp')


class OfficerProfileSerializer(serializers.ModelSerializer):
    officer_name = serializers.SerializerMethodField()
    # Writable fields that map to User model
    phone = serializers.CharField(
        required=False,
        allow_blank=False,
        max_length=20,
        write_only=True,
        help_text='Phone number (updates User.phone field)'
    )
    name = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
        help_text='Full name (will split into first_name and last_name)'
    )
    first_name = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=150,
        write_only=True
    )
    last_name = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=150,
        write_only=True
    )
    email = serializers.EmailField(
        required=False,
        allow_blank=True,
        write_only=True
    )
    
    def get_officer_name(self, obj):
        if obj.officer:
            name = f"{obj.officer.first_name} {obj.officer.last_name}".strip()
            return name or obj.officer.username
        return None
    officer_phone = serializers.SerializerMethodField()
    officer_geofence = serializers.SerializerMethodField()
    
    def get_officer_phone(self, obj):
        """
        Return phone number from user.mobile or user.phone if available.
        Priority: user.mobile > user.phone > OfficerProfile.phone_number > email
        Only return email if no phone number exists or if the phone field contains an email.
        """
        if not obj.officer:
            return None
        
        # Priority 1: Check if user has mobile field (if it exists)
        mobile = getattr(obj.officer, 'mobile', None)
        if mobile and mobile.strip() and '@' not in mobile:
            return mobile.strip()
        
        # Priority 2: Check user.phone field
        phone = getattr(obj.officer, 'phone', None)
        if phone and phone.strip():
            # Check if phone is actually an email (contains @)
            if '@' not in phone:
                return phone.strip()
        
        # Priority 3: Check OfficerProfile.phone_number
        if hasattr(obj, 'phone_number') and obj.phone_number:
            phone_num = obj.phone_number.strip()
            if phone_num and '@' not in phone_num:
                return phone_num
        
        # Fallback to email if no valid phone number found
        return obj.officer.email if obj.officer.email else None
    
    def get_officer_geofence(self, obj):
        # Get the first geofence from User.geofences ManyToManyField
        if obj.officer and obj.officer.geofences.exists():
            return obj.officer.geofences.first().name
        return None
    
    def validate_phone(self, value):
        """Validate phone number - must be non-empty string"""
        if value is not None:
            value = value.strip()
            if value == '':
                raise serializers.ValidationError("Phone number cannot be empty.")
        return value
    
    def update(self, instance, validated_data):
        """
        Update both OfficerProfile and User model.
        User model fields (phone, first_name, last_name, email) are updated directly.
        """
        # Extract User model fields from validated_data
        phone = validated_data.pop('phone', None)
        name = validated_data.pop('name', None)
        first_name = validated_data.pop('first_name', None)
        last_name = validated_data.pop('last_name', None)
        email = validated_data.pop('email', None)
        
        # Handle 'name' field - split into first_name and last_name if provided
        if name is not None:
            name = name.strip()
            if name:
                name_parts = name.split(' ', 1)
                first_name = name_parts[0]
                last_name = name_parts[1] if len(name_parts) > 1 else ''
        
        # Update OfficerProfile fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update User model fields
        if instance.officer:
            user = instance.officer
            update_fields = []
            
            if phone is not None:
                user.phone = phone
                update_fields.append('phone')
            
            if first_name is not None:
                user.first_name = first_name
                update_fields.append('first_name')
            
            if last_name is not None:
                user.last_name = last_name
                update_fields.append('last_name')
            
            if email is not None:
                user.email = email
                update_fields.append('email')
            
            if update_fields:
                user.save(update_fields=update_fields)
        
        return instance

    class Meta:
        model = OfficerProfile
        fields = (
            'officer',
            'officer_name',
            'officer_phone',
            'officer_geofence',
            'phone',
            'name',
            'first_name',
            'last_name',
            'email',
            'on_duty',
            'last_latitude',
            'last_longitude',
            'last_seen_at',
            'battery_level',
            'updated_at',
        )
        read_only_fields = (
            'officer',
            'officer_name',
            'officer_geofence',
            'last_seen_at',
            'updated_at',
        )


class NotificationSerializer(serializers.ModelSerializer):
    officer_name = serializers.SerializerMethodField()
    
    def get_officer_name(self, obj):
        if obj.officer:
            name = f"{obj.officer.first_name} {obj.officer.last_name}".strip()
            return name or obj.officer.username
        return None
    sos_alert_id = serializers.IntegerField(source='sos_alert.id', read_only=True)
    case_id = serializers.IntegerField(source='case.id', read_only=True)

    class Meta:
        model = Notification
        fields = (
            'id', 'officer', 'officer_name', 'title', 'message', 'notification_type',
            'is_read', 'sos_alert', 'sos_alert_id', 'case', 'case_id',
            'created_at', 'read_at'
        )
        read_only_fields = ('id', 'officer', 'created_at', 'read_at')


class NotificationAcknowledgeSerializer(serializers.Serializer):
    notification_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of notification IDs to mark as read"
    )


class GeofenceSerializer(serializers.ModelSerializer):
    """Serializer for Geofence model for security officers"""
    polygon_json = serializers.SerializerMethodField()
    center_point = serializers.SerializerMethodField()
    radius = serializers.SerializerMethodField()
    area_size = serializers.SerializerMethodField()
    active_users_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Geofence
        fields = [
            'id',
            'name',
            'description',
            'polygon_json',
            'center_point',
            'radius',
            'area_size',
            'active_users_count',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'polygon_json', 'center_point', 'radius', 'area_size', 'active_users_count']
    
    def get_polygon_json(self, obj):
        """Convert GeoJSON polygon to simple array format [[lat, lon], [lat, lon], ...]"""
        try:
            coordinates = obj.get_polygon_coordinates()
            if not coordinates or not coordinates[0]:
                return []
            
            # GeoJSON format: coordinates[0] is the outer ring
            ring = coordinates[0]
            # GeoJSON stores as [lon, lat], convert to [lat, lon] for frontend
            polygon_array = [[coord[1], coord[0]] for coord in ring]
            return polygon_array
        except Exception:
            return []
    
    def get_center_point(self, obj):
        """Get center point of the polygon"""
        center = obj.get_center_point()
        if center:
            # Convert from [lat, lon] to [lat, lon] format (already correct)
            return center
        return None
    
    def get_radius(self, obj):
        """Calculate approximate radius in meters"""
        # This is a placeholder - radius calculation for polygon is complex
        # For now, return None as polygon geofences don't have a simple radius
        return None
    
    def get_area_size(self, obj):
        """Calculate area size in square kilometers"""
        try:
            coordinates = obj.get_polygon_coordinates()
            if not coordinates or not coordinates[0]:
                return None
            
            ring = coordinates[0]
            if len(ring) < 3:
                return None
            
            # Convert GeoJSON [lon, lat] to [lat, lon] for calculation
            points = [[coord[1], coord[0]] for coord in ring]
            
            # Calculate area using shoelace formula
            area = 0.0
            for i in range(len(points)):
                j = (i + 1) % len(points)
                area += points[i][0] * points[j][1]  # lat * lon
                area -= points[j][0] * points[i][1]  # lat * lon
            area = abs(area) / 2.0
            
            # Get center point for scaling
            center = obj.get_center_point()
            if center:
                avg_lat = center[0]
                # Convert to square kilometers
                # 1 degree lat ≈ 111 km
                km_per_deg_lat = 111.0
                km_per_deg_lon = 111.0 * abs(math.cos(math.radians(avg_lat)))
                area_km2 = area * km_per_deg_lat * km_per_deg_lon
                return round(area_km2, 2)
            
            return None
        except Exception:
            return None
    
    def get_active_users_count(self, obj):
        """Count active users in this geofence"""
        try:
            from users.models import User
            # Count users who have this geofence assigned
            count = User.objects.filter(
                geofences=obj,
                is_active=True
            ).count()
            return count
        except Exception:
            return 0


class OfficerLoginSerializer(serializers.Serializer):
    """
    Serializer for security officer login.
    Accepts username and password.
    """
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True, style={'input_type': 'password'})

    def validate(self, attrs):
        username = attrs.get("username")
        password = attrs.get("password")

        logger.info(f"OfficerLoginSerializer - Received username: '{username}', password provided: {bool(password)}")
        print(f"🔍 SERIALIZER INPUT: username='{username}', password_provided={bool(password)}")

        if not username:
            logger.warning("OfficerLoginSerializer - Username is required")
            print("❌ VALIDATION: Username is required")
            raise serializers.ValidationError({"username": "Username is required."})

        if not password:
            logger.warning("OfficerLoginSerializer - Password is required")
            print("❌ VALIDATION: Password is required")
            raise serializers.ValidationError({"password": "Password is required."})

        # Authenticate user
        logger.info(f"OfficerLoginSerializer - Looking up user: '{username}'")
        print(f"🔍 USER LOOKUP: Searching for username '{username}'")
        try:
            user = User.objects.get(username=username, is_active=True)
            logger.info(f"OfficerLoginSerializer - User found: {user.username}, is_active: {user.is_active}")
            print(f"✅ USER FOUND: {user.username}, active: {user.is_active}, role: {user.role}")
        except User.DoesNotExist:
            logger.warning(f"OfficerLoginSerializer - User '{username}' not found or not active")
            print(f"❌ USER LOOKUP FAILED: User '{username}' not found or inactive")
            raise serializers.ValidationError({"non_field_errors": "Invalid credentials."})

        # Check password
        logger.info(f"OfficerLoginSerializer - Checking password for user: {user.username}")
        print(f"🔍 PASSWORD CHECK: Verifying password for {user.username}")
        if not user.check_password(password):
            logger.warning(f"OfficerLoginSerializer - Invalid password for user: {user.username}")
            print(f"❌ PASSWORD CHECK FAILED: Invalid password for {user.username}")
            raise serializers.ValidationError({"non_field_errors": "Invalid credentials."})

        # Check role - must be security_officer
        logger.info(f"OfficerLoginSerializer - Checking role for user: {user.username}, role: {user.role}")
        print(f"🔍 ROLE CHECK: User {user.username} has role '{user.role}'")
        if user.role != "security_officer":
            logger.warning(f"OfficerLoginSerializer - Invalid role for user: {user.username}, role: {user.role}")
            print(f"❌ ROLE CHECK FAILED: User {user.username} has role '{user.role}', need 'security_officer'")
            raise serializers.ValidationError({"non_field_errors": "This account is not a security officer."})

        # Return authenticated user
        logger.info(f"OfficerLoginSerializer - Authentication successful for user: {user.username}")
        print(f"✅ AUTHENTICATION SUCCESS: User {user.username} validated")
        attrs["user"] = user
        return attrs


class LiveLocationSerializer(serializers.ModelSerializer):
    """
    Serializer for LiveLocation model with SOS alert relationship.
    """
    sos_alert_id = serializers.IntegerField(source='sos_alert.id', read_only=True)
    sos_alert_status = serializers.CharField(source='sos_alert.status', read_only=True)
    
    class Meta:
        model = LiveLocation
        fields = (
            'id', 'sos_alert', 'sos_alert_id', 'user', 'latitude', 'longitude', 
            'updated_at', 'sos_alert_status'
        )
        read_only_fields = ('id', 'sos_alert', 'user', 'updated_at', 'sos_alert_status')


class UnifiedAlertSerializer(serializers.Serializer):
    """
    Unified format for all alert types.
    This is what gets returned to the frontend.
    """
    id = serializers.CharField()  # Composite ID like "officer_123" or "sos_456"
    alert_type = serializers.CharField()  # 'emergency', 'warning', 'info', 'all_clear'
    alert_source = serializers.CharField()  # 'officer', 'sos', 'community', 'system'
    title = serializers.CharField()
    message = serializers.CharField()
    location = serializers.CharField(required=False, allow_null=True)
    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)
    created_at = serializers.DateTimeField()
    time_ago = serializers.CharField()
    is_read = serializers.BooleanField(default=False)
    
    # Optional fields
    officer_name = serializers.CharField(required=False, allow_null=True)
    status = serializers.CharField(required=False, allow_null=True)


class OfficerAlertSerializer(serializers.ModelSerializer):
    """Serializer for officer broadcasts"""
    
    officer_name = serializers.CharField(source='officer.get_full_name', read_only=True)
    time_ago = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    
    class Meta:
        model = OfficerAlert
        fields = [
            'id',
            'alert_type',
            'title',
            'message',
            'location',
            'latitude',
            'longitude',
            'officer_name',
            'is_broadcast',
            'created_at',
            'time_ago',
            'is_read',
        ]
    
    def get_time_ago(self, obj):
        from django.utils.timesince import timesince
        return f"{timesince(obj.created_at)} ago"
    
    def get_is_read(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return AlertRead.objects.filter(
                user=request.user,
                officer_alert=obj
            ).exists()
        return False


class UserInAreaSerializer(serializers.ModelSerializer):
    """
    Serializer for users physically located within a geofence.
    Matches the frontend UserInArea interface.
    """
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    user_name = serializers.SerializerMethodField()
    user_email = serializers.CharField(source='user.email', read_only=True)
    current_latitude = serializers.FloatField(source='latitude', read_only=True)
    current_longitude = serializers.FloatField(source='longitude', read_only=True)
    last_seen = serializers.DateTimeField(source='location_timestamp', read_only=True)
    is_inside = serializers.BooleanField(default=True, read_only=True)

    class Meta:
        model = UserLocation
        fields = (
            'user_id', 'user_name', 'user_email', 'current_latitude', 
            'current_longitude', 'last_seen', 'is_inside'
        )

    def get_user_name(self, obj):
        name = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return name or obj.user.username or obj.user.email