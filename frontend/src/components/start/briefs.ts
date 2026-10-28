import type { Locale } from "@/i18n/dictionaries";

/**
 * What the request form asks for each service (the "Project" step). Each
 * service gets the questions a studio asks before quoting that kind of work,
 * drawn from agency briefs for websites, apps, desktop software, automation
 * and video: what it is, who uses it, what already exists, where it runs, and
 * what the result must plug into. Anything priced is asked in the calculator
 * instead (pages, platforms, film length...), never twice.
 *
 * Answers are saved in the request's `brief` (keys below); the studio reads
 * them back through the same labels.
 */

type Text = { en: string; fr: string };
type Option = { value: string; label: Text };
export type Question =
  | { key: string; kind: "one" | "many"; label: Text; help?: Text; options: Option[] }
  | { key: string; kind: "text" | "long"; label: Text; help?: Text; placeholder?: Text | string };

export type Brief = {
  title: Text;
  titleHelp: Text;
  goal: Text;
  goalHelp: Text;
  details: Text;
  detailsHelp: Text;
  /** Feature chips offered (none for films and automation). */
  features: string[];
  questions: Question[];
};

const t = (en: string, fr: string): Text => ({ en, fr });
const o = (value: string, en: string, fr: string): Option => ({ value, label: { en, fr } });

export const FEATURES: Record<string, Text> = {
  accounts: t("User accounts", "Comptes utilisateurs"),
  roles: t("Roles and permissions", "Rôles et permissions"),
  payments: t("Online payments", "Paiement en ligne"),
  admin: t("Admin back-office", "Back-office"),
  i18n: t("Several languages", "Plusieurs langues"),
  booking: t("Booking / reservations", "Réservations"),
  ecommerce: t("Store & cart", "Boutique & panier"),
  subscriptions: t("Subscriptions", "Abonnements"),
  multivendor: t("Several sellers", "Plusieurs vendeurs"),
  realtime: t("Chat / real time", "Chat / temps réel"),
  maps: t("Maps & location", "Cartes & localisation"),
  notifications: t("E-mail / push notifications", "Notifications e-mail / push"),
  analytics: t("Dashboards & stats", "Tableaux de bord & statistiques"),
  dashboard: t("Dashboard & stats", "Tableau de bord & statistiques"),
  search: t("Search & filters", "Recherche & filtres"),
  files: t("File uploads", "Envoi de fichiers"),
  api: t("API / integrations", "API / intégrations"),
  mobile_app: t("Mobile app", "Application mobile"),
  automation: t("Automation / bots", "Automatisation / bots"),
  seo: t("SEO", "Référencement (SEO)"),
  contact_form: t("Contact form", "Formulaire de contact"),
  whatsapp: t("WhatsApp / call button", "Bouton WhatsApp / appel"),
  blog: t("Blog / news", "Blog / actualités"),
  gallery: t("Photo & video gallery", "Galerie photos & vidéos"),
  newsletter: t("Newsletter sign-up", "Inscription newsletter"),
  offline: t("Works offline", "Fonctionne hors ligne"),
  camera: t("Camera / QR scan", "Appareil photo / scan QR"),
  sync: t("Sync between devices", "Synchronisation entre appareils"),
  reports: t("Reports (PDF, Excel)", "Rapports (PDF, Excel)"),
  printing: t("Printing (receipts, invoices)", "Impression (tickets, factures)"),
  barcode: t("Barcode scanning", "Lecture de codes-barres"),
  backup: t("Automatic backups", "Sauvegardes automatiques"),
  licensing: t("Licence keys / activation", "Clés de licence / activation"),
  import: t("Import from Excel", "Import depuis Excel"),
};

// Shared questions.
const DESIGN: Question = {
  key: "design", kind: "one", label: t("Design material", "Éléments de design"),
  options: [
    o("mockups", "I have mock-ups (Figma, sketches)", "J'ai des maquettes (Figma, croquis)"),
    o("brand", "I have a logo and colours", "J'ai un logo et des couleurs"),
    o("none", "Nothing yet: design it for me", "Rien encore : concevez-le pour moi"),
  ],
};
const START: Question = {
  key: "start", kind: "one", label: t("Starting point", "Point de départ"),
  options: [
    o("scratch", "From scratch", "De zéro"),
    o("replace", "Replacing an existing system", "Remplacer un système existant"),
    o("extend", "Adding to something that exists", "Compléter un existant"),
  ],
};
const USERS: Question = {
  key: "scale", kind: "one", label: t("Users in the first year", "Utilisateurs la première année"),
  options: [o("100", "Under 100", "Moins de 100"), o("1k", "100 to 1 000", "100 à 1 000"), o("10k", "1 000 to 10 000", "1 000 à 10 000"), o("more", "More", "Plus")],
};
const HOSTING: Question = {
  key: "hosting", kind: "one", label: t("Domain and hosting", "Domaine et hébergement"),
  options: [
    o("have", "I already have them", "Je les ai déjà"),
    o("setup", "Set them up for me", "Mettez-les en place pour moi"),
    o("unsure", "Not sure", "Je ne sais pas"),
  ],
};

