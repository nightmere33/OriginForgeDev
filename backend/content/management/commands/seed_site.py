"""
Seed the public content: settings, services, case studies, tech, credentials, FAQ.

    python manage.py seed_site            # create what's missing, attach built media
    python manage.py seed_site --update   # also overwrite copy edited in the admin

Media comes from `scripts/media/build_media.py` (media/work/manifest.json).
Testimonials are deliberately not seeded: only real client words go there.
"""

import datetime
import json

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from content.models import FAQ, CaseStudy, CaseStudyMedia, Credential, Service, SiteSettings, Tech

SITE = {
    "email": "younesoft2017@gmail.com",
    "github_url": "https://github.com/nightmere33",
    "linkedin_url": "https://www.linkedin.com/in/younes-ouali-82ba5a319/",
    "instagram_url": "https://www.instagram.com/originforgedev/",
    "discord_username": "nightmere33",
    "years_experience": 3,
    "projects_shipped": 20,
    "reply_hours": 24,
    "availability_en": "Booking new projects",
    "availability_fr": "Ouvert à de nouveaux projets",
    "location_en": "Dellys, Algeria · working worldwide",
    "location_fr": "Dellys, Algérie · partout dans le monde",
    "about_en": (
        "I'm Younes Ouali, a full-stack developer from Dellys, Algeria, and the person behind OriginForge.\n"
        "I hold a Bachelor's in Computer Science (Information Systems) from Université Mouloud Mammeri, "
        "Tizi-Ouzou, where I'm now in Master 2 (final year) of Mobile Networks & Embedded Systems. Alongside, I ship "
        "real products: Alquilar, my own rental platform with its app, website and admin; a medical revision "
        "platform taking live card payments; store fronts, bots and the launch films that sell them.\n"
        "I work end to end: product thinking, interface, backend, payments, deployment. And I stay on after "
        "launch. You talk to the person who writes the code."
    ),
    "about_fr": (
        "Je suis Younes Ouali, développeur full-stack basé à Dellys, en Algérie, et la personne derrière OriginForge.\n"
        "Titulaire d'une Licence en informatique (Systèmes d'Information) de l'Université Mouloud Mammeri de "
        "Tizi-Ouzou, j'y suis en Master 2 (dernière année) Réseaux Mobiles et Systèmes Embarqués. En parallèle, je livre de vrais "
        "produits : Alquilar, ma propre plateforme de location avec son application, son site et son back-office ; "
        "une plateforme de révision médicale avec paiement par carte ; des boutiques, des bots, et les films de "
        "lancement qui les vendent.\n"
        "Je travaille de bout en bout : produit, interface, backend, paiements, mise en ligne. Et je reste après "
        "le lancement. Vous parlez à la personne qui écrit le code."
    ),
}

