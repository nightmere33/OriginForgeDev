/**
 * The legal pages (privacy, terms, cookies, data deletion), EN and FR.
 * Plain words, and only what the platform really does: keep this file in step
 * with backend/config/settings.py (cookies), accounts/views.py
 * (DeleteAccountView) and docs/BUSINESS_RULES.md. Reviewed by Younes before launch.
 */
import type { Locale } from "./dictionaries";

export const LEGAL_PAGES = ["privacy", "terms", "cookies", "data-deletion"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];
export type LegalDoc = { title: string; lead: string; sections: { h: string; p: string[] }[] };

const UPDATED = { en: "Last updated 23 October 2026", fr: "Dernière mise à jour : 23 octobre 2026" };
const CONTACT = "younesoft2017@gmail.com";

const en: Record<LegalPage, LegalDoc> = {
  privacy: {
    title: "Privacy policy",
    lead: "What OriginForge collects, why, who sees it, and how you stay in control. Written to be read, not skimmed.",
    sections: [
      { h: "Who is responsible", p: [
        `OriginForge is the freelance studio of Younes Ouali, based in Dellys (Boumerdès), Algeria. He is responsible for the personal data handled on this website. Contact: ${CONTACT}.`,
        "This policy follows Algerian Law 18-07 on the protection of personal data. If you live in the European Union, it also gives you the rights of the GDPR.",
      ] },
      { h: "What is collected", p: [
        "Your account: name, e-mail, password (stored only as a one-way hash, never readable), and what you choose to add: phone, WhatsApp, company, country, language, display currency, how you heard about the studio, and the channel and username you prefer to be contacted on.",
        "Your projects: requests and drafts, the files you upload, messages and voice notes, proposals, the contract and its electronic signature (the name you type, the date and time, your IP address, your device, and a fingerprint of the exact text), milestones, and payments (amount, method, references and the receipts you upload).",
        "Card details are entered on the secure pages of Chargily or PayPal and never reach this website.",
        "Reviews: your rating, your words and the name you choose to show. They are published only if you tick the consent box and the review is approved.",
        "Technical data: the sign-in and security cookies described in the cookie policy, and server logs (IP address, browser, pages, time) used to keep the service secure.",
      ] },
      { h: "Why, and on what basis", p: [
        "To run your project and the contract you sign: proposals, work, payments, delivery and maintenance.",
        "To meet legal duties, mainly accounting: invoices and payment records must be kept.",
        "To keep the service secure and prevent fraud (a legitimate interest): rate limits, an activity log, abuse checks.",
        "With your consent: publishing your review. You can withdraw it at any time.",
        "There is no advertising, no profiling and no selling of data, ever.",
      ] },
      { h: "Who else processes it", p: [
        "Only the services needed to run the platform: the hosting provider of the server, Google (to send e-mails), Chargily (card payments in Algeria) and PayPal (international payments), and a content delivery network for images and videos.",
        "Some of these providers are outside Algeria. They only get what their task needs.",
        "Nobody else, unless the law requires it.",
      ] },
      { h: "How long it is kept", p: [
        "Your account and projects: as long as your account exists.",
        "Contracts, invoices and payment records: 10 years, as accounting law requires, even after an account is deleted (then without your name).",
        "Server logs: up to 90 days.",
        "Unsent drafts: until you send or delete them.",
      ] },
      { h: "How it is protected", p: [
        "Every connection is encrypted (HTTPS, with strict transport security). Passwords are hashed. Sign-in attempts and forms are rate-limited.",
        "Your files are private: each download checks that you are allowed to see it. Contracts are fingerprinted, so any change would show.",
        "Important actions are written to an activity log. The studio account is the only one with access to client data.",
      ] },
      { h: "Your rights", p: [
        "You can see, correct and download your data, object to a use, and delete your account, at any time.",
        "Most of this is self-service in Settings. For anything else, write to " + CONTACT + ": you will get an answer within 30 days.",
        "You can also complain to the Algerian authority (ANPDP) or, in the EU, to your data protection authority.",
      ] },
      { h: "Children", p: ["The platform is for people of 18 and over. Accounts of minors are deleted when found."] },
      { h: "Changes", p: ["If this policy changes in a way that matters, you will be told by e-mail and on the website before it applies."] },
    ],
  },
  terms: {
    title: "Terms of use",
    lead: "The rules for using this website and working with OriginForge. Each project is also covered by its own signed contract, which takes precedence.",
    sections: [
      { h: "The studio", p: [`OriginForge is the freelance practice of Younes Ouali, Dellys, Algeria (${CONTACT}). It designs and builds custom software: websites, web platforms, mobile apps and games.`] },
      { h: "Your account", p: [
        "Give accurate details and keep your password to yourself. You are responsible for what is done with your account.",
        "An account can be suspended for abuse, fraud or attempts to break the platform. You can delete yours at any time (see Data deletion).",
      ] },
      { h: "From request to contract", p: [
        "A request is free and commits you to nothing. The price calculator gives an estimate, not a quote.",
        "The studio answers with a written proposal (scope, price, timeline, plan). You can accept it, decline it or make a counter-offer.",
        "An accepted proposal becomes a contract that you sign online. The contract text, its date and its fingerprint are kept as proof.",
      ] },
      { h: "Payments", p: [
        "Unless the contract says otherwise: a 40 % deposit within 5 days of signing, and the balance before going live. Work starts once the deposit is confirmed.",
        "Prices are in the currency of the contract. Amounts shown in other currencies are estimates at the day's rate.",
        "Third-party costs (domain, hosting, paid services, store accounts, payment fees) are paid by the client.",
        "Cancellation by you before work starts: the deposit is refunded minus 10 %. After work starts: the deposit is kept and the work done is delivered. Cancellation by the studio: anything not covered by delivered work is refunded in full.",
      ] },
      { h: "Ownership", p: [
        "The code and content belong to you once the final payment is made. Until then they belong to the studio.",
        "The studio may show the finished work in its portfolio and on social media, unless you ask for confidentiality (NDA) before signing.",
      ] },
      { h: "Working together", p: [
        "You provide content, access and feedback on time. When the studio waits on you for more than 5 working days, the timeline pauses.",
        "Changes within the agreed scope use the revision rounds of your plan. New work is quoted as a change request.",
        "Maintenance and support follow the plan in your contract.",
      ] },
      { h: "Reviews", p: [
        "Only clients of a delivered project can leave a review, one per project. It must describe your own experience.",
        "Reviews are never edited. A review can be refused with a reason (for example personal data or insults), and you can then change it.",
      ] },
      { h: "Responsibility", p: [
        "The studio does its best to keep the website available and accurate but cannot promise it never fails.",
        "For a project, the studio's responsibility is limited to the amounts paid under its contract, except in case of serious fault.",
      ] },
      { h: "Law and disputes", p: [
        "These terms are governed by Algerian law. In case of disagreement, we first look for a friendly solution; failing that, the courts of Boumerdès have jurisdiction, unless the law gives you another choice.",
      ] },
    ],
  },
  cookies: {
    title: "Cookie policy",
    lead: "This site uses only what it needs to work. No analytics, no advertising, no tracking, so there is nothing to accept or refuse.",
    sections: [
      { h: "Cookies", p: [
        "of_session: keeps you signed in. Set when you sign in, lasts 14 days, unreadable by scripts, sent only over HTTPS.",
        "of_csrftoken: protects forms against cross-site attacks. Contains no personal data.",
        "of_lang: remembers your language so the site opens in it next time. Lasts one year.",
      ] },
      { h: "Saved on your device", p: [
        "A few preferences are stored in your browser, never sent anywhere: the theme (light or dark), the display currency, whether you have already seen the opening animation, and the video format your device plays best.",
      ] },
      { h: "Third parties", p: [
        "When you pay by card you are sent to Chargily or PayPal, whose own cookie policies apply on their pages.",
        "No other service sets cookies on this website.",
      ] },
      { h: "Your control", p: [
        "You can clear or block cookies in your browser settings. Blocking of_session or of_csrftoken prevents signing in, the rest of the website still works.",
      ] },
    ],
  },
  "data-deletion": {
    title: "Data deletion",
    lead: "How to delete your account and personal data, and what happens to them.",
    sections: [
      { h: "Delete it yourself", p: [
        "Sign in, open Settings, and choose Delete account at the bottom. Confirm with your password and the word DELETE. It takes effect at once and you are signed out.",
      ] },
      { h: "Or ask", p: [
        `Write to ${CONTACT} from the address of your account and ask for deletion. It is done within 30 days, and you get a confirmation e-mail.`,
      ] },
      { h: "What is deleted", p: [
        "Your name, e-mail, password, phone numbers, usernames and preferences. Your unsent drafts and your notifications. Your sign-in stops working.",
        "Reviews you published stay on the website, without your name.",
      ] },
      { h: "What is kept, and why", p: [
        "Signed contracts, invoices and payment records are kept for 10 years without your name, because accounting law requires it.",
        "Backups roll over and are fully replaced within 30 days.",
      ] },
      { h: "When it isn't possible right away", p: [
        "While a project is being built under a signed contract, the account can't be deleted from Settings. Finish or cancel the project first, or write to " + CONTACT + ".",
      ] },
    ],
  },
};

