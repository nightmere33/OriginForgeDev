"""
Lifecycle e-mails: one short subject and sentence per event, in every launch
language. Client events are sent in the client's language; studio events
(marked studio=True) always in English.
"""

from django.db import transaction

from .service import site_url, studio_recipients, user_lang
from .tasks import send_email_task

EVENTS = {
    # → client
    "proposal_sent": {
        "en": ("Your proposal for {title} is ready", "I sent you a proposal for \"{title}\": {price}. Accept it, decline it, or make a counter-offer. It stays valid for 14 days."),
        "fr": ("Votre proposition pour {title} est prête", "Je vous ai envoyé une proposition pour « {title} » : {price}. Acceptez-la, refusez-la ou faites une contre-proposition. Elle reste valable 14 jours."),
    },
    "contract_ready": {
        "en": ("Your contract is ready to sign", "We agreed on {price} for \"{title}\". Your contract is ready: read it and sign it online."),
        "fr": ("Votre contrat est prêt à signer", "Nous sommes d'accord sur {price} pour « {title} ». Votre contrat est prêt : lisez-le et signez-le en ligne."),
    },
    "payment_due": {
        "en": ("Payment due: {label}", "{label} for \"{title}\": {amount}. Please pay within 5 days. Payment details are in your client space."),
        "fr": ("Paiement attendu : {label}", "{label} pour « {title} » : {amount}. Merci de régler sous 5 jours. Les coordonnées de paiement sont dans votre espace client."),
    },
    "payment_reminder": {
        "en": ("Reminder: {label} for {title}", "A friendly reminder: {label} ({amount}) is due by {due}. Without it the project cannot start or continue."),
        "fr": ("Rappel : {label} pour {title}", "Petit rappel : {label} ({amount}) est attendu avant le {due}. Sans ce paiement, le projet ne peut pas démarrer ou continuer."),
    },
    "payment_received": {
        "en": ("Payment received, thank you", "I received {amount} for \"{title}\" ({label}). Your receipt is in your client space."),
        "fr": ("Paiement reçu, merci", "J'ai bien reçu {amount} pour « {title} » ({label}). Votre reçu est dans votre espace client."),
    },
    "proof_rejected": {
        "en": ("I could not confirm your payment", "Your receipt for {label} could not be confirmed: {note}. You can upload a new one from your client space."),
        "fr": ("Je n'ai pas pu confirmer votre paiement", "Votre reçu pour {label} n'a pas pu être confirmé : {note}. Vous pouvez en envoyer un nouveau depuis votre espace client."),
    },
    "project_started": {
        "en": ("Work has started on {title}", "The deposit is confirmed and work on \"{title}\" has started. Estimated delivery: {deadline}. Follow every step in your client space."),
        "fr": ("Le travail sur {title} a commencé", "L'acompte est confirmé et le travail sur « {title} » a commencé. Livraison estimée : {deadline}. Suivez chaque étape dans votre espace client."),
    },
    "update_posted": {
        "en": ("New progress on {title}", "{update}. See the screenshots and details in your client space."),
        "fr": ("Du nouveau sur {title}", "{update}. Les captures et détails sont dans votre espace client."),
    },
    "milestone_review": {
        "en": ("Please review: {milestone}", "The milestone \"{milestone}\" is ready. Approve it or ask for changes."),
        "fr": ("À valider : {milestone}", "L'étape « {milestone} » est prête. Validez-la ou demandez des modifications."),
    },
    "review_ready": {
        "en": ("{title} is ready for your review", "Development is done. Test everything on the preview link, then approve it or ask for changes."),
        "fr": ("{title} est prêt à être validé", "Le développement est terminé. Testez tout sur le lien de prévisualisation, puis validez ou demandez des modifications."),
    },
    "project_live": {
        "en": ("{title} is live!", "Your project is in production. Your maintenance period runs until {until}. The source code and accounts are in your client space."),
        "fr": ("{title} est en ligne !", "Votre projet est en production. Votre maintenance court jusqu'au {until}. Le code source et les accès sont dans votre espace client."),
    },
    "project_closed": {
        "en": ("Thank you for working with me", "Maintenance for \"{title}\" has ended and the project is closed. Everything stays in your client space. A short review would mean a lot."),
        "fr": ("Merci pour votre confiance", "La maintenance de « {title} » est terminée et le projet est clôturé. Tout reste disponible dans votre espace client. Un court avis me ferait très plaisir."),
    },
    "proposal_expired": {
        "en": ("Your proposal for {title} has expired", "The proposal was not answered within 14 days. Reply in the conversation if you would like to continue."),
        "fr": ("Votre proposition pour {title} a expiré", "La proposition n'a pas reçu de réponse sous 14 jours. Répondez dans la conversation si vous souhaitez continuer."),
    },
    "deposit_expired": {
        "en": ("Your project {title} has lapsed", "The deposit was not received within 5 days, so the agreement lapsed. Reply in the conversation if you would like to revive it."),
        "fr": ("Votre projet {title} est caduc", "L'acompte n'a pas été reçu sous 5 jours, le contrat est donc caduc. Répondez dans la conversation si vous souhaitez le relancer."),
    },
    "new_message": {
        "en": ("New message about {title}", "{sender}: {preview}"),
        "fr": ("Nouveau message sur {title}", "{sender} : {preview}"),
    },
    "request_queued": {
        "en": ("You're #{position} in the queue for {title}", "Thanks for your request {reference}. I'm working at full capacity right now, so \"{title}\" joined the queue at #{position}. Estimated start: {start}. I'll still read it and answer within {hours}, and you'll hear from me the moment it's your turn. You can follow your place in the queue in your client space."),
        "fr": ("Vous êtes n°{position} dans la file pour {title}", "Merci pour votre demande {reference}. Je travaille à pleine capacité en ce moment, donc « {title} » a rejoint la file d'attente en position {position}. Démarrage estimé : {start}. Je la lis quand même et je vous réponds sous {hours}, et je vous préviens dès que c'est votre tour. Suivez votre place dans la file depuis votre espace client."),
    },
    "queue_your_turn": {
        "en": ("It's your turn: {title}", "A place just opened up and \"{title}\" is next. I'm starting with your project now; my next message won't be long."),
        "fr": ("C'est votre tour : {title}", "Une place vient de se libérer et « {title} » est le suivant. Je commence avec votre projet maintenant ; mon prochain message ne tardera pas."),
    },
    "waitlist_open": {
        "en": ("I'm taking new projects again", "You asked to be told first: requests are open again. Start yours here."),
        "fr": ("Je reprends de nouveaux projets", "Vous avez demandé à être prévenu en premier : les demandes sont rouvertes. Lancez la vôtre ici."),
    },
    # → studio (English only)
    "studio_counter": {"en": ("Counter-offer on {ref}: {price}", "{client} countered \"{title}\" with {price}. {note}")},
    "studio_accepted": {"en": ("Accepted: {ref} at {price}", "{client} accepted \"{title}\". The contract is waiting for their signature.")},
    "studio_declined": {"en": ("Declined: {ref}", "{client} declined the proposal for \"{title}\". {note}")},
    "studio_signed": {"en": ("Signed: {ref}", "{client} signed the contract for \"{title}\". The deposit is due within 5 days.")},
    "studio_proof": {"en": ("Receipt to check: {ref}", "{client} uploaded a {method} receipt for {label} ({amount}).")},
    "studio_paid_online": {"en": ("Paid online: {ref}", "{client} paid {label} ({amount}) by {method}. It is confirmed: nothing to check.")},
    "studio_payment_attention": {"en": ("Check a payment: {ref}", "{note}")},
    "review_invite": {
        "en": ("How was it working together?", "{title} is live. When you've had a little time with it, a few honest words and a rating would help other clients decide. It takes a minute, and nothing is published without your consent."),
        "fr": ("Comment s'est passée notre collaboration ?", "{title} est en ligne. Quand vous aurez pris un peu de recul, quelques mots sincères et une note aideraient d'autres clients à se décider. Une minute suffit, et rien n'est publié sans votre accord."),
    },
    "review_invite_project": {
        "en": ("A few words about {project}?", "Thank you again for building {project} with me. Would you share a few honest words and a rating? Sign in (or create your account) with this e-mail address and your review form is waiting. Nothing is published without your consent."),
        "fr": ("Quelques mots sur {project} ?", "Merci encore d'avoir construit {project} avec moi. Accepteriez-vous de partager quelques mots sincères et une note ? Connectez-vous (ou créez votre compte) avec cette adresse e-mail et votre formulaire d'avis vous attend. Rien n'est publié sans votre accord."),
    },
    "review_published": {
        "en": ("Your review is live", "Thank you. Your review of {title} is now on the website."),
        "fr": ("Votre avis est en ligne", "Merci. Votre avis sur {title} est maintenant sur le site."),
    },
    "review_rejected": {
        "en": ("About your review", "I couldn't publish your review of {title} as it is: {reason} You can edit it from your client space."),
        "fr": ("À propos de votre avis", "Je n'ai pas pu publier votre avis sur {title} tel quel : {reason} Vous pouvez le modifier depuis votre espace client."),
    },
    "studio_review": {
        "en": ("New review {stars} on {ref}", "{client} reviewed {ref} ({stars}). It waits for your approval."),
    },
    "account_deleted": {
        "en": ("Your account was deleted", "Your OriginForge account and personal details were deleted, as you asked. Signed contracts and invoices are kept anonymised, because accounting law requires it. If this wasn't you, reply to this e-mail right away."),
        "fr": ("Votre compte a été supprimé", "Votre compte OriginForge et vos données personnelles ont été supprimés, comme demandé. Les contrats signés et les factures sont conservés de façon anonyme, car la loi l'exige. Si ce n'était pas vous, répondez à cet e-mail tout de suite."),
    },
    "studio_changes": {"en": ("Changes requested on {ref}", "{client}: {note}")},
    "studio_approved": {"en": ("Approved: {ref}", "{client} approved \"{what}\".")},
    "studio_deposit_expired": {"en": ("Deposit not received: {ref}", "The deposit window for \"{title}\" closed; the project lapsed.")},
    "studio_message": {"en": ("Message from {client} on {ref}", "{preview}")},
    "studio_queue_next": {"en": ("Next in the queue: {ref}", "A place opened: {client}'s \"{title}\" is next. They were told it's their turn.")},
    "studio_review_due": {"en": ("Waiting for your answer: {ref}", "{client}'s \"{title}\" was sent {hours} h ago and still has no answer. The promise is a reply within 24 to 48 h.")},
}