SERVICES = [
    {
        "slug": "web-platforms", "icon": "layers", "order": 1,
        "title_en": "Web platforms", "title_fr": "Plateformes web",
        "summary_en": "Marketplaces, booking systems, dashboards and client portals, built to run a business.",
        "summary_fr": "Marketplaces, réservation, tableaux de bord et portails clients, faits pour faire tourner une activité.",
        "description_en": "Accounts and roles, payments, admin back-office, notifications and multilingual interfaces, on a stack you can grow: Django or Next.js, PostgreSQL, Redis.",
        "description_fr": "Comptes et rôles, paiements, back-office, notifications et interfaces multilingues, sur une base qui peut grandir : Django ou Next.js, PostgreSQL, Redis.",
        "deliverables_en": "Product scoping & user flows\nResponsive interface\nAdmin back-office\nPayments & e-mails\nDeployment & monitoring",
        "deliverables_fr": "Cadrage produit & parcours\nInterface responsive\nBack-office d'administration\nPaiements & e-mails\nMise en ligne & suivi",
        "timeline_en": "4–10 weeks", "timeline_fr": "4 à 10 semaines",
    },
    {
        "slug": "websites", "icon": "monitor-smartphone", "order": 2,
        "title_en": "Websites & landing pages", "title_fr": "Sites & landing pages",
        "summary_en": "Fast, animated sites that explain what you do and turn visitors into requests.",
        "summary_fr": "Des sites rapides et animés qui expliquent ce que vous faites et transforment les visites en demandes.",
        "description_en": "Motion where it helps the story, content you can edit yourself, SEO and analytics from day one, in English, French or Arabic.",
        "description_fr": "Du mouvement là où il sert le propos, un contenu que vous modifiez vous-même, SEO et statistiques dès le départ, en français, anglais ou arabe.",
        "deliverables_en": "Design direction\nAnimated, responsive pages\nEditable content\nSEO & analytics\nHosting setup",
        "deliverables_fr": "Direction artistique\nPages animées et responsives\nContenu modifiable\nSEO & statistiques\nMise en place de l'hébergement",
        "timeline_en": "1–3 weeks", "timeline_fr": "1 à 3 semaines",
    },
    {
        "slug": "mobile-apps", "icon": "smartphone", "order": 3,
        "title_en": "Mobile apps", "title_fr": "Applications mobiles",
        "summary_en": "Flutter apps for Android and iOS, from the first screen to the store listing.",
        "summary_fr": "Applications Flutter pour Android et iOS, du premier écran à la fiche sur le store.",
        "description_en": "One codebase, native feel: maps, notifications, offline-friendly data, payments and the backend that powers it.",
        "description_fr": "Une seule base de code, un rendu natif : cartes, notifications, données hors ligne, paiements et le backend qui va avec.",
        "deliverables_en": "App design & prototype\nFlutter app (Android & iOS)\nBackend & admin\nStore publishing\nRelease updates",
        "deliverables_fr": "Design & prototype\nApplication Flutter (Android & iOS)\nBackend & administration\nPublication sur les stores\nMises à jour",
        "timeline_en": "4–12 weeks", "timeline_fr": "4 à 12 semaines",
    },
    {
        # Replaced "Payments & integrations": payment work is priced inside each
        # project (calculator option), games are a service of their own.
        "slug": "game-dev", "icon": "gamepad-2", "order": 4,
        "title_en": "Game development", "title_fr": "Développement de jeux",
        "summary_en": "2D and 3D games in Unity for PC, Android and the web, from the first prototype to a playable release.",
        "summary_fr": "Des jeux 2D et 3D sous Unity pour PC, Android et le web, du premier prototype à une version jouable.",
        "description_en": "Gameplay first: a playable prototype in the first weeks, then levels, interface, sound and polish, with a build to test at every milestone.",
        "description_fr": "Le gameplay d'abord : un prototype jouable dès les premières semaines, puis niveaux, interface, son et finitions, avec une version à tester à chaque étape.",
        "deliverables_en": "Game design brief\nPlayable prototype\nGameplay & levels\nUI, menus & sound\nPC, Android & WebGL builds",
        "deliverables_fr": "Brief de game design\nPrototype jouable\nGameplay & niveaux\nInterface, menus & son\nVersions PC, Android & WebGL",
        "timeline_en": "3–12 weeks", "timeline_fr": "3 à 12 semaines",
    },
    {
        "slug": "automation", "icon": "bot", "order": 5,
        "title_en": "Automation & data", "title_fr": "Automatisation & données",
        "summary_en": "Bots, scrapers and scheduled jobs that take repetitive work off your hands.",
        "summary_fr": "Bots, extraction de données et tâches planifiées qui vous retirent le travail répétitif.",
        "description_en": "Selenium and Playwright automation, data pipelines and integrations: monitored, logged and easy to rerun.",
        "description_fr": "Automatisation Selenium et Playwright, pipelines de données et intégrations : surveillés, journalisés, faciles à relancer.",
        "deliverables_en": "Workflow audit\nAutomation scripts\nScheduling & alerts\nData exports\nHandover docs",
        "deliverables_fr": "Analyse du processus\nScripts d'automatisation\nPlanification & alertes\nExports de données\nDocumentation",
        "timeline_en": "3 days–3 weeks", "timeline_fr": "3 jours à 3 semaines",
    },
    {
        "slug": "product-films", "icon": "clapperboard", "order": 6,
        "title_en": "Product films & 3D motion", "title_fr": "Films produit & motion 3D",
        "summary_en": "Launch videos rendered in code from your real app: 3D, voice-over, music, every format.",
        "summary_fr": "Des vidéos de lancement rendues en code à partir de votre vraie application : 3D, voix off, musique, tous formats.",
        "description_en": "The MediGate and Alquilar ads were made this way: real screens on 3D devices, word-synced captions, in Arabic, French and English.",
        "description_fr": "Les publicités MediGate et Alquilar sont faites ainsi : vrais écrans sur des appareils 3D, sous-titres synchronisés, en arabe, français et anglais.",
        "deliverables_en": "Script & storyboard\n3D motion film\nVoice-over & music\nVertical & square cuts\nSource files",
        "deliverables_fr": "Script & storyboard\nFilm motion 3D\nVoix off & musique\nFormats vertical et carré\nFichiers sources",
        "timeline_en": "1–2 weeks", "timeline_fr": "1 à 2 semaines",
    },
]

RETIRED_SERVICES = ["payments"]

