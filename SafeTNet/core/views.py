from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

# Create your views here.

@require_http_methods(["GET", "HEAD"])
def root_view(request):
    """
    Root API endpoint - provides API information
    """
    return JsonResponse({
        'message': 'SafeTNet API',
        'version': '1.0',
        'endpoints': {
            'admin': '/admin/',
            'api_docs': '/api/docs/',
            'api_schema': '/api/schema/',
            'security_login': '/api/security/login/',
            'auth': '/api/auth/',
            'user_profile': '/api/user/',
            'create_test_alert': '/api/create-test-alert/',
        },
        'status': 'running'
    })


def create_test_alert(request):
    """
    Temporary endpoint to create a test alert for User 18
    """
    from users.models import User, Alert, Geofence
    try:
        user = User.objects.filter(id=18).first()
        if not user:
            # Try to find by username if ID fails, or just the first user
            user = User.objects.first()
            if not user:
                return JsonResponse({'error': 'No users found in system'}, status=404)
        
        # Ensure user has at least one geofence
        geofence = user.geofences.filter(active=True).first()
        if not geofence:
            # Find any active geofence
            geofence = Geofence.objects.filter(active=True).first()
            if not geofence:
                return JsonResponse({'error': 'No active geofences found in system. Please create one in admin first.'}, status=400)
            user.geofences.add(geofence)
            user.save()
            msg_prefix = f"Added Geofence '{geofence.name}' to user {user.id}. "
        else:
            msg_prefix = ""

        # Create the alert
        alert = Alert.objects.create(
            user=user,
            geofence=geofence,
            title="SYSTEM TEST: High Priority Warning",
            description="This is a test alert generated to verify the AlertsScreen display. If you see this, the system is working!",
            status='ACTIVE',
            alert_type='SYSTEM_ALERT',
            severity='HIGH',
            priority='high'
        )
        
        return JsonResponse({
            'success': True,
            'message': f"{msg_prefix}Created test alert: {alert.title}",
            'alert_id': alert.id,
            'user_id': user.id,
            'geofence': geofence.name
        })
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error creating test alert: {e}", exc_info=True)
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def live_share_view(request, share_token):
    """
    Render a lightweight public page that streams live location updates
    for the provided share token.
    """
    try:
        from django.conf import settings
        
        # Get the base URL for API calls
        # Check X-Forwarded-Proto header (set by Render/proxy) first
        forwarded_proto = request.META.get('HTTP_X_FORWARDED_PROTO', '')
        if forwarded_proto:
            scheme = forwarded_proto
        elif request.is_secure():
            scheme = 'https'
        else:
            scheme = 'http'
        
        host = request.get_host()
        
        # For production (onrender.com), always use https
        if 'onrender.com' in host:
            scheme = 'https'
        # For local development, use http
        elif settings.DEBUG or 'localhost' in host or '127.0.0.1' in host or '192.168' in host:
            scheme = 'http'
        
        api_base_url = f"{scheme}://{host}"
        
        response = render(request, "core/live_share.html", {
            "share_token": share_token,
            "api_base_url": api_base_url
        })
        # Remove Cross-Origin-Opener-Policy header for local development (HTTP)
        # This prevents browser warnings when using HTTP instead of HTTPS
        if settings.DEBUG:
            if hasattr(response, 'headers'):
                response.headers.pop('Cross-Origin-Opener-Policy', None)
        return response
    except Exception as e:
        from django.http import HttpResponse
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error rendering live share view: {e}", exc_info=True)
        return HttpResponse(
            f"<html><body><h1>Error loading live share</h1><p>Share token: {share_token}</p><p>Error: {str(e)}</p></body></html>",
            status=500
        )
