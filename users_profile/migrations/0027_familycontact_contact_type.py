from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users_profile', '0026_geofenceevent'),
    ]

    operations = [
        migrations.AddField(
            model_name='familycontact',
            name='contact_type',
            field=models.CharField(
                choices=[('family', 'Family'), ('emergency', 'Emergency'), ('friend', 'Friend')],
                default='family',
                help_text='Category of contact (family, emergency, friend)',
                max_length=20
            ),
        ),
    ]
