"""
The studio's own media library: the films in full quality (the originals,
not the site's web encodes), each with its post caption, for Younes to
download on his phone and publish. Private: only the studio account sees it.
"""

from django.db import models

from common.files import private_storage, private_upload_path


class LibraryFilm(models.Model):
    title = models.CharField(max_length=120)
    language = models.CharField(max_length=2, choices=[("en", "English"), ("fr", "Français"), ("ar", "العربية")], default="en")
    kind = models.CharField(max_length=20, default="promo", help_text="promo, howto, ad, case study…")
    file = models.FileField(storage=private_storage, upload_to=private_upload_path("library"))
    original_name = models.CharField(max_length=140)
    size = models.PositiveBigIntegerField(default=0)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    duration = models.PositiveIntegerField(default=0, help_text="Seconds")
    caption = models.TextField(blank=True, help_text="Ready to paste with the post")
    order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "-created_at"]

    def __str__(self):
        return f"{self.title} ({self.language})"
