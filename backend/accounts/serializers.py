from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    is_developer = serializers.BooleanField(read_only=True)
    email_verified = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id", "email", "full_name", "role", "is_developer", "company", "phone",
            "whatsapp", "country", "address", "city", "postal_code", "language", "currency", "email_verified",
            "heard_from", "heard_from_detail", "contact_channel", "contact_handle", "onboarded", "has_password",
        )
        read_only_fields = ("id", "email", "role", "is_developer", "email_verified", "onboarded")

    onboarded = serializers.SerializerMethodField()

    def get_onboarded(self, obj) -> bool:
        # The studio owner never needs the client welcome.
        return obj.onboarded_at is not None or obj.is_developer

    def get_email_verified(self, obj) -> bool:
        return obj.email_verified_at is not None

    has_password = serializers.SerializerMethodField()

    def get_has_password(self, obj) -> bool:
        # Accounts made through Google or Facebook have none (deletion then asks only for the word).
        return obj.has_usable_password()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = ("email", "full_name", "password", "company", "phone", "whatsapp", "country", "language")

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this e-mail already exists.")
        return value

    def validate(self, attrs):
        validate_password(attrs["password"], User(email=attrs.get("email"), full_name=attrs.get("full_name", "")))
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        # Public sign-ups are always clients; the developer account is made
        # with `createsuperuser`.
        return User.objects.create_user(password=password, role=User.Role.CLIENT, **validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)


class PasswordResetSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)


class OnboardingSerializer(serializers.ModelSerializer):
    """The welcome steps: language and currency, how they found us, how to reach them."""

    class Meta:
        model = User
        fields = ("language", "currency", "heard_from", "heard_from_detail", "contact_channel", "contact_handle", "whatsapp", "company", "country")

    def validate(self, attrs):
        channel = attrs.get("contact_channel", self.instance.contact_channel if self.instance else "site")
        if channel in ("instagram", "discord") and not (attrs.get("contact_handle") or "").strip():
            raise serializers.ValidationError({"contact_handle": "Add your username so I can reach you there."})
        if channel in ("whatsapp", "phone") and not (attrs.get("whatsapp") or (self.instance and self.instance.whatsapp) or "").strip():
            raise serializers.ValidationError({"whatsapp": "Add the number to reach you on."})
        return attrs


class DeleteAccountSerializer(serializers.Serializer):
    password = serializers.CharField(trim_whitespace=False, required=False, allow_blank=True, default="")
    confirm = serializers.CharField()

    def validate_confirm(self, value):
        if value.strip().upper() not in ("DELETE", "SUPPRIMER"):
            raise serializers.ValidationError("Type DELETE to confirm.")
        return value
