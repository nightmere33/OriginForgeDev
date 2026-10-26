from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from content.revalidate import queue

from .models import Review


@receiver(post_save, sender=Review)
@receiver(post_delete, sender=Review)
def refresh_site(sender, instance, **kwargs):
    # The home page and the work pages show published reviews and their average.
    queue(["reviews"])
