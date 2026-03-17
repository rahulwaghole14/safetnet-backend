import base64
import json
from datetime import timedelta
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model

from users_profile.google_play_utils import (
    decode_google_play_rtdn_message,
    normalize_google_play_subscription,
    process_google_play_rtdn_payload,
)
from users_profile.models import GooglePlaySubscription
from users.models import UserDetails

User = get_user_model()


class GooglePlayUtilsSimpleTest(SimpleTestCase):
    """Pure utility tests for Google Play billing helpers."""

    def test_normalize_google_play_subscription_prefers_matching_line_item(self):
        payload = {
            'subscriptionState': 'SUBSCRIPTION_STATE_ACTIVE',
            'acknowledgementState': 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
            'latestOrderId': 'order-123',
            'externalAccountIdentifiers': {
                'obfuscatedExternalAccountId': 'acct-1',
                'obfuscatedExternalProfileId': 'profile-1',
            },
            'lineItems': [
                {
                    'productId': 'premium_annual',
                    'expiryTime': (timezone.now() + timedelta(days=365)).isoformat(),
                },
                {
                    'productId': 'premium_monthly',
                    'expiryTime': (timezone.now() + timedelta(days=30)).isoformat(),
                    'autoRenewingPlan': {},
                    'linkedPurchaseToken': 'linked-token-1',
                },
            ],
        }

        normalized = normalize_google_play_subscription(
            payload,
            fallback_product_id='premium_monthly',
            package_name='com.safetnet.userapp',
        )

        self.assertEqual(normalized['product_id'], 'premium_monthly')
        self.assertEqual(normalized['line_item_index'], 1)
        self.assertEqual(normalized['linked_purchase_token'], 'linked-token-1')
        self.assertTrue(normalized['auto_renew_enabled'])
        self.assertTrue(normalized['has_access'])

    def test_normalize_google_play_subscription_marks_non_active_state_as_no_access(self):
        payload = {
            'subscriptionState': 'SUBSCRIPTION_STATE_ON_HOLD',
            'acknowledgementState': 'ACKNOWLEDGEMENT_STATE_PENDING',
            'lineItems': [
                {
                    'productId': 'premium_monthly',
                    'expiryTime': (timezone.now() + timedelta(days=5)).isoformat(),
                }
            ],
        }

        normalized = normalize_google_play_subscription(
            payload,
            fallback_product_id='premium_monthly',
            package_name='com.safetnet.userapp',
        )

        self.assertEqual(normalized['subscription_state'], 'SUBSCRIPTION_STATE_ON_HOLD')
        self.assertFalse(normalized['has_access'])

    def test_decode_google_play_rtdn_message_decodes_pubsub_payload(self):
        payload = {
            'packageName': 'com.safetnet.userapp',
            'eventTimeMillis': '1742200000000',
            'subscriptionNotification': {
                'notificationType': 4,
                'purchaseToken': 'purchase-token-123',
                'subscriptionId': 'premium_monthly',
            },
        }
        encoded = base64.b64encode(json.dumps(payload).encode('utf-8')).decode('utf-8')

        decoded = decode_google_play_rtdn_message(encoded)

        self.assertEqual(decoded['packageName'], 'com.safetnet.userapp')
        self.assertEqual(
            decoded['subscriptionNotification']['purchaseToken'],
            'purchase-token-123',
        )

    def test_process_google_play_rtdn_payload_handles_test_notifications(self):
        processed = process_google_play_rtdn_payload({
            'version': '1.0',
            'testNotification': {},
        })

        self.assertEqual(processed['event_type'], 'TEST_NOTIFICATION')
        self.assertTrue(processed['handled'])

    def test_process_google_play_rtdn_payload_handles_one_time_notifications_without_error(self):
        processed = process_google_play_rtdn_payload({
            'packageName': 'com.safetnet.userapp',
            'eventTimeMillis': '1742200000000',
            'oneTimeProductNotification': {
                'notificationType': 1,
                'purchaseToken': 'otp-token-123',
                'sku': 'panic_pack',
            },
        })

        self.assertEqual(processed['purchase_token'], 'otp-token-123')
        self.assertEqual(processed['event_type'], 'ONE_TIME_PRODUCT_NOTIFICATION_1')
        self.assertFalse(processed['handled'])


class GooglePlayUtilsDBTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='rtdnuser',
            email='rtdn@example.com',
            phone='+1234567890',
            password='testpass123',
        )

    def test_process_google_play_rtdn_payload_voided_purchase_revokes_subscription(self):
        subscription = GooglePlaySubscription.objects.create(
            user=self.user,
            package_name='com.safetnet.userapp',
            product_id='premium_monthly',
            purchase_token='voided-token-123',
            subscription_state='SUBSCRIPTION_STATE_ACTIVE',
            auto_renew_enabled=True,
            expiry_time=timezone.now() + timedelta(days=30),
            raw_response={},
        )

        processed = process_google_play_rtdn_payload({
            'packageName': 'com.safetnet.userapp',
            'eventTimeMillis': '1742200000000',
            'voidedPurchaseNotification': {
                'purchaseToken': 'voided-token-123',
                'productType': 1,
                'refundType': 1,
            },
        })

        subscription.refresh_from_db()
        user_details = UserDetails.objects.get(username=self.user.username)

        self.assertEqual(processed['event_type'], 'VOIDED_PURCHASE')
        self.assertEqual(subscription.subscription_state, 'SUBSCRIPTION_STATE_REVOKED')
        self.assertFalse(subscription.auto_renew_enabled)
        self.assertEqual(str(user_details.price), '0.00')

    @patch('users_profile.google_play_utils.verify_google_play_subscription')
    def test_process_google_play_rtdn_payload_updates_subscription_notifications(self, mock_verify):
        mock_verify.return_value = {
            'product_id': 'premium_monthly',
            'linked_purchase_token': '',
            'latest_order_id': 'order-123',
            'subscription_state': 'SUBSCRIPTION_STATE_ACTIVE',
            'acknowledgement_state': 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
            'auto_renew_enabled': True,
            'line_item_index': 0,
            'expiry_time': timezone.now() + timedelta(days=30),
            'external_account_id': '',
            'external_profile_id': '',
            'is_test_purchase': False,
            'has_access': True,
            'raw_response': {},
        }

        processed = process_google_play_rtdn_payload({
            'packageName': 'com.safetnet.userapp',
            'eventTimeMillis': '1742200000000',
            'subscriptionNotification': {
                'notificationType': 4,
                'purchaseToken': 'purchase-token-123',
                'subscriptionId': 'premium_monthly',
            },
        })

        self.assertEqual(processed['event_type'], 'PURCHASED')
        self.assertEqual(processed['subscription_state'], 'SUBSCRIPTION_STATE_ACTIVE')
        self.assertTrue(
            GooglePlaySubscription.objects.filter(purchase_token='purchase-token-123').exists()
        )
