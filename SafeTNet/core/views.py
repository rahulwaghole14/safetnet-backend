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
        },
        'status': 'running'
    })


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
