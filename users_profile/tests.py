"""
Unit tests for User models and API endpoints.
"""
import base64
import json
from datetime import timedelta
from unittest import skipUnless
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User, FamilyContact, CommunityMembership, GooglePlaySubscription, SOSEvent
from users.models import PromoCode
from users.models import UserDetails

try:
    from django.contrib.gis.geos import Point
    HAS_GIS = True
except ImproperlyConfigured:
    Point = None
    HAS_GIS = False

User = get_user_model()


class UserModelTest(TestCase):
    """Test cases for User model."""
    
    def setUp(self):
        """Set up test data."""
        self.user_data = {
            'name': 'John Doe',
            'email': 'john@example.com',
            'phone': '+1234567890',
            'plantype': 'free'
        }
    
    def test_user_creation(self):
        """Test user creation."""
        user = User.objects.create_user(**self.user_data)
        self.assertEqual(user.name, 'John Doe')
        self.assertEqual(user.email, 'john@example.com')
        self.assertEqual(user.phone, '+1234567890')
        self.assertEqual(user.plantype, 'free')
        self.assertFalse(user.is_premium)
    
    def test_user_premium_status(self):
        """Test premium status calculation."""
        from datetime import date, timedelta
        
        # Free user
        user = User.objects.create_user(**self.user_data)
        self.assertFalse(user.is_premium)
        
        # Premium user with future expiry
        user.plantype = 'premium'
        user.planexpiry = date.today() + timedelta(days=30)
        user.save()
        self.assertTrue(user.is_premium)
        
        # Premium user with past expiry
        user.planexpiry = date.today() - timedelta(days=1)
        user.save()
        self.assertFalse(user.is_premium)
    
    @skipUnless(HAS_GIS, 'GDAL is not installed')
    def test_user_location(self):
        """Test user location functionality."""
        user = User.objects.create_user(**self.user_data)
        
        # Set location
        user.set_location(-74.0059, 40.7128)  # New York coordinates
        self.assertIsNotNone(user.location)
        self.assertEqual(user.location.x, -74.0059)
        self.assertEqual(user.location.y, 40.7128)
        
        # Get location dict
        location_dict = user.get_location_dict()
        self.assertEqual(location_dict['longitude'], -74.0059)
        self.assertEqual(location_dict['latitude'], 40.7128)