CASE_STUDIES = [
    {
        "slug": "alquilar", "title": "Alquilar", "client_name": "Own product", "year": 2026,
        "category": CaseStudy.Category.PLATFORM, "accent": "#F0533F", "order": 1, "featured": True,
        "stack": "Flutter, Dart, Firebase, Cloud Functions, Google Maps, React, Django, Chargily Pay",
        "live_url": "https://alquilardz.com",
        "tagline_en": "Short-term rentals for Algeria: an app, a website and an admin, paid in dinars.",
        "tagline_fr": "La location courte durée en Algérie : une app, un site et un back-office, payés en dinars.",
        "summary_en": "Alquilar lets hosts across Algeria list homes and get booked, and lets guests pay their way: cash at check-in or online by card through Chargily.",
        "summary_fr": "Alquilar permet aux hôtes partout en Algérie de publier leur logement et d'être réservés, et aux voyageurs de payer à leur façon : en espèces à l'arrivée ou en ligne par carte via Chargily.",
        "role_en": "Founder: product, design and full-stack engineering", "role_fr": "Fondateur : produit, design et développement full-stack",
        "challenge_en": "International booking apps assume online card payment. In Algeria most stays are paid in cash, so a booking platform has to make cash trustworthy for both sides without losing the guarantees of online payment.",
        "challenge_fr": "Les plateformes internationales supposent un paiement par carte. En Algérie, la plupart des séjours se paient en espèces : il faut donc rendre le cash fiable pour les deux parties sans perdre les garanties du paiement en ligne.",
        "approach_en": "A Flutter app for guests and hosts, a companion website and a Django admin panel share one set of platform rules: holds on dates during checkout, payment windows, no-show handling, configurable fees and host payouts by CCP or bank transfer.",
        "approach_fr": "Une application Flutter pour voyageurs et hôtes, un site compagnon et un back-office Django partagent les mêmes règles : dates bloquées pendant le paiement, délais de règlement, gestion des absences, frais configurables et versements aux hôtes par CCP ou virement.",
        "outcome_en": "Every rule the team can tune lives in the admin, so pricing and policies change without shipping a new app version.",
        "outcome_fr": "Chaque règle ajustable vit dans le back-office : tarifs et politiques changent sans publier une nouvelle version de l'application.",
        "metrics_en": "3 | surfaces: app, website, admin\nDZD | cash check-in or Chargily card payment\n4 | languages: Arabic, French, English, Tamazight",
        "metrics_fr": "3 | supports : app, site, back-office\nDZD | espèces à l'arrivée ou carte via Chargily\n4 | langues : arabe, français, anglais, tamazight",
    },
    {
        "slug": "medigate", "title": "MediGate", "client_name": "MediGate", "year": 2026,
        "category": CaseStudy.Category.PLATFORM, "accent": "#1F8A86", "order": 2, "featured": True,
        "stack": "Django 6, PostgreSQL, Redis, Celery, DRF, Tailwind CSS, Chargily Pay v2, nginx",
        "live_url": "https://medigate-dz.com",
        "tagline_en": "A revision platform for Algerian medical students, with local payments built in.",
        "tagline_fr": "Une plateforme de révision pour les étudiants en médecine algériens, avec paiement local intégré.",
        "summary_en": "Question banks from real exams, courses and flash sheets, revision sessions built in a few taps, and progress that feels like a game. Sold module by module.",
        "summary_fr": "Banques de questions issues de vrais examens, cours et fiches, sessions de révision composées en quelques gestes, et une progression ludique. Vendue module par module.",
        "role_en": "Full-stack engineering, payments and infrastructure", "role_fr": "Développement full-stack, paiements et infrastructure",
        "challenge_en": "Students pay with Edahabia and CIB cards, CCP transfers or cash. Each needed to unlock exactly the right modules, with nothing lost when a payment page is closed halfway.",
        "challenge_fr": "Les étudiants paient par carte Edahabia ou CIB, par virement CCP ou en espèces. Chaque moyen devait débloquer exactement les bons modules, sans rien perdre si la page de paiement est fermée en cours de route.",
        "approach_en": "A Django platform with a Chargily Pay v2 integration written against the API (signed webhooks stored before they are processed, reconciliation, checkout expiry), a review queue for transfer receipts, gift codes, and XP, ranks and trophies to keep students coming back.",
        "approach_fr": "Une plateforme Django avec une intégration Chargily Pay v2 écrite contre l'API (webhooks signés enregistrés avant traitement, rapprochement, expiration des paiements), une file de validation des reçus, des codes cadeaux, et des XP, grades et trophées pour faire revenir les étudiants.",
        "outcome_en": "Live on its own VPS with scripted provisioning, backups and one-command rollback.",
        "outcome_fr": "En ligne sur son propre VPS, avec installation scriptée, sauvegardes et retour arrière en une commande.",
        "metrics_en": "CIB · Edahabia | live card payments via Chargily\nXP | ranks and trophies for every answer\n1 cmd | deploy and rollback",
        "metrics_fr": "CIB · Edahabia | paiement par carte en ligne via Chargily\nXP | grades et trophées à chaque réponse\n1 cmd | déploiement et retour arrière",
    },
    {
        "slug": "product-films", "title": "Product films", "client_name": "MediGate · Alquilar · OriginForge", "year": 2026,
        "category": CaseStudy.Category.MOTION, "accent": "#FF6A1A", "order": 3, "featured": True,
        "stack": "three.js, Headless Chromium, Node.js, Python, Whisper, ffmpeg",
        "tagline_en": "Launch films rendered in code: real screens on 3D devices, voice-over and music.",
        "tagline_fr": "Des films de lancement rendus en code : vrais écrans sur des appareils 3D, voix off et musique.",
        "summary_en": "A small film engine that turns real app captures into vertical ads: 3D phones and laptops, word-synced captions, a music bed and every cut a platform asks for.",
        "summary_fr": "Un petit moteur de films qui transforme de vraies captures d'application en publicités verticales : téléphones et ordinateurs en 3D, sous-titres synchronisés, musique, et tous les formats demandés par les plateformes.",
        "role_en": "Script, motion design and engine", "role_fr": "Script, motion design et moteur",
        "challenge_en": "Agencies charge for every language and every format. These products needed to launch in Arabic, French and English, on Reels, TikTok and Shorts, and stay in sync with the app as it changed.",
        "challenge_fr": "Une agence facture chaque langue et chaque format. Ces produits devaient sortir en arabe, français et anglais, sur Reels, TikTok et Shorts, et rester fidèles à l'application au fil des versions.",
        "approach_en": "Scenes are code. Voice lines are recorded first and timed word by word, the scene timeline follows the voice, and three.js renders each frame on the GPU with motion blur and depth of field.",
        "approach_fr": "Les scènes sont du code. La voix est enregistrée d'abord et chaque mot est horodaté, la timeline suit la voix, et three.js rend chaque image sur le GPU avec flou de mouvement et profondeur de champ.",
        "outcome_en": "A new language or a new screen is a re-render, not a re-shoot.",
        "outcome_fr": "Une nouvelle langue ou un nouvel écran, c'est un nouveau rendu, pas un nouveau tournage.",
        "metrics_en": "3 | languages per film\n9:16 | cut for Reels, TikTok and Shorts",
        "metrics_fr": "3 | langues par film\n9:16 | pour Reels, TikTok et Shorts",
    },
    {
        "slug": "ecommerce-dz", "title": "E-commerce DZ", "year": 2025,
        "category": CaseStudy.Category.WEB, "order": 4,
        "stack": "Django, Tailwind CSS, PostgreSQL",
        "repo_url": "https://github.com/nightmere33/E-commerce-DZ",
        "tagline_en": "An online store built for selling in Algeria.", "tagline_fr": "Une boutique en ligne pensée pour vendre en Algérie.",
        "summary_en": "Catalogue, cart and checkout on Django and Tailwind, with the delivery and payment habits of Algerian buyers in mind.",
        "summary_fr": "Catalogue, panier et commande avec Django et Tailwind, pensés pour les habitudes de livraison et de paiement des acheteurs algériens.",
    },
    {
        "slug": "distributed-chat", "title": "Distributed chat", "year": 2026,
        "category": CaseStudy.Category.WEB, "order": 5,
        "stack": "Python, WebSockets, HTML, CSS, JavaScript",
        "repo_url": "https://github.com/nightmere33/ChatAPP-DS",
        "live_url": "https://chatapp-tv44.onrender.com/",
        "tagline_en": "Real-time messaging on a distributed architecture.", "tagline_fr": "Une messagerie temps réel sur une architecture distribuée.",
        "summary_en": "A university distributed-systems project: a web chat whose messages travel across several nodes in real time.",
        "summary_fr": "Un projet universitaire de systèmes distribués : une messagerie web dont les messages circulent entre plusieurs nœuds en temps réel.",
    },
    {
        "slug": "gameverse", "title": "GameVerse", "client_name": "Bachelor's final project (PFE)", "year": 2025,
        "category": CaseStudy.Category.PLATFORM, "order": 6,
        "stack": "Django 5, Tailwind CSS, PostgreSQL, Django Channels, Docker, Railway",
        "repo_url": "https://github.com/nightmere33/E-Commerce-Website-Django",
        "tagline_en": "A store for video games and digital subscription cards.",
        "tagline_fr": "Une boutique de jeux vidéo et de cartes d'abonnement numériques.",
        "summary_en": "My Bachelor's final project: a marketplace where players buy games and gift cards, receive their keys instantly and keep them in a personal library.",
        "summary_fr": "Mon projet de fin de licence : une place de marché où les joueurs achètent des jeux et des cartes cadeaux, reçoivent leur clé immédiatement et la retrouvent dans leur bibliothèque.",
        "role_en": "Design, full-stack development and deployment", "role_fr": "Conception, développement full-stack et déploiement",
        "challenge_en": "Selling digital goods means the product is a code: it has to reach the right buyer right after payment, never twice, and stay retrievable later. Buyers also want to ask the seller questions before paying.",
        "challenge_fr": "Vendre des biens numériques, c'est vendre un code : il doit arriver au bon acheteur juste après le paiement, jamais deux fois, et rester accessible ensuite. Les acheteurs veulent aussi poser des questions au vendeur avant de payer.",
        "approach_en": "A Django back-end with a catalogue by category and a featured carousel, a session cart, orders with a status trail and a checkout that accepts a transfer receipt. Each paid order generates a unique key per game, stored in the buyer's \"My games\" library. Sellers get a dashboard of their listings, and every listing has its own buyer and seller conversation. Styled with Tailwind, containerised with Docker and deployed on Railway with PostgreSQL.",
        "approach_fr": "Un back-end Django avec un catalogue par catégorie et un carrousel de mise en avant, un panier en session, des commandes suivies par statut et un paiement qui accepte un reçu de virement. Chaque commande payée génère une clé unique par jeu, rangée dans la bibliothèque « Mes jeux » de l'acheteur. Les vendeurs ont un tableau de bord de leurs annonces, et chaque annonce a sa propre conversation entre acheteur et vendeur. Mis en forme avec Tailwind, conteneurisé avec Docker et déployé sur Railway avec PostgreSQL.",
        "outcome_en": "A complete purchase loop, from browsing to key delivery, presented and defended as my Bachelor's final project at UMMTO.",
        "outcome_fr": "Une boucle d'achat complète, de la navigation à la livraison de la clé, présentée et soutenue comme projet de fin de licence à l'UMMTO.",
    },
    {
        "slug": "csi-game", "title": "CSI Game", "client_name": "Younes Ouali × CSI, UMMTO", "year": 2025,
        "category": CaseStudy.Category.GAME, "order": 7,
        "stack": "Unity 6, C#, 2D, URP, Tilemaps",
        "repo_url": "https://github.com/nightmere33/CSI-GAME-UMMTO",
        "tagline_en": "A 2D pixel-art action platformer: four levels, traps and boss fights.",
        "tagline_fr": "Un jeu de plateforme et d'action en pixel art : quatre niveaux, des pièges et des boss.",
        "summary_en": "Run, jump and fight through four hand-built levels: patrolling, melee and ranged enemies, arrow, fire and spike traps, health pickups, checkpoints and boss fights.",
        "summary_fr": "Courir, sauter et combattre à travers quatre niveaux faits main : ennemis en patrouille, au corps à corps et à distance, pièges à flèches, à feu et à pointes, soins, points de sauvegarde et combats de boss.",
        "role_en": "Game design, level design and development", "role_fr": "Game design, level design et développement",
        "challenge_en": "A platformer lives or dies on feel: jumps must be readable and fair, enemies must pressure the player without cheap hits, and each level has to bring something new.",
        "challenge_fr": "Un jeu de plateforme tient à ses sensations : des sauts lisibles et justes, des ennemis qui mettent la pression sans coups injustes, et chaque niveau doit apporter quelque chose de neuf.",
        "approach_en": "Physics-based movement with a variable jump (let go early for a short hop) and melee attacks on a cooldown. Enemies are built from small reusable behaviours (patrol, melee, ranged fireballs) and the levels add arrow, fire and spike traps. A health bar with pickups, checkpoints that respawn the player, a following camera, sound effects and a loading manager tie the four levels together.",
        "approach_fr": "Des déplacements physiques avec un saut variable (relâcher tôt pour un petit saut) et des attaques au corps à corps avec temps de recharge. Les ennemis reposent sur de petits comportements réutilisables (patrouille, corps à corps, boules de feu) et les niveaux ajoutent des pièges à flèches, à feu et à pointes. Une barre de vie avec soins, des points de sauvegarde, une caméra qui suit le joueur, des effets sonores et un gestionnaire de chargement relient les quatre niveaux.",
        "outcome_en": "A playable pre-alpha: four levels from the first jumps to the jungle, credited in game “Younes Ouali × CSI”.",
        "outcome_fr": "Une pré-alpha jouable : quatre niveaux, des premiers sauts jusqu'à la jungle, signée dans le jeu « Younes Ouali × CSI ».",
    },
    {
        "slug": "backdoor-escape", "title": "Backdoor Escape", "client_name": "Personal game", "year": 2024,
        "category": CaseStudy.Category.GAME, "order": 8,
        "stack": "Unity, C#, 3D",
        "repo_url": "https://github.com/nightmere33/Horror-Game-3D",
        "tagline_en": "A first-person horror escape set in the backrooms.",
        "tagline_fr": "Une évasion horrifique à la première personne dans les backrooms.",
        "summary_en": "Scavenge lanterns, a gun and the exit key in dark, looping corridors while a chainsaw-wielding monster hunts you. Hide, or fight back.",
        "summary_fr": "Récupérez lanternes, arme et clé de sortie dans des couloirs sombres et sans fin, pendant qu'un monstre armé d'une tronçonneuse vous traque. Cachez-vous, ou ripostez.",
        "role_en": "Game design and development", "role_fr": "Game design et développement",
        "challenge_en": "Horror lives on tension: the player must feel hunted without the game feeling unfair, in a maze that looks the same everywhere.",
        "challenge_fr": "L'horreur vit de la tension : le joueur doit se sentir traqué sans que le jeu paraisse injuste, dans un labyrinthe qui se ressemble partout.",
        "approach_en": "Limited light as the core mechanic: lanterns are both the way forward and what gives you away. A monster that patrols and chases, loot that opens choices (run or fight), and a single key that ends the run. Controls built for AZERTY keyboards.",
        "approach_fr": "La lumière limitée comme mécanique centrale : les lanternes ouvrent le chemin autant qu'elles trahissent votre position. Un monstre qui patrouille et poursuit, des objets qui ouvrent des choix (fuir ou combattre) et une seule clé pour en finir. Des commandes pensées pour les claviers AZERTY.",
    },
    {
        "slug": "crates-ninja", "title": "Crates Ninja", "client_name": "Unity Learn project", "year": 2024,
        "category": CaseStudy.Category.GAME, "order": 9,
        "stack": "Unity, C#, physics, UI",
        "repo_url": "https://github.com/nightmere33/Crates-Ninja-Game",
        "tagline_en": "A fast arcade slicer: hit the crates, spare the bombs.",
        "tagline_fr": "Un jeu d'arcade nerveux : tranchez les caisses, épargnez les bombes.",
        "summary_en": "Built from Unity's Create with Code course and finished into a full game: physics-launched targets, three difficulty levels, scoring, particles and a game-over loop.",
        "summary_fr": "Né du cours Create with Code de Unity et terminé en jeu complet : cibles lancées par la physique, trois niveaux de difficulté, score, particules et boucle de fin de partie.",
        "role_en": "Development", "role_fr": "Développement",
    },
]

