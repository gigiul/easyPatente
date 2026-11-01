import type { LearningStats } from '@/types/learning';
export function learningSuggestion(stats: LearningStats) {
  if (stats.resume) return { kind: 'resume' as const, ...stats.resume };
  const available = stats.categories.filter(c => c.accessible > 0);
  const unseen = available.find(c => c.recent_unique < Math.min(10, c.total));
  if (!stats.readiness.enough && unseen) return { kind: 'category' as const, category: unseen };
  if (stats.mistakes.current > 0 && stats.mistakes.recurring > 0) return { kind: 'review' as const };
  const weak = available.find(c => c.mastery < 70);
  if (weak) return { kind: 'category' as const, category: weak };
  const uncovered = [...available].sort((a, b) => (b.total - b.seen) - (a.total - a.seen))[0];
  if (uncovered && uncovered.seen < uncovered.total / 2) return { kind: 'category' as const, category: uncovered };
  return { kind: 'exam' as const };
}

export function validExamDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Display-only conversion. Server scores and readiness thresholds remain on their original scale. */
export function formatLearningGrade(score: number | null, locale: string) {
  if (score === null || !Number.isFinite(score)) return '—';
  const grade = Math.max(1, Math.min(10, score / 10));
  return `${grade.toLocaleString(locale, { maximumFractionDigits: 1 })}/10`;
}
