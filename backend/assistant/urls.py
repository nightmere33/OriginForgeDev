from django.urls import path

from . import api

urlpatterns = [path("ask/", api.ask)]
