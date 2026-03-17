"""
Serializers for User models.
"""
from rest_framework import serializers
from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from .models import User, FamilyContact, CommunityMembership, SOSEvent, LiveLocationShare, CommunityAlert, ChatGroup, ChatMessage

GOOGLE_PLAY_PACKAGE_NAME = getattr(settings, 'GOOGLE_PLAY_PACKAGE_NAME', 'com.safetnet.userapp')


class UserRegistrationSerializer(serializers.ModelSerializer):
    """
    Serializer for user registration.
    Maps app fields to User model fields.
    """
    name = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)
    phone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    plantype = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='free')
    
    class Meta:
        model = User
        fields = ('name', 'email', 'phone', 'password', 'password_confirm', 'plantype', 'username')
        extra_kwargs = {
            'username': {'required': False},
            'email': {'required': True}
        }
    
    def validate(self, attrs):
        """Validate that passwords match."""
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError("Passwords don't match.")
        return attrs
    
    def create(self, validated_data):
        """Create a new user."""
        password_confirm = validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        name = validated_data.pop('name', '')
        phone = validated_data.pop('phone', None)
        plantype = validated_data.pop('plantype', 'free')
        
        # Split name into first_name and last_name
        name_parts = name.split(' ', 1) if name else []
        first_name = name_parts[0] if name_parts else ''
        last_name = name_parts[1] if len(name_parts) > 1 else ''
        
        # Use email as username if username not provided
        email = validated_data.get('email')
        username = validated_data.pop('username', None) or email.split('@')[0]
        
        # Create user with actual model fields
        user = User.objects.create_user(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            password=password
        )
        
        # Store phone and plantype in a way that can be accessed later if needed
        # For now, we'll just save the user as-is since these fields don't exist on the model
        user.save()
        return user


class UserLoginSerializer(serializers.Serializer):
    """
    Serializer for user login.
    """
    email = serializers.EmailField()
    password = serializers.CharField()
    
    def validate(self, attrs):
        """Validate user credentials."""
        email = attrs.get('email')
        password = attrs.get('password')
        
        if email and password:
            # Find user by email first, then authenticate with username
            try:
                user = User.objects.get(email=email)
                # Try authenticating with username first, then email if username is None
                authenticated_user = None
                if user.username:
                    authenticated_user = authenticate(username=user.username, password=password)
                if not authenticated_user:
                    # Try with email as username
                    authenticated_user = authenticate(username=email, password=password)
                
                if not authenticated_user:
                    raise serializers.ValidationError('Invalid email or password.')
                if not authenticated_user.is_active:
                    raise serializers.ValidationError('User account is disabled.')
                attrs['user'] = authenticated_user
                return attrs
            except User.DoesNotExist:
                raise serializers.ValidationError('Invalid email or password.')
        else:
            raise serializers.ValidationError('Must include email and password.')


