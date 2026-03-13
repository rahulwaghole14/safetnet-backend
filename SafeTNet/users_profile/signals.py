"""
Signal handlers for User models.
"""
import logging
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from .models import User, FamilyContact, SOSEvent

logger = logging.getLogger(__name__)


@receiver(post_save, sender=User)
def user_post_save(sender, instance, created, **kwargs):
    """
    Handle user creation and updates.
    """
    try:
        if created:
            logger.info(f"New user created: {instance.email if hasattr(instance, 'email') else 'Unknown'}")
        else:
            logger.info(f"User updated: {instance.email if hasattr(instance, 'email') else 'Unknown'}")
    except Exception as e:
        logger.error(f"Error in user_post_save signal: {str(e)}")


@receiver(pre_save, sender=FamilyContact)
def family_contact_pre_save(sender, instance, **kwargs):
    """
    Handle family contact creation and updates.
    """
    try:
        if not instance.pk:  # New contact being created
            # Ensure maximum 3 contacts per user
            if instance.user:
                existing_count = FamilyContact.objects.filter(user=instance.user).count()
                if existing_count >= 3:
                    raise ValueError("Maximum 3 family contacts allowed per user")
                
                logger.info(f"New family contact being created for user: {instance.user.email}")
        else:
            if instance.user:
                logger.info(f"Family contact being updated for user: {instance.user.email}")
    except Exception as e:
        logger.error(f"Error in family_contact_pre_save signal: {str(e)}")
        # Re-raise if it's a validation error, otherwise log and continue
        if isinstance(e, ValueError):
            raise


@receiver(post_save, sender=SOSEvent)
def sos_event_post_save(sender, instance, created, **kwargs):
    """
    Handle SOS event creation and updates.
    """
    try:
        if created:
            logger.info(f"SOS event created for user: {instance.user.email if instance.user else 'Unknown'}")
            
            # NOTE: Notification and security alert synchronization is now handled 
            # by the sync signals in security_app/signals.py.
            # We no longer need to trigger emergency response from here.
            logger.info(f"Handled by security_app signals for user: {instance.user.email if instance.user else 'Unknown'}")
        else:
            logger.info(f"SOS event updated for user: {instance.user.email if instance.user else 'Unknown'}")
    except Exception as e:
        logger.error(f"Error in sos_event_post_save signal: {str(e)}")