TECH = {
    Tech.Category.LANGUAGE: ["Python", "TypeScript", "JavaScript", "Dart", "Java", "C#", "C", "SQL"],
    Tech.Category.WEB: ["Django", "Django REST Framework", "React", "Next.js", "Tailwind CSS", "Node.js", ".NET"],
    Tech.Category.MOBILE: ["Flutter", "Android (Java)"],
    Tech.Category.DATA: ["PostgreSQL", "Redis", "Celery", "Firebase", "REST APIs"],
    Tech.Category.AUTOMATION: ["Selenium", "Playwright", "Web scraping"],
    Tech.Category.MOTION: ["three.js", "GSAP", "Unity", "ffmpeg"],
    Tech.Category.INFRA: ["Linux", "nginx", "Docker", "Git & GitHub", "Microsoft Azure"],
    Tech.Category.EMBEDDED: ["TCP/IP", "Network security", "IoT", "Arduino"],
}

CREDENTIALS = [
    ("Unity Essentials Pathway", "Unity Technologies", None, "", ""),
    ("95 lessons completed · 7 badges · 8,330 XP", "Unity Learn", None, "", ""),
    ("Intro to AI Agents and Agentic AI", "365 Data Science", "2025-11", "CC-5DD6DB1B4C", ""),
    ("Intro to AI", "365 Data Science", "2025-11", "CC-DB38B68893", ""),
    ("Intro to Microsoft Azure", "365 Data Science", "2025-11", "CC-ABF5C37FB1", ""),
    ("SQL", "365 Data Science", "2025-11", "CC-FB24343D0B", ""),
    ("Python 102: Beginner's Power-Up", "365 Data Science", "2025-11", "CC-C13FE38CE5", ""),
    ("Python 101: Kickoff", "365 Data Science", "2025-11", "CC-59A164AADC", ""),
    ("Intro to Shell", "365 Data Science", "2025-11", "CC-0F9A2DCA21", ""),
    ("Git and GitHub", "365 Data Science", "2025-11", "CC-F80DABA46D", ""),
    ("Introduction to Data and Data Science", "365 Data Science", "2025-11", "CC-D6D3CC2464", ""),
    ("Web Creation and Development Training", "GDSC UMMTO, Tizi-Ouzou", "2024-04", "", ""),
]

