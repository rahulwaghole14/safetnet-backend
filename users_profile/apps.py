from django.apps import AppConfig
import logging

logger = logging.getLogger(__name__)


class UsersProfileConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'users_profile'
    
    def ready(self):
        try:
            import users_profile.signals
        except Exception as e:
            logger.warning(f"Could not import users_profile signals: {str(e)}")
            # Don't crash the app if signals can't be imported