export const BRIEFS: Record<string, Brief> = {
  "web-platforms": {
    title: t("Platform name", "Nom de la plateforme"),
    titleHelp: t("A working name is fine, e.g. \"Booking platform for driving schools\".", "Un nom provisoire suffit, ex. « Plateforme de réservation pour auto-écoles »."),
    goal: t("What must it do for the business?", "Que doit-elle faire pour l'activité ?"),
    goalHelp: t("Who uses it, the main thing they do on it, and how it makes or saves money.", "Qui l'utilise, ce qu'on y fait surtout, et comment elle rapporte ou fait gagner du temps."),
    details: t("Rules and must-haves (optional)", "Règles et indispensables (facultatif)"),
    detailsHelp: t("Business rules, statuses, fees, anything already decided.", "Règles métier, statuts, frais, tout ce qui est déjà décidé."),
    features: ["accounts", "roles", "payments", "admin", "booking", "ecommerce", "subscriptions", "multivendor", "realtime", "notifications", "search", "files", "maps", "analytics", "i18n", "api", "seo"],
    questions: [
      {
        key: "kind", kind: "one", label: t("Kind of platform", "Type de plateforme"),
        options: [
          o("marketplace", "Marketplace", "Place de marché"), o("booking", "Booking & reservations", "Réservations"),
          o("saas", "Subscription tool (SaaS)", "Outil par abonnement (SaaS)"), o("portal", "Client portal / dashboard", "Portail client / tableau de bord"),
          o("internal", "Internal business tool", "Outil interne"), o("other", "Something else", "Autre"),
        ],
      },
      {
        key: "sides", kind: "one", label: t("Who uses it", "Qui l'utilise"),
        options: [
          o("customers", "Customers only", "Les clients seulement"), o("staff", "Customers and my team", "Les clients et mon équipe"),
          o("two-sided", "Two sides (buyers and sellers, guests and hosts)", "Deux côtés (acheteurs et vendeurs, voyageurs et hôtes)"),
          o("team", "My team only", "Mon équipe seulement"),
        ],
      },
      USERS,
      START,
      { key: "migration", kind: "long", label: t("Data to bring over (optional)", "Données à reprendre (facultatif)"), help: t("Spreadsheets, an old system's export, how many records.", "Tableurs, export d'un ancien système, nombre d'enregistrements.") },
      { key: "integrations", kind: "text", label: t("Services it must talk to (optional)", "Services à connecter (facultatif)"), placeholder: "Chargily, Google Sheets, SMS, Yalidine…" },
      DESIGN,
      HOSTING,
    ],
  },
  websites: {
    title: t("Site name", "Nom du site"),
    titleHelp: t("Your business or the site's name, e.g. \"Atlas Dental\".", "Votre activité ou le nom du site, ex. « Cabinet Atlas »."),
    goal: t("What should a visitor do on it?", "Que doit faire un visiteur sur le site ?"),
    goalHelp: t("Who you want to reach and the one action that counts: call, book, buy, ask for a quote.", "Qui vous voulez toucher et l'action qui compte : appeler, réserver, acheter, demander un devis."),
    details: t("Sections and content (optional)", "Rubriques et contenu (facultatif)"),
    detailsHelp: t("The pages you picture, what each one says, anything that must appear.", "Les pages imaginées, ce que dit chacune, ce qui doit absolument figurer."),
    features: ["contact_form", "whatsapp", "booking", "ecommerce", "gallery", "blog", "newsletter", "maps", "i18n", "analytics", "seo"],
    questions: [
      {
        key: "kind", kind: "one", label: t("Kind of site", "Type de site"),
        options: [
          o("landing", "Landing page", "Landing page"), o("company", "Company / showcase site", "Site vitrine"),
          o("portfolio", "Portfolio", "Portfolio"), o("shop", "Online shop", "Boutique en ligne"),
          o("event", "Event or launch page", "Page d'événement ou de lancement"), o("blog", "Blog / magazine", "Blog / magazine"),
        ],
      },
      {
        key: "content", kind: "one", label: t("Texts and photos", "Textes et photos"),
        options: [o("ready", "Ready", "Prêts"), o("partly", "Partly ready", "En partie prêts"), o("none", "Not yet", "Pas encore")],
      },
      DESIGN,
      HOSTING,
      { key: "current", kind: "text", label: t("Current site (optional)", "Site actuel (facultatif)"), placeholder: "https://" },
    ],
  },
  "mobile-apps": {
    title: t("App name", "Nom de l'application"),
    titleHelp: t("A working name is fine, e.g. \"Delivery app for my restaurant\".", "Un nom provisoire suffit, ex. « Appli de livraison pour mon restaurant »."),
    goal: t("What will people do with the app?", "Que feront les gens avec l'application ?"),
    goalHelp: t("Who installs it, what they do most, and why they come back.", "Qui l'installe, ce qu'on y fait le plus, et pourquoi on y revient."),
    details: t("Screens and must-haves (optional)", "Écrans et indispensables (facultatif)"),
    detailsHelp: t("The main screens, rules, anything already decided.", "Les écrans principaux, les règles, tout ce qui est déjà décidé."),
    features: ["accounts", "payments", "notifications", "maps", "camera", "offline", "realtime", "booking", "ecommerce", "admin", "analytics", "i18n"],
    questions: [
      {
        key: "kind", kind: "one", label: t("Kind of app", "Type d'application"),
        options: [
          o("business", "An app for my customers", "Une appli pour mes clients"), o("marketplace", "Marketplace / delivery", "Place de marché / livraison"),
          o("booking", "Booking", "Réservation"), o("community", "Social / community", "Social / communauté"),
          o("team", "A tool for my team", "Un outil pour mon équipe"), o("other", "Something else", "Autre"),
        ],
      },
      {
        key: "backend", kind: "one", label: t("Server and admin", "Serveur et administration"),
        options: [
          o("build", "Build them too", "À construire aussi"), o("have", "I already have an API", "J'ai déjà une API"),
          o("none", "No server needed", "Pas de serveur"),
        ],
      },
      {
        key: "stores", kind: "one", label: t("Store accounts", "Comptes des stores"),
        options: [
          o("have", "I have Google Play / App Store accounts", "J'ai les comptes Google Play / App Store"),
          o("publish", "Publish it for me", "Publiez-la pour moi"), o("unsure", "Not sure yet", "Pas encore décidé"),
        ],
      },
      USERS,
      DESIGN,
    ],
  },
  "windows-software": {
    title: t("Software name", "Nom du logiciel"),
    titleHelp: t("A working name is fine, e.g. \"Stock and sales for my shop\".", "Un nom provisoire suffit, ex. « Stock et ventes pour ma boutique »."),
    goal: t("What should the software handle?", "Que doit gérer le logiciel ?"),
    goalHelp: t("The daily work it replaces, who uses it, and what you want to see at the end of the day.", "Le travail quotidien qu'il remplace, qui l'utilise, et ce que vous voulez voir en fin de journée."),
    details: t("Screens, rules and documents (optional)", "Écrans, règles et documents (facultatif)"),
    detailsHelp: t("Invoices or receipts to print, statuses, calculations, anything already decided.", "Factures ou tickets à imprimer, statuts, calculs, tout ce qui est déjà décidé."),
    features: ["accounts", "roles", "reports", "printing", "barcode", "import", "backup", "dashboard", "sync", "licensing", "i18n"],
    questions: [
      {
        key: "kind", kind: "one", label: t("Kind of software", "Type de logiciel"),
        options: [
          o("management", "Business management (stock, sales, clients)", "Gestion (stock, ventes, clients)"), o("pos", "Point of sale (cash register)", "Caisse / point de vente"),
          o("tool", "A tool that processes files or data", "Un outil qui traite des fichiers ou des données"), o("device", "Controlling a device or machine", "Pilotage d'un appareil ou d'une machine"),
          o("other", "Something else", "Autre"),
        ],
      },
      {
        key: "today", kind: "one", label: t("Today you use", "Aujourd'hui vous utilisez"),
        options: [o("paper", "Paper", "Du papier"), o("excel", "Excel", "Excel"), o("software", "Another program (to replace)", "Un autre logiciel (à remplacer)"), o("nothing", "Nothing yet", "Rien encore")],
      },
      {
        key: "seats", kind: "one", label: t("People using it", "Nombre d'utilisateurs"),
        options: [o("1", "1", "1"), o("5", "2 to 5", "2 à 5"), o("20", "6 to 20", "6 à 20"), o("more", "More than 20", "Plus de 20")],
      },
      {
        key: "windows", kind: "one", label: t("Computers", "Ordinateurs"),
        options: [o("modern", "Windows 10 or 11", "Windows 10 ou 11"), o("old", "Some run Windows 7 or 8", "Certains sous Windows 7 ou 8"), o("unsure", "Not sure", "Je ne sais pas")],
      },
      { key: "devices", kind: "text", label: t("Printers, scanners or machines to connect (optional)", "Imprimantes, scanners ou machines à connecter (facultatif)"), placeholder: "Xprinter 80 mm, Honeywell…" },
      { key: "migration", kind: "long", label: t("Data to import (optional)", "Données à importer (facultatif)"), help: t("Product lists, clients, history: in which file, how many lines.", "Liste de produits, clients, historique : dans quel fichier, combien de lignes.") },
    ],
  },
  automation: {
    title: t("Task name", "Nom de la tâche"),
    titleHelp: t("e.g. \"Daily price watch on 3 sites\".", "ex. « Veille des prix quotidienne sur 3 sites »."),
    goal: t("What should run without you?", "Que doit-on faire tourner sans vous ?"),
    goalHelp: t("The task as you do it by hand today, step by step, and how long it takes you.", "La tâche telle que vous la faites à la main aujourd'hui, étape par étape, et le temps qu'elle vous prend."),
    details: t("Rules and exceptions (optional)", "Règles et exceptions (facultatif)"),
    detailsHelp: t("Which data, filters, what to do when something is missing.", "Quelles données, quels filtres, que faire quand il manque quelque chose."),
    features: [],
    questions: [
      {
        key: "kind", kind: "one", label: t("Kind of automation", "Type d'automatisation"),
        options: [
          o("scraping", "Collect data from websites", "Collecter des données sur des sites"), o("web-task", "Do a web task for me (forms, posting)", "Faire une tâche web à ma place (formulaires, publications)"),
          o("sheets", "Spreadsheets and reports", "Tableurs et rapports"), o("integration", "Connect two tools", "Connecter deux outils"),
          o("bot", "A bot (Telegram, Discord, WhatsApp)", "Un bot (Telegram, Discord, WhatsApp)"), o("other", "Something else", "Autre"),
        ],
      },
      { key: "sources", kind: "long", label: t("Sites or tools involved", "Sites ou outils concernés"), help: t("Links, one per line.", "Les liens, un par ligne."), placeholder: "https://" },
      { key: "fields", kind: "text", label: t("Data to collect or fill (optional)", "Données à collecter ou remplir (facultatif)"), placeholder: t("Name, price, stock, date…", "Nom, prix, stock, date…") },
      {
        key: "frequency", kind: "one", label: t("How often", "À quelle fréquence"),
        options: [o("once", "Once", "Une fois"), o("daily", "Every day", "Chaque jour"), o("hourly", "Every hour", "Chaque heure"), o("live", "In real time", "En temps réel"), o("on-demand", "When I click", "Quand je clique")],
      },
      {
        key: "volume", kind: "one", label: t("Records each run", "Enregistrements par exécution"),
        options: [o("1k", "Under 1 000", "Moins de 1 000"), o("10k", "1 000 to 10 000", "1 000 à 10 000"), o("100k", "10 000 to 100 000", "10 000 à 100 000"), o("more", "More", "Plus")],
      },
      {
        key: "login", kind: "one", label: t("Behind a login?", "Derrière une connexion ?"),
        options: [o("no", "No", "Non"), o("yes", "Yes, with my account", "Oui, avec mon compte"), o("unsure", "Not sure", "Je ne sais pas")],
      },
    ],
  },
  "product-films": {
    title: t("Product or brand", "Produit ou marque"),
    titleHelp: t("What the film is about, e.g. \"Launch of the Alquilar app\".", "Le sujet du film, ex. « Lancement de l'appli Alquilar »."),
    goal: t("What is the film for?", "À quoi sert le film ?"),
    goalHelp: t("Who should watch it, the one message they must remember, and what they do next.", "Qui doit le voir, le message à retenir, et ce qu'ils font ensuite."),
    details: t("Ideas and must-haves (optional)", "Idées et indispensables (facultatif)"),
    detailsHelp: t("Scenes you picture, words or offers to show, things to avoid.", "Scènes imaginées, mots ou offres à montrer, choses à éviter."),
    features: [],
    questions: [
      {
        key: "kind", kind: "one", label: t("Kind of film", "Type de film"),
        options: [
          o("launch", "App or product launch", "Lancement d'appli ou de produit"), o("ad", "Ad for social media", "Pub pour les réseaux sociaux"),
          o("explainer", "Explainer", "Vidéo explicative"), o("tutorial", "Tutorial / demo", "Tutoriel / démo"), o("showreel", "Showreel", "Showreel"),
        ],
      },
      {
        key: "channels", kind: "many", label: t("Where it will play", "Où il sera diffusé"),
        options: [
          o("instagram", "Instagram & Facebook", "Instagram & Facebook"), o("tiktok", "TikTok", "TikTok"), o("youtube", "YouTube", "YouTube"),
          o("website", "My website", "Mon site"), o("screen", "Screens at events or in store", "Écrans en salon ou en boutique"),
        ],
      },
      {
        key: "material", kind: "many", label: t("What you can send", "Ce que vous pouvez envoyer"),
        options: [
          o("app", "The app or site to film", "L'appli ou le site à filmer"), o("photos", "Product photos", "Photos du produit"),
          o("brand", "Logo and brand colours", "Logo et couleurs"), o("script", "A script", "Un script"), o("nothing", "Nothing yet", "Rien encore"),
        ],
      },
      {
        key: "script", kind: "one", label: t("Script", "Script"),
        options: [o("have", "I have it", "Je l'ai"), o("together", "Write it with me", "À écrire ensemble"), o("you", "Write it for me", "Écrivez-le pour moi")],
      },
      {
        key: "tone", kind: "one", label: t("Tone", "Ton"),
        options: [
          o("energetic", "Energetic", "Énergique"), o("premium", "Premium and calm", "Premium et posé"), o("friendly", "Friendly", "Chaleureux"),
          o("corporate", "Serious", "Sérieux"), o("fun", "Fun", "Drôle"),
        ],
      },
      { key: "cta", kind: "text", label: t("Last words on screen (optional)", "Derniers mots à l'écran (facultatif)"), placeholder: t("Download on Google Play", "Téléchargez sur Google Play") },
    ],
  },
  "": {
    title: t("Project name", "Nom du projet"),
    titleHelp: t("A few words, e.g. \"2D game for a school\".", "Quelques mots, ex. « Jeu 2D pour une école »."),
    goal: t("What must it achieve?", "Que doit-il accomplir ?"),
    goalHelp: t("Who uses it, what problem it solves, what success looks like.", "Qui l'utilise, quel problème il résout, à quoi ressemble la réussite."),
    details: t("Requirements (optional)", "Exigences (facultatif)"),
    detailsHelp: t("Must-haves, platforms, anything already decided.", "Indispensables, plateformes, tout ce qui est déjà décidé."),
    features: ["accounts", "payments", "admin", "i18n", "realtime", "maps", "notifications", "analytics", "api", "mobile_app", "automation", "seo"],
    questions: [
      {
        key: "kind", kind: "one", label: t("Closest to", "Ça ressemble à"),
        options: [
          o("game", "A game (Unity, PC or Android)", "Un jeu (Unity, PC ou Android)"), o("software", "Another kind of software", "Un autre type de logiciel"),
          o("advice", "I need advice first", "J'ai d'abord besoin d'un conseil"), o("unsure", "Not sure yet", "Je ne sais pas encore"),
        ],
      },
    ],
  },
};

