"""
What the assistant knows: the studio's own rules (docs/BUSINESS_RULES.md,
docs/SUPPORT.md), written once in each language, plus what Younes edits in
the studio (FAQ, services and their starting prices, plans). Each note is a
small chunk the retrieval can match on its own.
"""

from dataclasses import dataclass, field

from content.models import FAQ, CarePlan, Service


@dataclass
class Note:
    key: str
    title: str
    text: str
    url: str = ""
    film: str = ""
    tags: list[str] = field(default_factory=list)


RULES = {
    "en": [
        Note("start", "How to start a project",
             "Open Start a project and follow five short steps: pick a service, describe your project (goals and features), "
             "see your estimate update live, add references and how to reach you, then check and send. You can write the whole "
             "brief before making an account; you sign in when you send it. Younes reads every request himself and replies "
             "within 24 hours with a written proposal: price, timeline and milestones.",
             "/start", "howto", ["begin", "request", "brief", "quote", "estimate", "order"]),
        Note("proposal", "Proposals and negotiation",
             "A proposal states the scope, price, plan, timeline, milestones and payment schedule. It stays valid 14 days. You "
             "can accept it, decline it, or make one counter-offer with your price; Younes answers with a new or final offer. "
             "Three versions at most, then the request closes unless reopened.",
             "", "", ["offer", "counter", "negotiate", "price", "discount"]),
        Note("contract", "Contract and deposit",
             "Once you accept, you sign the contract online. Work starts when the deposit is paid: 40 % of the price (50 % for "
             "small projects, under 60 000 DZD or 400 EUR, and for Rush). Large projects (from 500 000 DZD or 3 500 EUR) are "
             "paid 40 / 30 / 30 by milestone. The rest is asked when the work is ready for your review. You have 5 days to pay "
             "each part, with reminders, and every payment gets an invoice.",
             "", "", ["deposit", "advance", "sign", "contract", "invoice", "balance"]),
        Note("payments", "Paying from Algeria",
             "From Algeria you can pay by CIB or Edahabia card on Chargily's secure page, by CCP transfer, by BaridiMob, or "
             "in cash by hand when agreed. CCP and BaridiMob transfers are checked by hand against the receipt you upload. "
             "Prices are in dinars.",
             "", "", ["pay", "card", "cib", "edahabia", "ccp", "baridimob", "cash", "algeria", "dinar"]),
        Note("payments-abroad", "Paying from abroad",
             "From outside Algeria you pay by PayPal (with a PayPal account, or any card through PayPal) or in USDT "
             "(BEP20). There is no bank transfer from abroad. Prices are the standard international ones in euros or "
             "dollars.",
             "", "", ["pay", "abroad", "france", "europe", "paypal", "card", "usdt", "crypto", "euro", "dollar", "international"]),
        Note("maintenance", "Maintenance after launch",
             "Every plan includes free maintenance once the project is live: bugs (anything that doesn't work as the proposal "
             "says) are fixed for free during that window. It starts on the day of production. Reminders come before it ends; "
             "it can be extended, as a paid extra or by switching plan. After it ends the conversation stays open 72 hours, "
             "then closes; support tickets stay open to you.",
             "", "", ["bug", "fix", "after", "care", "support", "warranty", "extend"]),
        Note("support", "Support and reply times",
             "You can open a support ticket any time from the messages button. Replies come by standing: Ultimate projects "
             "within 12 hours, Pro within 24, Starter within 48, past clients and sent requests within 48, other accounts "
             "within 3 days. The assistant answers at once; for anything it can't, talk to Younes.",
             "", "", ["ticket", "help", "contact", "reply", "fast", "priority", "talk", "human"]),
        Note("review", "Reviews, revisions and milestones",
             "Work is delivered by milestones you review in your client space: approve it, or ask for changes. Each plan "
             "includes revision rounds (Starter 2, Pro 3, Ultimate 5); more can be granted. New features are always quoted "
             "separately, and nothing new is built until you accept it.",
             "", "", ["revision", "change", "milestone", "approve", "feedback", "feature"]),
        Note("queue", "Availability and waiting list",
             "Younes takes two projects at a time to keep quality and dates. When both places are taken, a new request joins "
             "the queue with its position and an estimated start date; you are told when your turn comes. Product films are "
             "taken directly.",
             "", "", ["busy", "available", "when", "queue", "wait", "start date", "delay"]),
        Note("ownership", "What you get",
             "A fixed scope in a written proposal, the source code and its rights once paid, your files and invoices in your "
             "client space, and a conversation with the person who builds it. An NDA is available on request.",
             "", "", ["code", "own", "rights", "nda", "confidential", "files"]),
        Note("contact", "Contact",
             "Messages on the site are the fastest way, and every project has its own conversation. Younes is also on "
             "WhatsApp, Instagram, LinkedIn and Discord (links at the bottom of every page). He works in English and French.",
             "", "", ["whatsapp", "instagram", "email", "phone", "discord", "language", "french", "english"]),
        Note("account", "Your account and data",
             "Sign in with your e-mail or with Google or Facebook; you can add a password later in Settings. Settings is also "
             "where you change your details, profile picture, language and currency, or delete your account.",
             "/portal/settings", "", ["login", "password", "google", "facebook", "delete", "privacy", "profile", "picture"]),
    ],
    "fr": [
        Note("start", "Comment lancer un projet",
             "Ouvrez « Lancer un projet » et suivez cinq étapes courtes : choisissez un service, décrivez votre projet "
             "(objectifs et fonctionnalités), voyez votre estimation en direct, ajoutez des références et comment vous joindre, "
             "puis vérifiez et envoyez. Vous pouvez tout écrire avant de créer un compte ; la connexion se fait à l'envoi. "
             "Younes lit chaque demande lui-même et répond sous 24 heures avec une proposition écrite : prix, délai et étapes.",
             "/start", "howto", ["commencer", "demande", "devis", "estimation", "commander"]),
        Note("proposal", "Propositions et négociation",
             "Une proposition précise le périmètre, le prix, la formule, le délai, les étapes et l'échéancier. Elle reste "
             "valable 14 jours. Vous pouvez l'accepter, la refuser ou faire une contre-proposition avec votre prix ; Younes "
             "répond par une nouvelle offre ou une offre finale. Trois versions au plus.",
             "", "", ["offre", "contre", "negocier", "prix", "remise"]),
        Note("contract", "Contrat et acompte",
             "Une fois la proposition acceptée, vous signez le contrat en ligne. Le travail commence à réception de l'acompte : "
             "40 % du prix (50 % pour les petits projets, sous 60 000 DZD ou 400 EUR, et pour l'option Rapide). Les gros "
             "projets (dès 500 000 DZD ou 3 500 EUR) se paient 40 / 30 / 30 par étape. Le reste est demandé quand le travail "
             "est prêt pour votre validation. Vous avez 5 jours pour chaque paiement, avec rappels, et chaque paiement a sa facture.",
             "", "", ["acompte", "avance", "signer", "contrat", "facture", "solde"]),
        Note("payments", "Payer depuis l'Algérie",
             "Depuis l'Algérie, vous payez par carte CIB ou Edahabia sur la page sécurisée de Chargily, par virement CCP, "
             "par BaridiMob, ou en espèces en main propre si convenu. Les virements CCP et BaridiMob sont vérifiés à la main "
             "avec le reçu que vous envoyez. Les prix sont en dinars.",
             "", "", ["payer", "carte", "cib", "edahabia", "ccp", "baridimob", "especes", "algerie", "dinar"]),
        Note("payments-abroad", "Payer depuis l'étranger",
             "Depuis l'étranger, vous payez par PayPal (avec un compte PayPal, ou n'importe quelle carte via PayPal) ou en "
             "USDT (BEP20). Il n'y a pas de virement bancaire depuis l'étranger. Les prix sont les tarifs internationaux en "
             "euros ou en dollars.",
             "", "", ["payer", "etranger", "france", "europe", "paypal", "carte", "usdt", "crypto", "euro", "dollar", "international"]),
        Note("maintenance", "Maintenance après la mise en ligne",
             "Chaque formule inclut une maintenance gratuite une fois le projet en ligne : les bugs (ce qui ne marche pas comme "
             "prévu dans la proposition) sont corrigés gratuitement pendant cette période, qui commence le jour de la mise en "
             "production. Des rappels arrivent avant la fin ; elle peut être prolongée, en extra payant ou en changeant de "
             "formule. Après la fin, la conversation reste ouverte 72 heures puis se ferme ; les tickets restent ouverts.",
             "", "", ["bug", "corriger", "apres", "suivi", "garantie", "prolonger"]),
        Note("support", "Support et délais de réponse",
             "Vous pouvez ouvrir un ticket à tout moment depuis le bouton des messages. Les réponses suivent votre situation : "
             "projets Ultimate sous 12 heures, Pro sous 24, Starter sous 48, anciens clients et demandes envoyées sous 48, "
             "autres comptes sous 3 jours. L'assistant répond tout de suite ; pour le reste, parlez à Younes.",
             "", "", ["ticket", "aide", "contact", "reponse", "rapide", "priorite", "parler", "humain"]),
        Note("review", "Validations, révisions et étapes",
             "Le travail est livré par étapes que vous validez dans votre espace client : vous approuvez ou demandez des "
             "changements. Chaque formule inclut des tours de révision (Starter 2, Pro 3, Ultimate 5) ; d'autres peuvent être "
             "accordés. Les nouvelles fonctionnalités sont toujours chiffrées à part, et rien n'est construit sans votre accord.",
             "", "", ["revision", "changement", "etape", "valider", "retour", "fonctionnalite"]),
        Note("queue", "Disponibilité et file d'attente",
             "Younes prend deux projets à la fois pour tenir la qualité et les délais. Quand les deux places sont prises, une "
             "nouvelle demande rejoint la file avec sa position et une date de début estimée ; vous êtes prévenu quand votre "
             "tour arrive. Les films produits sont pris directement.",
             "", "", ["occupe", "disponible", "quand", "file", "attente", "debut", "delai"]),
        Note("ownership", "Ce que vous obtenez",
             "Un périmètre fixé dans une proposition écrite, le code source et ses droits une fois payé, vos fichiers et "
             "factures dans votre espace client, et une conversation avec la personne qui construit. Un accord de "
             "confidentialité est possible sur demande.",
             "", "", ["code", "propriete", "droits", "confidentialite", "fichiers"]),
        Note("contact", "Contact",
             "Les messages du site sont le moyen le plus rapide, et chaque projet a sa propre conversation. Younes est aussi "
             "sur WhatsApp, Instagram, LinkedIn et Discord (liens en bas de chaque page). Il travaille en français et en anglais.",
             "", "", ["whatsapp", "instagram", "email", "telephone", "discord", "langue", "francais", "anglais"]),
        Note("account", "Votre compte et vos données",
             "Connectez-vous avec votre e-mail ou avec Google ou Facebook ; vous pouvez ajouter un mot de passe plus tard dans "
             "Paramètres. C'est aussi là que vous changez vos coordonnées, votre photo, la langue et la devise, ou supprimez votre compte.",
             "/portal/settings", "", ["connexion", "mot de passe", "google", "facebook", "supprimer", "donnees", "profil", "photo"]),
    ],
}