class UserProfileSerializer(serializers.ModelSerializer):
    """
    Serializer for user profile (read and update).
    Maps User model fields to app-expected format.
    """
    name = serializers.SerializerMethodField()
    phone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    plantype = serializers.SerializerMethodField()
    planexpiry = serializers.SerializerMethodField()
    plan_details = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    is_premium = serializers.SerializerMethodField()
    is_paid_user = serializers.SerializerMethodField()
    geofences = serializers.SerializerMethodField()
    geofence_ids = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()  # Map Django's is_active to status
    
    class Meta:
        model = User
        fields = (
            'id', 'name', 'email', 'phone', 'plantype', 
            'planexpiry', 'plan_details', 'location', 'is_premium', 'is_paid_user',
            'date_joined', 'last_login', 'first_name', 'last_name', 'username',
            'geofences', 'geofence_ids', 'status'
        )
        read_only_fields = ('id', 'email', 'date_joined', 'last_login', 'username')
    
    def get_geofence_ids(self, obj):
        """Return list of geofence IDs for writing"""
        return [g.id for g in obj.geofences.all()]
    
    def get_geofences(self, obj):
        """Return geofence details for the user"""
        geofences = obj.geofences.all()
        if not geofences.exists():
            return []
        
        return [
            {
                'id': g.id,
                'name': g.name,
                'description': g.description,
                'organization_name': g.organization.name if g.organization else None,
                'active': g.active,
                'center_point': g.get_center_point(),
            }
            for g in geofences
        ]
    
    def get_name(self, obj):
        """Get user's full name."""
        if obj.first_name or obj.last_name:
            return f"{obj.first_name or ''} {obj.last_name or ''}".strip()
        return obj.username or obj.email.split('@')[0]
    
    def get_location(self, obj):
        """Get location as a dictionary."""
        # Check if user has location attribute/method
        if hasattr(obj, 'get_location_dict'):
            return obj.get_location_dict()
        # Return empty if no location method
        return None
    
    def get_is_paid_user(self, obj):
        """Check if user is a paid user."""
        # Check UserDetails model for plan information
        try:
            from users.models import UserDetails
            user_details = UserDetails.objects.filter(username=obj.username).first()
            if user_details and user_details.price > 0:
                return True
        except:
            pass
        # Check if user has is_paid_user attribute
        if hasattr(obj, 'is_paid_user'):
            return obj.is_paid_user is True or obj.is_paid_user == 'true' or obj.is_paid_user == 1
        # Fallback: Check email or username for premium indicator
        email = getattr(obj, 'email', '').lower()
        username = getattr(obj, 'username', '').lower()
        if 'premium' in email or 'premium' in username:
            return True
        return False
    
    def get_is_premium(self, obj):
        """Check if user has premium plan."""
        # Check UserDetails model for plan information
        try:
            from users.models import UserDetails
            user_details = UserDetails.objects.filter(username=obj.username).first()
            if user_details and user_details.price > 0:
                return True
        except:
            pass
        # Check is_paid_user first (highest priority)
        is_paid = self.get_is_paid_user(obj)
    
    def get_status(self, obj):
        """Map Django's is_active to frontend status field."""
        return 'active' if obj.is_active else 'inactive'
    
    def get_plantype(self, obj):
        """Get user's plan type from UserDetails."""
        try:
            from users.models import UserDetails
            user_details = UserDetails.objects.filter(username=obj.username).first()
            if user_details:
                if user_details.price > 0:
                    return 'premium'
                return 'free'
        except:
            pass
        # Fallback
        if hasattr(obj, 'plantype'):
            return obj.plantype
        email = getattr(obj, 'email', '').lower()
        username = getattr(obj, 'username', '').lower()
        if 'premium' in email or 'premium' in username:
            return 'premium'
        return 'free'
    
    def get_planexpiry(self, obj):
        """Get user's plan expiry date."""
        try:
            from users.models import UserDetails
            user_details = UserDetails.objects.filter(username=obj.username).first()
            if user_details and user_details.price > 0:
                # For premium users, calculate expiry (30 days from now for monthly)
                from datetime import date, timedelta
                return date.today() + timedelta(days=30)
        except:
            pass
        if hasattr(obj, 'planexpiry'):
            return obj.planexpiry
        return None
    
    def get_plan_details(self, obj):
        """Get detailed plan information."""
        try:
            from users.models import UserDetails
            user_details = UserDetails.objects.filter(username=obj.username).first()
            if user_details:
                plan_type = 'premium' if user_details.price > 0 else 'free'
                return {
                    'type': plan_type,
                    'price': float(user_details.price),
                    'status': user_details.status,
                    'currency': 'USD',
                    'billing_cycle': 'monthly' if user_details.price > 0 else None
                }
        except:
            pass
        return {
            'type': 'free',
            'price': 0.0,
            'status': 'active',
            'currency': 'USD',
            'billing_cycle': None
        }
    
    def update(self, instance, validated_data):
        """Update user profile."""
        # Handle geofence_ids if provided
        geofence_ids = self.initial_data.get('geofence_ids', None)
        if geofence_ids is not None:  # Allow empty list to clear geofences
            from users.models import Geofence
            geofences = Geofence.objects.filter(id__in=geofence_ids)
            instance.geofences.set(geofences)
        
        # Update first_name and last_name from name field if provided
        name = self.initial_data.get('name')
        if name:
            name_parts = name.split(' ', 1)
            instance.first_name = name_parts[0]
            if len(name_parts) > 1:
                instance.last_name = name_parts[1]
        
        # Handle location update if provided
        location_data = self.initial_data.get('location')
        if location_data and hasattr(instance, 'set_location'):
            try:
                longitude = float(location_data.get('longitude'))
                latitude = float(location_data.get('latitude'))
                instance.set_location(longitude, latitude)
            except (ValueError, TypeError):
                raise serializers.ValidationError('Invalid location data.')
        
        # Handle phone number update if provided
        phone = self.initial_data.get('phone')
        if phone is not None:
            instance.phone = phone
        
        # Handle status update if provided
        status = self.initial_data.get('status')
        if status is not None:
            instance.is_active = (status.lower() == 'active')
        
        # Remove fields that don't exist on the model
        validated_data.pop('name', None)
        validated_data.pop('plantype', None)
        validated_data.pop('planexpiry', None)
        
        return super().update(instance, validated_data)


