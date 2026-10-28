"""
Plain-text e-mail templates, one entry per event, in every launch language.

Kept as Python rather than Django templates: they are short, they need no
markup, and having EN and FR side by side makes a missing translation obvious
in review. Placeholders use str.format and are filled by `service.notify`.
"""

TEMPLATES = {
    "verify_email": {
        "en": (
            "Your code: {code}",
            "Hi {name},\n\nWelcome to OriginForge. Type this code on the site to confirm your e-mail:\n\n"
            "{code}\n\nIt works for 15 minutes. Or confirm with this link instead:\n\n{link}\n\n"
            "If you didn't create an account, ignore this message.",
        ),
        "fr": (
            "Votre code : {code}",
            "Bonjour {name},\n\nBienvenue chez OriginForge. Saisissez ce code sur le site pour confirmer "
            "votre e-mail :\n\n{code}\n\nIl fonctionne pendant 15 minutes. Ou confirmez avec ce lien :\n\n{link}\n\n"
            "Si vous n'avez pas créé de compte, ignorez ce message.",
        ),
    },
    "password_reset": {
        "en": (
            "Reset your password",
            "Hi {name},\n\nSomeone asked to reset the password of your OriginForge account. "
            "If it was you, choose a new one here:\n\n{link}\n\nIf it wasn't, you can ignore this e-mail.",
        ),
        "fr": (
            "Réinitialisez votre mot de passe",
            "Bonjour {name},\n\nUne réinitialisation du mot de passe de votre compte OriginForge a été "
            "demandée. Si c'est vous, choisissez-en un nouveau ici :\n\n{link}\n\n"
            "Sinon, ignorez simplement cet e-mail.",
        ),
    },
    "request_received": {
        "en": (
            "We received your request {reference}",
            "Hi {name},\n\nThanks for your project request \"{title}\" ({reference}). "
            "I'll review it and get back to you within {hours}, usually with a few questions.\n\n"
            "Follow it here: {link}\n\nYounes, OriginForge",
        ),
        "fr": (
            "Nous avons reçu votre demande {reference}",
            "Bonjour {name},\n\nMerci pour votre demande de projet « {title} » ({reference}). "
            "Je l'étudie et je reviens vers vous sous {hours}, généralement avec quelques questions.\n\n"
            "Suivez-la ici : {link}\n\nYounes, OriginForge",
        ),
    },
    "request_status": {
        "en": (
            "Your request {reference} is now: {status}",
            "Hi {name},\n\nYour request \"{title}\" ({reference}) moved to: {status}.\n\n{note}"
            "Details: {link}\n\nYounes, OriginForge",
        ),
        "fr": (
            "Votre demande {reference} : {status}",
            "Bonjour {name},\n\nVotre demande « {title} » ({reference}) est passée à : {status}.\n\n{note}"
            "Détails : {link}\n\nYounes, OriginForge",
        ),
    },
    # Studio-side notices are always in English.
    "studio_new_request": {
        "en": (
            "New request {reference}: {title}",
            "{client} ({email}) submitted a new request.\n\nService: {service}\nBudget: {budget}\n"
            "Deadline: {deadline}\n\n{objectives}\n\nOpen it: {link}",
        ),
    },
}


def render(key: str, lang: str, **context) -> tuple[str, str]:
    variants = TEMPLATES[key]
    subject, body = variants.get(lang) or variants["en"]
    return subject.format(**context), body.format(**context)
