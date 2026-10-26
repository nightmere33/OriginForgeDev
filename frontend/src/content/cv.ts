import type { Locale } from "@/i18n/dictionaries";

/**
 * CV-only copy. Projects, stack and certificates come from the CMS so the CV
 * and the site never disagree; this file holds what only the CV says.
 * Edit freely, then run `npm run cv:pdf` to refresh the downloadable PDFs.
 */
export type CvCopy = {
  title: string;
  profile: string;
  labels: Record<"profile" | "experience" | "projects" | "education" | "skills" | "certificates" | "languages" | "contact" | "download" | "print", string>;
  experience: { role: string; org: string; period: string; points: string[] }[];
  education: { degree: string; school: string; period: string }[];
  languages: string;
};

const EN: CvCopy = {
  title: "Full-stack developer: web platforms, mobile apps, payments & automation",
  profile:
    "Full-stack developer who ships complete products end to end: interface, backend, payments, deployment and the launch film. " +
    "Founder of Alquilar, a rental platform for Algeria, and builder of MediGate, a medical revision platform taking live card payments. " +
    "Master 2 student (final year) in Mobile Networks & Embedded Systems.",
  labels: {
    profile: "Profile", experience: "Experience", projects: "Selected projects", education: "Education", skills: "Skills",
    certificates: "Certificates", languages: "Languages", contact: "Contact", download: "Download PDF", print: "Print",
  },
  experience: [
    {
      role: "Freelance full-stack developer", org: "OriginForge", period: "2023 to present",
      points: [
        "Design, build and deploy web platforms, mobile apps and automation for clients in Algeria and abroad.",
        "Own the full lifecycle: scoping, written proposals, development, payments integration, hosting and support.",
        "Produce launch films rendered in code (three.js) from the real product, in Arabic, French and English.",
      ],
    },
    {
      role: "Founder & engineer", org: "Alquilar", period: "2026 to present",
      points: [
        "Built the Flutter app, the companion website and the Django admin panel of a short-term rental platform.",
        "Designed cash check-in and online card payments (Chargily) with configurable fees, payment windows and host payouts.",
      ],
    },
    {
      role: "Full-stack engineer (client project)", org: "MediGate", period: "2026",
      points: [
        "Built a Django 6 / PostgreSQL / Celery revision platform for medical students, sold module by module.",
        "Integrated Chargily Pay v2 (signed webhooks, reconciliation, expiry) and a review queue for CCP/BaridiMob receipts.",
        "Provisioned the VPS with scripted deploys, backups and one-command rollback.",
      ],
    },
  ],
  education: [
    { degree: "Master 2, Mobile Networks & Embedded Systems (RMSE)", school: "Université Mouloud Mammeri, Tizi-Ouzou", period: "Final year" },
    { degree: "Bachelor's in Computer Science, Information Systems (SI)", school: "Université Mouloud Mammeri, Tizi-Ouzou", period: "" },
  ],
  languages: "Arabic · French · English",
};

const FR: CvCopy = {
  title: "Développeur full-stack : plateformes web, applications mobiles, paiements & automatisation",
  profile:
    "Développeur full-stack qui livre des produits complets de bout en bout : interface, backend, paiements, mise en ligne et film de lancement. " +
    "Fondateur d'Alquilar, plateforme de location en Algérie, et concepteur de MediGate, plateforme de révision médicale avec paiement par carte. " +
    "Étudiant en Master 2 (dernière année) Réseaux Mobiles et Systèmes Embarqués.",
  labels: {
    profile: "Profil", experience: "Expérience", projects: "Projets choisis", education: "Formation", skills: "Compétences",
    certificates: "Certificats", languages: "Langues", contact: "Contact", download: "Télécharger le PDF", print: "Imprimer",
  },
  experience: [
    {
      role: "Développeur full-stack freelance", org: "OriginForge", period: "2023 à aujourd'hui",
      points: [
        "Conception, développement et mise en ligne de plateformes web, d'applications mobiles et d'automatisations pour des clients en Algérie et à l'étranger.",
        "Prise en charge du cycle complet : cadrage, propositions écrites, développement, intégration des paiements, hébergement et suivi.",
        "Réalisation de films de lancement rendus en code (three.js) à partir du vrai produit, en arabe, français et anglais.",
      ],
    },
    {
      role: "Fondateur & ingénieur", org: "Alquilar", period: "2026 à aujourd'hui",
      points: [
        "Développement de l'application Flutter, du site compagnon et du back-office Django d'une plateforme de location courte durée.",
        "Conception du paiement en espèces à l'arrivée et par carte en ligne (Chargily), avec frais, délais de paiement et versements aux hôtes configurables.",
      ],
    },
    {
      role: "Ingénieur full-stack (projet client)", org: "MediGate", period: "2026",
      points: [
        "Développement d'une plateforme de révision Django 6 / PostgreSQL / Celery pour étudiants en médecine, vendue module par module.",
        "Intégration de Chargily Pay v2 (webhooks signés, rapprochement, expiration) et d'une file de validation des reçus CCP/BaridiMob.",
        "Installation du VPS avec déploiements scriptés, sauvegardes et retour arrière en une commande.",
      ],
    },
  ],
  education: [
    { degree: "Master 2, Réseaux Mobiles et Systèmes Embarqués (RMSE)", school: "Université Mouloud Mammeri, Tizi-Ouzou", period: "Dernière année" },
    { degree: "Licence en informatique, Systèmes d'Information (SI)", school: "Université Mouloud Mammeri, Tizi-Ouzou", period: "" },
  ],
  languages: "Arabe · Français · Anglais",
};

export function getCv(lang: Locale): CvCopy {
  return lang === "fr" ? FR : EN;
}
