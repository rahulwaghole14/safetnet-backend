import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users_profile', '0015_live_location_share_public_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='LiveLocationTrackPoint',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('latitude', models.FloatField(help_text='Latitude component of the recorded point')),
                ('longitude', models.FloatField(help_text='Longitude component of the recorded point')),
                ('recorded_at', models.DateTimeField(auto_now_add=True)),
                ('share', models.ForeignKey(help_text='Live location session this point belongs to', on_delete=django.db.models.deletion.CASCADE, related_name='track_points', to='users_profile.livelocationshare')),
            ],
            options={
                'verbose_name': 'Live Location Track Point',
                'verbose_name_plural': 'Live Location Track Points',
                'db_table': 'users_live_location_track_point',
                'ordering': ['recorded_at'],
            },
        ),
    ]




