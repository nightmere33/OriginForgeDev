"""
Contract text, generated from an accepted proposal and the approved business
rules (docs/BUSINESS_RULES.md). The rendered text is what gets hashed and
signed; it is stored, never regenerated, so later template edits cannot
change an agreement that already exists.
"""

import hashlib

from .models import Proposal


def money(amount: int, currency: str) -> str:
    return f"{amount:,}".replace(",", " ") + f" {currency}"


def deposit_terms(proposal: Proposal, lang: str) -> tuple[str, str]:
    """(when the deposit is due, what happens without it), as the proposal set them."""
    days, fr = proposal.deposit_days, lang == "fr"
    if not days:
        return (
            ("demandé quand vient le tour du projet dans la file, puis à régler sous 5 jours" if fr
             else "asked for when the project's turn comes in the queue, then due within 5 days"),
            ("Sans acompte reçu dans les 5 jours suivant sa demande, ce contrat devient caduc." if fr
             else "If the deposit is not received within 5 days of being asked for, this agreement lapses."),
        )
    return (
        (f"à régler sous {days} jours après la signature" if fr else f"due within {days} days of signing"),
        (f"Sans acompte reçu dans les {days} jours suivant la signature, ce contrat devient caduc." if fr
         else f"If the deposit is not received within {days} days of signing, this agreement lapses."),
    )


def schedule_lines(proposal: Proposal, lang: str) -> list[str]:
    lines, total = [], 0
    for i, item in enumerate(proposal.schedule):
        amount = round(proposal.price * item["percent"] / 100) if i < len(proposal.schedule) - 1 else proposal.price - total
        total += amount
        when = deposit_terms(proposal, lang)[0] if i == 0 else (
            "due when requested, with 5 days to pay" if lang == "en" else "à régler sur demande, sous 5 jours")
        lines.append(f"- {item['label']}: {item['percent']} % ({money(amount, proposal.currency)}), {when}")
    return lines


EN = """SERVICE AGREEMENT
Reference {ref} · proposal version {version}

Between Younes Ouali, trading as OriginForge, Dellys, Algeria (the Developer)
and {client} (the Client).

1. Scope
{scope}

Deliverables:
{deliverables}

Not included:
{exclusions}- Any new feature or change beyond this scope. It is quoted separately and built only after written acceptance.

2. Price and payment
Total price: {price}, plan {plan}.
Schedule:
{schedule}
Accepted methods: CCP, BaridiMob, cash, card (Chargily) and PayPal. Third-party costs (domain, hosting, paid services, store accounts, payment provider fees) are paid by the Client at cost.
Work starts once the deposit is confirmed. {lapse}

3. Timeline
Estimated duration: {timeline} days from the deposit confirmation.
{milestones}
If the Developer waits on the Client (content, feedback, access) for more than 5 working days, the timeline pauses. After 30 days without an answer the project is put on hold; after 60 days it is closed and the deposit covers the work done.

4. Reviews and revisions
The Client reviews the work at each milestone on preview links. {revisions} rounds of revisions within the agreed scope are included.

5. Delivery, ownership and maintenance
The final payment is due before the production launch. Once everything is paid, the Client owns the source code and the content, and receives the accounts and credentials.
Maintenance ({plan}): {maintenance} days from the production launch. It covers bugs, meaning anything that does not work as described in this agreement. It does not cover new features, design changes, content changes beyond the plan, problems caused by third parties, or changes made by the Client. Replies within {reply} working hours.

6. Cancellation
Before work starts, the deposit is refunded minus 10 %. After work starts, the deposit is not refunded and the work done so far is delivered. If the Developer cancels, any amount not covered by delivered work is refunded in full.

7. Portfolio
{portfolio}

8. Signature
This agreement is signed electronically. The Client's typed name, the date and time, the IP address, the device and a SHA-256 fingerprint of this text are recorded as proof of agreement.
"""