TEMPLATE = {
    "en": "Hi {name},\n\n{text}\n\n{link}\n\nYounes, OriginForge",
    "fr": "Bonjour {name},\n\n{text}\n\n{link}\n\nYounes, OriginForge",
}


def _render(key: str, lang: str, **ctx) -> tuple[str, str]:
    variants = EVENTS[key]
    subject, text = variants.get(lang) or variants["en"]
    return subject.format(**ctx), text.format(**ctx)


def notify_address(key: str, email: str, name: str, lang: str, path: str, **ctx):
    lang = lang if lang in TEMPLATE else "en"
    subject, text = _render(key, lang, **ctx)
    body = TEMPLATE[lang].format(name=(name or "").split(" ")[0] or email, text=text, link=site_url(f"/{lang}{path}"))
    transaction.on_commit(lambda: send_email_task.delay(subject, body, [email], lang))


def notify_client(key: str, user, path: str, **ctx):
    notify_address(key, user.email, user.full_name, user_lang(user), path, **ctx)
    # The same news, live on the website.
    from live.service import notify_in_app

    subject, text = _render(key, user_lang(user), **ctx)
    notify_in_app(user, key, subject, text, path)


def notify_studio_event(key: str, path: str, **ctx):
    subject, text = _render(key, "en", **ctx)
    from live.service import notify_studio_in_app

    notify_studio_in_app(key, subject, text, path)
    recipients = studio_recipients()
    if not recipients:
        return
    body = f"{text}\n\n{site_url('/en' + path)}"
    transaction.on_commit(lambda: send_email_task.delay(subject, body, recipients))
