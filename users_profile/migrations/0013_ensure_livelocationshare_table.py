from django.db import migrations


def ensure_live_share_table(apps, schema_editor):
    connection = schema_editor.connection
    table_names = set(connection.introspection.table_names())
    table_name = 'users_live_location_share'
    if table_name in table_names:
        return

    LiveLocationShare = apps.get_model('users_profile', 'LiveLocationShare')
    schema_editor.create_model(LiveLocationShare)


class Migration(migrations.Migration):

    dependencies = [
        ('users_profile', '0012_remove_sosevent_audio_recording_url_and_more'),
    ]

    operations = [
        migrations.RunPython(ensure_live_share_table, migrations.RunPython.noop),
    ]