class FamilyContactSerializer(serializers.ModelSerializer):
    """
    Serializer for family contacts.
    """
    
    class Meta:
        model = FamilyContact
        fields = ('id', 'name', 'phone', 'relationship', 'is_primary', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at')
    
    def validate(self, attrs):
        """Validate family contact data."""
        user = self.context['request'].user
        
        # Check if phone number already exists for this user
        phone = attrs.get('phone')
        if phone:
            existing_contact = FamilyContact.objects.filter(
                user=user, 
                phone=phone
            ).exclude(id=self.instance.id if self.instance else None)
            
            if existing_contact.exists():
                raise serializers.ValidationError(
                    {'phone': 'A contact with this phone number already exists.'}
                )
        
        return attrs


class FamilyContactCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating family contacts.
    """
    
    class Meta:
        model = FamilyContact
        fields = ('name', 'phone', 'relationship', 'is_primary')
    
    def validate(self, attrs):
        """Validate family contact creation."""
        user = self.context['request'].user
        
        # Check if phone number already exists
        phone = attrs.get('phone')
        existing_contact = FamilyContact.objects.filter(user=user, phone=phone)
        if self.instance:
            existing_contact = existing_contact.exclude(id=self.instance.id)
        if existing_contact.exists():
            raise serializers.ValidationError(
                {'phone': 'A contact with this phone number already exists.'}
            )
        
        return attrs


class CommunityMembershipSerializer(serializers.ModelSerializer):
    """
    Serializer for community memberships.
    """
    
    class Meta:
        model = CommunityMembership
        fields = ('id', 'community_id', 'community_name', 'joined_at', 'is_active')
        read_only_fields = ('id', 'joined_at')


class CommunityMembershipCreateSerializer(serializers.Serializer):
    """
    Serializer for joining communities.
    """
    community_id = serializers.CharField(max_length=100)
    community_name = serializers.CharField(max_length=200)
    
    def validate(self, attrs):
        """Validate community membership."""
        user = self.context['request'].user
        community_id = attrs.get('community_id')
        
        # Check if user is already a member
        if CommunityMembership.objects.filter(
            user=user, 
            community_id=community_id
        ).exists():
            raise serializers.ValidationError(
                'You are already a member of this community.'
            )
        
        return attrs


class SOSEventSerializer(serializers.ModelSerializer):
    """
    Serializer for SOS events.
    Only includes fields that exist in the database.
    """
    location = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='triggered_at', read_only=True)
    read_by_ids = serializers.SerializerMethodField()
    is_read_by_current_user = serializers.SerializerMethodField()
    read_timestamp = serializers.SerializerMethodField()
    
    class Meta:
        model = SOSEvent
        fields = (
            'id', 'location', 'status', 'triggered_at', 'created_at',
            'resolved_at', 'notes', 'read_by_ids', 'is_read_by_current_user',
            'read_timestamp'
        )
        read_only_fields = ('id', 'triggered_at', 'created_at', 'resolved_at')
    
    def get_location(self, obj):
        """Get location as a dictionary."""
        if obj.location:
            # Handle JSONField format
            if isinstance(obj.location, dict):
                return obj.location
            # Handle Point format (if using geospatial)
            if hasattr(obj.location, 'x') and hasattr(obj.location, 'y'):
                return {
                    'longitude': obj.location.x,
                    'latitude': obj.location.y
                }
        return None
    
    def get_read_by_ids(self, obj):
        """Return list of user IDs who have read this SOS event."""
        return list(obj.read_by.values_list('id', flat=True))
    
    def get_is_read_by_current_user(self, obj):
        """Check if current user has read this SOS event."""
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            return obj.is_read_by(request.user)
        return False
    
    def get_read_timestamp(self, obj):
        """Get read timestamp for current user."""
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            return obj.get_read_timestamp(request.user)
        return None


class GeofenceEventSerializer(serializers.Serializer):
    """
    Serializer for geofence enter/exit events.
    """
    geofence_id = serializers.IntegerField(help_text="ID of the geofence")
    event_type = serializers.ChoiceField(
        choices=['enter', 'exit'],
        help_text="Type of event: 'enter' or 'exit'"
    )
    latitude = serializers.FloatField(help_text="User's latitude at time of event")
    longitude = serializers.FloatField(help_text="User's longitude at time of event")
    timestamp = serializers.DateTimeField(required=False, help_text="Event timestamp (optional, defaults to now)")


class SOSTriggerSerializer(serializers.Serializer):
    """
    Serializer for triggering SOS events.
    """
    longitude = serializers.FloatField(required=False)
    latitude = serializers.FloatField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    
    def validate(self, attrs):
        """Validate SOS trigger data."""
        longitude = attrs.get('longitude')
        latitude = attrs.get('latitude')
        
        # If location is provided, both coordinates must be present
        if longitude is not None and latitude is None:
            raise serializers.ValidationError(
                'Both longitude and latitude must be provided for location.'
            )
        if latitude is not None and longitude is None:
            raise serializers.ValidationError(
                'Both longitude and latitude must be provided for location.'
            )
        
        return attrs


class UserLocationUpdateSerializer(serializers.Serializer):
    """
    Serializer for updating user location.
    """
    longitude = serializers.FloatField()
    latitude = serializers.FloatField()
    
    def validate(self, attrs):
        """Validate location coordinates."""
        longitude = attrs.get('longitude')
        latitude = attrs.get('latitude')
        
        # Basic coordinate validation
        if not (-180 <= longitude <= 180):
            raise serializers.ValidationError(
                {'longitude': 'Longitude must be between -180 and 180.'}
            )
        
        if not (-90 <= latitude <= 90):
            raise serializers.ValidationError(
                {'latitude': 'Latitude must be between -90 and 90.'}
            )
        
        return attrs


class SubscriptionSerializer(serializers.Serializer):
    """
    Serializer for subscription requests.
    """
    plan_type = serializers.ChoiceField(
        choices=['premium-monthly', 'premium-annual'],
        help_text="Subscription plan type"
    )
    promo_code = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Optional promo code"
    )


class GooglePlayPurchaseSerializer(serializers.Serializer):
    """
    Serializer for Google Play purchase verification.
    """
    purchase_token = serializers.CharField(
        required=True,
        help_text="The purchase token received from Google Play"
    )
    subscription_id = serializers.CharField(
        required=True,
        help_text="The ID of the subscription (e.g. 'premium_monthly')"
    )
    package_name = serializers.CharField(
        required=False,
        default=GOOGLE_PLAY_PACKAGE_NAME,
        help_text="The package name of the app"
    )


class LiveLocationShareSerializer(serializers.ModelSerializer):
    """
    Serializer for live location sharing.
    """
    share_url = serializers.SerializerMethodField()
    path_points = serializers.SerializerMethodField()
    geofence_id = serializers.SerializerMethodField()

    class Meta:
        model = LiveLocationShare
        fields = (
            'id',
            'share_token',
            'share_url',
            'started_at',
            'expires_at',
            'is_active',
            'current_location',
            'last_broadcast_at',
            'path_points',
            'plan_type',
            'stop_reason',
            'geofence_id',
        )
        read_only_fields = (
            'id',
            'share_token',
            'share_url',
            'started_at',
            'expires_at',
            'is_active',
            'last_broadcast_at',
            'path_points',
            'plan_type',
            'stop_reason',
            'geofence_id',
        )

    def get_share_url(self, obj):
        base_url = getattr(settings, 'LIVE_SHARE_BASE_URL', '').strip()
        if not base_url:
            return None
        normalized_base = base_url[:-1] if base_url.endswith('/') else base_url
        return f"{normalized_base}/{obj.share_token}"

    def get_path_points(self, obj):
        qs = obj.track_points.order_by('recorded_at')
        return [
            {
                'latitude': point.latitude,
                'longitude': point.longitude,
                'recorded_at': point.recorded_at.isoformat(),
            }
            for point in qs
        ]
    
    def get_geofence_id(self, obj):
        """Return the geofence ID from security officer's assigned geofence"""
        if obj.security_officer and obj.security_officer.assigned_geofence:
            return obj.security_officer.assigned_geofence.id
        # For regular users, you might want to get geofence from user's profile
        # For now, return None if not a security officer
        return None


class LiveLocationShareCreateSerializer(serializers.Serializer):
    """
    Serializer for creating live location share.
    """
    duration_minutes = serializers.IntegerField(
        min_value=1,
        max_value=1440,  # 24 hours max
        help_text="Duration of live sharing in minutes"
    )
    shared_with_user_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text="List of user IDs to share location with"
    )


