# Generated migration to populate file_name for existing ChatMessage records

from django.db import migrations
import os


def populate_file_name_from_file_path(apps, schema_editor):
    """
    Populate file_name for existing ChatMessage records that have files but no file_name.
    Extract file name from file.url or image.url.
    """
    ChatMessage = apps.get_model('users_profile', 'ChatMessage')
    
    # Update messages with file but no file_name
    messages_with_file = ChatMessage.objects.filter(file__isnull=False, file_name__isnull=True)
    for message in messages_with_file:
        if message.file:
            # Extract file name from file path
            file_path = message.file.name
            if file_path:
                file_name = os.path.basename(file_path)
                # Remove any query parameters or hash
                file_name = file_name.split('?')[0]
                if file_name:
                    message.file_name = file_name
                    message.save(update_fields=['file_name'])
    
    # Update messages with image but no file_name (if image is treated as file)
    messages_with_image = ChatMessage.objects.filter(image__isnull=False, file_name__isnull=True)
    for message in messages_with_image:
        if message.image:
            # Extract file name from image path
            image_path = message.image.name
            if image_path:
                file_name = os.path.basename(image_path)
                # Remove any query parameters or hash
                file_name = file_name.split('?')[0]
                if file_name:
                    message.file_name = file_name
                    message.save(update_fields=['file_name'])


def reverse_populate_file_name(apps, schema_editor):
    """
    Reverse migration - no need to delete file_name as it's nullable
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('users_profile', '0010_remove_sosevent_audio_recording_url_and_more'),
    ]

    operations = [
        migrations.RunPython(populate_file_name_from_file_path, reverse_populate_file_name),
    ]

