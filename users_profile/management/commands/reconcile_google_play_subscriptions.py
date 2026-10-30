from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from users_profile.google_play_utils import (
    upsert_google_play_subscription,
    verify_google_play_subscription,
)
from users_profile.models import GooglePlaySubscription


class Command(BaseCommand):
    help = 'Re-verify Google Play subscriptions and refresh local entitlement state'

    def add_arguments(self, parser):
        parser.add_argument(
            '--user-id',
            type=int,
            help='Only reconcile subscriptions belonging to the given user id',
        )
        parser.add_argument(
            '--purchase-token',
            help='Only reconcile the given purchase token',
        )
        parser.add_argument(
            '--limit',
            type=int,
            help='Maximum number of subscriptions to reconcile',
        )
        parser.add_argument(
            '--include-inactive',
            action='store_true',
            help='Include inactive or expired subscriptions in the reconciliation set',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Verify against Google Play without persisting the refreshed state',
        )

    def handle(self, *args, **options):
        if not getattr(settings, 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', None):
            raise CommandError(
                'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured for this environment.'
            )

        queryset = GooglePlaySubscription.objects.select_related('user').order_by('-updated_at')

        if options.get('user_id'):
            queryset = queryset.filter(user_id=options['user_id'])

        if options.get('purchase_token'):
            queryset = queryset.filter(purchase_token=options['purchase_token'])

        if not options.get('include_inactive'):
            queryset = queryset.filter(
                Q(subscription_state__in=GooglePlaySubscription.ACCESS_GRANTING_STATES)
                | Q(last_verified_at__isnull=True)
            )

        if options.get('limit'):
            queryset = queryset[: options['limit']]

        subscriptions = list(queryset)
        if not subscriptions:
            self.stdout.write(
                self.style.WARNING('No Google Play subscriptions matched the requested filters.')
            )
            return

        refreshed = 0
        missing = 0
        no_access = 0

        for subscription in subscriptions:
            package_name = subscription.package_name or settings.GOOGLE_PLAY_PACKAGE_NAME
            normalized = verify_google_play_subscription(
                package_name=package_name,
                subscription_id=subscription.product_id,
                purchase_token=subscription.purchase_token,
            )

            if not normalized:
                missing += 1
                self.stdout.write(
                    self.style.WARNING(
                        f'No verification result for token {subscription.purchase_token[:18]}...'
                    )
                )
                continue

            if options.get('dry_run'):
                refreshed += 1
                if not normalized.get('has_access'):
                    no_access += 1
                continue

            refreshed_subscription = upsert_google_play_subscription(
                user=subscription.user,
                package_name=package_name,
                purchase_token=subscription.purchase_token,
                normalized_subscription=normalized,
                event_type='RECONCILED',
            )
            refreshed += 1
            if not refreshed_subscription.has_access:
                no_access += 1

        mode = 'dry-run' if options.get('dry_run') else 'saved'
        self.stdout.write(
            self.style.SUCCESS(
                f'Reconciliation complete ({mode}). '
                f'Refreshed: {refreshed}, '
                f'No result: {missing}, '
                f'Without access: {no_access}.'
            )
        )
