from rest_framework import permissions


class IsDeveloper(permissions.BasePermission):
    """The studio owner (role=developer) or staff."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_developer)