FR = """CONTRAT DE PRESTATION
Référence {ref} · version {version} de la proposition

Entre Younes Ouali, sous le nom OriginForge, Dellys, Algérie (le Développeur)
et {client} (le Client).

1. Périmètre
{scope}

Livrables :
{deliverables}

Non inclus :
{exclusions}- Toute nouvelle fonctionnalité ou modification hors de ce périmètre. Elle fait l'objet d'un devis séparé et n'est réalisée qu'après acceptation écrite.

2. Prix et paiement
Prix total : {price}, formule {plan}.
Échéancier :
{schedule}
Moyens acceptés : CCP, BaridiMob, espèces, carte (Chargily) et PayPal. Les frais de tiers (domaine, hébergement, services payants, comptes des stores, frais des prestataires de paiement) sont à la charge du Client, au coût réel.
Le travail commence dès la confirmation de l'acompte. {lapse}

3. Délais
Durée estimée : {timeline} jours à partir de la confirmation de l'acompte.
{milestones}
Si le Développeur attend le Client (contenus, retours, accès) plus de 5 jours ouvrés, le délai est suspendu. Après 30 jours sans réponse, le projet est mis en pause ; après 60 jours, il est clôturé et l'acompte couvre le travail réalisé.

4. Validations et révisions
Le Client valide le travail à chaque étape sur des liens de prévisualisation. {revisions} tours de révision dans le périmètre convenu sont inclus.

5. Livraison, propriété et maintenance
Le solde est dû avant la mise en production. Une fois tout réglé, le Client devient propriétaire du code source et des contenus, et reçoit les comptes et accès.
Maintenance ({plan}) : {maintenance} jours à partir de la mise en production. Elle couvre les bugs, c'est-à-dire tout ce qui ne fonctionne pas comme décrit dans ce contrat. Elle ne couvre pas les nouvelles fonctionnalités, les changements de design, les modifications de contenu au-delà de la formule, les problèmes causés par des tiers ni les modifications faites par le Client. Réponse sous {reply} heures ouvrées.

6. Annulation
Avant le début du travail, l'acompte est remboursé moins 10 %. Après le début du travail, l'acompte n'est pas remboursé et le travail réalisé est livré. Si le Développeur annule, toute somme non couverte par un travail livré est intégralement remboursée.

7. Portfolio
{portfolio}

8. Signature
Ce contrat est signé électroniquement. Le nom saisi par le Client, la date et l'heure, l'adresse IP, l'appareil et une empreinte SHA-256 de ce texte sont enregistrés comme preuve d'accord.
"""


def bullet(text: str, empty: str) -> str:
    rows = [f"- {line.strip()}" for line in text.splitlines() if line.strip()]
    return "\n".join(rows) or f"- {empty}"


def render(proposal: Proposal, lang: str) -> tuple[str, str]:
    """Return (body, sha256) for the contract of this accepted proposal."""
    req = proposal.request
    client = req.client
    who = client.full_name + (f", {client.company}" if client.company else "") + f" <{client.email}>"
    fr = lang == "fr"
    milestones = "\n".join(f"- {m['title']}: {m['days']} {'jours' if fr else 'days'}" for m in proposal.milestones)
    portfolio = (
        ("Le Client a demandé la confidentialité : le Développeur ne présentera pas ce projet publiquement." if fr
         else "The Client asked for confidentiality: the Developer will not show this project publicly.")
        if proposal.nda else
        ("Le Développeur peut présenter ce projet dans son portfolio et sur les réseaux sociaux." if fr
         else "The Developer may show this project in his portfolio and on social media.")
    )
    body = (FR if fr else EN).format(
        ref=req.reference, version=proposal.version, client=who, scope=proposal.scope.strip(),
        deliverables=bullet(proposal.deliverables, "Voir le périmètre" if fr else "See scope"),
        # Only what Younes listed, then the standing rule (never "Nothing else" above it).
        exclusions="".join(f"{row}\n" for row in bullet(proposal.exclusions, "").splitlines() if row.strip() not in ("", "-")),
        price=money(proposal.price, proposal.currency), plan=proposal.plan_name,
        schedule="\n".join(schedule_lines(proposal, lang)), timeline=proposal.timeline_days,
        milestones=milestones, revisions=proposal.revision_rounds, maintenance=proposal.maintenance_days,
        reply=proposal.reply_hours, portfolio=portfolio, lapse=deposit_terms(proposal, lang)[1],
    )
    return body, hashlib.sha256(body.encode("utf-8")).hexdigest()
