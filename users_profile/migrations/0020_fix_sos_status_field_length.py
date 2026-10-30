# Generated migration to fix SOS status field length
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users_profile', '0019_remove_livelocationshare_user_or_security_officer_required_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='sosevent',
            name='status',
            field=models.CharField(
                choices=[
                    ('triggered', 'Triggered'),
                    ('sms_sent', 'SMS Sent'),
                    ('police_called', 'Police Called'),
                    ('geofence_alerted', 'Geofence Alerted'),
                    ('response_center_notified', 'Response Center Notified'),
                    ('audio_recording', 'Audio Recording'),
                    ('video_recording', 'Video Recording'),
                    ('resolved', 'Resolved'),
                ],
                default='triggered',
                help_text='Current status of the SOS event',
                max_length=30
            ),
        ),
    ]