const fr: Record<LegalPage, LegalDoc> = {
  privacy: {
    title: "Politique de confidentialité",
    lead: "Ce qu'OriginForge collecte, pourquoi, qui y a accès, et comment vous gardez la main. Écrit pour être lu.",
    sections: [
      { h: "Responsable", p: [
        `OriginForge est le studio indépendant de Younes Ouali, à Dellys (Boumerdès), Algérie. Il est responsable des données personnelles traitées sur ce site. Contact : ${CONTACT}.`,
        "Cette politique suit la loi algérienne 18-07 relative à la protection des données personnelles. Si vous résidez dans l'Union européenne, elle vous donne aussi les droits du RGPD.",
      ] },
      { h: "Ce qui est collecté", p: [
        "Votre compte : nom, e-mail, mot de passe (stocké uniquement sous forme d'empreinte, jamais lisible), et ce que vous choisissez d'ajouter : téléphone, WhatsApp, entreprise, pays, langue, devise d'affichage, comment vous avez connu le studio, et le canal et le nom d'utilisateur où vous préférez être contacté.",
        "Vos projets : demandes et brouillons, fichiers envoyés, messages et notes vocales, propositions, le contrat et sa signature électronique (le nom saisi, la date et l'heure, votre adresse IP, votre appareil et une empreinte du texte exact), étapes, et paiements (montant, moyen, références et reçus envoyés).",
        "Les données de carte sont saisies sur les pages sécurisées de Chargily ou PayPal et n'arrivent jamais sur ce site.",
        "Avis : votre note, vos mots et le nom que vous choisissez d'afficher. Ils ne sont publiés que si vous cochez la case de consentement et que l'avis est validé.",
        "Données techniques : les cookies de connexion et de sécurité décrits dans la politique cookies, et les journaux du serveur (adresse IP, navigateur, pages, heure) utilisés pour la sécurité.",
      ] },
      { h: "Pourquoi, et sur quelle base", p: [
        "Pour réaliser votre projet et le contrat que vous signez : propositions, travail, paiements, livraison et maintenance.",
        "Pour respecter des obligations légales, surtout comptables : factures et paiements doivent être conservés.",
        "Pour sécuriser le service et prévenir la fraude (intérêt légitime) : limites de requêtes, journal d'activité, contrôles anti-abus.",
        "Avec votre consentement : publier votre avis. Vous pouvez le retirer à tout moment.",
        "Aucune publicité, aucun profilage, aucune revente de données, jamais.",
      ] },
      { h: "Qui d'autre les traite", p: [
        "Seulement les services nécessaires : l'hébergeur du serveur, Google (envoi des e-mails), Chargily (paiements par carte en Algérie), PayPal (paiements internationaux) et un réseau de diffusion pour les images et vidéos.",
        "Certains de ces prestataires sont hors d'Algérie. Ils ne reçoivent que ce dont leur tâche a besoin.",
        "Personne d'autre, sauf obligation légale.",
      ] },
      { h: "Durée de conservation", p: [
        "Votre compte et vos projets : tant que votre compte existe.",
        "Contrats, factures et paiements : 10 ans, comme l'exige la loi comptable, même après suppression du compte (alors sans votre nom).",
        "Journaux du serveur : 90 jours au plus.",
        "Brouillons non envoyés : jusqu'à ce que vous les envoyiez ou les supprimiez.",
      ] },
      { h: "Comment elles sont protégées", p: [
        "Chaque connexion est chiffrée (HTTPS, avec sécurité de transport stricte). Les mots de passe sont hachés. Connexions et formulaires sont limités en nombre.",
        "Vos fichiers sont privés : chaque téléchargement vérifie que vous y avez droit. Les contrats portent une empreinte, toute modification se verrait.",
        "Les actions importantes sont inscrites dans un journal d'activité. Seul le compte du studio a accès aux données des clients.",
      ] },
      { h: "Vos droits", p: [
        "Vous pouvez consulter, corriger et télécharger vos données, vous opposer à un usage, et supprimer votre compte, à tout moment.",
        "L'essentiel se fait vous-même dans Paramètres. Pour le reste, écrivez à " + CONTACT + " : réponse sous 30 jours.",
        "Vous pouvez aussi saisir l'autorité algérienne (ANPDP) ou, dans l'UE, votre autorité de protection des données.",
      ] },
      { h: "Mineurs", p: ["La plateforme est réservée aux personnes de 18 ans et plus. Les comptes de mineurs sont supprimés dès qu'ils sont identifiés."] },
      { h: "Modifications", p: ["Si cette politique change de façon importante, vous serez prévenu par e-mail et sur le site avant son application."] },
    ],
  },
  terms: {
    title: "Conditions d'utilisation",
    lead: "Les règles pour utiliser ce site et travailler avec OriginForge. Chaque projet est aussi couvert par son propre contrat signé, qui prévaut.",
    sections: [
      { h: "Le studio", p: [`OriginForge est l'activité indépendante de Younes Ouali, Dellys, Algérie (${CONTACT}). Il conçoit et développe des logiciels sur mesure : sites, plateformes web, applications mobiles et jeux.`] },
      { h: "Votre compte", p: [
        "Donnez des informations exactes et gardez votre mot de passe pour vous. Vous êtes responsable de ce qui est fait avec votre compte.",
        "Un compte peut être suspendu en cas d'abus, de fraude ou de tentative d'attaque. Vous pouvez supprimer le vôtre à tout moment (voir Suppression des données).",
      ] },
      { h: "De la demande au contrat", p: [
        "Une demande est gratuite et ne vous engage à rien. Le calculateur donne une estimation, pas un devis.",
        "Le studio répond par une proposition écrite (périmètre, prix, délai, formule). Vous pouvez l'accepter, la refuser ou faire une contre-proposition.",
        "Une proposition acceptée devient un contrat que vous signez en ligne. Le texte, sa date et son empreinte sont conservés comme preuve.",
      ] },
      { h: "Paiements", p: [
        "Sauf mention contraire au contrat : un acompte de 40 % sous 5 jours après la signature, et le solde avant la mise en ligne. Le travail commence une fois l'acompte confirmé.",
        "Les prix sont dans la devise du contrat. Les montants affichés dans d'autres devises sont des estimations au taux du jour.",
        "Les frais de tiers (domaine, hébergement, services payants, comptes des stores, frais de paiement) sont à la charge du client.",
        "Annulation par vous avant le début du travail : acompte remboursé moins 10 %. Après le début : l'acompte est conservé et le travail réalisé est livré. Annulation par le studio : tout ce qui n'est pas couvert par du travail livré est remboursé intégralement.",
      ] },
      { h: "Propriété", p: [
        "Le code et le contenu vous appartiennent une fois le paiement final effectué. Jusque-là, ils appartiennent au studio.",
        "Le studio peut montrer le travail terminé dans son portfolio et sur les réseaux sociaux, sauf si vous demandez la confidentialité (NDA) avant la signature.",
      ] },
      { h: "Travailler ensemble", p: [
        "Vous fournissez contenus, accès et retours à temps. Quand le studio vous attend plus de 5 jours ouvrés, le calendrier est mis en pause.",
        "Les changements dans le périmètre prévu utilisent les tours de révision de votre formule. Tout ajout fait l'objet d'une demande de changement chiffrée.",
        "La maintenance et le support suivent la formule de votre contrat.",
      ] },
      { h: "Avis", p: [
        "Seuls les clients d'un projet livré peuvent laisser un avis, un par projet. Il doit décrire votre propre expérience.",
        "Les avis ne sont jamais modifiés. Un avis peut être refusé avec une raison (par exemple des données personnelles ou des insultes), et vous pouvez alors le corriger.",
      ] },
      { h: "Responsabilité", p: [
        "Le studio fait de son mieux pour que le site soit disponible et exact, sans pouvoir garantir qu'il ne connaîtra jamais de panne.",
        "Pour un projet, la responsabilité du studio est limitée aux sommes payées au titre de son contrat, sauf faute grave.",
      ] },
      { h: "Droit applicable et litiges", p: [
        "Ces conditions relèvent du droit algérien. En cas de désaccord, nous cherchons d'abord une solution amiable ; à défaut, les tribunaux de Boumerdès sont compétents, sauf si la loi vous donne un autre choix.",
      ] },
    ],
  },
  cookies: {
    title: "Politique cookies",
    lead: "Ce site n'utilise que ce dont il a besoin pour fonctionner. Pas de mesure d'audience, pas de publicité, pas de pistage : il n'y a donc rien à accepter ou refuser.",
    sections: [
      { h: "Cookies", p: [
        "of_session : vous garde connecté. Créé à la connexion, dure 14 jours, illisible par les scripts, envoyé uniquement en HTTPS.",
        "of_csrftoken : protège les formulaires contre les attaques intersites. Ne contient aucune donnée personnelle.",
        "of_lang : retient votre langue pour ouvrir le site dans celle-ci la prochaine fois. Dure un an.",
      ] },
      { h: "Enregistré sur votre appareil", p: [
        "Quelques préférences sont gardées dans votre navigateur, sans jamais être envoyées : le thème (clair ou sombre), la devise d'affichage, si vous avez déjà vu l'animation d'ouverture, et le format vidéo que votre appareil lit le mieux.",
      ] },
      { h: "Tiers", p: [
        "Quand vous payez par carte, vous êtes dirigé vers Chargily ou PayPal, dont les propres politiques cookies s'appliquent sur leurs pages.",
        "Aucun autre service ne dépose de cookies sur ce site.",
      ] },
      { h: "Votre contrôle", p: [
        "Vous pouvez effacer ou bloquer les cookies dans les réglages de votre navigateur. Bloquer of_session ou of_csrftoken empêche la connexion, le reste du site fonctionne.",
      ] },
    ],
  },
  "data-deletion": {
    title: "Suppression des données",
    lead: "Comment supprimer votre compte et vos données personnelles, et ce qu'elles deviennent.",
    sections: [
      { h: "Le faire vous-même", p: [
        "Connectez-vous, ouvrez Paramètres et choisissez Supprimer le compte en bas de page. Confirmez avec votre mot de passe et le mot SUPPRIMER. C'est immédiat et vous êtes déconnecté.",
      ] },
      { h: "Ou le demander", p: [
        `Écrivez à ${CONTACT} depuis l'adresse de votre compte en demandant la suppression. C'est fait sous 30 jours, avec un e-mail de confirmation.`,
      ] },
      { h: "Ce qui est supprimé", p: [
        "Votre nom, e-mail, mot de passe, numéros, noms d'utilisateur et préférences. Vos brouillons non envoyés et vos notifications. Votre connexion cesse de fonctionner.",
        "Les avis que vous avez publiés restent sur le site, sans votre nom.",
      ] },
      { h: "Ce qui est conservé, et pourquoi", p: [
        "Les contrats signés, factures et paiements sont conservés 10 ans sans votre nom, car la loi comptable l'exige.",
        "Les sauvegardes tournent et sont entièrement remplacées sous 30 jours.",
      ] },
      { h: "Quand ce n'est pas possible tout de suite", p: [
        "Tant qu'un projet est en cours de réalisation sous un contrat signé, le compte ne peut pas être supprimé depuis Paramètres. Terminez ou annulez d'abord le projet, ou écrivez à " + CONTACT + ".",
      ] },
    ],
  },
};

export function legal(lang: Locale, page: LegalPage) {
  return { ...(lang === "fr" ? fr : en)[page], updated: UPDATED[lang] };
}

export const LEGAL_LABELS: Record<Locale, Record<LegalPage, string>> = {
  en: { privacy: "Privacy", terms: "Terms", cookies: "Cookies", "data-deletion": "Data deletion" },
  fr: { privacy: "Confidentialité", terms: "Conditions", cookies: "Cookies", "data-deletion": "Suppression des données" },
};