export const briefFor = (service: string): Brief => BRIEFS[service] ?? BRIEFS[""];

export const say = (lang: Locale, text: Text | string) => (typeof text === "string" ? text : lang === "fr" ? text.fr : text.en);

export const featureLabel = (lang: Locale, key: string) => (FEATURES[key] ? say(lang, FEATURES[key]) : key);

/** The brief as label / answer pairs, in the order the form asks (studio, review). */
export function briefRows(lang: Locale, service: string, answers: Record<string, string | string[]>) {
  // A request whose service is gone (or changed) still shows every answer it has.
  const known = Object.values(BRIEFS).flatMap((b) => b.questions);
  const order = [...briefFor(service).questions, ...known.filter((q) => !briefFor(service).questions.includes(q))];
  const seen = new Set<string>();
  return order.flatMap((q) => {
    const value = answers[q.key];
    if (seen.has(q.key) || value === undefined || value === "" || (Array.isArray(value) && !value.length)) return [];
    seen.add(q.key);
    const name = (v: string) => ("options" in q ? q.options.find((x) => x.value === v) : undefined);
    const shown = Array.isArray(value)
      ? value.map((v) => (name(v) ? say(lang, name(v)!.label) : v)).join(" · ")
      : name(value) ? say(lang, name(value)!.label) : value;
    return [{ key: q.key, label: say(lang, q.label), value: shown }];
  });
}
