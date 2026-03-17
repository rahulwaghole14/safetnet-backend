import base64
import binascii
import json
import logging
import os
from datetime import datetime, timedelta, timezone as datetime_timezone
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)

ACCESS_GRANTING_STATES = {
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
}

RTDN_NOTIFICATION_TYPES = {
    1: 'RECOVERED',
    2: 'RENEWED',
    3: 'CANCELED',
    4: 'PURCHASED',
    5: 'ON_HOLD',
    6: 'IN_GRACE_PERIOD',
    7: 'RESTARTED',
    8: 'PRICE_CHANGE_CONFIRMED',
    9: 'DEFERRED',
    10: 'PAUSED',
    11: 'PAUSE_SCHEDULE_CHANGED',
    12: 'REVOKED',
    13: 'EXPIRED',
    19: 'PRICE_STEP_UP_CONSENT_UPDATED',
    20: 'PENDING_PURCHASE_CANCELED',
}

VOIDED_PURCHASE_PRODUCT_TYPES = {
    1: 'SUBSCRIPTION',
    2: 'ONE_TIME_PRODUCT',
}

VOIDED_PURCHASE_REFUND_TYPES = {
    1: 'FULL_REFUND',
    2: 'QUANTITY_BASED_PARTIAL_REFUND',
}

GOOGLE_PLAY_PRODUCT_PRICES = {
    'premium_monthly': Decimal('499.00'),
    'premium-monthly': Decimal('499.00'),
    'premium_annual': Decimal('4799.00'),
    'premium-annual': Decimal('4799.00'),
}


