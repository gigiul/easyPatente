/** Save notifications are intentionally hidden in every state. Persistence is unchanged. */
export function QuizSaveStatus(_props: { state: 'saved' | 'pending' | 'error'; onRetry: () => unknown }) {
  return null;
}
