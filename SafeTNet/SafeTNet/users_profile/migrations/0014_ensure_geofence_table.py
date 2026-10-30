from django.db import migrations


def ensure_geofence_table(apps, schema_editor):
    connection = schema_editor.connection
    table_name = 'users_profile_geofence'
    if table_name in set(connection.introspection.table_names()):
        return

    Geofence = apps.get_model('users_profile', 'Geofence')
    schema_editor.create_model(Geofence)


class Migration(migrations.Migration):

    dependencies = [
        ('users_profile', '0013_ensure_livelocationshare_table'),
    ]

    operations = [
        migrations.RunPython(ensure_geofence_table, migrations.RunPython.noop),
    ]

