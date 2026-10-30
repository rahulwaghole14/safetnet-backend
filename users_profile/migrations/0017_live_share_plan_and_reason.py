from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users_profile', '0016_livelocationtrackpoint'),
    ]

    operations = [
        migrations.AddField(
            model_name='livelocationshare',
            name='plan_type',
            field=models.CharField(blank=True, help_text='Plan type when session started (free/premium)', max_length=20),
        ),
        migrations.AddField(
            model_name='livelocationshare',
            name='stop_reason',
            field=models.CharField(blank=True, help_text='Reason session ended (user, limit, expired)', max_length=30),
        ),
    ]




