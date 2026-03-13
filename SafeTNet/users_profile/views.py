"""
API views for User models.
"""
import logging
from django.conf import settings
from django.http import Http404
from django.db import models
# from django.contrib.gis.geos import Point  # Commented out to avoid GDAL dependency
# from django.contrib.gis.measure import Distance  # Commented out to avoid GDAL dependency
# from django.contrib.gis.db.models.functions import Distance as DistanceFunction  # Commented out to avoid GDAL dependency
from django.utils import timezone
from datetime import timedelta
from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import (
    User, FamilyContact, CommunityMembership, SOSEvent,
    LiveLocationShare, CommunityAlert, ChatGroup, ChatMessage, FREE_TIER_LIMITS
)
# Import PromoCode and Alert from users app
from users.models import PromoCode
from security_app.models import SOSAlert
from .serializers import (
    UserRegistrationSerializer, UserLoginSerializer, UserProfileSerializer,
    FamilyContactSerializer, FamilyContactCreateSerializer,
    CommunityMembershipSerializer, CommunityMembershipCreateSerializer,
    SOSEventSerializer, SOSTriggerSerializer, UserLocationUpdateSerializer,
    SubscriptionSerializer, LiveLocationShareSerializer, LiveLocationShareCreateSerializer,
    CommunityAlertSerializer, CommunityAlertCreateSerializer,
    ChatGroupSerializer, ChatGroupCreateSerializer,
    ChatMessageSerializer, ChatMessageCreateSerializer
)
from .services import SMSService

logger = logging.getLogger(__name__)