FAQS = [
    ("How does a project start?", "Comment démarre un projet ?",
     "You send a request with your goals, budget and deadline. I reply within 24 hours, usually with a few questions, then send a written proposal: scope, price, timeline, revisions and what's not included. Work starts once you accept it and the deposit is paid.",
     "Vous envoyez une demande avec vos objectifs, votre budget et votre délai. Je réponds sous 24 heures, souvent avec quelques questions, puis j'envoie une proposition écrite : périmètre, prix, délais, révisions et exclusions. Le travail commence une fois la proposition acceptée et l'acompte réglé."),
    ("How do payments work?", "Comment se passent les paiements ?",
     "A deposit before development starts and the balance at delivery, or per milestone on larger projects. You can pay by CCP or BaridiMob transfer, in cash, or online by CIB/Edahabia card through Chargily. Every payment is tracked in your client space.",
     "Un acompte avant le début du développement et le solde à la livraison, ou par étapes sur les gros projets. Vous pouvez payer par virement CCP ou BaridiMob, en espèces, ou en ligne par carte CIB/Edahabia via Chargily. Chaque paiement est suivi dans votre espace client."),
    ("How long does it take?", "Combien de temps faut-il ?",
     "A landing page takes one to three weeks, a full platform or mobile app four to twelve. Your proposal has a dated timeline, and you follow progress in your client space as it happens.",
     "Une landing page prend une à trois semaines, une plateforme complète ou une application mobile quatre à douze. Votre proposition contient un calendrier daté, et vous suivez l'avancement en temps réel dans votre espace client."),
    ("Can I ask for changes?", "Puis-je demander des modifications ?",
     "Yes. Each proposal includes a number of revision rounds, and you review the work at agreed points rather than only at the end. Changes beyond the agreed scope are quoted before they're done, never after.",
     "Oui. Chaque proposition inclut des tours de révision, et vous validez le travail à des étapes convenues plutôt qu'à la fin. Ce qui dépasse le périmètre est chiffré avant d'être fait, jamais après."),
    ("Who owns the code?", "À qui appartient le code ?",
     "You do. When the balance is paid you receive the source code, the accounts and the credentials for everything that was set up for your project.",
     "À vous. Une fois le solde réglé, vous recevez le code source, les comptes et les accès de tout ce qui a été mis en place pour votre projet."),
    ("Do you work with clients outside Algeria?", "Travaillez-vous avec des clients hors d'Algérie ?",
     "Yes, remotely, in English, French or Arabic. International clients can pay by bank transfer, and PayPal where it's available.",
     "Oui, à distance, en français, anglais ou arabe. Les clients à l'étranger peuvent payer par virement bancaire, et par PayPal là où c'est possible."),
    ("What happens after launch?", "Et après la mise en ligne ?",
     "Bugs found after delivery are fixed free of charge for an agreed period. After that I can keep maintaining and improving the product on a monthly plan.",
     "Les bugs découverts après la livraison sont corrigés gratuitement pendant une période convenue. Ensuite, je peux continuer à maintenir et faire évoluer le produit avec un forfait mensuel."),
]


