import logging
import traceback
from django.conf import settings
from rest_framework import viewsets, status, serializers, permissions
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
from django.utils import timezone
from datetime import timedelta
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
import math

# Internal imports
from .models import SOSAlert, Case, Incident, OfficerProfile, Notification, LiveLocation, OfficerAlert, AlertRead
from .fcm_service import fcm_service
from .permissions import IsSecurityOfficer
from users.models import Geofence, Alert, OfficerGeofenceAssignment
from users.permissions import IsSuperAdminOrSubAdmin, IsOwnerAndPendingAlert, IsLiveLocationOwner
from users_profile.models import LiveLocationShare, LiveLocationTrackPoint
from users_profile.serializers import LiveLocationShareSerializer, LiveLocationShareCreateSerializer

# Import serializers
from .serializers import (
    SOSAlertSerializer,
    SOSAlertCreateSerializer,
    CaseSerializer,
    CaseCreateSerializer,
    CaseUpdateStatusSerializer,
    IncidentSerializer,
    NotificationSerializer,
    NotificationAcknowledgeSerializer,
    OfficerLoginSerializer,
    LiveLocationSerializer,
    GeofenceSerializer,  # This is the security_app one
    UnifiedAlertSerializer,
    OfficerAlertSerializer,
    UserInAreaSerializer
)
from .geo_utils import get_users_in_geofence

from users.serializers import GeofenceSerializer as UserGeofenceSerializer

User = get_user_model()
logger = logging.getLogger(__name__)

class OfficerOnlyMixin:
    permission_classes = [IsAuthenticated, IsSecurityOfficer]


