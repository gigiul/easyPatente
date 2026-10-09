import { Platform } from 'react-native';

/**
 * Per-subdomain site configuration (web only).
 * On mobile or with no hostname match → null → full language list (historical behavior).
 */
export type SiteConfig = {
  /** subdomain label, e.g. 'bn' */
  site: string;
  /** fixed language pair allowed on the site */
  languages: string[];
  /** default primary: ALWAYS italian */
  defaultPrimary: string;
  /** default secondary: the subdomain language */
  defaultSecondary: string;
  meta: { title: string; description: string };
};

export const DEFAULT_META = {
  title: 'Quiz Patente 2026',
  description: 'Quiz patente multilingua',
};

/** Per-language base URL — used for canonical/hreflang (apex = it) */
export const SITE_BASES: Record<string, string> = {
  it: 'https://quizpatenteitaliana.it',
  bn: 'https://bn.quizpatenteitaliana.it',
  es: 'https://es.quizpatenteitaliana.it',
};

const SITES: Record<string, SiteConfig> = {
  bn: {
    site: 'bn',
    languages: ['it', 'bn'],
    defaultPrimary: 'it',
    defaultSecondary: 'bn',
    meta: {
      title: 'Quiz Patente 2026 — বাংলা',
      description:
        "Quiz patente in italiano e bengalese: domande ufficiali, spiegazioni AI e simulazioni d'esame.",
    },
  },
  es: {
    site: 'es',
    languages: ['it', 'es'],
    defaultPrimary: 'it',
    defaultSecondary: 'es',
    meta: {
      title: 'Quiz Patente 2026 — Español',
      description:
        'Examen de conducción en italiano y español: preguntas oficiales, explicaciones con IA y simulacros de examen.',
    },
  },
};

let cached: SiteConfig | null | undefined;

function resolveSite(): SiteConfig | null {
  // Explicit override (local tests / future per-language builds)
  const envSite = process.env.EXPO_PUBLIC_SITE;
  if (envSite) return SITES[envSite] ?? null;

  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  // 'bn.quizpatenteitaliana.it' → 'bn'; apex/localhost/unknown → null
  const label = window.location.hostname.split('.')[0];
  return SITES[label] ?? null;
}

export function getSiteConfig(): SiteConfig | null {
  if (cached === undefined) cached = resolveSite();
  return cached;
}

/**
 * Enforces the site's language rules.
 * - No site → values untouched (no clamping).
 * - primary → must belong to the site pair: kept when valid (the swap button
 *   can move it to the site language), otherwise fallback to defaultPrimary ('it').
 * - secondary → OPTIONAL even on a dedicated site: null stays null (the picker
 *   can clear it and the choice persists). Only an out-of-site value (or one
 *   equal to primary) falls back to defaultSecondary for the session.
 * No DB write: the next explicit change from the picker saves normally.
 */
export function clampSiteLanguages(
  langPrimary?: string | null,
  langSecondary?: string | null
): { primary: string | null; secondary: string | null } {
  const cfg = getSiteConfig();
  if (!cfg) {
    return { primary: langPrimary ?? null, secondary: langSecondary ?? null };
  }

  const primary =
    langPrimary && langPrimary !== langSecondary && cfg.languages.includes(langPrimary)
      ? langPrimary
      : cfg.defaultPrimary;

  let secondary: string | null = null;
  if (langSecondary && langSecondary !== primary && cfg.languages.includes(langSecondary)) {
    secondary = langSecondary;
  } else if (langSecondary) {
    // Out-of-site / invalid value (cross-site profile) → session fallback.
    secondary =
      cfg.defaultSecondary !== primary
        ? cfg.defaultSecondary
        : cfg.languages.find((c) => c !== primary) ?? null;
  }

  return { primary, secondary };
}