def repeats(manifest: dict) -> set[str]:
    """Gallery files that would show footage already on their page.

    Per project, the cover's seconds come first; then clips, then galaxy cuts
    that double as clips, each kept only if it overlaps nothing kept so far by
    at least a second of the same recording; then photos grabbed from video,
    kept only if their frame is in nothing kept. Entries without provenance
    (older manifests, plain photos) are always kept.
    """
    def overlap(a, b):
        if a.get("src") is None or a.get("src") != b.get("src"):
            return 0.0
        a_end = a["end"] if a["end"] is not None else float("inf")
        b_end = b["end"] if b["end"] is not None else float("inf")
        return min(a_end, b_end) - max(a["start"], b["start"])

    kept: dict[str, list[dict]] = {}
    for cover in manifest.get("covers", []):
        kept.setdefault(cover["slug"], []).append(cover)
    hidden: set[str] = set()
    with_clips = {c["slug"] for c in manifest.get("clips", [])}
    videos = manifest.get("clips", []) + [g for g in manifest.get("galaxy", []) if g["slug"] not in with_clips]
    for item in videos:
        mine = kept.setdefault(item["slug"], [])
        if any(overlap(item, k) >= 1.0 for k in mine):
            hidden.add(item["file"])
        else:
            mine.append(item)
    for still in manifest.get("stills", []):
        if still.get("src") and any(overlap({**still, "end": still["start"] + 0.01}, k) > 0 for k in kept.get(still["slug"], [])):
            hidden.add(still["file"])
    return hidden