class CommunityAlertSerializer(serializers.ModelSerializer):
    """
    Serializer for community alerts.
    """
    class Meta:
        model = CommunityAlert
        fields = ('id', 'message', 'location', 'radius_meters', 'sent_at', 'is_premium_alert')
        read_only_fields = ('id', 'sent_at', 'is_premium_alert')


class CommunityAlertCreateSerializer(serializers.Serializer):
    """
    Serializer for creating community alerts.
    """
    message = serializers.CharField(max_length=500)
    location = serializers.DictField(
        child=serializers.FloatField(),
        help_text="Location as {longitude: float, latitude: float}"
    )
    radius_meters = serializers.IntegerField(
        required=False,
        default=500,
        help_text="Alert radius in meters (max 500 for free users)"
    )


class ChatGroupSerializer(serializers.ModelSerializer):
    """
    Serializer for chat groups.
    """
    member_count = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    admin_id = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = ChatGroup
        fields = ('id', 'name', 'description', 'members', 'member_count', 'admin_id', 'created_by', 'created_by_name', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_by', 'created_at', 'updated_at')
    
    def get_member_count(self, obj):
        return obj.members.count()
    
    def get_members(self, obj):
        admin_id = obj.admin.id if obj.admin else obj.created_by.id
        return [
            {
                'id': member.id,
                'name': member.name if hasattr(member, 'name') else (member.first_name + ' ' + member.last_name).strip() or member.email,
                'email': member.email,
                'first_name': getattr(member, 'first_name', ''),
                'last_name': getattr(member, 'last_name', ''),
                'is_admin': (obj.admin and obj.admin.id == member.id) or (not obj.admin and obj.created_by.id == member.id),
            }
            for member in obj.members.all()
        ]
    
    def get_admin_id(self, obj):
        return obj.admin.id if obj.admin else obj.created_by.id
    
    def get_created_by_name(self, obj):
        if hasattr(obj.created_by, 'name') and obj.created_by.name:
            return obj.created_by.name
        first_name = getattr(obj.created_by, 'first_name', '')
        last_name = getattr(obj.created_by, 'last_name', '')
        return (first_name + ' ' + last_name).strip() or obj.created_by.email


class ChatGroupCreateSerializer(serializers.Serializer):
    """
    Serializer for creating chat groups.
    """
    name = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True)
    member_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of user IDs to add as members"
    )


