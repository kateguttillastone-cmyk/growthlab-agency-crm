// GAC Pilot — icônes du système de design (SVG intégré, aucune ressource externe). Fichier livré par le designer (étape 4) :
// seule la fonction <Icon> est adaptée (classes .i / .i-16 de gac-components.css, pour que les boutons et pastilles règlent la taille).
// Grille 24, trait 1,75 (2,2 sous 14 px), extrémités arrondies, couleur héritée (currentColor).
// Usage :
//   <Icon name="phone" />                          décorative (à côté d'un texte) : aria-hidden
//   <Icon name="close" label="Fermer la fiche" />  seule : rôle img + libellé
//   <Icon name="search" size={16} className="text-muted" />
import type { ReactElement, SVGProps } from "react";

const paths = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ), // Tableau de bord
  leads: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
      <path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.8.7 3 2.4 3.5 5.2" />
    </>
  ), // Leads
  phone: (
    <>
      <path d="M5 3.5h3.2l1.6 4.2-2.1 1.4a11 11 0 0 0 7.2 7.2l1.4-2.1 4.2 1.6V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5z" />
    </>
  ), // Appels
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </>
  ), // E-mails
  pipeline: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="17" y="4" width="4" height="7" rx="1.5" />
    </>
  ), // Pipeline
  sourcing: (
    <>
      <circle cx="11" cy="11" r="7" />
      <circle cx="11" cy="11" r="2.5" />
      <path d="m16.2 16.2 4.3 4.3" />
    </>
  ), // Sourcing
  contacts: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10.5" r="2.5" />
      <path d="M5.5 17c.6-1.8 1.9-2.8 3.5-2.8s2.9 1 3.5 2.8M15 9h3M15 13h3" />
    </>
  ), // Contacts
  ban: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </>
  ), // Adresses exclues
  users: (
    <>
      <circle cx="10" cy="8" r="4" />
      <path d="M3 20c.9-3.8 3.6-6 7-6 1.3 0 2.5.3 3.5.9" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M18 13v1.5M18 19.5V21M14 17h1.5M20.5 17H22" />
    </>
  ), // Utilisateurs
  upload: (
    <>
      <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
      <path d="M4 14.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-4.5" />
    </>
  ), // Import
  audit: (
    <>
      <path d="M8.5 6H20M8.5 12H20M8.5 18H20" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="2.6" />
    </>
  ), // Journal d'audit
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ), // Réglages
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c1-4 4-6.5 8-6.5s7 2.5 8 6.5" />
    </>
  ), // Mon profil
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ), // Menu
  more: (
    <>
      <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />
    </>
  ), // Plus
  logout: (
    <>
      <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </>
  ), // Se déconnecter
  "user-plus": (
    <>
      <circle cx="10" cy="8" r="4" />
      <path d="M3 20.5c.9-3.8 3.6-6.5 7-6.5 1.6 0 3 .5 4.2 1.4M18 14v6M15 17h6" />
    </>
  ), // Créer un compte
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ), // Rechercher
  filter: (
    <>
      <path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" />
    </>
  ), // Filtrer
  sort: (
    <>
      <path d="M8 4v16M4.5 16.5 8 20l3.5-3.5M16 20V4M12.5 7.5 16 4l3.5 3.5" />
    </>
  ), // Trier
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ), // Ajouter
  edit: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="m14 7 3 3" />
    </>
  ), // Modifier
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ), // Supprimer
  download: (
    <>
      <path d="M12 3.5V15M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4 14.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-4.5" />
    </>
  ), // Exporter (CSV)
  close: (
    <>
      <path d="M6 6l12 12M18 6 6 18" />
    </>
  ), // Fermer, rejeter
  check: (
    <>
      <path d="m4.5 12.5 5 5 10-11" />
    </>
  ), // Valider
  "arrow-left": (
    <>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </>
  ), // Retour
  "chevron-right": (
    <>
      <path d="m9 5 7 7-7 7" />
    </>
  ), // Ouvrir, suivant
  "chevron-down": (
    <>
      <path d="m5 9 7 7 7-7" />
    </>
  ), // Déplier, liste
  send: (
    <>
      <path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z" />
    </>
  ), // Envoyer
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </>
  ), // Mettre en pause
  play: (
    <>
      <path d="M7 4.5v15l12-7.5z" />
    </>
  ), // Reprendre
  simulate: (
    <>
      <path d="M9.5 3.5h5M10 3.5V9l-5 9a1.8 1.8 0 0 0 1.6 2.5h10.8A1.8 1.8 0 0 0 19 18l-5-9V3.5" />
      <path d="M7.5 14.5h9" />
    </>
  ), // Simuler
  grip: (
    <>
      <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth="3" />
    </>
  ), // Déplacer (poignée)
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ), // Réessayer
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
    </>
  ), // Copier
  external: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ), // Ouvrir ailleurs
  "no-answer": (
    <>
      <path d="M5 3.5h3.2l1.6 4.2-2.1 1.4a11 11 0 0 0 7.2 7.2l1.4-2.1 4.2 1.6V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5z" />
      <path d="m15.5 3.5 5 5M20.5 3.5l-5 5" />
    </>
  ), // Ne répond pas
  voicemail: (
    <>
      <circle cx="6.5" cy="12" r="3.5" />
      <circle cx="17.5" cy="12" r="3.5" />
      <path d="M6.5 15.5h11" />
    </>
  ), // Répondeur
  gatekeeper: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z" />
      <path d="M9 12h6" />
    </>
  ), // Barrage secrétaire
  callback: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 4v4h4" />
      <path d="M12 7.5V12l3 2" />
    </>
  ), // À rappeler
  "wrong-number": (
    <>
      <path d="M5 3.5h3.2l1.6 4.2-2.1 1.4a11 11 0 0 0 7.2 7.2l1.4-2.1 4.2 1.6V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5z" />
      <path d="M21 3 3 21" />
    </>
  ), // Mauvais numéro
  "not-interested": (
    <>
      <path d="M7.5 13.5V4.5" />
      <path d="M7.5 4.5h8.3a2 2 0 0 1 2 1.6l1.1 5.6a2 2 0 0 1-2 2.3H13l.8 3.6a1.8 1.8 0 0 1-3.3 1.3l-3-5.4" />
      <path d="M7.5 4.5h-3v9h3" />
    </>
  ), // Pas intéressé
  meeting: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="m9 15 2 2 4-4" />
    </>
  ), // RDV fixé
  skip: (
    <>
      <path d="M5 5v14l10-7z" />
      <path d="M19 5v14" />
    </>
  ), // Passer
  note: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4H5.5A1.5 1.5 0 0 1 4 14.5z" />
    </>
  ), // Note
  success: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8 12.5 3 3 5-6" />
    </>
  ), // Succès
  error: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ), // Erreur
  warning: (
    <>
      <path d="M12 4 2.8 19.5h18.4z" />
      <path d="M12 10v4.5M12 17.2h.01" />
    </>
  ), // Avertissement
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8h.01" />
    </>
  ), // Information
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ), // Accès refusé
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ), // Planifié
  spinner: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />
    </>
  ), // Chargement
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ), // Ouvert, aperçu
  bounce: (
    <>
      <path d="M4 7l6 6 3-3 7 7" />
      <path d="M20 12v5h-5" />
    </>
  ), // Rebond
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ), // Ville, adresse
  star: (
    <>
      <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </>
  ), // Note Google
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5z" />
    </>
  ), // Site web
  euro: (
    <>
      <path d="M17.5 6.5a7 7 0 1 0 0 11" />
      <path d="M4 10h10M4 14h10" />
    </>
  ), // Valeur du deal
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ), // Période, date
  inbox: (
    <>
      <path d="M3.5 13.5 6 5h12l2.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z" />
      <path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5" />
    </>
  ), // Rien à traiter
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ), // Thème clair
  moon: (
    <>
      <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />
    </>
  ), // Thème sombre
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8.5 20h7M12 16v4" />
    </>
  ), // Thème du système
  sparkle: (
    <>
      <path d="M12 3.5 13.8 9 19.5 10.8 13.8 12.6 12 18.5 10.2 12.6 4.5 10.8 10.2 9z" />
      <path d="M19 3.5v3M17.5 5h3" />
    </>
  ), // IA (qualifier, rédiger, réécrire) (étape 4)
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ), // Notifications (emplacement) (étape 4)
  undo: (
    <>
      <path d="M9 14 4.5 9.5 9 5" />
      <path d="M4.5 9.5H15a5 5 0 0 1 0 10h-3" />
    </>
  ), // Annuler, revenir à l’original (étape 4)
  "wifi-off": (
    <>
      <path d="M3 3l18 18" />
      <path d="M8.5 16.2a5 5 0 0 1 7 0M5.2 12.8a9.6 9.6 0 0 1 4.3-2.3M12.8 10.2a9.6 9.6 0 0 1 6 2.6M2 9.4a14.6 14.6 0 0 1 4-2.6M10.6 5.6A14.7 14.7 0 0 1 22 9.4" />
      <path d="M12 19.5h.01" strokeWidth="2.6" />
    </>
  ), // Hors ligne (étape 4)
  "eye-off": (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.7A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.7M6.6 6.7A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.4-1.1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ), // Masquer le mot de passe (étape 4)
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01" strokeWidth="2.4" />
      <path d="M9 14h6" />
    </>
  ), // Déplacement au clavier (étape 4)
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M3 12.5h18" />
    </>
  ), // LinkedIn, entreprise (étape 4)
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof paths;
export const iconNames = Object.keys(paths) as IconName[];

type IconProps = Omit<SVGProps<SVGSVGElement>, "children" | "name"> & {
  name: IconName;
  /** 12, 16, 20 (défaut), 24 ou 26 px */
  size?: 12 | 16 | 20 | 24 | 26;
  /** Libellé si l'icône est seule (bouton icône, état) ; sinon elle est décorative. */
  label?: string;
};

export function Icon({ name, size = 20, label, className, ...rest }: IconProps) {
  const sizeClass = size === 20 ? "i" : size === 26 ? "i" : `i i-${size}`;
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: décorative (aria-hidden) ou libellée par aria-label quand elle est seule
    <svg
      viewBox="0 0 24 24"
      className={className ? `${sizeClass} ${className}` : sizeClass}
      {...(size === 26 ? { width: 26, height: 26 } : {})}
      focusable="false"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
