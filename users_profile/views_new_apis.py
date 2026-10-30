"""
New API endpoints for additional features
"""
from rest_framework import status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from math import radians, sin, cos, sqrt, atan2
from .views import _is_user_premium
from .models import LiveLocationShare
from django.contrib.auth import get_user_model
User = get_user_model()
from security_app.models import OfficerProfile
from django.utils import timezone

# Nearby Help Map API
def _build_nearby_help_payload(latitude, longitude):
    """Return mock nearby help data."""
    return [
        {
            'id': 1,
            'name': 'City Hospital',
            'type': 'hospital',
            'latitude': latitude + 0.01,
            'longitude': longitude + 0.01,
            'distance': 1.2,
            'phone': '+1234567890',
            'address': '123 Main St'
        },
        {
            'id': 2,
            'name': 'Police Station',
            'type': 'police',
            'latitude': latitude - 0.01,
            'longitude': longitude + 0.01,
            'distance': 1.5,
            'phone': '+1234567891',
            'address': '456 Oak Ave'
        },
        {
            'id': 3,
            'name': 'Fire Department',
            'type': 'fire',
            'latitude': latitude + 0.02,
            'longitude': longitude - 0.01,
            'distance': 2.1,
            'phone': '+1234567892',
            'address': '789 Pine Rd'
        }
    ]