def _load_google_play_service_account():
    """
    Return Google Play service account credentials from env/settings.
    """
    service_account_json = os.environ.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')
    if not service_account_json:
        service_account_json = getattr(settings, 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', None)

    if not service_account_json:
        return None

    if isinstance(service_account_json, str):
        try:
            return json.loads(service_account_json)
        except json.JSONDecodeError:
            if os.path.exists(service_account_json):
                with open(service_account_json, 'r', encoding='utf-8') as service_account_file:
                    return json.load(service_account_file)
            raise ValueError(
                'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is neither valid JSON nor a valid file path'
            )

    return service_account_json


def _build_google_play_service():
    creds_dict = _load_google_play_service_account()
    if not creds_dict:
        return None

    creds = service_account.Credentials.from_service_account_info(
        creds_dict,
        scopes=['https://www.googleapis.com/auth/androidpublisher'],
    )
    return build('androidpublisher', 'v3', credentials=creds, cache_discovery=False)


def _get_google_play_price(product_id):
    if not product_id:
        return Decimal('1.00')
    return GOOGLE_PLAY_PRODUCT_PRICES.get(product_id, Decimal('1.00'))


def _sync_user_details_price(user, price):
    """
    Keep the legacy UserDetails premium lookup in sync with subscription access.
    """
    username = getattr(user, 'username', '')
    if not username:
        return

    try:
        from users.models import UserDetails
    except Exception:
        return

    user_details, created = UserDetails.objects.get_or_create(
        username=username,
        defaults={
            'price': price,
            'status': 'ACTIVE',
        },
    )
    if created:
        return

    if user_details.price != price:
        user_details.price = price
        user_details.save(update_fields=['price'])


def _coerce_datetime(value):
    if not value:
        return None

    if isinstance(value, str) and value.isdigit():
        return datetime.fromtimestamp(int(value) / 1000, tz=datetime_timezone.utc)

    parsed = parse_datetime(value)
    if parsed and timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _select_line_item(subscription_data, fallback_product_id=None):
    line_items = subscription_data.get('lineItems') or []
    if not line_items:
        return {}, 0

    if fallback_product_id:
        for index, item in enumerate(line_items):
            if item.get('productId') == fallback_product_id:
                return item, index

    return line_items[0], 0


def normalize_google_play_subscription(subscription_data, fallback_product_id=None, package_name=None):
    """
    Normalize subscriptionsv2 data into a stable internal shape.
    """
    selected_line_item, line_item_index = _select_line_item(subscription_data, fallback_product_id)
    external_account_identifiers = subscription_data.get('externalAccountIdentifiers') or {}
    subscription_state = subscription_data.get('subscriptionState', '')
    expiry_time = _coerce_datetime(selected_line_item.get('expiryTime'))
    has_access = subscription_state in ACCESS_GRANTING_STATES

    if expiry_time and expiry_time <= timezone.now():
        has_access = False

    normalized = {
        'package_name': package_name or getattr(settings, 'GOOGLE_PLAY_PACKAGE_NAME', ''),
        'product_id': selected_line_item.get('productId') or fallback_product_id or '',
        'linked_purchase_token': selected_line_item.get('linkedPurchaseToken') or '',
        'latest_order_id': subscription_data.get('latestOrderId', ''),
        'subscription_state': subscription_state,
        'acknowledgement_state': subscription_data.get('acknowledgementState', ''),
        'auto_renew_enabled': selected_line_item.get('autoRenewingPlan') is not None,
        'line_item_index': line_item_index,
        'expiry_time': expiry_time,
        'external_account_id': (
            external_account_identifiers.get('obfuscatedExternalAccountId')
            or external_account_identifiers.get('externalAccountId')
            or ''
        ),
        'external_profile_id': external_account_identifiers.get('obfuscatedExternalProfileId') or '',
        'is_test_purchase': bool(subscription_data.get('testPurchase')),
        'has_access': has_access,
        'raw_response': subscription_data,
    }
    return normalized


def verify_google_play_subscription(package_name, subscription_id, purchase_token):
    """
    Verify a Google Play subscription using the subscriptionsv2 API.
    """
    service = _build_google_play_service()
    if not service:
        logger.error(
            'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not found. Please set it in .env or settings.py'
        )
        if settings.DEBUG:
            logger.warning('DEBUG MODE: Returning mock subscription data.')
            debug_response = {
                'subscriptionState': 'SUBSCRIPTION_STATE_ACTIVE',
                'acknowledgementState': 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
                'latestOrderId': 'debug-order-id',
                'lineItems': [
                    {
                        'productId': subscription_id,
                        'expiryTime': (timezone.now() + timedelta(days=30)).isoformat(),
                        'autoRenewingPlan': {},
                    }
                ],
            }
            return normalize_google_play_subscription(
                debug_response,
                fallback_product_id=subscription_id,
                package_name=package_name,
            )
        return None

    try:
        result = service.purchases().subscriptionsv2().get(
            packageName=package_name,
            token=purchase_token,
        ).execute()
        normalized = normalize_google_play_subscription(
            result,
            fallback_product_id=subscription_id,
            package_name=package_name,
        )
        logger.info(
            'Google Play Verification Success for token starting with: %s...',
            purchase_token[:10],
        )
        return normalized
    except HttpError as exc:
        logger.error('Google Play subscriptionsv2 verification failed: %s', exc)
        if settings.DEBUG:
            logger.warning(
                'DEBUG MODE FALLBACK: Returning mock subscription data despite verification error.'
            )
            debug_response = {
                'subscriptionState': 'SUBSCRIPTION_STATE_ACTIVE',
                'acknowledgementState': 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
                'latestOrderId': 'debug-order-id',
                'lineItems': [
                    {
                        'productId': subscription_id,
                        'expiryTime': (timezone.now() + timedelta(days=30)).isoformat(),
                        'autoRenewingPlan': {},
                    }
                ],
            }
            return normalize_google_play_subscription(
                debug_response,
                fallback_product_id=subscription_id,
                package_name=package_name,
            )
        return None
    except Exception as exc:
        logger.error('Error verifying Google Play subscription: %s', exc)
        if settings.DEBUG:
            logger.warning(
                'DEBUG MODE FALLBACK: Returning mock subscription data despite verification error.'
            )
            debug_response = {
                'subscriptionState': 'SUBSCRIPTION_STATE_ACTIVE',
                'acknowledgementState': 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
                'latestOrderId': 'debug-order-id',
                'lineItems': [
                    {
                        'productId': subscription_id,
                        'expiryTime': (timezone.now() + timedelta(days=30)).isoformat(),
                        'autoRenewingPlan': {},
                    }
                ],
            }
            return normalize_google_play_subscription(
                debug_response,
                fallback_product_id=subscription_id,
                package_name=package_name,
            )
        return None


def sync_user_google_play_entitlements(user):
    """
    Update the user's premium flags from their Google Play ledger entries.
    """
    from .models import GooglePlaySubscription

    subscriptions = list(
        GooglePlaySubscription.objects.filter(user=user).order_by('-expiry_time', '-updated_at')
    )
    if not subscriptions:
        return False

    active_subscriptions = [subscription for subscription in subscriptions if subscription.has_access]
    updated_fields = []

    if active_subscriptions:
        latest_expiry = max(
            (
                subscription.expiry_time
                for subscription in active_subscriptions
                if subscription.expiry_time is not None
            ),
            default=None,
        )
        reference_subscription = max(
            active_subscriptions,
            key=lambda subscription: subscription.expiry_time or timezone.now(),
        )
        if hasattr(user, 'plantype') and user.plantype != 'premium':
            user.plantype = 'premium'
            updated_fields.append('plantype')
        if latest_expiry and hasattr(user, 'planexpiry'):
            latest_expiry_date = latest_expiry.date()
            if user.planexpiry != latest_expiry_date:
                user.planexpiry = latest_expiry_date
                updated_fields.append('planexpiry')
        if updated_fields:
            user.save(update_fields=updated_fields)
        _sync_user_details_price(
            user,
            _get_google_play_price(reference_subscription.product_id),
        )
        return True

    max_known_expiry = max(
        (
            subscription.expiry_time.date()
            for subscription in subscriptions
            if subscription.expiry_time is not None
        ),
        default=None,
    )
    current_expiry = getattr(user, 'planexpiry', None)
    should_downgrade = getattr(user, 'plantype', '').lower() == 'premium'

    if current_expiry and max_known_expiry and current_expiry > max_known_expiry:
        should_downgrade = False

    if should_downgrade:
        if hasattr(user, 'plantype') and user.plantype != 'free':
            user.plantype = 'free'
            updated_fields.append('plantype')
        if hasattr(user, 'planexpiry') and user.planexpiry is not None:
            user.planexpiry = None
            updated_fields.append('planexpiry')
        if updated_fields:
            user.save(update_fields=updated_fields)

    _sync_user_details_price(user, Decimal('0.00'))

    return False


def upsert_google_play_subscription(
    *,
    user,
    package_name,
    purchase_token,
    normalized_subscription,
    event_type='',
    notification_time=None,
):
    """
    Persist the latest known subscription state for a token and sync the user if known.
    """
    from .models import GooglePlaySubscription

    with transaction.atomic():
        subscription = (
            GooglePlaySubscription.objects.select_for_update()
            .filter(purchase_token=purchase_token)
            .first()
        )

        if not subscription and normalized_subscription.get('linked_purchase_token'):
            previous_subscription = (
                GooglePlaySubscription.objects.select_for_update()
                .filter(purchase_token=normalized_subscription['linked_purchase_token'])
                .first()
            )
            if previous_subscription and not user:
                user = previous_subscription.user

        if subscription and subscription.user_id and user and subscription.user_id != user.id:
            raise ValueError('This Google Play purchase is already linked to another account.')

        if not subscription:
            subscription = GooglePlaySubscription(purchase_token=purchase_token)

        if user and subscription.user_id is None:
            subscription.user = user

        subscription.package_name = package_name
        subscription.product_id = normalized_subscription.get('product_id', '')
        subscription.linked_purchase_token = normalized_subscription.get('linked_purchase_token') or ''
        subscription.latest_order_id = normalized_subscription.get('latest_order_id', '')
        subscription.subscription_state = normalized_subscription.get('subscription_state', '')
        subscription.acknowledgement_state = normalized_subscription.get(
            'acknowledgement_state',
            '',
        )
        subscription.auto_renew_enabled = normalized_subscription.get('auto_renew_enabled', False)
        subscription.line_item_index = normalized_subscription.get('line_item_index', 0)
        subscription.expiry_time = normalized_subscription.get('expiry_time')
        subscription.external_account_id = normalized_subscription.get('external_account_id', '')
        subscription.external_profile_id = normalized_subscription.get('external_profile_id', '')
        subscription.is_test_purchase = normalized_subscription.get('is_test_purchase', False)
        subscription.raw_response = normalized_subscription.get('raw_response', {})
        subscription.last_verified_at = timezone.now()

        if event_type:
            subscription.last_event_type = event_type
        if notification_time:
            subscription.last_notification_at = notification_time

        subscription.save()

    if subscription.user:
        sync_user_google_play_entitlements(subscription.user)

    return subscription


def decode_google_play_rtdn_message(encoded_message):
    """
    Decode the base64-encoded Pub/Sub message body used by RTDN.
    """
    if not encoded_message:
        raise ValueError('RTDN message data is required')

    padded_message = encoded_message + ('=' * (-len(encoded_message) % 4))
    try:
        decoded_bytes = base64.b64decode(padded_message)
    except (binascii.Error, ValueError) as exc:
        raise ValueError('RTDN message data is not valid base64') from exc

    try:
        return json.loads(decoded_bytes.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError('RTDN message data is not valid JSON') from exc


def _process_test_notification(payload):
    test_notification = payload.get('testNotification') or {}
    return {
        'event_type': 'TEST_NOTIFICATION',
        'handled': True,
        'version': test_notification.get('version') or payload.get('version', ''),
    }


def _process_voided_purchase_notification(payload, package_name, notification_time):
    """
    Mark a known purchase token as voided when Play sends a refund or revocation RTDN.
    """
    from .models import GooglePlaySubscription

    voided_notification = payload.get('voidedPurchaseNotification') or {}
    purchase_token = voided_notification.get('purchaseToken')
    if not purchase_token:
        raise ValueError('RTDN voidedPurchaseNotification.purchaseToken is required')

    product_type = VOIDED_PURCHASE_PRODUCT_TYPES.get(
        voided_notification.get('productType'),
        'UNKNOWN_PRODUCT_TYPE',
    )
    refund_type = VOIDED_PURCHASE_REFUND_TYPES.get(
        voided_notification.get('refundType'),
        'UNKNOWN_REFUND_TYPE',
    )
    event_type = 'VOIDED_PURCHASE'

    subscription = GooglePlaySubscription.objects.filter(
        purchase_token=purchase_token,
    ).first()
    if not subscription:
        return {
            'purchase_token': purchase_token,
            'event_type': event_type,
            'product_type': product_type,
            'refund_type': refund_type,
            'subscription_state': '',
            'handled': False,
        }

    raw_response = subscription.raw_response or {}
    raw_response['voidedPurchaseNotification'] = voided_notification
    raw_response['latestRtdnPayload'] = payload

    subscription.package_name = package_name or subscription.package_name
    subscription.subscription_state = 'SUBSCRIPTION_STATE_REVOKED'
    subscription.auto_renew_enabled = False
    subscription.last_event_type = event_type
    subscription.last_notification_at = notification_time or timezone.now()
    subscription.raw_response = raw_response
    subscription.save(
        update_fields=[
            'package_name',
            'subscription_state',
            'auto_renew_enabled',
            'last_event_type',
            'last_notification_at',
            'raw_response',
            'updated_at',
        ]
    )

    if subscription.user:
        sync_user_google_play_entitlements(subscription.user)

    return {
        'purchase_token': purchase_token,
        'event_type': event_type,
        'product_type': product_type,
        'refund_type': refund_type,
        'subscription_state': subscription.subscription_state,
        'handled': True,
    }


def _process_one_time_product_notification(payload):
    """
    Acknowledge one-time-product RTDN payloads without failing subscription setup.
    """
    notification = payload.get('oneTimeProductNotification') or {}
    notification_type = notification.get('notificationType')
    purchase_token = notification.get('purchaseToken', '')
    event_suffix = notification_type if notification_type is not None else 'UNKNOWN'

    return {
        'purchase_token': purchase_token,
        'event_type': f'ONE_TIME_PRODUCT_NOTIFICATION_{event_suffix}',
        'handled': False,
    }


def process_google_play_rtdn_payload(payload):
    """
    Process a decoded RTDN payload and refresh the corresponding subscription ledger row.
    """
    from .models import GooglePlaySubscription

    package_name = payload.get('packageName') or getattr(
        settings,
        'GOOGLE_PLAY_PACKAGE_NAME',
        'com.safetnet.userapp',
    )
    notification_time = _coerce_datetime(payload.get('eventTimeMillis'))

    if 'testNotification' in payload:
        return _process_test_notification(payload)

    if 'voidedPurchaseNotification' in payload:
        return _process_voided_purchase_notification(
            payload,
            package_name=package_name,
            notification_time=notification_time,
        )

    if 'oneTimeProductNotification' in payload:
        return _process_one_time_product_notification(payload)

    subscription_notification = payload.get('subscriptionNotification') or {}
    purchase_token = subscription_notification.get('purchaseToken')
    if not purchase_token:
        raise ValueError('RTDN subscriptionNotification.purchaseToken is required')

    subscription_id = subscription_notification.get('subscriptionId', '')
    notification_type = subscription_notification.get('notificationType')
    event_type = RTDN_NOTIFICATION_TYPES.get(
        notification_type,
        f'NOTIFICATION_TYPE_{notification_type}',
    )

    normalized_subscription = verify_google_play_subscription(
        package_name=package_name,
        subscription_id=subscription_id,
        purchase_token=purchase_token,
    )

    if normalized_subscription:
        subscription = upsert_google_play_subscription(
            user=None,
            package_name=package_name,
            purchase_token=purchase_token,
            normalized_subscription=normalized_subscription,
            event_type=event_type,
            notification_time=notification_time,
        )
        return {
            'purchase_token': purchase_token,
            'event_type': event_type,
            'subscription_state': subscription.subscription_state,
        }

    subscription = GooglePlaySubscription.objects.filter(purchase_token=purchase_token).first()
    if subscription:
        subscription.last_event_type = event_type
        subscription.last_notification_at = notification_time or timezone.now()
        subscription.save(update_fields=['last_event_type', 'last_notification_at', 'updated_at'])
        if subscription.user:
            sync_user_google_play_entitlements(subscription.user)

    return {
        'purchase_token': purchase_token,
        'event_type': event_type,
        'subscription_state': subscription.subscription_state if subscription else '',
    }
