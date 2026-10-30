import uuid
from django.db import migrations, models


def populate_share_tokens(apps, schema_editor):
    LiveLocationShare = apps.get_model('users_profile', 'LiveLocationShare')
    for share in LiveLocationShare.objects.filter(share_token__isnull=True):
        share.share_token = uuid.uuid4()
        share.save(update_fields=['share_token'])


class Migration(migrations.Migration):

    dependencies = [
        ('users_profile', '0014_ensure_geofence_table'),
    ]

    operations = [
        migrations.AddField(
            model_name='livelocationshare',
            name='last_broadcast_at',
            field=models.DateTimeField(blank=True, null=True, help_text='Timestamp of the last location update broadcast'),
        ),
        migrations.AddField(
            model_name='livelocationshare',
            name='share_token',
            field=models.UUIDField(editable=False, null=True, help_text='Public token used to access the live location session'),
        ),
        migrations.RunPython(populate_share_tokens, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='livelocationshare',
            name='share_token',
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True, help_text='Public token used to access the live location session'),
        ),
    ]


