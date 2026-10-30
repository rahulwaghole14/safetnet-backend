"""
Management command to clear all live location share records from the database.
"""
from django.core.management.base import BaseCommand
from users_profile.models import LiveLocationShare, LiveLocationTrackPoint


class Command(BaseCommand):
    help = 'Clear all live location share records and track points from the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Confirm deletion (required to actually delete)',
        )

    def handle(self, *args, **options):
        if not options['confirm']:
            self.stdout.write(
                self.style.WARNING(
                    'This will delete ALL live location share records and track points.\n'
                    'Run with --confirm to proceed.'
                )
            )
            return

        # Count records before deletion
        share_count = LiveLocationShare.objects.count()
        track_point_count = LiveLocationTrackPoint.objects.count()

        # Delete track points first (due to foreign key constraint)
        deleted_track_points = LiveLocationTrackPoint.objects.all().delete()
        self.stdout.write(
            self.style.SUCCESS(
                f'Deleted {deleted_track_points[0]} track point(s)'
            )
        )

        # Delete live location shares
        deleted_shares = LiveLocationShare.objects.all().delete()
        self.stdout.write(
            self.style.SUCCESS(
                f'Deleted {deleted_shares[0]} live location share record(s)'
            )
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'\nTotal deleted:\n'
                f'  - Live Location Shares: {share_count}\n'
                f'  - Track Points: {track_point_count}'
            )
        )