class Command(BaseCommand):
    help = "Seed public content and attach built media (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--update", action="store_true", help="Overwrite existing copy too")

    @transaction.atomic
    def handle(self, *args, update=False, **options):
        site = SiteSettings.load()
        for key, value in SITE.items():
            if update or not getattr(site, key):
                setattr(site, key, value)
        site.save()

        for data in SERVICES:
            self._upsert(Service, data, update)
        # Retired services stay in the database (requests point to them) but leave the site.
        Service.objects.filter(slug__in=RETIRED_SERVICES).update(active=False)
        for data in CASE_STUDIES:
            self._upsert(CaseStudy, {"published": True, **data}, update)

        for category, names in TECH.items():
            for i, name in enumerate(names):
                Tech.objects.update_or_create(name=name, defaults={"category": category, "order": i})

        for i, (title, issuer, issued, cred_id, url) in enumerate(CREDENTIALS):
            issued_on = datetime.date.fromisoformat(f"{issued}-01") if issued else None
            Credential.objects.update_or_create(
                title=title, issuer=issuer,
                defaults={"issued_on": issued_on, "credential_id": cred_id, "url": url, "order": i},
            )

        for i, (q_en, q_fr, a_en, a_fr) in enumerate(FAQS):
            faq, created = FAQ.objects.get_or_create(question_en=q_en, defaults={"answer_en": a_en})
            if created or update:
                faq.question_fr, faq.answer_en, faq.answer_fr, faq.order = q_fr, a_en, a_fr, i
                faq.save()

        self._attach_media()
        self.stdout.write(self.style.SUCCESS("Content seeded."))

    def _upsert(self, model, data, update):
        obj, created = model.objects.get_or_create(slug=data["slug"], defaults=data)
        if update and not created:
            for key, value in data.items():
                setattr(obj, key, value)
            obj.save()

    def _attach_media(self):
        """Point the case studies at the files scripts/media/build_media.py produced."""
        manifest_path = settings.MEDIA_ROOT / "work" / "manifest.json"
        if not manifest_path.exists():
            self.stdout.write(self.style.WARNING("No media manifest; run scripts/media/build_media.py first."))
            return
        manifest = json.loads(manifest_path.read_text())
        studies = {s.slug: s for s in CaseStudy.objects.all()}

        reel = manifest.get("reel")
        if reel:
            site = SiteSettings.load()
            site.showreel.name, site.showreel_av1.name = reel["file"], reel.get("file_av1", "")
            site.showreel_poster.name = reel["poster"]
            site.showreel_width, site.showreel_height = reel["width"], reel["height"]
            site.save()

        for cover in manifest.get("covers", []):
            study = studies.get(cover["slug"])
            if study:
                study.cover_video.name, study.cover_video_av1.name = cover["file"], cover.get("file_av1", "")
                study.cover_image.name = cover["poster"]
                study.cover_width, study.cover_height = cover["width"], cover["height"]
                study.save(update_fields=["cover_video", "cover_video_av1", "cover_image", "cover_width", "cover_height"])

        for film in manifest.get("films", []):
            study = studies.get(film["slug"])
            if study:
                study.film.name, study.film_av1.name, study.film_poster.name = film["file"], film["file_av1"], film["poster"]
                study.film_width, study.film_height, study.film_duration = film["width"], film["height"], film["duration"]
                study.save(update_fields=["film", "film_av1", "film_poster", "film_width", "film_height", "film_duration"])

        for logo in manifest.get("logos", []):
            study = studies.get(logo["slug"])
            if study:
                study.logo.name, study.logo_mark.name = logo["logo"], logo["mark"]
                study.save(update_fields=["logo", "logo_mark"])

        def media(slug, file, kind, order, **fields):
            study = studies.get(slug)
            if not study:
                return
            item, _ = CaseStudyMedia.objects.get_or_create(case_study=study, file=file, defaults={"kind": kind})
            item.kind, item.order = kind, order
            for key, value in fields.items():
                if key in ("poster", "file_av1"):
                    getattr(item, key).name = value
                else:
                    setattr(item, key, value)
            item.save()

        hidden = repeats(manifest)

        # Photos first (orders 0-49), then feature clips (50+), then the galaxy cuts (100+).
        for i, still in enumerate(manifest.get("stills", [])):
            media(still["slug"], still["file"], CaseStudyMedia.Kind.IMAGE, i, width=still["width"], height=still["height"],
                  caption_en=still.get("caption_en", still.get("caption", "")), caption_fr=still.get("caption_fr", ""),
                  in_gallery=still["file"] not in hidden, in_galaxy=False)
        for i, clip in enumerate(manifest.get("clips", [])):
            media(clip["slug"], clip["file"], CaseStudyMedia.Kind.VIDEO, 50 + i, file_av1=clip["file_av1"], poster=clip["poster"],
                  width=clip["width"], height=clip["height"], caption_en=clip["caption_en"], caption_fr=clip["caption_fr"],
                  in_gallery=clip["file"] not in hidden, in_galaxy=False)
        # Pipeline media dropped from the manifest goes too (admin uploads live outside work/).
        keep = {m["file"] for key in ("stills", "clips", "galaxy", "galaxy_photos") for m in manifest.get(key, [])}
        CaseStudyMedia.objects.filter(file__startswith="work/").exclude(file__in=keep).delete()
        # Feature photos in the galaxy (small copies; the gallery has the full ones).
        for i, photo in enumerate(manifest.get("galaxy_photos", [])):
            media(photo["slug"], photo["file"], CaseStudyMedia.Kind.IMAGE, 200 + i, width=photo["width"], height=photo["height"],
                  in_gallery=False, in_galaxy=True)
        # Galaxy cuts double as gallery clips only for projects without clips of their own.
        with_clips = {c["slug"] for c in manifest.get("clips", [])}
        for i, clip in enumerate(manifest.get("galaxy", [])):
            media(clip["slug"], clip["file"], CaseStudyMedia.Kind.VIDEO, 100 + i, file_av1=clip.get("file_av1", ""),
                  poster=clip["poster"], width=clip["width"], height=clip["height"], in_galaxy=True,
                  in_gallery=clip["slug"] not in with_clips and clip["file"] not in hidden)