def _money(amount: int, currency: str) -> str:
    return f"{amount:,}".replace(",", " ") + f" {currency}"


def notes(lang: str) -> list[Note]:
    """Every note for this language: the fixed rules, then what the studio edits."""
    lang = lang if lang in RULES else "en"
    out = list(RULES[lang])
    fr = lang == "fr"
    for faq in FAQ.objects.all():
        q = getattr(faq, f"question_{lang}", "") or faq.question_en
        a = getattr(faq, f"answer_{lang}", "") or faq.answer_en
        out.append(Note(f"faq-{faq.pk}", q, a))
    for service in Service.objects.filter(active=True).prefetch_related("prices"):
        title = getattr(service, f"title_{lang}", "") or service.title_en
        summary = getattr(service, f"summary_{lang}", "") or service.summary_en
        prices = ", ".join(_money(p.amount, p.currency) for p in service.prices.all() if p.amount)
        price_text = (f" Prix de départ : {prices}." if fr else f" Starting prices: {prices}.") if prices else ""
        out.append(Note(f"service-{service.slug}", title, f"{summary}{price_text}", f"/start?service={service.slug}",
                        tags=["price", "cost", "prix", "tarif", service.slug.replace("-", " ")]))
    plans = list(CarePlan.objects.filter(active=True))
    if plans:
        lines = []
        for p in plans:
            name = getattr(p, f"name_{lang}", "") or p.name_en
            if fr:
                lines.append(f"{name} : {p.maintenance_days} jours de maintenance, {p.revision_rounds} tours de révision, "
                             f"réponse sous {p.reply_hours} h, +{p.surcharge_percent} % sur le prix.")
            else:
                lines.append(f"{name}: {p.maintenance_days} days of maintenance, {p.revision_rounds} revision rounds, "
                             f"replies within {p.reply_hours} h, +{p.surcharge_percent} % on the price.")
        intro = ("Chaque projet se choisit avec une formule qui fixe le suivi après livraison. " if fr
                 else "Every project comes with a plan that sets the care after delivery. ")
        out.append(Note("plans", "Formules Starter, Pro et Ultimate" if fr else "Starter, Pro and Ultimate plans",
                        intro + " ".join(lines), "/#services", tags=["plan", "formule", "starter", "pro", "ultimate", "subscription", "abonnement"]))
    return out