class ChatMessageSerializer(serializers.ModelSerializer):
    """
    Serializer for chat messages.
    """
    sender_name = serializers.SerializerMethodField()
    sender_first_name = serializers.SerializerMethodField()
    sender_last_name = serializers.SerializerMethodField()
    sender_id = serializers.IntegerField(source='sender.id', read_only=True)
    image_url = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = ChatMessage
        fields = ('id', 'group', 'sender', 'sender_id', 'sender_name', 'sender_first_name', 'sender_last_name', 'text', 'image', 'image_url', 'file', 'file_url', 'file_name', 'file_size', 'created_at')
        read_only_fields = ('id', 'sender', 'created_at', 'image_url', 'file_url')
    
    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None
    
    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def get_sender_name(self, obj):
        if hasattr(obj.sender, 'name') and obj.sender.name:
            return obj.sender.name
        first_name = getattr(obj.sender, 'first_name', '')
        last_name = getattr(obj.sender, 'last_name', '')
        return (first_name + ' ' + last_name).strip() or obj.sender.email
    
    def get_sender_first_name(self, obj):
        return getattr(obj.sender, 'first_name', '')
    
    def get_sender_last_name(self, obj):
        return getattr(obj.sender, 'last_name', '')


class ChatMessageCreateSerializer(serializers.Serializer):
    """
    Serializer for creating and updating chat messages.
    """
    text = serializers.CharField(required=False, allow_blank=True)
    image = serializers.ImageField(required=False, allow_null=True)
    file = serializers.FileField(required=False, allow_null=True)
    file_name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    file_size = serializers.IntegerField(required=False, allow_null=True)
    
    def validate(self, attrs):
        """Validate that either text, image, or file is provided."""
        if not attrs.get('text') and not attrs.get('image') and not attrs.get('file'):
            raise serializers.ValidationError("Either text, image, or file must be provided.")
        return attrs
    
    def update(self, instance, validated_data):
        """Update the message."""
        instance.text = validated_data.get('text', instance.text)
        if 'image' in validated_data:
            instance.image = validated_data['image']
        if 'file' in validated_data:
            instance.file = validated_data['file']
            instance.file_name = validated_data.get('file_name', instance.file_name)
            instance.file_size = validated_data.get('file_size', instance.file_size)
        instance.save()
        return instance