class TestNotificationView(OfficerOnlyMixin, APIView):
    """
    Diagnostic endpoint to send a test siren notification directly to the logged-in officer.
    POST /api/security/profile/test-notification/
    """
    def post(self, request):
        try:
            logger.info(f"🔔 Manual test notification requested by officer: {request.user.email}")
            
            # Use the FCM service to send a direct message
            result = fcm_service.send_to_officer(
                officer=request.user,
                title="🚨 Diagnostic Siren Test",
                body="If you hear a siren, your device is correctly configured for SOS alerts.",
                data={
                    'type': 'diagnostic_test',
                    'timestamp': str(timezone.now())
                },
                sound='siren'
            )
            
            if result.get('success'):
                return Response({
                    'status': 'success',
                    'message': f"Test notification sent to {result.get('success_count')} tokens. Check your device."
                })
            else:
                error_detail = result.get('first_error') or "All tokens failed"
                return Response({
                    'status': 'error',
                    'message': f"Firebase rejected all tokens. Reason: {error_detail}",
                    'details': result
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
        except Exception as e:
            logger.error(f"Test notification error: {str(e)}", exc_info=True)
            return Response({
                'status': 'error',
                'message': f'Server error: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SOSAlertViewSet(OfficerOnlyMixin, viewsets.ModelViewSet):
    queryset = SOSAlert.objects.filter(is_deleted=False)
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'user']
    search_fields = ['user__username', 'user__email', 'message']
    ordering_fields = ['created_at', 'updated_at']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return SOSAlertCreateSerializer  # Use SOSAlert serializer
        return SOSAlertSerializer  # Use SOSAlert serializer

    def get_permissions(self):
        """
        Override permissions:
        - Read operations: Any authenticated user (filtered by queryset)
        - Update/Delete operations: SUPER_ADMIN/SUB_ADMIN OR owner of pending alert
        - Create operations: Use existing OfficerOnlyMixin
        """
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated()]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsOwnerAndPendingAlert()]
        return [IsAuthenticated()]  # Create uses OfficerOnlyMixin for additional restrictions

    def get_queryset(self):
        """
        Get alerts from SOSAlert model with role-based filtering.
        Security officers see alerts in their assigned geofences or assigned to them.
        Users see their own alerts.
        Admins see all alerts.
        """
        user = self.request.user
        
        # Base queryset: active SOS alerts (not soft-deleted)
        base_queryset = SOSAlert.objects.filter(is_deleted=False).select_related('user', 'geofence', 'assigned_officer')

        logger.info(f"[SECURITY QUERIES] User {user.email} (role: {user.role}) requesting alerts")

        # For Security Officers → show alerts in their assigned geofences or assigned to them
        if user.role == 'security_officer':
            # Get officer's assigned geofences
            officer_geofences = user.geofences.filter(active=True)
            geofence_ids = list(officer_geofences.values_list('id', flat=True))

            logger.info(f"[SECURITY QUERIES] Officer {user.email} has {len(geofence_ids)} assigned geofences: {geofence_ids}")

            # Filter alerts by:
            # 1. Officer's assigned geofences
            # 2. Alerts assigned directly to them
            # 3. Alerts from users in their organization (if they have one)
            org_filter = Q(user__organization=user.organization) if user.organization else Q()
            
            # In DEBUG mode, let officers see everything to make testing easier
            if settings.DEBUG:
                return base_queryset
                
            queryset = base_queryset.filter(
                Q(geofence_id__in=geofence_ids) | 
                Q(assigned_officer=user) |
                org_filter
            ).distinct()

            logger.info(f"[SECURITY QUERIES] Found {queryset.count()} alerts for officer {user.email}")
            return queryset

        # For Sub-Admins → show alerts in their organization's geofences OR for users in their organization
        elif user.role == 'SUB_ADMIN' and hasattr(user, 'organization') and user.organization:
            org_geofences = user.organization.geofences.filter(active=True)
            geofence_ids = list(org_geofences.values_list('id', flat=True))

            logger.info(f"[SECURITY QUERIES] Sub-admin {user.email} has {len(geofence_ids)} org geofences")

            queryset = base_queryset.filter(
                Q(geofence_id__in=geofence_ids) | 
                Q(user__organization=user.organization)
            ).distinct()
            return queryset

        # For Super Admins → see all alerts
        elif user.role == 'SUPER_ADMIN':
            logger.info(f"[SECURITY QUERIES] Super-admin {user.email} sees all alerts")
            return base_queryset

        # For Users → show their own alerts AND officer alerts for their geofences
        elif user.role == 'USER':
            # Users see:
            # 1. Their own alerts (USER-created)
            # 2. OFFICER-created alerts in geofences they are part of
            user_geofences = user.geofences.filter(active=True)
            geofence_ids = list(user_geofences.values_list('id', flat=True))
            
            logger.info(f"[SECURITY QUERIES] User {user.email} has {len(geofence_ids)} geofences: {geofence_ids}")
            
            queryset = base_queryset.filter(
                Q(user=user, created_by_role='USER') |
                Q(created_by_role='OFFICER', geofence_id__in=geofence_ids)
            )
            logger.info(f"[SECURITY QUERIES] Found {queryset.count()} alerts for user {user.email}")
            return queryset

        # For other users → no alerts
        logger.info(f"[SECURITY QUERIES] User {user.email} (role: {user.role}) has no access to alerts")
        return SOSAlert.objects.none()

    def perform_create(self, serializer):
        """Create SOSAlert in security_app using serializer.save()."""
        from users.utils import get_geofence_from_location

        request = self.request
        user = request.user
        validated_data = serializer.validated_data

        try:
            # Get location data
            location_lat = validated_data.get('location_lat')
            location_long = validated_data.get('location_long')

            # Find geofence for this location
            geofence = None
            if location_lat and location_long:
                geofence = get_geofence_from_location(float(location_lat), float(location_long))
                if not geofence:
                    # If no geofence found, use officer's assigned geofence if available
                    officer_geofences = user.geofences.filter(active=True)
                    if officer_geofences.exists():
                        geofence = officer_geofences.first()

            logger.info(f"[OFFICER ALERT] Officer {user.email} geofence: {geofence.name if geofence else 'None'}")

            # Set created_by_role based on user role
            created_by_role = 'OFFICER' if user.role == 'security_officer' else 'USER'

            # Save via serializer to set serializer.instance correctly
            instance = serializer.save(
                user=user,
                created_by_role=created_by_role,
                location_lat=float(location_lat) if location_lat else None,
                location_long=float(location_long) if location_long else None,
                geofence=geofence,
                status='pending',
                assigned_officer=user if user.role == 'security_officer' else None
            )

            logger.info(f"[OFFICER ALERT] Created SOSAlert ID {instance.id} for user {user.email}")

        except Exception as e:
            logger.error(f"[OFFICER ALERT] Error creating SOSAlert: {e}", exc_info=True)
            raise

    def create(self, request, *args, **kwargs):
        """
        Override create to handle area-based user alerts with backend-authoritative logic.
        This method implements the core security requirements for evacuation alerts.
        """
        # 🚨 ALERT REQUEST RECEIVED - Log incoming request details
        logger.info(f"🚨 ALERT REQUEST RECEIVED")
        logger.info(f"👤 User: {request.user.username} (role: {getattr(request.user, 'role', 'unknown')})")
        logger.info(f"📦 Payload: {dict(request.data)}")
        
        try:
            serializer = self.get_serializer(data=request.data)
            
            # 🔍 SERIALIZER VALIDATION - Log validation attempt
            logger.info(f"🔍 Starting serializer validation...")
            serializer.is_valid(raise_exception=True)
            
            # ✅ SERIALIZER VALIDATION SUCCESS
            logger.info(f"✅ Serializer validation passed")
            logger.info(f"📋 Validated data: {dict(serializer.validated_data)}")
            
            alert_type = serializer.validated_data.get('alert_type', 'security')
            logger.info(f"🏷️ Alert type: {alert_type}")
            
            # Handle area-based user alerts with backend-authoritative logic
            if alert_type == 'area_user_alert':
                return self._create_area_user_alert(request, serializer)
            
            # Handle regular alerts with existing logic
            logger.info(f"🔄 Processing regular alert creation")
            self.perform_create(serializer)
            instance = serializer.instance
            
            # ✅ ALERT CREATED SUCCESSFULLY
            logger.info(f"✅ ALERT CREATED: ID={instance.id}")
            
            response_serializer = SOSAlertSerializer(instance)
            headers = self.get_success_headers(response_serializer.data)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)
            
        except serializers.ValidationError as e:
            # ❌ SERIALIZER VALIDATION FAILED
            logger.error(f"❌ Serializer validation failed")
            logger.error(f"🚫 Validation errors: {dict(e.detail)}")
            logger.error(f"📦 Failed payload: {dict(request.data)}")
            raise
        except Exception as e:
            # 💥 UNEXPECTED ERROR
            logger.error(f"💥 Unexpected error during alert creation")
            logger.error(f"🔍 Error type: {type(e).__name__}")
            logger.error(f"📝 Error message: {str(e)}")
            logger.error(f"📦 Request payload: {dict(request.data)}")
            logger.error(f"👤 User: {request.user.username} (role: {getattr(request.user, 'role', 'unknown')})")
            import traceback
            logger.error(f"📚 Full traceback:\n{traceback.format_exc()}")
            raise

    def _create_area_user_alert(self, request, serializer):
        """
        Create an area-based user alert with backend-authoritative targeting.
        
        Security Rules:
        1. Officer identity comes from request.user only
        2. Geofences come from database relations only
        3. User targeting is based on GPS coordinates only
        4. All validation happens server-side
        """
        from django.utils import timezone
        from .geo_utils import (
            get_users_in_multiple_geofences,
            validate_gps_coordinates,
            calculate_geofence_center
        )
        
        try:
            # Step 1: Identify officer from authentication context ONLY
            officer = request.user
            if officer.role != 'security_officer':
                return Response({
                    'error': 'Unauthorized',
                    'detail': 'Only security officers can create area-based alerts'
                }, status=status.HTTP_403_FORBIDDEN)
            
            logger.info(f"🚨 AREA_USER_ALERT creation initiated by officer: {officer.username}")
            
            # Step 2: Validate GPS coordinates from alert data
            alert_lat = serializer.validated_data.get('location_lat')
            alert_lon = serializer.validated_data.get('location_long')
            
            if not validate_gps_coordinates(alert_lat, alert_lon):
                return Response({
                    'error': 'Invalid GPS coordinates',
                    'detail': 'Alert GPS coordinates are invalid or out of range'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Step 3: Check expiry time for area-based alerts
            expires_at = serializer.validated_data.get('expires_at')
            if expires_at and expires_at <= timezone.now():
                return Response({
                    'error': 'Invalid expiry time',
                    'detail': 'Area-based alerts cannot expire in the past'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Step 4: Load officer's assigned geofences from database ONLY
            officer_geofences = officer.geofences.filter(active=True)
            if not officer_geofences.exists():
                return Response({
                    'error': 'No assigned geofences',
                    'detail': 'Security officer has no active geofences assigned'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            logger.info(f"📍 Officer has {officer_geofences.count()} assigned geofences")
            
            # Step 5: Identify users within officer's geofences using GPS coordinates
            affected_users = get_users_in_multiple_geofences(
                list(officer_geofences), 
                max_age_hours=24  # Only use fresh location data (24 hours)
            )
            
            affected_users_count = len(affected_users)
            logger.info(f"🎯 Identified {affected_users_count} users in officer's geofences")
            
            # Step 6: Create the alert with backend-authoritative data
            alert = serializer.save(
                user=officer,  # Officer creates the alert
                created_by_role='OFFICER',  # Explicitly set role for sync logic
                priority='high',  # Area-based alerts are always high priority
            )
            
            # Step 7: Update alert with area-based metadata
            alert.affected_users_count = affected_users_count
            alert.expires_at = expires_at
            alert.geofence = officer_geofences.first()
            alert.save(update_fields=['affected_users_count', 'expires_at', 'geofence'])
            
            logger.info(f"✅ Alert {alert.id} saved with geofence_id={alert.geofence_id}")
            
            logger.info(f"✅ Area-based alert created: ID={alert.id}, Users={affected_users_count}")
            
            # Step 8: Send push notifications ONLY to affected users (Authoritative Dispatch)
            if affected_users_count > 0:
                logger.info(f"📣 Manual notification dispatch for area_user_alert {alert.id}")
                self._send_area_alert_notifications(alert, affected_users)
            else:
                logger.warning(f"⚠️ No users in geofences for alert {alert.id}")
            
            # Step 9: Return response with area-based metadata
            response_data = SOSAlertSerializer(alert).data
            response_data.update({
                'area_alert_metadata': {
                    'officer_id': officer.id,
                    'officer_name': officer.get_full_name() or officer.username,
                    'affected_users_count': affected_users_count,
                    'geofences_count': officer_geofences.count(),
                    'expires_at': expires_at.isoformat() if expires_at else None,
                    'notification_sent': alert.notification_sent,
                    'notification_sent_at': alert.notification_sent_at.isoformat() if alert.notification_sent_at else None
                }
            })
            
            headers = self.get_success_headers(response_data)
            return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)
            
        except Exception as e:
            logger.error(f"❌ Failed to create area-based alert: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return Response({
                'error': 'Internal server error',
                'detail': 'Failed to create area-based alert'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _send_area_alert_notifications(self, alert, affected_users):
        """
        Send high-priority push notifications to affected users.
        This method implements the notification delivery security requirements.
        """
        from .fcm_service import fcm_service
        
        try:
            logger.info(f"📱 Sending real push notifications for alert {alert.id} to {len(affected_users)} users")
            
            # Extract actual User objects from UserLocation query result
            users_to_notify = [ul.user for ul in affected_users]
            
            # Use FCM service to send to multiple users at once
            success = fcm_service.send_to_users(
                users_to_notify,
                title=f"Security Alert: {alert.alert_type.replace('_', ' ').title()}",
                body=alert.message or "An emergency alert has been issued for your area.",
                data={
                    "alert_id": str(alert.id),
                    "alert_type": alert.alert_type,
                    "latitude": str(alert.location_lat),
                    "longitude": str(alert.location_long),
                    "priority": alert.priority
                }
            )
            
            if success:
                # Update alert with notification metadata
                alert.notification_sent = True
                alert.notification_sent_at = timezone.now()
                alert.save(update_fields=['notification_sent', 'notification_sent_at'])
                logger.info(f"✅ Real push notifications sent successfully for alert {alert.id}")
            else:
                logger.warning(f"⚠️ FCM service reported failure or no tokens for alert {alert.id}")
                
        except Exception as e:
            logger.error(f"❌ Error in real notification sending: {str(e)}")
            logger.error(traceback.format_exc())

    @action(detail=True, methods=['patch'])
    def resolve(self, request, pk=None):
        alert = self.get_object()
        
        # Permission checks are now handled by get_permissions() and IsOwnerAndPendingAlert
        
        # Update status and ensure officer assignment for dashboard accuracy
        alert.status = 'resolved'
        if not alert.assigned_officer and request.user.role == 'security_officer':
            logger.info(f"👮 Auto-assigning officer {request.user.username} to alert {alert.id} during resolution")
            alert.assigned_officer = request.user
            
        alert.save()

        serializer = self.get_serializer(alert)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        
        # Permission checks are now handled by get_permissions() and IsOwnerAndPendingAlert
        # Soft delete the alert
        instance.is_deleted = True
        instance.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ✅ Apply permission checks to all write operations
    def update(self, request, *args, **kwargs):
        # Permission checks are now handled by get_permissions() and IsOwnerAndPendingAlert
        return super().update(request, *args, **kwargs)

    # ✅ Same for partial updates (PATCH) with permission checks
    def partial_update(self, request, *args, **kwargs):
        # Permission checks are now handled by get_permissions() and IsOwnerAndPendingAlert
        return super().partial_update(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def active(self, request):
        qs = self.get_queryset().filter(status__in=['pending', 'accepted'])
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def resolved(self, request):
        qs = self.get_queryset().filter(status='resolved')
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)



class CaseViewSet(OfficerOnlyMixin, viewsets.ModelViewSet):
    queryset = Case.objects.all()
    serializer_class = CaseSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'officer', 'sos_alert']
    search_fields = ['description', 'officer__name', 'sos_alert__user__username']
    ordering_fields = ['updated_at']
    ordering = ['-updated_at']

    def get_queryset(self):
        user = self.request.user
        # Only cases assigned to the current officer (user with role='security_officer')
        if user.role == 'security_officer':
            return Case.objects.filter(officer=user)
        return Case.objects.none()

    def get_serializer_class(self):
        if self.action == 'create':
            return CaseCreateSerializer
        elif self.action == 'update_status':
            return CaseUpdateStatusSerializer
        return CaseSerializer

    @action(detail=True, methods=['patch'])
    def update_status(self, request, pk=None):
        """
        Update case status (accept, reject, resolve)
        """
        case = self.get_object()
        
        # Verify the requesting officer is assigned to this case
        if request.user.role != 'security_officer':
            return Response({'detail': 'Only officers can update cases.'}, status=status.HTTP_403_FORBIDDEN)
        if case.officer != request.user:
            return Response({'detail': 'Only the assigned officer can update this case.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = CaseUpdateStatusSerializer(case, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_case = serializer.save()
        
        return Response(CaseSerializer(updated_case).data)
    
    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """Officer accepts a case."""
        case = self.get_object()
        case.status = 'accepted'
        case.save(update_fields=['status'])
        return Response({'detail': 'Case accepted successfully.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Officer rejects a case."""
        case = self.get_object()
        case.status = 'open'  # or 'rejected' if you add that option in STATUS_CHOICES
        case.save(update_fields=['status'])
        return Response({'detail': 'Case rejected successfully.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """Mark a case as resolved and also update the linked SOS alert."""
        case = self.get_object()
        case.status = 'resolved'
        case.save(update_fields=['status'])

        # Also mark the linked SOS alert as resolved
        if case.sos_alert:
            case.sos_alert.status = 'resolved'
            case.sos_alert.save(update_fields=['status'])

        return Response({'detail': 'Case resolved successfully.'}, status=status.HTTP_200_OK)



class NavigationView(OfficerOnlyMixin, APIView):
    def get(self, request):
        """
        Calculate route from officer location to target coordinates using GET parameters.
        Example: /api/navigation/?from_lat=18.5204&from_lng=73.8567&to_lat=18.5310&to_lng=73.8440
        """
        try:
            from_lat = float(request.query_params.get('from_lat'))
            from_lng = float(request.query_params.get('from_lng'))
            to_lat = float(request.query_params.get('to_lat'))
            to_lng = float(request.query_params.get('to_lng'))
        except (TypeError, ValueError):
            return Response({
                'error': 'Invalid or missing coordinates. Expected: from_lat, from_lng, to_lat, to_lng'
            }, status=status.HTTP_400_BAD_REQUEST)

        route_data = self._get_route_from_google_maps(from_lat, from_lng, to_lat, to_lng)

        if route_data.get('error'):
            return Response(route_data, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'from_location': {'lat': from_lat, 'lng': from_lng},
            'to_location': {'lat': to_lat, 'lng': to_lng},
            'route': route_data
        })

    def _get_route_from_google_maps(self, from_lat, from_lng, to_lat, to_lng):
        import requests
        from django.conf import settings

        api_key = getattr(settings, 'GOOGLE_MAPS_API_KEY', None)
        if not api_key:
            return self._get_fallback_route(from_lat, from_lng, to_lat, to_lng)

        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            'origin': f"{from_lat},{from_lng}",
            'destination': f"{to_lat},{to_lng}",
            'key': api_key,
            'mode': 'driving',
            'units': 'metric'
        }

        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()

            if data.get('status') != 'OK':
                return {'error': f"Google Maps API error: {data.get('status', 'Unknown error')}"}

            route = data['routes'][0]
            leg = route['legs'][0]

            polyline = route['overview_polyline']['points']
            distance_km = leg['distance']['value'] / 1000
            duration_minutes = leg['duration']['value'] / 60

            steps = []
            for step in leg['steps']:
                steps.append({
                    'instruction': step['html_instructions'].replace('<b>', '').replace('</b>', ''),
                    'distance': step['distance']['text'],
                    'duration': step['duration']['text']
                })

            return {
                'distance_km': round(distance_km, 2),
                'duration_minutes': round(duration_minutes, 1),
                'polyline': polyline,
                'steps': steps,
                'summary': leg['distance']['text'] + ' - ' + leg['duration']['text']
            }

        except requests.RequestException as e:
            return {'error': f"Failed to connect to Google Maps API: {str(e)}"}
        except (KeyError, IndexError) as e:
            return {'error': f"Unexpected response format from Google Maps API: {str(e)}"}

    def _get_fallback_route(self, from_lat, from_lng, to_lat, to_lng):
        """
        Fallback route calculation using haversine distance if Google Maps API is unavailable.
        """
        distance_km = self.haversine_distance_km(from_lat, from_lng, to_lat, to_lng)
        eta_minutes = round((distance_km / 40.0) * 60) if distance_km else 0

        return {
            'distance_km': round(distance_km, 2),
            'duration_minutes': eta_minutes,
            'polyline': None,
            'steps': [
                'Head towards target using best available route',
                'Follow primary roads',
                'Adjust path as needed'
            ],
            'summary': f"{round(distance_km, 2)} km - Estimated {eta_minutes} minutes",
            'note': 'Route calculated using straight-line distance. For detailed directions, configure Google Maps API key.'
        }

    @staticmethod
    def haversine_distance_km(lat1, lon1, lat2, lon2):
        import math
        R = 6371  # Earth radius in km
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

class IncidentsView(OfficerOnlyMixin, APIView, PageNumberPagination):
    page_size_query_param = 'page_size'

    def get(self, request):
        # List incidents for logged-in officer, filterable by date range and status
        if request.user.role != 'security_officer':
            return Response({'detail': 'Only officers can view incidents.'}, status=status.HTTP_403_FORBIDDEN)

        qs = Incident.objects.filter(officer=request.user)

        # Filters
        status_param = request.query_params.get('status')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if status_param:
            qs = qs.filter(status=status_param)

        from django.utils.dateparse import parse_datetime
        start_dt = parse_datetime(start_date) if start_date else None
        end_dt = parse_datetime(end_date) if end_date else None
        if start_dt:
            qs = qs.filter(timestamp__gte=start_dt)
        if end_dt:
            qs = qs.filter(timestamp__lte=end_dt)

        page = self.paginate_queryset(qs.select_related('officer', 'sos_alert', 'case'), request, view=self)
        serializer = IncidentSerializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    def post(self, request):
        # Manually log a new incident
        if request.user.role != 'security_officer':
            return Response({'detail': 'Only officers can log incidents.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = IncidentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(officer=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class OfficerProfileView(OfficerOnlyMixin, APIView):
    def get(self, request):
        if request.user.role != 'security_officer':
            return Response({'detail': 'Only officers can view profile.'}, status=status.HTTP_403_FORBIDDEN)

        user = request.user
        
        # Calculate dynamic stats for the officer
        # 1. Total responses = Count of resolved cases
        resolved_cases = Case.objects.filter(officer=user, status='resolved').select_related('sos_alert')
        total_responses = resolved_cases.count()
        
        # 2. Avg response time = Avg time between SOS creation and Case resolution (in minutes)
        response_times = []
        for case in resolved_cases:
            if case.sos_alert:
                delta = case.updated_at - case.sos_alert.created_at
                response_times.append(delta.total_seconds() / 60)
        
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        
        # 3. Active hours calculation
        from .models import DutySession
        all_sessions = DutySession.objects.filter(officer=user)
        total_seconds = 0
        for session in all_sessions:
            if session.is_active:
                # Add time since session started for active session
                delta = timezone.now() - session.start_time
                total_seconds += delta.total_seconds()
            elif session.end_time:
                # Add recorded session duration
                delta = session.end_time - session.start_time
                total_seconds += delta.total_seconds()
        
        active_hours = total_seconds / 3600
        
        # Get base serialized data
        from users_profile.serializers import UserProfileSerializer
        serializer = UserProfileSerializer(user, context={'request': request})
        data = serializer.data
        
        # Inject officer-specific fields for frontend alignment
        data['security_id'] = f"SEC-{user.id:04d}"
        data['security_role'] = user.role.replace('_', ' ').title()
        data['badge_number'] = user.username.upper() or f"OFF-{user.id}"
        
        # Add stats object
        data['stats'] = {
            'total_responses': total_responses,
            'avg_response_time': round(avg_response_time, 1),
            'active_hours': round(active_hours, 2),
            'area_coverage': 0   # Placeholder
        }
        
        # Add geofence detail if available
        first_geofence = user.geofences.first()
        if first_geofence:
            data['geofence_name'] = first_geofence.name
            data['assigned_geofence'] = {
                'id': first_geofence.id,
                'name': first_geofence.name
            }

        return Response(data)

    def patch(self, request):
        if request.user.role != 'security_officer':
            return Response({'detail': 'Only officers can update profile.'}, status=status.HTTP_403_FORBIDDEN)

        # Update User data instead of OfficerProfile data
        user = request.user
        from users_profile.serializers import UserProfileSerializer

        serializer = UserProfileSerializer(user, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()

        # Update OfficerProfile if location data is provided
        if 'last_latitude' in request.data or 'last_longitude' in request.data:
            profile, _ = OfficerProfile.objects.select_related('officer').get_or_create(officer=user)
            if 'last_latitude' in request.data:
                profile.last_latitude = request.data['last_latitude']
            if 'last_longitude' in request.data:
                profile.last_longitude = request.data['last_longitude']
            profile.last_seen_at = timezone.now()
            profile.save(update_fields=['last_latitude', 'last_longitude', 'last_seen_at', 'updated_at'])

        return Response(UserProfileSerializer(instance, context={'request': request}).data)


class GeofenceCurrentView(OfficerOnlyMixin, APIView):
    """
    Get current security officer's assigned geofence.
    GET /api/security/geofence/
    """
    def get(self, request):
        """Get the assigned geofence for the current security officer"""
        try:
            officer = User.objects.get(email=request.user.email, role='security_officer')
        except User.DoesNotExist:
            return Response({
                'error': 'Security officer profile not found',
                'detail': 'Officer not found for user.'
            }, status=status.HTTP_404_NOT_FOUND)
        
        if not officer.geofences.exists():
            return Response({
                'error': 'No geofence assigned to this officer',
                'detail': 'This security officer does not have an assigned geofence area.'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Get the first assigned geofence (or you could return all)
        assigned_geofence = officer.geofences.first()
        
        geofence = assigned_geofence
        serializer = GeofenceSerializer(geofence)
        return Response(serializer.data, status=status.HTTP_200_OK)


class LiveLocationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for LiveLocation with strict write permissions.
    Only users can create/update their own live locations for pending/accepted alerts.
    """
    serializer_class = LiveLocationSerializer
    permission_classes = [IsAuthenticated, IsLiveLocationOwner]
    
    def get_queryset(self):
        """
        Filter queryset based on user role:
        - Users: read own LiveLocation only
        - Officers: read LiveLocation of USER-created alerts assigned to them OR within their geofence
        """
        user = self.request.user
        
        if user.role == 'USER':
            # Users can only see their own live locations
            return LiveLocation.objects.filter(user=user)
        
        elif user.role == 'security_officer':
            # Officers can read LiveLocation of USER-created alerts:
            # 1. Assigned to them (via SOSAlert.assigned_officer)
            # 2. Within their geofence areas
            from django.db.models import Q
            
            # Get officer's assigned geofences
            officer_geofences = user.geofences.all()
            
            return LiveLocation.objects.filter(
                Q(sos_alert__created_by_role='USER') &  # Only USER-created alerts
                (
                    Q(sos_alert__assigned_officer=user) |  # Assigned to officer
                    Q(sos_alert__geofence__in=officer_geofences)  # Within officer's geofence
                )
            ).distinct()
        
        # Default: empty queryset
        return LiveLocation.objects.none()
    
    def perform_create(self, serializer):
        """Set the user and SOS alert relationship on creation."""
        serializer.save(user=self.request.user)
    
    def get_permissions(self):
        """Apply different permissions for different actions."""
        if self.action in ['create']:
            return [IsAuthenticated(), IsLiveLocationOwner()]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsLiveLocationOwner()]
        return [IsAuthenticated()]





class OfficerLoginView(APIView):
    """
    API endpoint for security officer login.
    
    Accepts POST request with username and password.
    Returns JWT access and refresh tokens along with user information.
    
    User must have role="security_officer" to login.
    
    Example request:
    {
        "username": "officer1@example.com",
        "password": "OfficerPassword123!"
    }
    
    Example response:
    {
        "access": "eyJhbGci...",
        "refresh": "eyJhbGci...",
        "user": {
            "id": 12,
            "username": "officer1@example.com",
            "email": "officer1@example.com",
            "role": "security_officer"
        }
    }
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        """Return API documentation for login endpoint"""
        return Response({
            'endpoint': '/api/security/login/',
            'method': 'POST',
            'description': 'Security Officer Login API',
            'requirements': {
                'user_role': 'security_officer',
                'user_status': 'is_active=True'
            },
            'request_body': {
                'username': 'string (required)',
                'password': 'string (required)'
            },
            'example_request': {
                'username': 'test_officer',
                'password': 'TestOfficer123!'
            },
            'response': {
                'access': 'JWT access token (string)',
                'refresh': 'JWT refresh token (string)',
                'user': {
                    'id': 'integer',
                    'username': 'string',
                    'email': 'string',
                    'role': 'security_officer'
                }
            },
            'curl_example': 'curl -X POST "https://your-domain.com/api/security/login/" -H "Content-Type: application/json" -d \'{"username": "test_officer", "password": "TestOfficer123!"}\''
        }, status=status.HTTP_200_OK)

    def post(self, request):
        from rest_framework_simplejwt.tokens import RefreshToken
        from django.contrib.auth.models import update_last_login
        from .models import DutySession
        import logging

        logger = logging.getLogger(__name__)

        # Log incoming request data (for debugging)
        logger.info(f"Officer login attempt - Request data: {request.data}")
        print(f"🔍 LOGIN REQUEST: {request.data}")

        try:
            # Validate input and authenticate using serializer
            serializer = OfficerLoginSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            # Get authenticated user from serializer
            user = serializer.validated_data['user']
            logger.info(f"Officer login success - User: {user.username}, Role: {user.role}")
            print(f"✅ LOGIN SUCCESS: User {user.username} authenticated")

            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)
            update_last_login(None, user)
            
            # Start a new duty session
            DutySession.objects.create(officer=user)

            response_data = {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'role': user.role,
                }
            }

            print(f"✅ LOGIN RESPONSE: Tokens generated for {user.username}")
            return Response(response_data, status=status.HTTP_200_OK)

        except serializers.ValidationError as e:
            logger.warning(f"Officer login validation error: {e.detail}")
            print(f"❌ LOGIN VALIDATION ERROR: {e.detail}")
            return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Officer login unexpected error: {str(e)}")
            print(f"❌ LOGIN UNEXPECTED ERROR: {str(e)}")
            return Response({
                'error': 'Login failed',
                'detail': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class OfficerLogoutView(OfficerOnlyMixin, APIView):
    """
    API endpoint for security officer logout.
    Marks all active duty sessions as ended.
    """
    def post(self, request):
        from .models import DutySession
        from django.utils import timezone
        
        officer = request.user
        active_sessions = DutySession.objects.filter(officer=officer, is_active=True)
        count = active_sessions.count()
        
        for session in active_sessions:
            session.end_session()
            
        return Response({
            'message': f'Successfully logged out. Closed {count} duty sessions.',
            'sessions_closed': count
        }, status=status.HTTP_200_OK)


class NotificationView(OfficerOnlyMixin, APIView, PageNumberPagination):
    page_size_query_param = 'page_size'

    def get(self, request):
        """List notifications for the logged-in officer (unread first)"""
        if request.user.role != 'security_officer':
            return Response({'detail': 'Only officers can view notifications.'}, status=status.HTTP_403_FORBIDDEN)

        # Get notifications, unread first
        notifications = Notification.objects.filter(officer=request.user).order_by('is_read', '-created_at')
        
        page = self.paginate_queryset(notifications, request, view=self)
        serializer = NotificationSerializer(page, many=True)
        return self.get_paginated_response(serializer.data)


class NotificationAcknowledgeView(OfficerOnlyMixin, APIView):
    def post(self, request):
        """Mark notifications as read"""
        if request.user.role != 'security_officer':
            return Response({'detail': 'Only officers can mark notifications as read.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = NotificationAcknowledgeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        notification_ids = serializer.validated_data['notification_ids']
        notifications = Notification.objects.filter(
            id__in=notification_ids,
            officer=request.user,
            is_read=False
        )
        
        updated_count = 0
        for notification in notifications:
            notification.mark_as_read()
            updated_count += 1
        
        return Response({
            'message': f'Marked {updated_count} notifications as read',
            'updated_count': updated_count
        })


class DashboardView(OfficerOnlyMixin, APIView):
    def get(self, request):
        """Get officer dashboard metrics"""
        if request.user.role != 'security_officer':
            return Response({'detail': 'Only officers can view dashboard.'}, status=status.HTTP_403_FORBIDDEN)
        
        officer = request.user
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = now - timedelta(days=7)
        
        # Get officer's geofences from both sources
        geofence_ids = list(officer.geofences.all().values_list('id', flat=True))
        assignment_geofence_ids = OfficerGeofenceAssignment.objects.filter(
            officer=officer, 
            is_active=True
        ).values_list('geofence_id', flat=True)
        
        all_geofence_ids = list(set(geofence_ids) | set(assignment_geofence_ids))

        # 1. PENDING: New SOS alerts in officer's geofences OR organization fallback
        # This ensures alerts outside geofences are still visible to relevant officers
        pending_alerts_q = Q(status='pending', is_deleted=False)
        geofence_filter = Q(geofence_id__in=all_geofence_ids)
        org_fallback = Q(geofence__isnull=True, user__organization=officer.organization)
        
        pending_alerts_count = SOSAlert.objects.filter(
            pending_alerts_q & (geofence_filter | org_fallback)
        ).distinct().count()
        
        # 2. ACTIVE: Alerts currently handled by this officer
        active_alerts_count = SOSAlert.objects.filter(
            assigned_officer=officer,
            status='accepted',
            is_deleted=False
        ).count()
        
        # 3. RESOLVED: Alerts resolved by this officer today (Localized)
        today_start = timezone.localtime(now).replace(hour=0, minute=0, second=0, microsecond=0)
        resolved_today_count = SOSAlert.objects.filter(
            assigned_officer=officer,
            status='resolved',
            updated_at__gte=today_start,
            is_deleted=False
        ).count()

        # Extra metrics
        active_cases = Case.objects.filter(officer=officer, status__in=['open', 'accepted']).count()
        resolved_cases_week = Case.objects.filter(
            officer=officer,
            status='resolved',
            updated_at__gte=week_ago
        ).count()
        
        # Average response time
        response_times = []
        resolved_cases_list = Case.objects.filter(
            officer=officer,
            status='resolved',
            sos_alert__isnull=False
        ).select_related('sos_alert')
        
        for case in resolved_cases_list:
            if case.sos_alert and case.updated_at:
                response_time = (case.updated_at - case.sos_alert.created_at).total_seconds() / 60
                response_times.append(response_time)
        
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        unread_notifications = Notification.objects.filter(officer=officer, is_read=False).count()
        
        officer_name = f"{officer.first_name} {officer.last_name}".strip() or officer.username
        
        # Get recent alerts for dashboard
        recent_alerts = SOSAlert.objects.filter(
            Q(assigned_officer=officer) | Q(geofence_id__in=all_geofence_ids),
            is_deleted=False
        ).order_by('-created_at')[:5]
        
        recent_alerts_data = SOSAlertSerializer(recent_alerts, many=True).data
        
        return Response({
            'officer_name': officer_name,
            'metrics': {
                'pending_alerts': pending_alerts_count,
                'active_alerts': active_alerts_count,
                'resolved_today': resolved_today_count,
                'active_cases': active_cases,
                'resolved_cases_this_week': resolved_cases_week,
                'average_response_time_minutes': round(avg_response_time, 1),
                'unread_notifications': unread_notifications
            },
            'recent_alerts': recent_alerts_data,
            'last_updated': now.isoformat()
        })


class OfficerLiveLocationShareView(OfficerOnlyMixin, APIView):
    """
    Security officer live location sharing endpoints.
    POST /api/security/live_location/start/ - Start live location sharing
    GET /api/security/live_location/ - Get active sessions
    """
    
    def post(self, request):
        """Start live location sharing for security officer"""
        if request.user.role != 'security_officer':
            return Response({'detail': 'Only officers can share location.'}, status=status.HTTP_403_FORBIDDEN)
        
        officer = request.user
        
        # Stop any existing active sessions
        LiveLocationShare.objects.filter(
            security_officer=officer,
            is_active=True
        ).update(is_active=False, stop_reason='user')
        
        serializer = LiveLocationShareCreateSerializer(data=request.data)
        if serializer.is_valid():
            duration_minutes = serializer.validated_data.get('duration_minutes', 1440)  # Default 24 hours for officers
            
            # Create live location share session
            expires_at = timezone.now() + timedelta(minutes=duration_minutes)
            live_share = LiveLocationShare.objects.create(
                security_officer=officer,
                expires_at=expires_at,
                last_broadcast_at=timezone.now(),
                plan_type='premium',  # Officers always get premium
            )
            
            # Create initial track point if provided
            initial_latitude = serializer.validated_data.get('initial_latitude')
            initial_longitude = serializer.validated_data.get('initial_longitude')
            if initial_latitude is not None and initial_longitude is not None:
                LiveLocationTrackPoint.objects.create(
                    share=live_share,
                    latitude=initial_latitude,
                    longitude=initial_longitude
                )
            
            return Response({
                'message': 'Live location sharing started',
                'session': LiveLocationShareSerializer(live_share).data
            }, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def get(self, request):
        """Get active live location sharing sessions for officer"""
        if request.user.role != 'security_officer':
            return Response({'detail': 'Only officers can view live location sessions.'}, status=status.HTTP_403_FORBIDDEN)
        
        officer = request.user
        
        sessions = LiveLocationShare.objects.filter(
            security_officer=officer,
            is_active=True,
            expires_at__gt=timezone.now()
        ).order_by('-started_at')
        
        serializer = LiveLocationShareSerializer(sessions, many=True)
        return Response({'sessions': serializer.data})


class OfficerLiveLocationShareDetailView(OfficerOnlyMixin, APIView):
    """
    Security officer live location sharing detail endpoints.
    PATCH /api/security/live_location/<session_id>/ - Update location
    DELETE /api/security/live_location/<session_id>/ - Stop sharing
    """
    
    def patch(self, request, session_id):
        """Update live location for security officer"""
        if request.user.role != 'security_officer':
            return Response({'detail': 'Only officers can update live location.'}, status=status.HTTP_403_FORBIDDEN)
        
        officer = request.user
        
        try:
            live_share = LiveLocationShare.objects.get(
                id=session_id,
                security_officer=officer
            )
        except LiveLocationShare.DoesNotExist:
            return Response({'error': 'Live location session not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if not live_share.is_active or live_share.expires_at <= timezone.now():
            live_share.is_active = False
            live_share.stop_reason = 'expired'
            live_share.save(update_fields=['is_active', 'stop_reason'])
            return Response({'error': 'Live location session has ended'}, status=status.HTTP_400_BAD_REQUEST)
        
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        
        if latitude is None or longitude is None:
            return Response({'error': 'latitude and longitude are required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            lat = float(latitude)
            lng = float(longitude)
        except (TypeError, ValueError):
            return Response({'error': 'Invalid latitude/longitude values'}, status=status.HTTP_400_BAD_REQUEST)
        
        live_share.current_location = {'latitude': lat, 'longitude': lng}
        live_share.last_broadcast_at = timezone.now()
        live_share.save(update_fields=['current_location', 'last_broadcast_at'])

        # Log track point once per minute
        last_track_point = live_share.track_points.order_by('-recorded_at').first()
        if not last_track_point or (timezone.now() - last_track_point.recorded_at) >= timedelta(minutes=1):
            LiveLocationTrackPoint.objects.create(
                share=live_share,
                latitude=lat,
                longitude=lng
            )
        
        return Response({'status': 'updated'}, status=status.HTTP_200_OK)
    
    def delete(self, request, session_id):
        """Stop live location sharing for security officer"""
        if request.user.role != 'security_officer':
            return Response({'detail': 'Only officers can stop live location sharing.'}, status=status.HTTP_403_FORBIDDEN)
        
        officer = request.user
        
        try:
            live_share = LiveLocationShare.objects.get(
                id=session_id,
                security_officer=officer
            )
        except LiveLocationShare.DoesNotExist:
            return Response({'error': 'Live location session not found'}, status=status.HTTP_404_NOT_FOUND)
        
        live_share.is_active = False
        live_share.expires_at = timezone.now()
        live_share.current_location = None
        live_share.stop_reason = 'user'
        live_share.save(update_fields=['is_active', 'expires_at', 'current_location', 'stop_reason'])
        return Response({'status': 'stopped'}, status=status.HTTP_200_OK)


class GeofenceCurrentView(OfficerOnlyMixin, APIView):
    """
    Get the current geofence assigned to the logged-in security officer.
    Returns empty data if no geofence is assigned (200 status, not 404).
    """
    def get(self, request):
        try:
            officer = request.user
            logger.info(f"Geofence request for officer: {officer.username} (ID: {officer.id})")

            # 1. Check direct M2M relation (Legacy/Primary)
            geofences = list(officer.geofences.all())
            
            # 2. Check OfficerGeofenceAssignment table (Fallback/Strict)
            assignment_ids = OfficerGeofenceAssignment.objects.filter(
                officer=officer, 
                is_active=True
            ).values_list('geofence_id', flat=True)
            
            if assignment_ids:
                assigned_geofences = Geofence.objects.filter(id__in=assignment_ids)
                for g in assigned_geofences:
                    if g not in geofences:
                        geofences.append(g)

            logger.info(f"Found {len(geofences)} geofences for officer {officer.username}")

            if not geofences:
                logger.info(f"No geofence assigned to officer {officer.username}")
                return Response({
                    'data': None,
                    'message': 'No geofence assigned to this officer'
                }, status=status.HTTP_200_OK)

            # Sort by created_at desc to get most recent
            geofences.sort(key=lambda x: x.created_at, reverse=True)
            geofence = geofences[0]
            
            logger.info(f"Returning geofence: {geofence.name} (ID: {geofence.id}) for officer {officer.username}")

            # Use UserGeofenceSerializer to provide raw GeoJSON format expected by the frontend
            serializer = UserGeofenceSerializer(geofence)
            return Response(serializer.data, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error in GeofenceCurrentView for user {request.user.username}: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return Response({
                'error': 'An error occurred',
                'detail': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GeofenceDetailView(OfficerOnlyMixin, APIView):
    """
    Get geofence details by ID.
    Only returns geofences that are assigned to the logged-in security officer.
    """
    def get(self, request, geofence_id):
        officer = request.user
        
        try:
            # Get the geofence by ID
            geofence = Geofence.objects.get(id=geofence_id)
            
            # Check if this geofence is assigned to the officer
            if officer not in geofence.associated_users.all():
                return Response(
                    {'error': 'Geofence not assigned to this officer'},
                    status=status.HTTP_403_FORBIDDEN
                )
        except Geofence.DoesNotExist:
            return Response(
                {'error': 'Geofence not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = GeofenceSerializer(geofence)
        return Response(serializer.data, status=status.HTTP_200_OK)


    """
    ViewSet for LiveLocation with strict write permissions.
    Only users can create/update their own live locations for pending/accepted alerts.
    """
    serializer_class = LiveLocationSerializer
    permission_classes = [IsAuthenticated, IsLiveLocationOwner]
    
    def get_queryset(self):
        """
        Filter queryset based on user role:
        - Users: read own LiveLocation only
        - Officers: read LiveLocation of USER-created alerts assigned to them OR within their geofence
        """
        user = self.request.user
        
        if user.role == 'USER':
            # Users can only see their own live locations
            return LiveLocation.objects.filter(user=user)
        
        elif user.role == 'security_officer':
            # Officers can read LiveLocation of USER-created alerts:
            # 1. Assigned to them (via SOSAlert.assigned_officer)
            # 2. Within their geofence areas
            from django.db.models import Q
            
            # Get officer's assigned geofences
            officer_geofences = user.geofences.all()
            
            return LiveLocation.objects.filter(
                Q(sos_alert__created_by_role='USER') &  # Only USER-created alerts
                (
                    Q(sos_alert__assigned_officer=user) |  # Assigned to officer
                    Q(sos_alert__geofence__in=officer_geofences)  # Within officer's geofence
                )
            ).distinct()
        
        # Default: empty queryset
        return LiveLocation.objects.none()
    
    def perform_create(self, serializer):
        """Set the user and SOS alert relationship on creation."""
        serializer.save(user=self.request.user)
    
    def get_permissions(self):
        """Apply different permissions for different actions."""
        if self.action in ['create']:
            return [IsAuthenticated(), IsLiveLocationOwner()]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsLiveLocationOwner()]
        return [IsAuthenticated()]

class UserAlertViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Unified alerts endpoint - returns officer alerts + safety notifications
    
    Endpoints created:
    GET  /api/user/alerts/              - All alerts
    GET  /api/user/alerts/unread/       - Unread only
    POST /api/user/alerts/{id}/mark_read/ - Mark as read
    """
    
    serializer_class = UnifiedAlertSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        return []  # We override list() instead
    
    def list(self, request, *args, **kwargs):
        """Return unified list of all alerts"""
        user = request.user
        all_alerts = []
        
        # 1. OFFICER ALERTS (Primary - broadcasts + targeted)
        officer_alerts = OfficerAlert.objects.filter(
            is_active=True
        ).filter(
            Q(is_broadcast=True) | Q(users=user)
        ).distinct()
        
        for alert in officer_alerts:
            is_read = AlertRead.objects.filter(
                user=user,
                officer_alert=alert
            ).exists()
            
            all_alerts.append({
                'id': f"officer_{alert.id}",
                'alert_type': alert.alert_type,
                'alert_source': 'officer',
                'title': alert.title,
                'message': alert.message,
                'location': alert.location,
                'latitude': alert.latitude,
                'longitude': alert.longitude,
                'created_at': alert.created_at,
                'time_ago': self._time_ago(alert.created_at),
                'is_read': is_read,
                'officer_name': alert.officer.get_full_name(),
            })
        
        # 2. SOS SAFETY NOTIFICATIONS (User's SOS status updates)
        sos_alerts = SOSAlert.objects.filter(user=user, is_deleted=False).order_by('-created_at')[:10]
        
        for sos in sos_alerts:
            all_alerts.append({
                'id': f"sos_{sos.id}",
                'alert_type': 'emergency' if sos.status == 'active' else 'info',
                'alert_source': 'sos',
                'title': f"SOS Alert - {sos.status.title()}",
                'message': f"Your SOS alert is {sos.status}",
                'location': None,
                'latitude': sos.latitude,
                'longitude': sos.longitude,
                'created_at': sos.created_at,
                'time_ago': self._time_ago(sos.created_at),
                'is_read': False,
                'status': sos.status,
            })
        
        # 3. COMMUNITY ALERTS (if you have CommunityAlert model)
        # Uncomment if you have community alerts:
        """
        try:
            from users_profile.models import CommunityAlert
            community_alerts = CommunityAlert.objects.filter(
                user=user
            ).order_by('-created_at')[:10]
            
            for comm in community_alerts:
                all_alerts.append({
                    'id': f"community_{comm.id}",
                    'alert_type': 'warning',
                    'alert_source': 'community',
                    'title': 'Community Alert',
                    'message': comm.message,
                    'created_at': comm.created_at,
                    'time_ago': self._time_ago(comm.created_at),
                    'is_read': False,
                })
        except ImportError:
            pass
        """
        
        # Sort by most recent
        all_alerts.sort(key=lambda x: x['created_at'], reverse=True)
        
        serializer = UnifiedAlertSerializer(all_alerts, many=True)
        return Response(serializer.data)
    
    def _time_ago(self, dt):
        """Helper for human-readable time"""
        from django.utils.timesince import timesince
        return f"{timesince(dt)} ago"
    
    @action(detail=False, methods=['get'])
    def unread(self, request):
        """Get only unread officer alerts"""
        user = request.user
        
        officer_alerts = OfficerAlert.objects.filter(
            is_active=True
        ).filter(
            Q(is_broadcast=True) | Q(users=user)
        ).exclude(
            id__in=AlertRead.objects.filter(user=user).values_list('officer_alert_id', flat=True)
        ).distinct()
        
        alerts = []
        for alert in officer_alerts:
            alerts.append({
                'id': f"officer_{alert.id}",
                'alert_type': alert.alert_type,
                'alert_source': 'officer',
                'title': alert.title,
                'message': alert.message,
                'created_at': alert.created_at,
                'time_ago': self._time_ago(alert.created_at),
                'is_read': False,
            })
        
        serializer = UnifiedAlertSerializer(alerts, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Mark officer alert as read"""
        if not pk or '_' not in pk:
            return Response({'error': 'Invalid ID'}, status=400)
        
        alert_source, alert_id = pk.split('_', 1)
        
        if alert_source == 'officer':
            try:
                officer_alert = OfficerAlert.objects.get(id=alert_id)
                AlertRead.objects.get_or_create(
                    user=request.user,
                    officer_alert=officer_alert
                )
                return Response({'status': 'marked as read'})
            except OfficerAlert.DoesNotExist:
                return Response({'error': 'Not found'}, status=404)
        
        return Response({'status': 'ok'})


class GeofenceUsersView(OfficerOnlyMixin, APIView):
    """
    Get users who are physically located within a specific geofence.
    """
    def get(self, request, geofence_id):
        try:
            # Get the geofence by ID
            geofence = get_object_or_404(Geofence, id=geofence_id)
            
            # Check if this geofence is assigned to the officer
            # This is a security check to ensure officers only see users in their assigned areas
            officer = request.user
            is_assigned = officer.geofences.filter(id=geofence_id).exists() or \
                          OfficerGeofenceAssignment.objects.filter(officer=officer, geofence=geofence, is_active=True).exists()
            
            if not is_assigned:
                return Response(
                    {'error': 'Geofence not assigned to this officer'},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Get users in this geofence using the utility function
            # Default to 24 hours for location freshness
            users_locations = get_users_in_geofence(geofence, max_age_hours=24)
            
            serializer = UserInAreaSerializer(users_locations, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error in GeofenceUsersView: {str(e)}")
            return Response(
                {'error': 'An error occurred while fetching users in area', 'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

