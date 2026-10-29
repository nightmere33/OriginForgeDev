from django.urls import path

from . import api

urlpatterns = [
    path("tickets/", api.tickets),
    path("tickets/<str:reference>/", api.ticket_detail),
    path("tickets/<str:reference>/messages/", api.ticket_messages),
    path("tickets/<str:reference>/status/", api.ticket_status),
    path("tickets/<str:reference>/rate/", api.ticket_rate),
    path("start/", api.start),
    path("standing/", api.my_standing),
    path("files/<int:message_id>/", api.ticket_file),
]
