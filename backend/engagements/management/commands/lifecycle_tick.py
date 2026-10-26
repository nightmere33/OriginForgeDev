"""Run the lifecycle timers (expiries, reminders, closures). Schedule every 15 minutes."""

from django.core.management.base import BaseCommand

from engagements.lifecycle import tick


class Command(BaseCommand):
    help = "Expire proposals and deposits, send payment reminders, close finished maintenance."

    def handle(self, *args, **options):
        self.stdout.write(str(tick()))