@api_view(['GET'])
@permission_classes([permissions.AllowAny])  # Allow anyone to see nearby help
def nearby_help_map(request):
    """
    Get nearby emergency services (hospitals, police stations, etc.)
    GET /api/users/nearby_help/?latitude=40.7128&longitude=-74.0060&radius=5000
    """
    latitude_str = request.query_params.get('latitude')
    longitude_str = request.query_params.get('longitude')
    radius_str = request.query_params.get('radius', '5000')  # Default 5km
    
    try:
        latitude = float(latitude_str) if latitude_str else None
        longitude = float(longitude_str) if longitude_str else None
        radius = int(radius_str) if radius_str else 5000
    except (ValueError, TypeError):
        latitude = None
        longitude = None
        radius = 5000
    
    if latitude is None or longitude is None:
        return Response(
            {'error': 'Latitude and longitude are required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    nearby_places = _build_nearby_help_payload(latitude, longitude)
    
    return Response({
        'places': nearby_places,
        'user_location': {'latitude': latitude, 'longitude': longitude},
        'radius': radius
    })


def _haversine_km(lat1, lon1, lat2, lon2):
    """Calculate the great-circle distance between two points."""
    R = 6371  # Earth radius in kilometers
    phi1 = radians(lat1)
    phi2 = radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lon2 - lon1)

    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c


def _build_security_officer_payload(officers, ref_lat=None, ref_lon=None):
    profiles = OfficerProfile.objects.filter(officer__in=officers).select_related('officer')
    profile_lookup = {profile.officer_id: profile for profile in profiles}

    # Get active live location shares for these officers
    officer_ids = [o.id for o in officers]
    active_live_shares = LiveLocationShare.objects.filter(
        security_officer_id__in=officer_ids,
        is_active=True,
        expires_at__gt=timezone.now()
    ).select_related('security_officer')
    live_share_lookup = {share.security_officer_id: share for share in active_live_shares}

    payload = []
    for officer in officers:
        profile = profile_lookup.get(officer.id)
        location = None
        source = None
        last_seen = None
        battery = None
        on_duty = True
        is_live_sharing = False
        live_location = None

        # Check for active live location share
        live_share = live_share_lookup.get(officer.id)
        if live_share and live_share.current_location:
            live_location = live_share.current_location
            is_live_sharing = True
            source = 'live_share'
            last_seen = live_share.last_broadcast_at
            location = {
                'latitude': live_location.get('latitude') or live_location.get('lat'),
                'longitude': live_location.get('longitude') or live_location.get('lng'),
            }

        # Fall back to profile location if no live share
        if not location and profile:
            on_duty = profile.on_duty
            if profile.last_latitude is not None and profile.last_longitude is not None:
                location = {
                    'latitude': profile.last_latitude,
                    'longitude': profile.last_longitude,
                }
                if not source:
                    source = 'last_known'
                if not last_seen:
                    last_seen = profile.last_seen_at
                battery = profile.battery_level

        # Fall back to geofence center if still no location
        if location is None and officer.geofences.exists():
            first_geofence = officer.geofences.first()
            center = first_geofence.get_center_point()
            if center:
                location = {
                    'latitude': center[0],
                    'longitude': center[1],
                }
                if not source:
                    source = 'geofence_center'

        if location is None:
            continue

        distance_km = None
        if ref_lat is not None and ref_lon is not None:
            distance_km = round(_haversine_km(ref_lat, ref_lon, location['latitude'], location['longitude']), 2)

        officer_name = f"{officer.first_name} {officer.last_name}".strip() or officer.username
        first_geofence = officer.geofences.first() if officer.geofences.exists() else None
        
        payload.append({
            'id': officer.id,
            'name': officer_name,
            'contact': officer.email,  # Contact field doesn't exist in User, using email instead
            'email': officer.email,
            'organization': officer.organization.name if officer.organization else None,
            'geofence': {
                'id': first_geofence.id if first_geofence else None,
                'name': first_geofence.name if first_geofence else None,
            },
            'location': location,
            'location_source': source,
            'last_seen_at': last_seen,
            'battery_level': battery,
            'distance_km': distance_km,
            'is_on_duty': on_duty,
            'is_live_sharing': is_live_sharing,  # New field to indicate live sharing status
        })
    return payload


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def security_officer_locations(request):
    """
    Return active security officers accessible to the authenticated user.
    GET /api/users/security_officers/?latitude=12.9&longitude=77.6
    """
    user = request.user
    lat_qs = request.query_params.get('latitude')
    lon_qs = request.query_params.get('longitude')

    try:
        ref_lat = float(lat_qs) if lat_qs is not None else None
        ref_lon = float(lon_qs) if lon_qs is not None else None
    except (TypeError, ValueError):
        ref_lat = None
        ref_lon = None

    geofence_ids = list(user.geofences.values_list('id', flat=True))

    officers = User.objects.filter(role='security_officer', is_active=True)
    if user.organization_id:
        officers = officers.filter(organization=user.organization)
    if geofence_ids:
        officers = officers.filter(geofences__id__in=geofence_ids).distinct()

    officers = officers.select_related('organization', 'assigned_geofence')

    payload = _build_security_officer_payload(officers, ref_lat, ref_lon)

    return Response({
        'count': len(payload),
        'officers': payload,
    })


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def public_security_officer_locations(request):
    """
    Public endpoint to retrieve active security officers near a coordinate.
    GET /api/users/public/security_officers/?latitude=12.9&longitude=77.6
    """
    lat_qs = request.query_params.get('latitude')
    lon_qs = request.query_params.get('longitude')
    org_qs = request.query_params.get('organization_id')
    geofence_qs = request.query_params.get('geofence_id')

    try:
        ref_lat = float(lat_qs) if lat_qs is not None else None
        ref_lon = float(lon_qs) if lon_qs is not None else None
    except (TypeError, ValueError):
        ref_lat = None
        ref_lon = None

    if ref_lat is None or ref_lon is None:
        return Response({'error': 'latitude and longitude are required'}, status=status.HTTP_400_BAD_REQUEST)

    officers = User.objects.filter(role='security_officer', is_active=True).select_related('organization').prefetch_related('geofences')
    if org_qs:
        officers = officers.filter(organization_id=org_qs)
    if geofence_qs:
        officers = officers.filter(geofences__id=geofence_qs).distinct()

    payload = _build_security_officer_payload(officers, ref_lat, ref_lon)
    return Response({'count': len(payload), 'officers': payload})


# Safety Tips Feed API
@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def safety_tips_feed(request):
    """
    Get safety tips feed
    GET /api/users/safety_tips/
    """
    tips = [
        {
            'id': 1,
            'title': 'Stay Alert in Public Places',
            'content': 'Always be aware of your surroundings, especially in crowded areas. Trust your instincts if something feels wrong.',
            'category': 'general',
            'image_url': None
        },
        {
            'id': 2,
            'title': 'Share Your Location',
            'content': 'Let trusted contacts know where you are, especially when traveling alone or to unfamiliar places.',
            'category': 'location',
            'image_url': None
        },
        {
            'id': 3,
            'title': 'Emergency Contacts Ready',
            'content': 'Keep your emergency contacts updated and easily accessible. Test your SOS button regularly.',
            'category': 'emergency',
            'image_url': None
        },
        {
            'id': 4,
            'title': 'Night Safety Tips',
            'content': 'When walking at night, stay in well-lit areas, avoid shortcuts, and keep your phone charged.',
            'category': 'night_safety',
            'image_url': None
        },
        {
            'id': 5,
            'title': 'Trust Your Instincts',
            'content': 'If a situation feels unsafe, leave immediately. It\'s better to be cautious than sorry.',
            'category': 'general',
            'image_url': None
        }
    ]
    
    category = request.query_params.get('category')
    if category:
        tips = [tip for tip in tips if tip['category'] == category]
    
    return Response({
        'tips': tips,
        'total': len(tips)
    })


# Emergency Response Center API (Premium)
class EmergencyResponseCenterView(APIView):
    """
    Emergency Response Center Integration (Premium only)
    POST /api/users/<user_id>/emergency_response/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, user_id):
        """Connect to emergency response center."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'Unauthorized'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response({
                'error': 'Emergency Response Center is a Premium feature. Upgrade to Premium for 24x7 support.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get location from request
        location = request.data.get('location', {})
        message = request.data.get('message', 'Emergency assistance needed')
        
        # In production, connect to actual emergency response center
        return Response({
            'message': 'Connected to Emergency Response Center',
            'response_id': f'ERC-{timezone.now().timestamp()}',
            'status': 'active',
            'estimated_response_time': '2-5 minutes',
            'location': location
        }, status=status.HTTP_200_OK)


# Trusted Circle Feature API (Premium)
class TrustedCircleView(APIView):
    """
    Trusted Circle Feature (Premium only)
    GET /api/users/<user_id>/trusted_circle/
    POST /api/users/<user_id>/trusted_circle/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, user_id):
        """Get trusted circle members."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'Unauthorized'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response({
                'error': 'Trusted Circle is a Premium feature. Upgrade to Premium to use this feature.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get trusted circle members (family contacts with trusted circle flag)
        from .models import FamilyContact
        trusted_members = FamilyContact.objects.filter(user=user)
        
        return Response({
            'members': [
                {
                    'id': member.id,
                    'name': member.name,
                    'phone': member.phone,
                    'relationship': member.relationship,
                    'can_track': True,
                    'can_receive_checkins': True
                }
                for member in trusted_members
            ]
        })
    
    def post(self, request, user_id):
        """Add member to trusted circle or send check-in."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'Unauthorized'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response({
                'error': 'Trusted Circle is a Premium feature.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        action = request.data.get('action')  # 'checkin' or 'add_member'
        
        if action == 'checkin':
            location = request.data.get('location', {})
            return Response({
                'message': 'Check-in sent to trusted circle',
                'timestamp': timezone.now().isoformat(),
                'location': location
            })
        
        return Response({'message': 'Action completed'}, status=status.HTTP_200_OK)


class PublicLiveLocationShareView(APIView):
    """
    Public view for third parties to fetch live location session details via share token.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, share_token):
        share = LiveLocationShare.objects.select_related('user').filter(share_token=share_token).first()
        if not share:
            return Response({'error': 'Live location session not found'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        if share.is_active and share.expires_at <= now:
            share.is_active = False
            if not share.stop_reason:
                share.stop_reason = 'limit' if share.plan_type == 'free' else 'expired'
            share.save(update_fields=['is_active', 'stop_reason'])

        is_active = share.is_active and share.expires_at > now

        user_name = getattr(share.user, 'name', '').strip()
        if not user_name:
            user_name = (share.user.get_full_name() or '').strip()
        if not user_name:
            user_name = share.user.email.split('@')[0]

        import logging
        logger = logging.getLogger(__name__)
        logger.info(f'[Public Live Share] Fetching session for token {share_token}')
        logger.info(f'[Public Live Share] Current location from DB: {share.current_location}')
        logger.info(f'[Public Live Share] Location type: {type(share.current_location)}')
        
        payload = {
            'share_token': str(share.share_token),
            'session_id': share.id,
            'is_active': is_active,
            'started_at': share.started_at,
            'expires_at': share.expires_at,
            'current_location': share.current_location,
            'last_broadcast_at': share.last_broadcast_at,
            'stop_reason': share.stop_reason,
            'plan_type': share.plan_type,
            'path_points': [
                {
                    'latitude': point.latitude,
                    'longitude': point.longitude,
                    'recorded_at': point.recorded_at.isoformat(),
                }
                for point in share.track_points.order_by('recorded_at')
            ],
            'user': {
                'id': share.user_id,
                'name': user_name,
            },
        }

        include_query = request.query_params.get('include', '')
        include_parts = {part.strip().lower() for part in include_query.split(',') if part.strip()}

        location = share.current_location or {}
        lat = location.get('latitude')
        lon = location.get('longitude')
        logger.info(f'[Public Live Share] Extracted coordinates: lat={lat}, lon={lon}')
        logger.info(f'[Public Live Share] Full location dict: {location}')

        if lat is not None and lon is not None:
            if 'help' in include_parts:
                payload['nearby_help'] = _build_nearby_help_payload(lat, lon)
            if 'security' in include_parts:
                officers = User.objects.filter(role='security_officer', is_active=True).select_related('organization').prefetch_related('geofences')
                payload['security_officers'] = _build_security_officer_payload(officers, lat, lon)

        status_code = status.HTTP_200_OK if is_active else status.HTTP_410_GONE
        return Response(payload, status=status_code)


# Custom Alert Messages API (Premium)
class CustomAlertMessagesView(APIView):
    """
    Custom Alert Messages (Premium only)
    GET /api/users/<user_id>/custom_alerts/
    POST /api/users/<user_id>/custom_alerts/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, user_id):
        """Get custom alert messages."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'Unauthorized'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response({
                'error': 'Custom Alert Messages is a Premium feature.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Return user's custom messages
        return Response({
            'messages': [
                {
                    'id': 1,
                    'title': 'Default Emergency',
                    'message': 'I need help immediately. My location is being shared.',
                    'is_default': True
                }
            ]
        })
    
    def post(self, request, user_id):
        """Create or update custom alert message."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'Unauthorized'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response({
                'error': 'Custom Alert Messages is a Premium feature.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        title = request.data.get('title')
        message = request.data.get('message')
        
        return Response({
            'id': 1,
            'title': title,
            'message': message,
            'created_at': timezone.now().isoformat()
        }, status=status.HTTP_201_CREATED)


# AI Threat Detection API (Premium)
class AIThreatDetectionView(APIView):
    """
    AI Threat Detection (Premium only)
    POST /api/users/<user_id>/ai_threat_detection/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, user_id):
        """Detect threats using AI analysis."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'Unauthorized'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response({
                'error': 'AI Threat Detection is a Premium feature. Upgrade to Premium to use this feature.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Get sensor data from request
        accelerometer_data = request.data.get('accelerometer', {})
        audio_data = request.data.get('audio', {})
        location_data = request.data.get('location', {})
        
        # Mock AI analysis - In production, use actual ML model
        threat_score = 0.0
        threats_detected = []
        
        # Analyze accelerometer for sudden movements
        if accelerometer_data:
            x = accelerometer_data.get('x', 0)
            y = accelerometer_data.get('y', 0)
            z = accelerometer_data.get('z', 0)
            magnitude = (x**2 + y**2 + z**2)**0.5
            if magnitude > 15:  # Threshold for sudden movement
                threat_score += 0.3
                threats_detected.append({
                    'type': 'abnormal_movement',
                    'severity': 'medium',
                    'description': 'Sudden movement pattern detected'
                })
        
        # Analyze audio for loud sounds
        if audio_data:
            decibels = audio_data.get('decibels', 0)
            if decibels > 80:  # Threshold for loud sound
                threat_score += 0.4
                threats_detected.append({
                    'type': 'loud_sound',
                    'severity': 'high',
                    'description': 'Unusually loud sound detected'
                })
        
        # Analyze location for route deviation
        if location_data:
            # In production, compare with expected route
            threat_score += 0.1
        
        should_alert = threat_score > 0.5
        
        return Response({
            'threat_detected': should_alert,
            'threat_score': round(threat_score, 2),
            'threats': threats_detected,
            'recommendation': 'trigger_sos' if should_alert else 'monitor',
            'timestamp': timezone.now().isoformat()
        }, status=status.HTTP_200_OK)


# Audio/Video Recording API (Premium)
class RecordingView(APIView):
    """
    Audio/Video Recording Management (Premium only)
    POST /api/users/<user_id>/recordings/
    GET /api/users/<user_id>/recordings/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, user_id):
        """Upload recording (audio/video) for SOS event."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'Unauthorized'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response({
                'error': 'Audio/Video Recording is a Premium feature.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        recording_type = request.data.get('type')  # 'audio' or 'video'
        sos_event_id = request.data.get('sos_event_id')
        file_url = request.data.get('file_url')  # URL to uploaded file
        
        # In production, handle file upload and store in cloud storage
        # For now, return mock response
        recording_url = f'https://storage.example.com/recordings/{user_id}/{timezone.now().timestamp()}.{recording_type}'
        
        # Update SOS event with recording URL
        if sos_event_id:
            # Note: Recording URLs are not stored in SOSEvent model
            # In production, store these in a separate Recording model
            try:
                from .models import SOSEvent
                sos_event = SOSEvent.objects.get(id=sos_event_id, user=user)
                # Store recording URL in notes or separate table if needed
                # For now, we just return the URL without storing it
                pass
            except SOSEvent.DoesNotExist:
                pass
        
        return Response({
            'recording_id': f'rec-{timezone.now().timestamp()}',
            'type': recording_type,
            'url': recording_url,
            'uploaded_at': timezone.now().isoformat()
        }, status=status.HTTP_201_CREATED)
    
    def get(self, request, user_id):
        """Get recordings for user."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'Unauthorized'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response({
                'error': 'Audio/Video Recording is a Premium feature.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        from .models import SOSEvent
        # Get all SOS events for user
        sos_events = SOSEvent.objects.filter(user=user)
        
        # Note: Recording URLs are not stored in SOSEvent model
        # Return empty list as recordings would be stored in a separate model
        recordings = []
        
        return Response({
            'recordings': recordings,
            'total': len(recordings),
            'message': 'Recording feature requires separate Recording model'
        })


