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
 * Enforces the site's fixed language pair (primary = italian, secondary = subdomain language).
 * - No site → values untouched (no clamping).
 * - primary → ALWAYS defaultPrimary ('it') on a dedicated site.
 * - secondary → if missing/off-site/equal to primary → defaultSecondary ('bn').
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

  const primary = cfg.defaultPrimary;

  const secondary =
    langSecondary && cfg.languages.includes(langSecondary) && langSecondary !== primary
      ? langSecondary
      : cfg.defaultSecondary !== primary
        ? cfg.defaultSecondary
        : cfg.languages.find((c) => c !== primary) ?? null;

  return { primary, secondary };
}