class UserRegistrationView(APIView):
    """
    User registration endpoint.
    POST /users/
    """
    permission_classes = [permissions.AllowAny]
    
    def post(self, request):
        """Register a new user."""
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            
            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)
            access_token = refresh.access_token
            
            logger.info(f"New user registered: {user.email}")
            
            return Response({
                'message': 'User registered successfully',
                'user': UserProfileSerializer(user).data,
                'tokens': {
                    'access': str(access_token),
                    'refresh': str(refresh)
                }
            }, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserLoginView(TokenObtainPairView):
    """
    User login endpoint with JWT authentication.
    POST /users/login/
    """
    permission_classes = [permissions.AllowAny]
    
    def post(self, request, *args, **kwargs):
        """Login user and return JWT tokens."""
        serializer = UserLoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            
            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)
            access_token = refresh.access_token
            
            logger.info(f"User logged in: {user.email}")
            
            return Response({
                'message': 'Login successful',
                'user': UserProfileSerializer(user).data,
                'tokens': {
                    'access': str(access_token),
                    'refresh': str(refresh)
                }
            }, status=status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserProfileView(generics.RetrieveUpdateAPIView):
    """
    Get and update user profile.
    GET /users/<id>/
    PUT/PATCH /users/<id>/
    """
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_object(self):
        """Get the user's profile by ID or current user."""
        user_id = self.kwargs.get('user_id')
        if user_id:
            try:
                user = User.objects.select_related('organization').prefetch_related('geofences', 'geofences__organization').get(id=user_id)
                # Allow users to access their own profile
                if self.request.user.id == user.id:
                    return user
                else:
                    # For now, allow access to any profile (you can restrict this later)
                    return user
            except User.DoesNotExist:
                raise Http404("User not found")
        else:
            # For /profile/ endpoint, return current user with optimized queries
            return User.objects.select_related('organization').prefetch_related('geofences', 'geofences__organization').get(pk=self.request.user.pk)
    
    def get(self, request, *args, **kwargs):
        """Get user profile."""
        user = self.get_object()
        serializer = self.get_serializer(user)
        return Response(serializer.data)
    
    def put(self, request, *args, **kwargs):
        """Update user profile."""
        user = self.get_object()
        serializer = self.get_serializer(user, data=request.data, partial=False)
        if serializer.is_valid():
            serializer.save()
            logger.info(f"User profile updated: {user.email}")
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def patch(self, request, *args, **kwargs):
        """Partially update user profile."""
        user = self.get_object()
        serializer = self.get_serializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            logger.info(f"User profile updated: {user.email}")
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserLocationUpdateView(APIView):
    """
    Update user location.
    POST /users/<id>/location/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, user_id):
        """Update user's current location."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'You can only update your own location.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = UserLocationUpdateSerializer(data=request.data)
        if serializer.is_valid():
            longitude = serializer.validated_data['longitude']
            latitude = serializer.validated_data['latitude']
            
            request.user.set_location(longitude, latitude)
            logger.info(f"User location updated: {request.user.email}")
            
            return Response({
                'message': 'Location updated successfully',
                'location': request.user.get_location_dict()
            }, status=status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class FamilyContactListView(generics.ListCreateAPIView):
    """
    List and create family contacts.
    GET /users/<id>/family_contacts/
    POST /users/<id>/family_contacts/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Get family contacts for the current user."""
        return FamilyContact.objects.filter(user=self.request.user)
    
    def get_serializer_class(self):
        """Return appropriate serializer based on request method."""
        if self.request.method == 'POST':
            return FamilyContactCreateSerializer
        return FamilyContactSerializer
    
    def perform_create(self, serializer):
        """Create a new family contact."""
        user = self.request.user
        is_premium = _is_user_premium(user)
        current_count = FamilyContact.objects.filter(user=user).count()
        
        # Check free tier limit
        if not is_premium and current_count >= FREE_TIER_LIMITS['MAX_CONTACTS']:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                f'Free plan allows up to {FREE_TIER_LIMITS["MAX_CONTACTS"]} emergency contacts. '
                'Upgrade to Premium for unlimited contacts.'
            )
        
        serializer.save(user=user)
        logger.info(f"Family contact created for user: {user.email}")
    
    def post(self, request, *args, **kwargs):
        user_id = kwargs.get('user_id')
        if user_id is not None and request.user.id != int(user_id):
            return Response(
                {'error': 'You can only create family contacts for your own account.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().post(request, *args, **kwargs)
    
    def list(self, request, *args, **kwargs):
        """List family contacts."""
        user_id = kwargs.get('user_id')
        if user_id is not None and request.user.id != int(user_id):
            return Response(
                {'error': 'You can only view your own family contacts.'},
                status=status.HTTP_403_FORBIDDEN
            )
        queryset = self.get_queryset()
        serializer = FamilyContactSerializer(queryset, many=True)
        return Response(serializer.data)


class FamilyContactDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Retrieve, update, or delete a family contact.
    GET /users/<id>/family_contacts/<contact_id>/
    PUT/PATCH /users/<id>/family_contacts/<contact_id>/
    DELETE /users/<id>/family_contacts/<contact_id>/
    """
    serializer_class = FamilyContactSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_url_kwarg = 'contact_id'
    
    def get_queryset(self):
        """Get family contacts for the current user."""
        return FamilyContact.objects.filter(user=self.request.user)
    
    def get(self, request, *args, **kwargs):
        user_id = kwargs.get('user_id')
        if user_id is not None and request.user.id != int(user_id):
            return Response(
                {'error': 'You can only view your own family contacts.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().get(request, *args, **kwargs)
    
    def put(self, request, *args, **kwargs):
        user_id = kwargs.get('user_id')
        if user_id is not None and request.user.id != int(user_id):
            return Response(
                {'error': 'You can only update your own family contacts.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().put(request, *args, **kwargs)
    
    def patch(self, request, *args, **kwargs):
        user_id = kwargs.get('user_id')
        if user_id is not None and request.user.id != int(user_id):
            return Response(
                {'error': 'You can only update your own family contacts.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().patch(request, *args, **kwargs)
    
    def destroy(self, request, *args, **kwargs):
        """Delete a family contact."""
        user_id = kwargs.get('user_id')
        if user_id is not None and request.user.id != int(user_id):
            return Response(
                {'error': 'You can only delete your own family contacts.'},
                status=status.HTTP_403_FORBIDDEN
            )
        instance = self.get_object()
        self.perform_destroy(instance)
        logger.info(f"Family contact deleted for user: {request.user.email}")
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommunityMembershipListView(generics.ListAPIView):
    """
    List user's community memberships.
    GET /users/<id>/communities/
    """
    serializer_class = CommunityMembershipSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Get community memberships for the current user."""
        return CommunityMembership.objects.filter(
            user=self.request.user,
            is_active=True
        )
    
    def list(self, request, *args, **kwargs):
        user_id = kwargs.get('user_id')
        if user_id is not None and request.user.id != int(user_id):
            return Response(
                {'error': 'You can only view your own community memberships.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().list(request, *args, **kwargs)


class CommunityJoinView(APIView):
    """
    Join a community.
    POST /users/<id>/communities/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, user_id):
        """Join a community."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'You can only join communities for your own account.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = CommunityMembershipCreateSerializer(data=request.data)
        if serializer.is_valid():
            community_id = serializer.validated_data['community_id']
            community_name = serializer.validated_data['community_name']
            
            membership = CommunityMembership.objects.create(
                user=request.user,
                community_id=community_id,
                community_name=community_name
            )
            
            logger.info(f"User joined community: {request.user.email} - {community_name}")
            
            return Response({
                'message': 'Successfully joined community',
                'membership': CommunityMembershipSerializer(membership).data
            }, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CommunityLeaveView(APIView):
    """
    Leave a community.
    DELETE /users/<id>/communities/<community_id>/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def delete(self, request, user_id, community_id):
        """Leave a community."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'You can only leave communities for your own account.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            membership = CommunityMembership.objects.get(
                user=request.user,
                community_id=community_id
            )
            membership.is_active = False
            membership.save()
            
            logger.info(f"User left community: {request.user.email} - {community_id}")
            
            return Response({
                'message': 'Successfully left community'
            }, status=status.HTTP_200_OK)
        
        except CommunityMembership.DoesNotExist:
            return Response(
                {'error': 'Community membership not found.'},
                status=status.HTTP_404_NOT_FOUND
            )


class SOSTriggerView(APIView):
    """
    Trigger SOS event.
    POST /users/<id>/sos/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, user_id):
        """Trigger SOS event."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'You can only trigger SOS for your own account.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = SOSTriggerSerializer(data=request.data)
        if serializer.is_valid():
            user = request.user
            longitude = serializer.validated_data.get('longitude')
            latitude = serializer.validated_data.get('latitude')
            notes = serializer.validated_data.get('notes', '')
            
            # SIMPLIFIED: Only store SOS message in database
            # Security officers can access it from there
            # All other operations (SMS, live share, calls) are handled by frontend
            
            location_data = None
            if longitude is not None and latitude is not None:
                location_data = {'longitude': longitude, 'latitude': latitude}
            
            # Create SOS event - simple and fast
            sos_event = SOSEvent.objects.create(
                user=user,
                notes=notes,
                location=location_data,
                status='triggered'  # Default status, can be updated later
            )
            
            logger.info(f"SOS event stored in database for user: {user.email}")
            
            # Return response immediately - this should be < 1 second
            return Response({
                'message': 'SOS event stored successfully',
                'sos_event': SOSEventSerializer(sos_event).data,
            }, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SOSEventListView(generics.ListAPIView):
    """
    List user's SOS events.
    Free: Last 5 events
    Premium: Unlimited
    GET /users/<id>/sos_events/
    """
    serializer_class = SOSEventSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_context(self):
        """Add request to serializer context for read status checks."""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def get_queryset(self):
        """Get SOS events for the current user."""
        user = self.request.user
        is_premium = _is_user_premium(user)
        
        # Only select fields that exist in database to avoid errors
        queryset = SOSEvent.objects.filter(user=user).only(
            'id', 'user_id', 'location', 'status', 'triggered_at', 
            'resolved_at', 'notes'
        )
        
        # Free users see only last 5 events
        if not is_premium:
            queryset = queryset[:FREE_TIER_LIMITS['MAX_INCIDENT_HISTORY']]
        
        return queryset
    
    def list(self, request, *args, **kwargs):
        """List SOS events with limit info."""
        user_id = kwargs.get('user_id')
        if user_id is not None and request.user.id != int(user_id):
            return Response(
                {'error': 'You can only view your own SOS events.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        # Get queryset and convert to list to avoid lazy evaluation issues
        queryset = list(self.get_queryset())
        
        # Manually serialize to avoid accessing non-existent fields
        events_data = []
        for event in queryset:
            event_data = {
                'id': event.id,
                'status': event.status,
                'triggered_at': event.triggered_at.isoformat() if event.triggered_at else None,
                'created_at': event.triggered_at.isoformat() if event.triggered_at else None,
                'resolved_at': event.resolved_at.isoformat() if event.resolved_at else None,
                'notes': event.notes or '',
                'location': None
            }
            # Handle location
            if event.location:
                if isinstance(event.location, dict):
                    event_data['location'] = event.location
                elif hasattr(event.location, 'x') and hasattr(event.location, 'y'):
                    event_data['location'] = {
                        'longitude': event.location.x,
                        'latitude': event.location.y
                    }
            events_data.append(event_data)
        
        return Response({
            'events': events_data,
            'is_premium': is_premium,
            'limit': None if is_premium else FREE_TIER_LIMITS['MAX_INCIDENT_HISTORY'],
            'message': None if is_premium else f'Free plan shows last {FREE_TIER_LIMITS["MAX_INCIDENT_HISTORY"]} incidents. Upgrade to Premium for unlimited history.'
        })


class GeofenceEventView(APIView):
    """
    Record geofence enter/exit events.
    POST /users/<user_id>/geofence_event/
    Premium users only - this is a premium feature.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, user_id):
        """Record geofence enter/exit event (Premium users only)."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'You can only record geofence events for your own account.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if user is premium
        user = request.user
        is_premium = _is_user_premium(user)
        
        # Allow geofence events for premium users OR in DEBUG mode for easier testing
        if not is_premium and not settings.DEBUG:
            return Response(
                {
                    'error': 'Geofences are a Premium feature. Upgrade to Premium to use geofence monitoring.',
                    'is_premium': False,
                    'upgrade_required': True
                },
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = GeofenceEventSerializer(data=request.data)
        if serializer.is_valid():
            user = request.user
            geofence_id = serializer.validated_data['geofence_id']
            event_type = serializer.validated_data['event_type']
            latitude = serializer.validated_data['latitude']
            longitude = serializer.validated_data['longitude']
            timestamp = serializer.validated_data.get('timestamp', timezone.now())
            
            # Get the geofence (from users.models.Geofence - common organization-based geofence)
            from users.models import Geofence as AdminGeofence
            try:
                geofence = AdminGeofence.objects.get(id=geofence_id, active=True)
            except AdminGeofence.DoesNotExist:
                return Response(
                    {'error': 'Geofence not found or is inactive.'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Create GeofenceEvent record for tracking
            geofence_event = GeofenceEvent.objects.create(
                user=user,
                geofence=geofence,
                event_type='entry' if event_type == 'enter' else 'exit',
                latitude=latitude,
                longitude=longitude,
                timestamp=timezone.now()
            )

            return Response({
                'message': 'Geofence event recorded successfully',
                'geofence': {
                    'id': geofence.id,
                    'name': geofence.name,
                    'radius': geofence.radius,
                    'center_lat': geofence.center_latitude,
                    'center_lng': geofence.center_longitude,
                },
                'event': {
                    'id': geofence_event.id,
                    'type': geofence_event.event_type,
                    'timestamp': geofence_event.timestamp,
                }
            }, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SOSEventMarkReadView(APIView):
    """
    Mark SOS event as read by admin/sub-admin/security officer.
    POST /users/<user_id>/sos_events/<sos_event_id>/mark_read/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, user_id, sos_event_id):
        """Mark SOS event as read."""
        # Check if user has permission (admin, sub-admin, or security officer)
        user = request.user
        if user.role not in ['SUPER_ADMIN', 'SUB_ADMIN', 'security_officer']:
            return Response(
                {'error': 'Only admins, sub-admins, and security officers can mark SOS events as read.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            sos_event = SOSEvent.objects.get(id=sos_event_id)
        except SOSEvent.DoesNotExist:
            return Response(
                {'error': 'SOS event not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Mark as read
        is_newly_read = sos_event.mark_as_read(user)
        
        return Response({
            'message': 'SOS event marked as read.' if is_newly_read else 'SOS event was already read.',
            'is_read': True,
            'read_timestamp': sos_event.get_read_timestamp(user),
            'read_by_ids': list(sos_event.read_by.values_list('id', flat=True)),
        }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def user_stats(request, user_id):
    """
    Get user statistics.
    GET /users/<id>/stats/
    """
    if request.user.id != int(user_id):
        return Response(
            {'error': 'You can only view your own statistics.'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    user = request.user
    is_premium = _is_user_premium(user)
    
    stats = {
        'total_family_contacts': FamilyContact.objects.filter(user=user).count(),
        'max_contacts': None if is_premium else FREE_TIER_LIMITS['MAX_CONTACTS'],
        'active_community_memberships': CommunityMembership.objects.filter(
            user=user, is_active=True
        ).count(),
        'total_sos_events': SOSEvent.objects.filter(user=user).only(
            'id'
        ).count(),
        'is_premium': is_premium,
        'plan_type': getattr(user, 'plantype', 'free'),
        'plan_expiry': getattr(user, 'planexpiry', None),
    }
    
    return Response(stats)


class SOSTriggerView(APIView):
    """
    Trigger SOS alert and create entry in unified users_alert table.
    POST /users/<user_id>/sos/
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, user_id):
        """Create SOS alert in unified alert system."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'You can only trigger SOS for your own account.'},
                status=status.HTTP_403_FORBIDDEN
            )

        user = request.user
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        notes = request.data.get('notes', '')

        if latitude is None or longitude is None:
            return Response(
                {'error': 'latitude and longitude are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Import required models
        from users.utils import get_geofence_from_location

        try:
            # Find geofence for this location
            geofence = get_geofence_from_location(float(latitude), float(longitude))
            logger.info(f"[SOS] User {user.email} geofence: {geofence.name if geofence else 'None'}")

            # Create SOS event - signal will create alert
            sos_event = SOSEvent.objects.create(
                user=user,
                notes=notes,
                location={'longitude': longitude, 'latitude': latitude},
                status='triggered'
            )

            logger.info(f"[SOS] SOS event created for user {user.email}")

            # Send SMS to emergency contacts (existing logic)
            try:
                from .services import SMSService
                sms_service = SMSService()

                # Get family contacts
                family_contacts = FamilyContact.objects.filter(user=user, is_primary=True)
                if family_contacts.exists():
                    contact = family_contacts.first()
                    message = f"EMERGENCY: {user.first_name or user.username} triggered SOS at {latitude}, {longitude}"
                    sms_service.send_sms(contact.phone, message)
                    logger.info(f"[SOS] SMS sent to {contact.phone}")
            except Exception as sms_error:
                logger.error(f"[SOS] SMS failed: {sms_error}")

            return Response({
                'message': 'SOS event created successfully',
                'sos_event_id': sos_event.id,
                'geofence': geofence.name if geofence else None,
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"[SOS] Error creating SOS event: {e}", exc_info=True)
            return Response(
                {'error': 'Failed to create SOS event'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
def _is_user_premium(user):
    """Check if user has premium subscription by checking UserDetails."""
    # Treat all users as premium in DEBUG mode for easier local testing
    if settings.DEBUG:
        return True
        
    try:
        from users.models import UserDetails
        user_details = UserDetails.objects.filter(username=user.username).first()
        if user_details and user_details.price > 0:
            return True
    except:
        pass
    # Fallback checks
    if hasattr(user, 'is_paid_user') and user.is_paid_user:
        return True
    if hasattr(user, 'is_premium') and user.is_premium:
        return True
    email = getattr(user, 'email', '').lower()
    username = getattr(user, 'username', '').lower()
    if 'premium' in email or 'premium' in username:
            return True
    return False


# Subscription endpoints
class SubscriptionView(APIView):
    """
    Subscribe to premium plan.
    POST /users/subscribe/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        """Subscribe user to premium plan."""
        serializer = SubscriptionSerializer(data=request.data)
        if serializer.is_valid():
            user = request.user
            plan_type = serializer.validated_data['plan_type']
            promo_code = serializer.validated_data.get('promo_code', '')
            
            # Calculate expiry date
            if plan_type == 'premium-monthly':
                expiry_date = timezone.now().date() + timedelta(days=30)
            else:  # premium-annual
                expiry_date = timezone.now().date() + timedelta(days=365)
            
            # Update user plan
            if hasattr(user, 'plantype'):
                user.plantype = 'premium'
            if hasattr(user, 'planexpiry'):
                user.planexpiry = expiry_date
            user.save()
            
            logger.info(f"User subscribed to premium: {user.email} - {plan_type}")
            
            return Response({
                'success': True,
                'plan_type': 'premium',
                'planexpiry': expiry_date.isoformat(),
                'message': f'Successfully subscribed to {plan_type}'
            }, status=status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ValidatePromoCodeView(APIView):
    """
    Validate a promo code.
    POST /users/validate-promocode/
    """
    permission_classes = [permissions.AllowAny]  # Allow validation without auth
    
    def post(self, request):
        """Validate a promo code and return its details."""
        code = request.data.get('code', '').strip().upper()
        
        if not code:
            return Response({
                'valid': False,
                'error': 'Promo code is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            promo_code = PromoCode.objects.get(code=code)
        except PromoCode.DoesNotExist:
            return Response({
                'valid': False,
                'error': 'Invalid promo code'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Check if code is valid
        is_valid = promo_code.is_valid()
        
        if not is_valid:
            if not promo_code.is_active:
                error_message = 'This promo code is no longer active'
            elif timezone.now() >= promo_code.expiry_date:
                error_message = 'This promo code has expired'
            else:
                error_message = 'This promo code is invalid'
            
            return Response({
                'valid': False,
                'error': error_message,
                'code': promo_code.code,
                'discount_percentage': float(promo_code.discount_percentage),
                'expiry_date': promo_code.expiry_date.isoformat(),
                'is_active': promo_code.is_active,
            }, status=status.HTTP_200_OK)
        
        # Return valid promo code details
        return Response({
            'valid': True,
            'code': promo_code.code,
            'discount_percentage': float(promo_code.discount_percentage),
            'expiry_date': promo_code.expiry_date.isoformat(),
            'message': f'You will get {promo_code.discount_percentage}% discount',
        }, status=status.HTTP_200_OK)


class CancelSubscriptionView(APIView):
    """
    Cancel premium subscription.
    POST /users/subscribe/cancel/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        """Cancel user's premium subscription."""
        user = request.user
        
        # Downgrade to free
        if hasattr(user, 'plantype'):
            user.plantype = 'free'
        if hasattr(user, 'planexpiry'):
            user.planexpiry = None
        user.save()
        
        logger.info(f"User cancelled subscription: {user.email}")
        
        return Response({
            'message': 'Subscription cancelled successfully. You are now on the free plan.'
        }, status=status.HTTP_200_OK)


# Live Location Sharing endpoints
class LiveLocationShareView(APIView):
    """
    Start live location sharing.
    POST /users/<user_id>/live_location/start/
    GET /users/<user_id>/live_location/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, user_id):
        """Start live location sharing."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'You can only start live sharing for your own account.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        serializer = LiveLocationShareCreateSerializer(data=request.data)
        if serializer.is_valid():
            duration_minutes = serializer.validated_data['duration_minutes']
            
            # Check free tier limit
            if not is_premium and duration_minutes > FREE_TIER_LIMITS['MAX_LIVE_SHARE_MINUTES']:
                return Response({
                    'error': f'Free plan allows up to {FREE_TIER_LIMITS["MAX_LIVE_SHARE_MINUTES"]} minutes of live sharing. Upgrade to Premium for unlimited sharing.'
                }, status=status.HTTP_403_FORBIDDEN)
            
            # Create live location share session
            expires_at = timezone.now() + timedelta(minutes=duration_minutes)
            live_share = LiveLocationShare.objects.create(
                user=user,
                expires_at=expires_at,
                last_broadcast_at=timezone.now(),
                plan_type='premium' if is_premium else 'free',
                stop_reason='',
            )
            
            # Add shared_with users if provided
            shared_with_ids = serializer.validated_data.get('shared_with_user_ids', [])
            if shared_with_ids:
                shared_users = User.objects.filter(id__in=shared_with_ids)
                live_share.shared_with.set(shared_users)
            
            logger.info(f"Live location sharing started: {user.email} for {duration_minutes} minutes")
            
            return Response({
                'message': 'Live location sharing started',
                'session': LiveLocationShareSerializer(live_share).data
            }, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def get(self, request, user_id):
        """Get active live location sharing sessions."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'You can only view your own live location sessions.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        active_sessions = LiveLocationShare.objects.filter(
            user=user,
            is_active=True,
            expires_at__gt=timezone.now()
        )
        
        return Response({
            'sessions': LiveLocationShareSerializer(active_sessions, many=True).data
        })


class LiveLocationShareDetailView(APIView):
    """
    Update or stop a live location sharing session.
    PATCH /users/<user_id>/live_location/<session_id>/
    DELETE /users/<user_id>/live_location/<session_id>/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def patch(self, request, user_id, session_id):
        """Update the current location of an active session."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'You can only update your own live location session.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            live_share = LiveLocationShare.objects.get(id=session_id, user=request.user)
        except LiveLocationShare.DoesNotExist:
            return Response({'error': 'Live location session not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if not live_share.is_active or live_share.expires_at <= timezone.now():
            updates = []
            if live_share.is_active:
                live_share.is_active = False
                updates.append('is_active')
            if live_share.expires_at <= timezone.now():
                if not live_share.stop_reason:
                    live_share.stop_reason = 'limit' if live_share.plan_type == 'free' else 'expired'
                    updates.append('stop_reason')
            if updates:
                live_share.save(update_fields=updates)
            return Response({'error': 'Live location session has ended'}, status=status.HTTP_400_BAD_REQUEST)
        
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f'[Live Share Update] Received request data: {request.data}')
        logger.info(f'[Live Share Update] Raw values - latitude={latitude} (type: {type(latitude)}), longitude={longitude} (type: {type(longitude)})')
        
        if latitude is None or longitude is None:
            logger.error(f'[Live Share Update] Missing coordinates - latitude={latitude}, longitude={longitude}')
            return Response({'error': 'latitude and longitude are required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            lat = float(latitude)
            lng = float(longitude)
        except (TypeError, ValueError) as e:
            logger.error(f'[Live Share Update] Invalid coordinate conversion: {e}')
            return Response({'error': 'Invalid latitude/longitude values'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate coordinate ranges
        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            logger.error(f'[Live Share Update] Coordinates out of range: lat={lat}, lng={lng}')
            return Response({'error': 'Coordinates out of valid range'}, status=status.HTTP_400_BAD_REQUEST)
        
        logger.info(f'[Live Share Update] Processing session {session_id} for user {user_id}: lat={lat}, lng={lng}')
        
        location_dict = {'latitude': lat, 'longitude': lng}
        logger.info(f'[Live Share Update] Storing location dict: {location_dict}')
        
        live_share.current_location = location_dict
        live_share.last_broadcast_at = timezone.now()
        live_share.save(update_fields=['current_location', 'last_broadcast_at'])
        
        # Verify what was saved
        live_share.refresh_from_db()
        logger.info(f'[Live Share Update] Saved location: {live_share.current_location}')
        logger.info(f'[Live Share Update] Location type: {type(live_share.current_location)}')

        last_point = live_share.track_points.order_by('-recorded_at').first()
        should_record = True
        if last_point:
            delta = timezone.now() - last_point.recorded_at
            should_record = delta.total_seconds() >= 60
        if should_record:
            live_share.track_points.create(latitude=lat, longitude=lng)
        return Response({'status': 'updated'}, status=status.HTTP_200_OK)
    
    def delete(self, request, user_id, session_id):
        """Stop an active live sharing session."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'You can only stop your own live location session.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            live_share = LiveLocationShare.objects.get(id=session_id, user=request.user)
        except LiveLocationShare.DoesNotExist:
            return Response({'error': 'Live location session not found'}, status=status.HTTP_404_NOT_FOUND)
        
        live_share.is_active = False
        live_share.expires_at = timezone.now()
        live_share.current_location = None
        live_share.stop_reason = 'user'
        live_share.save(update_fields=['is_active', 'expires_at', 'current_location', 'stop_reason'])
        return Response({'status': 'stopped'}, status=status.HTTP_200_OK)


# Geofencing endpoints (Premium only)
class GeofenceListView(APIView):
    """
    List admin-created geofences.
    GET /users/<user_id>/geofences/
    Returns all active admin-created geofences with polygon data.
    Premium users only - this is a premium feature.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, user_id):
        """List admin-created geofences (Premium users only)."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'You can only view your own geofences.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if user is premium
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response(
                {
                    'error': 'Geofences are a Premium feature. Upgrade to Premium to view and use geofences.',
                    'is_premium': False,
                    'upgrade_required': True
                },
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Import admin Geofence model
        from users.models import Geofence as AdminGeofence
        
        # Get all active admin-created geofences (all users can see all geofences)
        admin_geofences = AdminGeofence.objects.filter(active=True).select_related('organization', 'created_by')
        
        # Convert to mobile app format
        geofences_data = []
        colors = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']
        
        for idx, admin_geo in enumerate(admin_geofences):
            # Get polygon coordinates
            polygon_coords = admin_geo.get_polygon_coordinates()
            center_point = admin_geo.get_center_point()
        
            if not polygon_coords or not center_point:
                continue  # Skip invalid geofences
            
            # Extract coordinates from polygon (GeoJSON format: [lng, lat])
            # Convert to [[lat, lng], ...] for Leaflet
            polygon_points = []
            if polygon_coords and len(polygon_coords) > 0:
                ring = polygon_coords[0]  # First ring of polygon
                for coord in ring:
                    if len(coord) >= 2:
                        # GeoJSON is [lng, lat], Leaflet needs [lat, lng]
                        polygon_points.append([coord[1], coord[0]])
            
            if not polygon_points:
                continue
            
            # Calculate radius from polygon (max distance from center to any point)
            import math
            center_lat, center_lon = center_point[0], center_point[1]
            max_radius = 0
            for point in polygon_points:
                point_lat, point_lon = point[0], point[1]
                # Haversine formula to calculate distance
                R = 6371000  # Earth radius in meters
                dlat = math.radians(point_lat - center_lat)
                dlon = math.radians(point_lon - center_lon)
                a = math.sin(dlat/2)**2 + math.cos(math.radians(center_lat)) * math.cos(math.radians(point_lat)) * math.sin(dlon/2)**2
                c = 2 * math.asin(math.sqrt(a))
                distance = R * c
                max_radius = max(max_radius, distance)
            
            # Round to nearest 10 meters for cleaner display
            radius_meters = int(math.ceil(max_radius / 10) * 10)
            
            geofences_data.append({
                'id': admin_geo.id,
                'name': admin_geo.name,
                'description': admin_geo.description or '',
                'polygon': polygon_points,  # Array of [lat, lng] pairs
                'center': {
                    'latitude': center_point[0],
                    'longitude': center_point[1],
                },
                'center_location': {  # Backward compatibility
                    'latitude': center_point[0],
                    'longitude': center_point[1],
                },
                'radius': radius_meters,  # Calculated radius in meters
                'radius_meters': radius_meters,  # Alternative field name for compatibility
                'is_active': admin_geo.active,
                'alert_on_entry': True,  # Default values for compatibility
                'alert_on_exit': True,
                'color': colors[idx % len(colors)],
                'organization_name': admin_geo.organization.name if admin_geo.organization else '',
                'created_at': admin_geo.created_at.isoformat() if admin_geo.created_at else None,
            })
        
        return Response({
            'geofences': geofences_data
        })
    
    def post(self, request, user_id):
        """Users cannot create geofences - only admins can."""
        return Response({
            'error': 'Geofences can only be created by administrators. Please contact your admin to create geofences.'
        }, status=status.HTTP_403_FORBIDDEN)


# Community Alert endpoints
class CommunityAlertView(APIView):
    """
    Send and get community alerts.
    POST /users/<user_id>/community_alert/ - Send a community alert
    GET /users/<user_id>/community_alerts/ - Get alerts for user based on geofence
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, user_id):
        """Send a community alert."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'You can only send alerts for your own account.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        serializer = CommunityAlertCreateSerializer(data=request.data)
        if serializer.is_valid():
            message = serializer.validated_data['message']
            location = serializer.validated_data['location']
            radius_meters = serializer.validated_data.get('radius_meters', 500)
            
            # Check free tier limit
            if not is_premium and radius_meters > FREE_TIER_LIMITS['COMMUNITY_ALERT_RADIUS_METERS']:
                return Response({
                    'error': f'Free plan allows alerts within {FREE_TIER_LIMITS["COMMUNITY_ALERT_RADIUS_METERS"]}m radius. Upgrade to Premium for unlimited radius.'
                }, status=status.HTTP_403_FORBIDDEN)
            
            # Create community alert
            alert = CommunityAlert.objects.create(
                user=user,
                message=message,
                location=location,
                radius_meters=radius_meters,
                is_premium_alert=is_premium
            )
            
            logger.info(f"Community alert sent: {user.email} - {radius_meters}m radius")
            
            return Response({
                'message': 'Community alert sent successfully',
                'alert': CommunityAlertSerializer(alert).data
            }, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CommunityAlertListView(APIView):
    """
    Get community alerts for user based on their geofence location.
    GET /users/<user_id>/community_alerts/
    Returns alerts that:
    1. Are within the user's geofence
    2. Are created for all geofences (radius covers user's location)
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def _haversine_distance(self, lat1, lon1, lat2, lon2):
        """Calculate distance between two points in meters using Haversine formula."""
        import math
        R = 6371000  # Earth radius in meters
        
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = math.sin(delta_phi / 2) ** 2 + \
            math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def get(self, request, user_id):
        """Get community alerts for the user based on geofence."""
        try:
            user = request.user
            if user.id != int(user_id):
                return Response(
                    {'error': 'You can only view alerts for your own account.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Get user's current location
            user_location = None
            try:
                if hasattr(user, 'location') and user.location:
                    user_location = user.location
            except Exception as e:
                logger.warning(f"Could not get user location: {e}")
            
            # Get all community alerts
            try:
                all_alerts = CommunityAlert.objects.select_related('user').all().order_by('-sent_at')
            except Exception as e:
                logger.error(f"Error fetching community alerts: {e}")
                return Response([], status=status.HTTP_200_OK)
            
            # Filter alerts based on geofence
            relevant_alerts = []
            
            # Check if user has location
            has_location = user_location is not None
            
            # If user has no location, show ALL alerts
            # (Without location data, we can't filter properly, so show everything)
            if not has_location:
                logger.info(f"User {user.id} has no location, returning all {all_alerts.count()} alerts")
                serializer = CommunityAlertSerializer(all_alerts, many=True)
                return Response(serializer.data, status=status.HTTP_200_OK)
            
            for alert in all_alerts:
                try:
                    alert_location = alert.location
                    if not alert_location:
                        continue
                    
                    # Extract coordinates from alert location
                    alert_lon = alert_location.get('longitude') or alert_location.get('lng') or (alert_location[0] if isinstance(alert_location, (list, tuple)) else None)
                    alert_lat = alert_location.get('latitude') or alert_location.get('lat') or (alert_location[1] if isinstance(alert_location, (list, tuple)) else None)
                    
                    if alert_lat is None or alert_lon is None:
                        continue
                    
                    # Check if alert is within user's location radius
                    is_within_geofence = False
                    
                    # Check if user's location is within alert's radius
                    if user_location:
                        try:
                            user_lat = user_location.get('latitude') or user_location.get('lat') or (user_location[1] if isinstance(user_location, (list, tuple)) else None)
                            user_lon = user_location.get('longitude') or user_location.get('lng') or (user_location[0] if isinstance(user_location, (list, tuple)) else None)
                            
                            if user_lat and user_lon:
                                distance = self._haversine_distance(user_lat, user_lon, alert_lat, alert_lon)
                                alert_radius = alert.radius_meters or 500
                                
                                # If alert has very large radius (>10000m), consider it for all geofences
                                if alert_radius > 10000 or distance <= alert_radius:
                                    is_within_geofence = True
                        except Exception as e:
                            logger.warning(f"Error checking user location against alert: {e}")
                            continue
                    
                    if is_within_geofence:
                        relevant_alerts.append(alert)
                except Exception as e:
                    logger.warning(f"Error processing alert {alert.id}: {e}")
                    continue
            
            # Serialize alerts
            serializer = CommunityAlertSerializer(relevant_alerts, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error in CommunityAlertListView.get: {e}", exc_info=True)
            # Return empty list on error instead of crashing
            return Response([], status=status.HTTP_200_OK)


class ChatGroupListView(APIView):
    """
    List and create chat groups.
    GET /users/<user_id>/chat_groups/ - List user's groups
    POST /users/<user_id>/chat_groups/ - Create a new group
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, user_id):
        """Get all groups the user is a member of."""
        try:
            user = User.objects.get(id=user_id)
            if request.user.id != user.id:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
            groups = ChatGroup.objects.filter(members=user).distinct()
            serializer = ChatGroupSerializer(groups, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def post(self, request, user_id):
        """Create a new chat group."""
        try:
            user = User.objects.get(id=user_id)
            if request.user.id != user.id:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
            serializer = ChatGroupCreateSerializer(data=request.data)
            if serializer.is_valid():
                # Check for duplicate group name (case-insensitive)
                group_name = serializer.validated_data['name'].strip()
                existing_group = ChatGroup.objects.filter(
                    name__iexact=group_name,
                    created_by=user
                ).first()
                
                if existing_group:
                    return Response(
                        {'error': 'A group with this name already exists. Please choose a different name.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                group = ChatGroup.objects.create(
                    name=group_name,
                    description=serializer.validated_data.get('description', ''),
                    created_by=user,
                    admin=user  # Creator is admin by default
                )
                # Add creator as member
                group.members.add(user)
                # Add other members
                member_ids = serializer.validated_data.get('member_ids', [])
                for member_id in member_ids:
                    try:
                        member = User.objects.get(id=member_id)
                        group.members.add(member)
                    except User.DoesNotExist:
                        continue
                
                return Response(ChatGroupSerializer(group).data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)


class ChatGroupDetailView(APIView):
    """
    Get, update, or delete a chat group.
    GET /users/<user_id>/chat_groups/<group_id>/ - Get group details
    DELETE /users/<user_id>/chat_groups/<group_id>/ - Delete group
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, user_id, group_id):
        """Get group details."""
        try:
            user = User.objects.get(id=user_id)
            if request.user.id != user.id:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
            group = ChatGroup.objects.get(id=group_id, members=user)
            serializer = ChatGroupSerializer(group)
            data = serializer.data
            # Add admin info
            data['admin_id'] = group.admin.id if group.admin else group.created_by.id
            data['is_admin'] = (group.admin and group.admin.id == user.id) or (not group.admin and group.created_by.id == user.id)
            return Response(data, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        except ChatGroup.DoesNotExist:
            return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def delete(self, request, user_id, group_id):
        """Delete a group (only admin can delete)."""
        try:
            user = User.objects.get(id=user_id)
            if request.user.id != user.id:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
            group = ChatGroup.objects.get(id=group_id, members=user)
            
            # Check if user is admin (or creator if admin is not set)
            is_admin = (group.admin and group.admin.id == user.id) or (not group.admin and group.created_by.id == user.id)
            
            if not is_admin:
                return Response({'error': 'Only the group admin can delete the group'}, status=status.HTTP_403_FORBIDDEN)
            
            group.delete()
            return Response({'message': 'Group deleted successfully'}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        except ChatGroup.DoesNotExist:
            return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)


class ChatGroupMemberView(APIView):
    """
    Manage group members: add, remove, leave group.
    POST /users/<user_id>/chat_groups/<group_id>/members/ - Add members
    DELETE /users/<user_id>/chat_groups/<group_id>/members/<member_id>/ - Remove member
    POST /users/<user_id>/chat_groups/<group_id>/leave/ - Leave group
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, user_id, group_id):
        """Add members to a group."""
        try:
            user = User.objects.get(id=user_id)
            if request.user.id != user.id:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
            group = ChatGroup.objects.get(id=group_id, members=user)
            member_ids = request.data.get('member_ids', [])
            
            if not isinstance(member_ids, list):
                return Response({'error': 'member_ids must be a list'}, status=status.HTTP_400_BAD_REQUEST)
            
            added_members = []
            for member_id in member_ids:
                try:
                    member = User.objects.get(id=member_id)
                    if member not in group.members.all():
                        group.members.add(member)
                        added_members.append(member_id)
                except User.DoesNotExist:
                    continue
            
            group.save()  # Update updated_at
            serializer = ChatGroupSerializer(group)
            data = serializer.data
            data['admin_id'] = group.admin.id if group.admin else group.created_by.id
            data['is_admin'] = (group.admin and group.admin.id == user.id) or (not group.admin and group.created_by.id == user.id)
            return Response(data, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        except ChatGroup.DoesNotExist:
            return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def delete(self, request, user_id, group_id, member_id=None):
        """Remove a member from a group (admin only) or leave group."""
        try:
            user = User.objects.get(id=user_id)
            if request.user.id != user.id:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
            group = ChatGroup.objects.get(id=group_id, members=user)
            
            # Check if user is admin (or creator if admin is not set)
            is_admin = (group.admin and group.admin.id == user.id) or (not group.admin and group.created_by.id == user.id)
            
            if member_id:
                # Remove another member (admin only)
                if not is_admin:
                    return Response({'error': 'Only the group admin can remove members'}, status=status.HTTP_403_FORBIDDEN)
                
                try:
                    member_to_remove = User.objects.get(id=member_id)
                    if member_to_remove not in group.members.all():
                        return Response({'error': 'User is not a member of this group'}, status=status.HTTP_400_BAD_REQUEST)
                    
                    # Cannot remove admin
                    if (group.admin and group.admin.id == member_to_remove.id) or (not group.admin and group.created_by.id == member_to_remove.id):
                        return Response({'error': 'Cannot remove the group admin'}, status=status.HTTP_400_BAD_REQUEST)
                    
                    group.members.remove(member_to_remove)
                    group.save()
                    
                    serializer = ChatGroupSerializer(group)
                    data = serializer.data
                    data['admin_id'] = group.admin.id if group.admin else group.created_by.id
                    data['is_admin'] = (group.admin and group.admin.id == user.id) or (not group.admin and group.created_by.id == user.id)
                    return Response(data, status=status.HTTP_200_OK)
                except User.DoesNotExist:
                    return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)
            else:
                # Leave group
                if is_admin:
                    # If admin is leaving, transfer admin to another member or creator
                    remaining_members = group.members.exclude(id=user.id)
                    if remaining_members.exists():
                        # Transfer admin to first remaining member
                        new_admin = remaining_members.first()
                        group.admin = new_admin
                        group.save()
                    # If no remaining members, admin can delete the group
                    # For now, we'll just remove the admin and let them leave
                    # The group will be orphaned but can be cleaned up later
                
                group.members.remove(user)
                group.save()
                
                return Response({'message': 'Left group successfully'}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        except ChatGroup.DoesNotExist:
            return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)


class ChatMessageListView(APIView):
    """
    List and create chat messages.
    GET /users/<user_id>/chat_groups/<group_id>/messages/ - Get messages
    POST /users/<user_id>/chat_groups/<group_id>/messages/ - Send a message
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, user_id, group_id):
        """Get all messages in a group."""
        try:
            user = User.objects.get(id=user_id)
            if request.user.id != user.id:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
            group = ChatGroup.objects.get(id=group_id, members=user)
            messages = ChatMessage.objects.filter(group=group).order_by('created_at')
            serializer = ChatMessageSerializer(messages, many=True, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        except ChatGroup.DoesNotExist:
            return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def post(self, request, user_id, group_id):
        """Send a message to a group."""
        try:
            user = User.objects.get(id=user_id)
            if request.user.id != user.id:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
            group = ChatGroup.objects.get(id=group_id, members=user)
            
            # Check file size if file is provided
            if 'file' in request.FILES:
                file = request.FILES['file']
                max_size = 2 * 1024 * 1024  # 2 MB
                if file.size > max_size:
                    return Response({'error': 'File size exceeds 2 MB limit'}, status=status.HTTP_400_BAD_REQUEST)
            
            if 'image' in request.FILES:
                image = request.FILES['image']
                max_size = 2 * 1024 * 1024  # 2 MB
                if image.size > max_size:
                    return Response({'error': 'Image size exceeds 2 MB limit'}, status=status.HTTP_400_BAD_REQUEST)
            
            serializer = ChatMessageCreateSerializer(data=request.data)
            if serializer.is_valid():
                message_data = {
                    'group': group,
                    'sender': user,
                    'text': serializer.validated_data.get('text', ''),
                }
                
                if 'image' in request.FILES:
                    image = request.FILES['image']
                    message_data['image'] = image
                    # For images, save the original file name
                    # Priority: request.data (FormData) > file object name > default
                    image_name = None
                    if 'file_name' in request.data:
                        image_name = str(request.data.get('file_name')).strip()
                    elif hasattr(image, 'name') and image.name:
                        image_name = image.name
                    elif serializer.validated_data.get('file_name'):
                        image_name = serializer.validated_data.get('file_name')
                    
                    # Ensure we have a file name (extract from image object if needed)
                    if not image_name and hasattr(image, 'name'):
                        image_name = image.name
                    if not image_name:
                        image_name = 'image'  # Default fallback
                    
                    # Always set file_name for images
                        message_data['file_name'] = image_name
                    
                    # Extract file size for images - always try to get it
                    image_size = None
                    if 'file_size' in request.data:
                        try:
                            image_size = int(request.data.get('file_size'))
                        except (ValueError, TypeError):
                            pass
                    
                    # Fallback to file size from uploaded image object (always use if available)
                    if not image_size:
                        if hasattr(image, 'size') and image.size:
                            image_size = image.size
                        elif serializer.validated_data.get('file_size'):
                            image_size = serializer.validated_data.get('file_size')
                    
                    # Always save file_size if we have it, otherwise save 0
                    message_data['file_size'] = image_size if image_size else 0
                
                if 'file' in request.FILES:
                    file = request.FILES['file']
                    message_data['file'] = file
                    
                    # Extract file name from FormData (priority: request.data > file.name > serializer)
                    # request.data is used for FormData fields
                    file_name = None
                    if 'file_name' in request.data:
                        file_name = str(request.data.get('file_name')).strip()
                    elif hasattr(file, 'name') and file.name:
                        file_name = file.name
                    elif serializer.validated_data.get('file_name'):
                        file_name = serializer.validated_data.get('file_name')
                    
                    # Ensure we have a file name (extract from file object if needed)
                    if not file_name and hasattr(file, 'name'):
                        file_name = file.name
                    if not file_name:
                        file_name = 'file'  # Default fallback
                    
                    message_data['file_name'] = file_name
                    
                    # Extract file size - always try to get it
                    file_size = None
                    if 'file_size' in request.data:
                        try:
                            file_size = int(request.data.get('file_size'))
                        except (ValueError, TypeError):
                            pass
                    
                    # Fallback to file size from uploaded file object (always use if available)
                    if not file_size:
                        if hasattr(file, 'size') and file.size:
                            file_size = file.size
                        elif serializer.validated_data.get('file_size'):
                            file_size = serializer.validated_data.get('file_size')
                    
                    # Always save file_size if we have it, otherwise save 0
                    message_data['file_size'] = file_size if file_size else 0
                
                message = ChatMessage.objects.create(**message_data)
                # Update group's updated_at timestamp
                group.save()
                return Response(ChatMessageSerializer(message, context={'request': request}).data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        except ChatGroup.DoesNotExist:
            return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)


class ChatMessageDetailView(APIView):
    """
    Update and delete chat messages.
    PUT /users/<user_id>/chat_groups/<group_id>/messages/<message_id>/ - Edit a message
    DELETE /users/<user_id>/chat_groups/<group_id>/messages/<message_id>/ - Delete a message
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def put(self, request, user_id, group_id, message_id):
        """Edit a message (only sender can edit)."""
        try:
            user = User.objects.get(id=user_id)
            if request.user.id != user.id:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
            group = ChatGroup.objects.get(id=group_id, members=user)
            message = ChatMessage.objects.get(id=message_id, group=group)
            
            # Only the sender can edit their message
            if message.sender.id != user.id:
                return Response({'error': 'You can only edit your own messages'}, status=status.HTTP_403_FORBIDDEN)
            
            serializer = ChatMessageCreateSerializer(message, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                # Update group's updated_at timestamp
                group.save()
                return Response(ChatMessageSerializer(message).data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        except ChatGroup.DoesNotExist:
            return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)
        except ChatMessage.DoesNotExist:
            return Response({'error': 'Message not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def delete(self, request, user_id, group_id, message_id):
        """Delete a message (only sender can delete)."""
        try:
            user = User.objects.get(id=user_id)
            if request.user.id != user.id:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
            
            group = ChatGroup.objects.get(id=group_id, members=user)
            message = ChatMessage.objects.get(id=message_id, group=group)
            
            # Only the sender can delete their message
            if message.sender.id != user.id:
                return Response({'error': 'You can only delete your own messages'}, status=status.HTTP_403_FORBIDDEN)
            
            message.delete()
            # Update group's updated_at timestamp
            group.save()
            return Response({'message': 'Message deleted successfully'}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        except ChatGroup.DoesNotExist:
            return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)
        except ChatMessage.DoesNotExist:
            return Response({'error': 'Message not found'}, status=status.HTTP_404_NOT_FOUND)


class AvailableUsersListView(APIView):
    """
    Get list of available users for group creation.
    GET /users/available_users/?geofence_only=true&include_other_geofences=false&search=query
    - geofence_only: if true, only show users within same geofences (default: true)
    - include_other_geofences: if true, include users from other geofences (default: false)
    - search: search query to filter users by name or email
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def _is_within_geofence(self, user_location, geofence_center, radius_meters):
        """Check if user location is within a geofence using simple distance calculation."""
        if not user_location or not geofence_center:
            return False
        
        try:
            import math
            # Extract coordinates
            if isinstance(user_location, dict):
                lat1 = user_location.get('latitude') or user_location.get('lat', 0)
                lng1 = user_location.get('longitude') or user_location.get('lng', 0)
            else:
                return False
            
            if isinstance(geofence_center, dict):
                lat2 = geofence_center.get('latitude') or geofence_center.get('lat', 0)
                lng2 = geofence_center.get('longitude') or geofence_center.get('lng', 0)
            else:
                return False
            
            # Haversine distance calculation (more accurate)
            R = 6371000  # Earth radius in meters
            phi1 = math.radians(lat1)
            phi2 = math.radians(lat2)
            delta_phi = math.radians(lat2 - lat1)
            delta_lambda = math.radians(lng2 - lng1)
            
            a = math.sin(delta_phi / 2) ** 2 + \
                math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            distance = R * c
            
            return distance <= radius_meters
        except Exception:
            return False
    
    def get(self, request):
        """Get users filtered by geofence and search query."""
        geofence_only = request.query_params.get('geofence_only', 'true').lower() == 'true'
        include_other_geofences = request.query_params.get('include_other_geofences', 'false').lower() == 'true'
        search_query = request.query_params.get('search', '').strip()
        
        # Get all active users except current user
        users = User.objects.exclude(id=request.user.id).filter(is_active=True)
        
        # Apply search filter
        if search_query:
            from django.db.models import Q
            query = Q(email__icontains=search_query) | Q(first_name__icontains=search_query) | Q(last_name__icontains=search_query)
            if hasattr(User, 'name'):
                query |= Q(name__icontains=search_query)
            users = users.filter(query)
        
        user_list = []
        # Geofence filtering is no longer supported (user profile geofences removed)
        if geofence_only:
            logger.warning("Geofence filtering requested but user profile geofences are no longer supported")
            geofence_only = False  # Disable geofence filtering
        
        # Get current user's location
        current_user_location = None
        if hasattr(request.user, 'location') and request.user.location:
            current_user_location = request.user.location
        
        for user in users:
            # Get user's location
            user_location = None
            if hasattr(user, 'location') and user.location:
                user_location = user.location
            
            # Geofence filtering removed - user profile geofences no longer supported
            
            # Safely get user name
            user_name = user.email  # Default to email
            try:
                if hasattr(user, 'first_name') and hasattr(user, 'last_name'):
                    full_name = f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
                    if full_name:
                        user_name = full_name
                elif hasattr(user, 'name') and getattr(user, 'name', None):
                    user_name = getattr(user, 'name')
            except Exception:
                pass  # Use email as fallback
            
            user_list.append({
                'id': user.id,
                'name': user_name,
                'email': user.email,
                'first_name': getattr(user, 'first_name', '') or '',
                'last_name': getattr(user, 'last_name', '') or '',
            })
        
        return Response(user_list, status=status.HTTP_200_OK)