# Cloud Backup API (Premium)
class CloudBackupView(APIView):
    """
    Cloud Backup Management (Premium only)
    POST /api/users/<user_id>/cloud_backup/
    GET /api/users/<user_id>/cloud_backup/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, user_id):
        """Create cloud backup for SOS event."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'Unauthorized'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response({
                'error': 'Cloud Backup is a Premium feature.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        sos_event_id = request.data.get('sos_event_id')
        
        # In production, backup SOS event data to cloud storage
        backup_url = f'https://backup.example.com/sos/{user_id}/{sos_event_id}/{timezone.now().timestamp()}.backup'
        
        if sos_event_id:
            try:
                from .models import SOSEvent
                sos_event = SOSEvent.objects.get(id=sos_event_id, user=user)
                # Note: Cloud backup URL is not stored in SOSEvent model
                # Store backup URL in notes or separate Backup model if needed
                # For now, we just return the URL without storing it
                pass
            except SOSEvent.DoesNotExist:
                return Response(
                    {'error': 'SOS event not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
        
        return Response({
            'backup_id': f'backup-{timezone.now().timestamp()}',
            'url': backup_url,
            'created_at': timezone.now().isoformat(),
            'status': 'completed'
        }, status=status.HTTP_201_CREATED)
    
    def get(self, request, user_id):
        """Get cloud backups for user."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'Unauthorized'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response({
                'error': 'Cloud Backup is a Premium feature.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        from .models import SOSEvent
        # Note: Cloud backup URLs are not stored in SOSEvent model
        # Return empty list as backups would be stored in a separate model
        backups = []
        
        return Response({
            'backups': backups,
            'total': len(backups)
        })


# Panic Mode Automation API (Premium)
class PanicModeAutomationView(APIView):
    """
    Panic Mode Automation (Premium only)
    POST /api/users/<user_id>/panic_mode/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, user_id):
        """Start panic mode automation."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'Unauthorized'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response({
                'error': 'Panic Mode Automation is a Premium feature.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        location = request.data.get('location', {})
        duration_seconds = request.data.get('duration', 300)  # Default 5 minutes
        
        # In production, this would:
        # 1. Start continuous location tracking
        # 2. Start audio recording
        # 3. Send updates every 5 seconds to emergency contacts
        # 4. Create SOS event
        
        return Response({
            'panic_mode_id': f'panic-{timezone.now().timestamp()}',
            'status': 'active',
            'duration_seconds': duration_seconds,
            'update_interval': 5,  # Send updates every 5 seconds
            'features': [
                'continuous_location_tracking',
                'audio_recording',
                'live_feed_to_contacts',
                'automatic_sos_trigger'
            ],
            'started_at': timezone.now().isoformat()
        }, status=status.HTTP_200_OK)


# Multi-device Sync API (Premium)
class MultiDeviceSyncView(APIView):
    """
    Multi-device Sync (Premium only)
    GET /api/users/<user_id>/devices/
    POST /api/users/<user_id>/devices/
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, user_id):
        """Get synced devices for user."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'Unauthorized'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response({
                'error': 'Multi-device Sync is a Premium feature.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # In production, track devices in database
        # For now, return mock data
        return Response({
            'devices': [
                {
                    'id': 'device-1',
                    'name': 'iPhone 14',
                    'type': 'mobile',
                    'last_sync': timezone.now().isoformat(),
                    'is_active': True
                },
                {
                    'id': 'device-2',
                    'name': 'Apple Watch',
                    'type': 'wearable',
                    'last_sync': (timezone.now() - timedelta(minutes=5)).isoformat(),
                    'is_active': True
                }
            ],
            'total': 2
        })
    
    def post(self, request, user_id):
        """Register a new device for sync."""
        if request.user.id != int(user_id):
            return Response(
                {'error': 'Unauthorized'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = request.user
        is_premium = _is_user_premium(user)
        
        if not is_premium:
            return Response({
                'error': 'Multi-device Sync is a Premium feature.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        device_name = request.data.get('device_name', 'Unknown Device')
        device_type = request.data.get('device_type', 'mobile')
        device_id = request.data.get('device_id', f'device-{timezone.now().timestamp()}')
        
        return Response({
            'device_id': device_id,
            'name': device_name,
            'type': device_type,
            'registered_at': timezone.now().isoformat(),
            'status': 'active'
        }, status=status.HTTP_201_CREATED)