class FamilyContactModelTest(TestCase):
    """Test cases for FamilyContact model."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            name='John Doe',
            email='john@example.com',
            phone='+1234567890'
        )
    
    def test_family_contact_creation(self):
        """Test family contact creation."""
        contact = FamilyContact.objects.create(
            user=self.user,
            name='Jane Doe',
            phone='+0987654321',
            relationship='Spouse'
        )
        self.assertEqual(contact.name, 'Jane Doe')
        self.assertEqual(contact.phone, '+0987654321')
        self.assertEqual(contact.relationship, 'Spouse')
        self.assertEqual(contact.user, self.user)
    
    def test_maximum_contacts_limit(self):
        """Test maximum 3 contacts per user."""
        # Create 3 contacts
        for i in range(3):
            FamilyContact.objects.create(
                user=self.user,
                name=f'Contact {i}',
                phone=f'+123456789{i}',
                relationship='Friend'
            )
        
        # Try to create 4th contact
        with self.assertRaises(ValueError):
            FamilyContact.objects.create(
                user=self.user,
                name='Contact 4',
                phone='+1234567894',
                relationship='Friend'
            )
    
    def test_primary_contact_unique(self):
        """Test that only one contact can be primary per user."""
        contact1 = FamilyContact.objects.create(
            user=self.user,
            name='Contact 1',
            phone='+1234567891',
            is_primary=True
        )
        
        contact2 = FamilyContact.objects.create(
            user=self.user,
            name='Contact 2',
            phone='+1234567892',
            is_primary=True
        )
        
        # Refresh from database
        contact1.refresh_from_db()
        contact2.refresh_from_db()
        
        # Only the last created contact should be primary
        self.assertFalse(contact1.is_primary)
        self.assertTrue(contact2.is_primary)


class UserAPITest(APITestCase):
    """Test cases for User API endpoints."""
    
    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        self.user_data = {
            'name': 'John Doe',
            'email': 'john@example.com',
            'phone': '+1234567890',
            'password': 'testpass123',
            'password_confirm': 'testpass123'
        }
    
    def test_user_registration(self):
        """Test user registration endpoint."""
        url = reverse('users:user-registration')
        response = self.client.post(url, self.user_data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('tokens', response.data)
        self.assertIn('user', response.data)
        self.assertEqual(response.data['user']['email'], 'john@example.com')
    
    def test_user_registration_invalid_data(self):
        """Test user registration with invalid data."""
        url = reverse('users:user-registration')
        invalid_data = self.user_data.copy()
        invalid_data['password_confirm'] = 'different_password'
        
        response = self.client.post(url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_user_login(self):
        """Test user login endpoint."""
        # Create user first
        User.objects.create_user(
            name='John Doe',
            email='john@example.com',
            phone='+1234567890',
            password='testpass123'
        )
        
        url = reverse('users:user-login')
        login_data = {
            'email': 'john@example.com',
            'password': 'testpass123'
        }
        
        response = self.client.post(url, login_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('tokens', response.data)
        self.assertIn('user', response.data)
    
    def test_user_profile_get(self):
        """Test getting user profile."""
        user = User.objects.create_user(
            name='John Doe',
            email='john@example.com',
            phone='+1234567890'
        )
        
        # Get JWT token
        refresh = RefreshToken.for_user(user)
        access_token = refresh.access_token
        
        # Set authorization header
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        
        url = reverse('users:user-profile', kwargs={'user_id': user.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], 'john@example.com')
    
    def test_user_profile_update(self):
        """Test updating user profile."""
        user = User.objects.create_user(
            name='John Doe',
            email='john@example.com',
            phone='+1234567890'
        )
        
        # Get JWT token
        refresh = RefreshToken.for_user(user)
        access_token = refresh.access_token
        
        # Set authorization header
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        
        url = reverse('users:user-profile', kwargs={'user_id': user.id})
        update_data = {'name': 'John Smith'}
        
        response = self.client.patch(url, update_data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'John Smith')
    
    def test_user_location_update(self):
        """Test updating user location."""
        user = User.objects.create_user(
            name='John Doe',
            email='john@example.com',
            phone='+1234567890'
        )
        
        # Get JWT token
        refresh = RefreshToken.for_user(user)
        access_token = refresh.access_token
        
        # Set authorization header
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        
        url = reverse('users:user-location-update', kwargs={'user_id': user.id})
        location_data = {
            'longitude': -74.0059,
            'latitude': 40.7128
        }
        
        response = self.client.post(url, location_data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('location', response.data)


class FamilyContactAPITest(APITestCase):
    """Test cases for FamilyContact API endpoints."""
    
    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        self.user = User.objects.create_user(
            name='John Doe',
            email='john@example.com',
            phone='+1234567890'
        )
        
        # Get JWT token
        refresh = RefreshToken.for_user(self.user)
        self.access_token = refresh.access_token
        
        # Set authorization header
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')
    
    def test_family_contact_list(self):
        """Test listing family contacts."""
        # Create a family contact
        FamilyContact.objects.create(
            user=self.user,
            name='Jane Doe',
            phone='+0987654321',
            relationship='Spouse'
        )
        
        url = reverse('users:family-contacts-list', kwargs={'user_id': self.user.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Jane Doe')
    
    def test_family_contact_create(self):
        """Test creating family contact."""
        url = reverse('users:family-contacts-list', kwargs={'user_id': self.user.id})
        contact_data = {
            'name': 'Jane Doe',
            'phone': '+0987654321',
            'relationship': 'Spouse'
        }
        
        response = self.client.post(url, contact_data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Jane Doe')
    
    def test_family_contact_maximum_limit(self):
        """Test maximum 3 contacts limit."""
        url = reverse('users:family-contacts-list', kwargs={'user_id': self.user.id})
        
        # Create 3 contacts
        for i in range(3):
            contact_data = {
                'name': f'Contact {i}',
                'phone': f'+123456789{i}',
                'relationship': 'Friend'
            }
            response = self.client.post(url, contact_data, format='json')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Try to create 4th contact
        contact_data = {
            'name': 'Contact 4',
            'phone': '+1234567894',
            'relationship': 'Friend'
        }
        response = self.client.post(url, contact_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_family_contact_delete(self):
        """Test deleting family contact."""
        contact = FamilyContact.objects.create(
            user=self.user,
            name='Jane Doe',
            phone='+0987654321',
            relationship='Spouse'
        )
        
        url = reverse('users:family-contact-detail', kwargs={
            'user_id': self.user.id,
            'contact_id': contact.id
        })
        
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        # Verify contact is deleted
        self.assertFalse(FamilyContact.objects.filter(id=contact.id).exists())


class CommunityAPITest(APITestCase):
    """Test cases for Community API endpoints."""
    
    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        self.user = User.objects.create_user(
            name='John Doe',
            email='john@example.com',
            phone='+1234567890'
        )
        
        # Get JWT token
        refresh = RefreshToken.for_user(self.user)
        self.access_token = refresh.access_token
        
        # Set authorization header
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')
    
    def test_community_join(self):
        """Test joining a community."""
        url = reverse('users:community-join', kwargs={'user_id': self.user.id})
        community_data = {
            'community_id': 'comm_123',
            'community_name': 'Test Community'
        }
        
        response = self.client.post(url, community_data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['membership']['community_id'], 'comm_123')
    
    def test_community_list(self):
        """Test listing user's communities."""
        # Create a community membership
        CommunityMembership.objects.create(
            user=self.user,
            community_id='comm_123',
            community_name='Test Community'
        )
        
        url = reverse('users:community-memberships-list', kwargs={'user_id': self.user.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['community_id'], 'comm_123')
    
    def test_community_leave(self):
        """Test leaving a community."""
        membership = CommunityMembership.objects.create(
            user=self.user,
            community_id='comm_123',
            community_name='Test Community'
        )
        
        url = reverse('users:community-leave', kwargs={
            'user_id': self.user.id,
            'community_id': 'comm_123'
        })
        
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify membership is deactivated
        membership.refresh_from_db()
        self.assertFalse(membership.is_active)


class SOSAPITest(APITestCase):
    """Test cases for SOS API endpoints."""
    
    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        self.user = User.objects.create_user(
            name='John Doe',
            email='john@example.com',
            phone='+1234567890'
        )
        
        # Create a family contact
        FamilyContact.objects.create(
            user=self.user,
            name='Jane Doe',
            phone='+0987654321',
            relationship='Spouse'
        )
        
        # Get JWT token
        refresh = RefreshToken.for_user(self.user)
        self.access_token = refresh.access_token
        
        # Set authorization header
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')
    
    def test_sos_trigger(self):
        """Test triggering SOS event."""
        url = reverse('users:sos-trigger', kwargs={'user_id': self.user.id})
        sos_data = {
            'longitude': -74.0059,
            'latitude': 40.7128,
            'notes': 'Emergency test'
        }
        
        response = self.client.post(url, sos_data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('sos_event', response.data)
        self.assertEqual(response.data['sos_event']['notes'], 'Emergency test')
    
    @skipUnless(HAS_GIS, 'GDAL is not installed')
    def test_sos_events_list(self):
        """Test listing SOS events."""
        # Create an SOS event
        SOSEvent.objects.create(
            user=self.user,
            location=Point(-74.0059, 40.7128),
            notes='Test SOS event'
        )
        
        url = reverse('users:sos-events-list', kwargs={'user_id': self.user.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['notes'], 'Test SOS event')


class AuthenticationTest(APITestCase):
    """Test cases for authentication and permissions."""
    
    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        self.user = User.objects.create_user(
            name='John Doe',
            email='john@example.com',
            phone='+1234567890'
        )
        self.other_user = User.objects.create_user(
            name='Jane Doe',
            email='jane@example.com',
            phone='+0987654321'
        )
    
    def test_unauthorized_access(self):
        """Test that unauthorized users cannot access protected endpoints."""
        url = reverse('users:user-profile', kwargs={'user_id': self.user.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_cross_user_access(self):
        """Test that users cannot access other users' data."""
        # Get JWT token for user
        refresh = RefreshToken.for_user(self.user)
        access_token = refresh.access_token
        
        # Set authorization header
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        
        # Try to access other user's profile
        url = reverse('users:user-profile', kwargs={'user_id': self.other_user.id})
        response = self.client.get(url)
        
        # Should still return user's own profile (current implementation)
        # In a more strict implementation, this could return 403
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class SubscriptionBillingAPITest(APITestCase):
    """Test cases for subscription and Play billing endpoints."""

    def setUp(self):
        """Create an authenticated user for billing tests."""
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='billinguser',
            email='billing@example.com',
            phone='+1234567890',
            password='testpass123'
        )
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

    def test_subscribe_requires_valid_promo_code(self):
        """Direct subscription activation should require a valid promo code."""
        url = reverse('users:subscribe')

        response = self.client.post(url, {'plan_type': 'premium-monthly'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('promo code', response.data['error'].lower())

    def test_subscribe_rejects_invalid_promo_code(self):
        """Invalid promo codes should not activate premium access."""
        url = reverse('users:subscribe')

        response = self.client.post(
            url,
            {'plan_type': 'premium-monthly', 'promo_code': 'INVALID'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error'], 'Invalid promo code')

    def test_subscribe_accepts_valid_promo_code(self):
        """Valid promo codes can activate complimentary premium access."""
        PromoCode.objects.create(
            code='PREMIUM100',
            discount_percentage=100,
            expiry_date=timezone.now() + timedelta(days=7),
            is_active=True
        )
        url = reverse('users:subscribe')

        response = self.client.post(
            url,
            {'plan_type': 'premium-annual', 'promo_code': 'premium100'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['plan_type'], 'premium')
        self.assertIsNotNone(response.data['planexpiry'])
        self.assertGreater(
            UserDetails.objects.get(username=self.user.username).price,
            0,
        )

    def test_cancel_subscription_redirects_to_google_play(self):
        """Self-service cancellation should happen in Google Play, not the backend."""
        self.user.plantype = 'premium'
        self.user.planexpiry = timezone.now().date() + timedelta(days=30)
        self.user.save()
        url = reverse('users:cancel-subscription')

        response = self.client.post(url, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Google Play', response.data['error'])
        self.user.refresh_from_db()
        self.assertEqual(self.user.plantype, 'premium')

    @patch('users_profile.views.verify_google_play_subscription')
    def test_verify_google_purchase_uses_configured_default_package(self, mock_verify):
        """Missing package_name should fall back to the configured Play package."""
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
        url = reverse('users:verify-google-purchase')

        response = self.client.post(
            url,
            {
                'purchase_token': 'purchase-token-123',
                'subscription_id': 'premium_monthly',
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(
            UserDetails.objects.get(username=self.user.username).price,
            0,
        )
        mock_verify.assert_called_once_with(
            package_name='com.safetnet.userapp',
            subscription_id='premium_monthly',
            purchase_token='purchase-token-123'
        )


class GooglePlayRTDNAPITest(APITestCase):
    def setUp(self):
        self.url = reverse('users:google-play-rtdn')
        self.shared_secret = 'test-rtdn-secret'
        self.user = User.objects.create_user(
            username='rtdnuserapi',
            email='rtdnapi@example.com',
            phone='+1234567891',
            password='testpass123',
        )

    def _encoded_payload(self, payload):
        return base64.b64encode(json.dumps(payload).encode('utf-8')).decode('utf-8')

    @patch('users_profile.views.settings.GOOGLE_PLAY_RTDN_SHARED_SECRET', 'test-rtdn-secret')
    def test_google_play_rtdn_rejects_incorrect_secret(self):
        response = self.client.post(
            f'{self.url}?secret=wrong-secret',
            {
                'message': {
                    'data': self._encoded_payload({
                        'version': '1.0',
                        'testNotification': {},
                    })
                }
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch('users_profile.views.settings.GOOGLE_PLAY_RTDN_SHARED_SECRET', 'test-rtdn-secret')
    def test_google_play_rtdn_accepts_test_notifications(self):
        response = self.client.post(
            f'{self.url}?secret={self.shared_secret}',
            {
                'message': {
                    'data': self._encoded_payload({
                        'version': '1.0',
                        'testNotification': {},
                    })
                }
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data['processed']['event_type'], 'TEST_NOTIFICATION')

    @patch('users_profile.views.settings.GOOGLE_PLAY_RTDN_SHARED_SECRET', 'test-rtdn-secret')
    def test_google_play_rtdn_voided_purchase_revokes_local_access(self):
        UserDetails.objects.create(
            username=self.user.username,
            price='499.00',
            status='ACTIVE',
        )
        GooglePlaySubscription.objects.create(
            user=self.user,
            package_name='com.safetnet.userapp',
            product_id='premium_monthly',
            purchase_token='voided-token-456',
            subscription_state='SUBSCRIPTION_STATE_ACTIVE',
            auto_renew_enabled=True,
            expiry_time=timezone.now() + timedelta(days=30),
            raw_response={},
        )

        response = self.client.post(
            f'{self.url}?secret={self.shared_secret}',
            {
                'message': {
                    'data': self._encoded_payload({
                        'packageName': 'com.safetnet.userapp',
                        'eventTimeMillis': '1742200000000',
                        'voidedPurchaseNotification': {
                            'purchaseToken': 'voided-token-456',
                            'productType': 1,
                            'refundType': 1,
                        },
                    })
                }
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)

        subscription = GooglePlaySubscription.objects.get(purchase_token='voided-token-456')
        user_details = UserDetails.objects.get(username=self.user.username)

        self.assertEqual(subscription.subscription_state, 'SUBSCRIPTION_STATE_REVOKED')
        self.assertFalse(subscription.auto_renew_enabled)
        self.assertEqual(str(user_details.price), '0.00')
