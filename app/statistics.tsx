import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/hooks/useAuth';
import { useLearningStats } from '@/hooks/useLearningStats';
import { useThemeColor } from '@/hooks/useThemeColor';
import { formatLearningGrade, learningSuggestion, validExamDate } from '@/lib/learning';
import { setLearningPreferences } from '@/queries/learning';
import { supabase } from '@/lib/supabase';
import { useFeatureFlagsStore } from '@/store/featureFlags';

export default function StatisticsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const enabled = useFeatureFlagsStore(state => state.flags.learning_statistics) === true;
  const [days, setDays] = useState(30);
  const [offset, setOffset] = useState(0);
  const { data, loading, error, refresh } = useLearningStats(session?.user.id, days, offset, enabled);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [date, setDate] = useState('');
  const [goal, setGoal] = useState('');
  const [timezone, setTimezone] = useState('Europe/Rome');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [starting, setStarting] = useState(false);
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({ light: '#D1D5DB', dark: '#4B5563' }, 'icon');
  const preferences = data?.preferences;
  const savedDate = preferences?.exam_date;
  const savedGoal = preferences?.daily_goal;
  const savedTimezone = preferences?.timezone;
  useEffect(() => {
    if (!savedTimezone) return;
    setDate(savedDate ?? ''); setGoal(savedGoal?.toString() ?? ''); setTimezone(savedTimezone);
  }, [savedDate, savedGoal, savedTimezone]);
  const button = (label: string, action: () => unknown, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled}
    onPress={() => { void action(); }} style={({ pressed }) => [styles.button, (pressed || disabled) && { opacity: 0.5 }]}>
    <ThemedText type="link">{label}</ThemedText></Pressable>;
  const section = (key: string, body: React.ReactNode, details?: React.ReactNode) => <ThemedView key={key} lightColor="#F3F4F6" darkColor="#1F2937" style={styles.card}>
    <ThemedText type="defaultSemiBold">{t(`statistics.${key}`)}</ThemedText>{body}
    {details && <>{button(t(expanded[key] ? 'statistics.less' : 'statistics.details'), () => setExpanded(v => ({ ...v, [key]: !v[key] })))}{expanded[key] && details}</>}
  </ThemedView>;
  const fmt = (value: number | null) => value === null ? '—' : Number(value).toFixed(1);
  const dateText = (value: string) => new Date(value).toLocaleDateString(i18n.language);
  const suggestion = data ? learningSuggestion(data) : null;
  const start = async () => {
    if (!suggestion || starting) return;
    setStarting(true); setMessage('');
    try {
      if (suggestion.kind === 'resume') {
        router.push({ pathname: suggestion.mode === 'practice' ? '/quiz' : '/examQuiz', params: { batchId: suggestion.batch_id, forceItalian: String(suggestion.force_italian) } });
      } else if (suggestion.kind === 'category') {
        router.push({ pathname: '/quizBatch', params: { categoryId: suggestion.category.id, categoryName: suggestion.category.title } });
      } else {
        const { data: batchId, error: startError } = suggestion.kind === 'review'
          ? await supabase.rpc('generate_category_mistakes_review', { p_category_id: null })
          : await supabase.rpc('generate_exam_batch', { p_user_id: session?.user.id });
        if (startError) throw startError;
        router.push({ pathname: '/examQuiz', params: { batchId, forceItalian: 'true' } });
      }
    } catch { setMessage('statistics.actionError'); } finally { setStarting(false); }
  };
  const save = async () => {
    if ((date && !validExamDate(date)) || (goal && (!/^\d+$/.test(goal) || Number(goal) < 1 || Number(goal) > 1000))) { setMessage('statistics.invalidPreferences'); return; }
    setSaving(true); setMessage('');
    try { await setLearningPreferences(date || null, goal ? Number(goal) : null, timezone); await refresh(); setMessage('statistics.saved'); }
    catch { setMessage('statistics.preferencesError'); } finally { setSaving(false); }
  };
  let examDays: number | null = null;
  if (preferences?.exam_date) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: preferences.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = (type: string) => today.find(p => p.type === type)?.value;
    examDays = Math.round((Date.parse(`${preferences.exam_date}T12:00:00Z`) - Date.parse(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`)) / 86400000);
  }
  return <ThemedView style={styles.container}><ScrollView contentContainerStyle={styles.content}>
    {button(t('statistics.back'), () => router.back())}
    <ThemedText type="title">{t('statistics.title')}</ThemedText>
    {!enabled ? <ThemedText>{t('statistics.unavailable')}</ThemedText> : <>
      {loading && <ActivityIndicator accessibilityLabel={t('statistics.loading')} />}
      {error && <ThemedView accessibilityLiveRegion="polite"><ThemedText>{t('statistics.error')}</ThemedText>{button(t('statistics.retry'), refresh)}</ThemedView>}
      {message !== '' && <ThemedText accessibilityLiveRegion="polite">{t(message)}</ThemedText>}
      {data && <>
        <ThemedText style={styles.muted}>{t('statistics.updated', { date: new Date(data.updated_at).toLocaleString(i18n.language) })}</ThemedText>
        {data.legacy_count > 0 && <ThemedText>{t('statistics.legacy')}</ThemedText>}
        {section('readiness', <>
          <ThemedText type="title">{formatLearningGrade(data.readiness.score, i18n.language)}</ThemedText>
          <ThemedText type="defaultSemiBold">{t(`statistics.states.${data.readiness.state}`)}</ThemedText>
          <ThemedText>{t(data.readiness.enough ? data.readiness.gates_met ? 'statistics.reliabilitySolid' : 'statistics.reliabilityIndicative' : 'statistics.reliabilityLimited')}</ThemedText>
          <ThemedText>{t('statistics.evidence', { exams: data.readiness.exam_count, questions: data.readiness.recent_unique, categories: data.readiness.recent_categories, total: data.readiness.total_categories })}</ThemedText>
        </>, <>
          <ThemedText>{t('statistics.formula')}</ThemedText>
          <ThemedText>{t('statistics.components', { exam: formatLearningGrade(data.readiness.exam, i18n.language), mastery: formatLearningGrade(data.readiness.mastery, i18n.language), coverage: formatLearningGrade(data.readiness.breadth, i18n.language) })}</ThemedText>
          <ThemedText>{t('statistics.requirements')}</ThemedText>
          <ThemedText>{t('statistics.readyRequirements')}</ThemedText>
          <ThemedText>{t('statistics.heuristic')}</ThemedText>
        </>)}
        {section('next', <>
          <ThemedText>{suggestion && t(`statistics.suggestions.${suggestion.kind}`)}</ThemedText>
          {suggestion?.kind === 'category' && <ThemedText>{suggestion.category.title} · {suggestion.category.recent_unique}/{Math.min(10, suggestion.category.total)}</ThemedText>}
          {button(t('statistics.start'), start, starting)}
        </>)}
        <View style={styles.row}>{[7, 30, 0].map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: days === value }}
          onPress={() => { setDays(value); setOffset(0); }} style={({ pressed }) => [styles.filter, { borderColor }, days === value && { borderColor: '#2563EB', borderWidth: 2 }, pressed && { opacity: 0.6 }]}>
          <ThemedText>{value ? t('statistics.days', { count: value }) : t('statistics.all')}</ThemedText></Pressable>)}</View>
        <ThemedText style={styles.muted}>{t('statistics.filterNote')}</ThemedText>
        {section('exams', <>
          <ThemedText>{t('statistics.passed', { passed: data.exams.passed, total: data.exams.eligible })}</ThemedText>
          <ThemedText>{t('statistics.meanErrors', { value: fmt(data.exams.mean_errors) })}</ThemedText>
          <ThemedText>{t('statistics.examStatuses', { open: data.exams.open, interrupted: data.exams.interrupted })}</ThemedText>
        </>, <>
          {data.history.map(item => <View key={item.id} style={styles.item}>
            <ThemedText>{dateText(item.started_at)} · {t(`statistics.status.${item.status}`)}</ThemedText>
            <ThemedText>{item.status === 'completed' ? `${item.errors}/${item.total} · ${t('statistics.errorCount')}` : ''} {item.legacy ? t('statistics.legacyTag') : item.italian ? t('statistics.italian') : t('statistics.translated')}</ThemedText>
          </View>)}
          <View style={styles.row}>{offset > 0 && button(t('statistics.previous'), () => setOffset(v => Math.max(0, v - 20)))}
            {offset + data.history.length < data.history_total && button(t('statistics.more'), () => setOffset(v => v + 20))}</View>
        </>)}
        {section('trend', <>
          <ThemedText>{t('statistics.trendNote')}</ThemedText>
          {data.trend.length === 0 ? <ThemedText>{t('statistics.empty')}</ThemedText> : data.trend.map((point, index) => <View key={`${point.at}-${index}`} style={styles.item}>
            <ThemedText>{dateText(point.at)} · {point.errors} {t('statistics.errorCount')} {point.legacy ? t('statistics.legacyTag') : ''}</ThemedText>
            <View accessible={false} style={[styles.track, { borderColor }]}><View style={[styles.bar, { width: `${point.errors / 30 * 100}%`, backgroundColor: point.errors <= 3 ? '#059669' : '#D97706' }]} /><View style={styles.threshold} /></View>
          </View>)}
        </>)}
        {section('categories', <>
          <ThemedText>{t('statistics.categoryNote')}</ThemedText>
          {data.categories.slice(0, expanded.categories ? undefined : 3).map(category => <View key={category.id} style={styles.item}>
            <ThemedText type="defaultSemiBold">{category.title}</ThemedText>
            <ThemedText>{t('statistics.categoryMetrics', { accuracy: fmt(category.accuracy), samples: category.samples, seen: category.seen, total: category.total })}</ThemedText>
            <ThemedText>{category.recent_unique < Math.min(10, category.total) ? t('statistics.smallSample') : t('statistics.mastery', { value: formatLearningGrade(category.mastery, i18n.language) })}</ThemedText>
            {category.accessible > 0 && button(t('statistics.train'), () => router.push({ pathname: '/quizBatch', params: { categoryId: category.id, categoryName: category.title } }))}
          </View>)}
          {button(t(expanded.categories ? 'statistics.less' : 'statistics.more'), () => setExpanded(v => ({ ...v, categories: !v.categories })))}
        </>)}
        {section('coverage', <>
          <ThemedText type="title">{data.coverage.seen}/{data.coverage.total}</ThemedText>
          <ThemedText>{t('statistics.coverageNote')}</ThemedText>
          {data.categories.some(c => c.accessible < c.total) && <ThemedText>{t('statistics.restricted')}</ThemedText>}
        </>)}
        {section('mistakes', <>
          <ThemedText>{t('statistics.mistakeMetrics', data.mistakes)}</ThemedText>
          <ThemedText>{t('statistics.recoveryMetrics', data.mistakes)}</ThemedText>
        </>, <ThemedText>{t('statistics.recoveryNote')}</ThemedText>)}
        {section('plan', <>
          {preferences?.daily_goal && <ThemedText>{t('statistics.today', { count: data.today, goal: preferences.daily_goal })}</ThemedText>}
          {examDays !== null && <ThemedText>{examDays < 0 ? t('statistics.pastDate') : t('statistics.examDays', { count: examDays })}</ThemedText>}
          <ThemedText>{t('statistics.dateLabel')}</ThemedText>
          <TextInput accessibilityLabel={t('statistics.dateLabel')} placeholder="YYYY-MM-DD" placeholderTextColor={textColor} value={date} onChangeText={setDate} autoCapitalize="none" style={[styles.input, { color: textColor, borderColor }]} />
          <ThemedText>{t('statistics.goalLabel')}</ThemedText>
          <TextInput accessibilityLabel={t('statistics.goalLabel')} value={goal} onChangeText={setGoal} keyboardType="number-pad" placeholder="30" placeholderTextColor={textColor} style={[styles.input, { color: textColor, borderColor }]} />
          <ThemedText>{t('statistics.timezoneLabel')}</ThemedText>
          <TextInput accessibilityLabel={t('statistics.timezoneLabel')} value={timezone} onChangeText={setTimezone} autoCapitalize="none" style={[styles.input, { color: textColor, borderColor }]} />
          <ThemedText>{t('statistics.optional')}</ThemedText>
          {button(t('statistics.savePreferences'), save, saving)}
        </>)}
      </>}
    </>}
  </ScrollView></ThemedView>;
}
const styles = StyleSheet.create({
  container: { flex: 1 }, content: { padding: 20, paddingTop: 48, paddingBottom: 48, gap: 16, maxWidth: 900, width: '100%', alignSelf: 'center' },
  card: { padding: 16, borderRadius: 16, gap: 10 }, button: { paddingVertical: 10, minHeight: 44 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center' }, filter: { padding: 12, borderWidth: 1, borderRadius: 12 },
  muted: { opacity: 0.7 }, item: { paddingVertical: 10, gap: 6 }, input: { borderWidth: 1, padding: 12, borderRadius: 12, fontSize: 16, minHeight: 48 },
  track: { height: 12, borderWidth: 1, borderRadius: 4, overflow: 'hidden' }, bar: { height: '100%' },
  threshold: { position: 'absolute', left: '10%', width: 2, height: '100%', backgroundColor: '#2563EB' },
});
