import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppAlert as Alert } from '@/lib/alert';
import { isVoiceSupported } from '@/lib/liveAudio';
import { startVoiceSession, stopVoiceSession } from '@/lib/liveVoice';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useChatStore } from '@/store/chat';
import { useFeatureFlagsStore } from '@/store/featureFlags';
import { useUserProfileStore } from '@/store/user';
import { useVoiceStore } from '@/store/voice';

const TYPING_ROW_ID = '__typing__';
const VOICE_USER_ROW_ID = '__voice_user__';
const VOICE_ASSISTANT_ROW_ID = '__voice_assistant__';

// ── Markdown rendering rules ──
// Reproduce default rules of react-native-markdown-display,
// adding `selectable` to enable native text selection/copying.
// - "textgroup" wraps all inline text of a block (bold,
//   italic, links included) into a single text node: making it selectable
//   is enough to select the entire paragraph/heading/list item.
// - "fence"/"code_block" are handled separately because they contain
//   preformatted text, not inline text.
const markdownRenderRules = {
  textgroup: (node: any, children: any, _parent: any, styles: any) => (
    <Text key={node.key} style={styles.textgroup} selectable>
      {children}
    </Text>
  ),
  text: (node: any, _children: any, _parent: any, styles: any, inheritedStyles: any = {}) => (
    <Text key={node.key} style={[inheritedStyles, styles.text]} selectable>
      {node.content}
    </Text>
  ),
  fence: (node: any, _children: any, _parent: any, styles: any) => (
    <Text key={node.key} style={styles.fence} selectable>
      {node.content}
    </Text>
  ),
  code_block: (node: any, _children: any, _parent: any, styles: any) => (
    <Text key={node.key} style={styles.code_block} selectable>
      {node.content}
    </Text>
  ),
};

// ── MessageBubble (memoized) ──

interface MessageBubbleProps {
  item: { id: string; role: string; content: string; status?: string };
  isUser: boolean;
  isPending: boolean;
  isFailed: boolean;
  assistantBubbleColor: string;
  markdownStyles: any;
  onRetry: (id: string) => void;
  retryLabel: string;
}

const MessageBubble = memo(function MessageBubble({
  item,
  isUser,
  isPending,
  isFailed,
  assistantBubbleColor,
  markdownStyles,
  onRetry,
  retryLabel,
}: MessageBubbleProps) {
  const bubble = (
    <View
      style={[
        styles.messageBubble,
        isUser ? styles.userBubble : styles.assistantBubble,
        {
          backgroundColor: isUser ? '#2563EB' : assistantBubbleColor,
          opacity: isPending ? 0.6 : 1,
        },
        isFailed && styles.failedBubble,
      ]}
    >
      {isUser ? (
        <ThemedText
          selectable
          style={[styles.messageText, { color: '#FFFFFF' }]}
        >
          {item.content}
        </ThemedText>
      ) : (
        <Markdown style={markdownStyles} rules={markdownRenderRules}>
          {item.content}
        </Markdown>
      )}
    </View>
  );

  if (!isFailed) return bubble;

  return (
    <View style={styles.failedRow}>
      {bubble}
      <Pressable
        onPress={() => onRetry(item.id)}
        style={({ pressed }) => [
          styles.retryButton,
          pressed && { opacity: 0.6 },
        ]}
      >
        <Ionicons name="refresh" size={14} color="#EF4444" />
        <ThemedText style={styles.retryText}>{retryLabel}</ThemedText>
      </Pressable>
    </View>
  );
});

// ── TypingIndicator (memoized) ──

const TypingIndicator = memo(function TypingIndicator({ color }: { color: string }) {
  return (
    <View style={styles.typingRow}>
      <Dot color={color} delay={0} />
      <Dot color={color} delay={150} />
      <Dot color={color} delay={300} />
    </View>
  );
});

function Dot({ color, delay }: { color: string; delay: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 400,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={[styles.typingDot, { backgroundColor: color, opacity }]}
    />
  );
}

// ── ChatScreen ──

export default function ChatScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const { secondaryLanguage } = useLanguage();
  const profile = useUserProfileStore((state) => state.user);
  const {
    messages,
    sending,
    error,
    remainingRequests,
    sendMessage,
    retryMessage,
    clearChat,
    loadMessages,
    loadRemainingRequests,
  } = useChatStore();
  const chatEnabled = useFeatureFlagsStore((state) => state.flags.chat) && profile?.has_ai;
  const voiceFlag = useFeatureFlagsStore((state) => state.flags.voice);
  const voiceActive = useVoiceStore((state) => state.active);
  const voiceStatus = useVoiceStore((state) => state.status);
  const voiceUserText = useVoiceStore((state) => state.userTranscript);
  const voiceAssistantText = useVoiceStore((state) => state.assistantTranscript);
  const voiceError = useVoiceStore((state) => state.error);
  const voiceAvailable = !!voiceFlag && isVoiceSupported();
  const canStartVoice =
    voiceAvailable && chatEnabled && (remainingRequests === null || remainingRequests > 0);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  // Scroll to bottom of the list, deferring by one frame to ensure
  // that FlatList has updated layout with the latest messages.
  const scrollToEnd = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
    const willShowSub =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardWillShow', () => {
          flatListRef.current?.scrollToEnd({ animated: true });
        })
        : null;

    return () => {
      showSub.remove();
      willShowSub?.remove();
    };
  }, []);

  const iconColor = useThemeColor({}, 'icon');
  const borderColor = useThemeColor({ light: '#E2E8F0', dark: '#374151' }, 'icon');
  const cardBackgroundColor = useThemeColor({ light: '#FFFFFF', dark: '#1F2937' }, 'background');
  const assistantBubbleColor = useThemeColor({ light: '#F1F5F9', dark: '#1F2937' }, 'background');
  const assistantTextColor = useThemeColor({}, 'text');
  const secondaryTextColor = useThemeColor({ light: '#6B7280', dark: '#9CA3AF' }, 'text');
  const inputBackgroundColor = useThemeColor({ light: '#F9FAFB', dark: '#111827' }, 'background');
  const placeholderColor = useThemeColor({ light: '#9CA3AF', dark: '#6B7280' }, 'icon');
  const codeBackgroundColor = useThemeColor({ light: '#E2E8F0', dark: '#111827' }, 'background');
  const linkColor = useThemeColor({ light: '#2563EB', dark: '#60A5FA' }, 'text');

  const markdownStyles = useMemo(
    () => ({
      body: { color: assistantTextColor, fontSize: 15, lineHeight: 21 },
      paragraph: { marginTop: 0, marginBottom: 8 },
      strong: { fontWeight: '700' as const },
      em: { fontStyle: 'italic' as const },
      bullet_list: { marginBottom: 8 },
      ordered_list: { marginBottom: 8 },
      list_item: { marginBottom: 4 },
      code_inline: {
        backgroundColor: codeBackgroundColor,
        color: assistantTextColor,
        borderRadius: 4,
        paddingHorizontal: 4,
        fontSize: 14,
      },
      code_block: {
        backgroundColor: codeBackgroundColor,
        color: assistantTextColor,
        borderRadius: 8,
        padding: 10,
        fontSize: 13,
      },
      fence: {
        backgroundColor: codeBackgroundColor,
        color: assistantTextColor,
        borderRadius: 8,
        padding: 10,
        fontSize: 13,
      },
      link: { color: linkColor },
      heading1: { fontSize: 19, fontWeight: '700' as const, marginTop: 4, marginBottom: 6, color: assistantTextColor },
      heading2: { fontSize: 17, fontWeight: '700' as const, marginTop: 4, marginBottom: 6, color: assistantTextColor },
      heading3: { fontSize: 16, fontWeight: '600' as const, marginTop: 4, marginBottom: 4, color: assistantTextColor },
      hr: { backgroundColor: borderColor, height: 1, marginVertical: 8 },
      blockquote: {
        backgroundColor: codeBackgroundColor,
        borderLeftWidth: 3,
        borderLeftColor: borderColor,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginVertical: 4,
      },
    }),
    [assistantTextColor, codeBackgroundColor, linkColor, borderColor]
  );

  // Load messages when the session is ready and, as soon as they arrive,
  // force a scroll to bottom (without animation: initial loading).
  useEffect(() => {
    if (!session?.user?.id) return;

    let cancelled = false;

    (async () => {
      await loadMessages();
      if (!cancelled) scrollToEnd(false);
    })();

    loadRemainingRequests();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // expo-router tabs stay mounted: a useEffect on mount is not enough
  // to scroll every time the tab is REOPENED. useFocusEffect triggers
  // on every focus (including initial opening), covering exactly
  // the case "scroll to bottom when tab opens".
  useFocusEffect(
    useCallback(() => {
      scrollToEnd(false);
    }, [scrollToEnd])
  );

  // Scroll to bottom again every time a new message arrives or
  // the content/status of the last one changes (AI response, retry, streaming).
  // The second, delayed scroll handles any late markdown reflows
  // (code blocks, lists, headings) measured after initial render.
  const lastMessageSignatureRef = useRef('');

  useEffect(() => {
    const last = messages[messages.length - 1];
    const signature = last
      ? `${messages.length}:${last.id}:${last.content?.length ?? 0}:${last.status ?? ''}`
      : `${messages.length}`;
    const voiceSignature = voiceActive
      ? `:${voiceUserText.length}:${voiceAssistantText.length}:${voiceStatus}`
      : '';

    const fullSignature = signature + voiceSignature;
    if (fullSignature === lastMessageSignatureRef.current) return;
    lastMessageSignatureRef.current = fullSignature;

    scrollToEnd(true);
    const timer = setTimeout(() => scrollToEnd(true), 250);
    return () => clearTimeout(timer);
  }, [messages, scrollToEnd, voiceActive, voiceUserText, voiceAssistantText, voiceStatus]);

  const rows = useMemo(() => {
    const list: any[] = [...messages];
    if (sending) list.push({ id: TYPING_ROW_ID } as any);
    if (voiceActive) {
      if (voiceUserText) {
        list.push({ id: VOICE_USER_ROW_ID, role: 'user', content: voiceUserText });
      }
      if (voiceAssistantText) {
        list.push({ id: VOICE_ASSISTANT_ROW_ID, role: 'assistant', content: voiceAssistantText });
      }
    }
    return list;
  }, [messages, sending, voiceActive, voiceUserText, voiceAssistantText]);

  // Smooth scroll using onContentSizeChange instead of useEffect
  const onContentSizeChange = useCallback(
    (_contentWidth: number, contentHeight: number) => {
      flatListRef.current?.scrollToEnd({ animated: false });
    },
    []
  );

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending || (remainingRequests !== null && remainingRequests <= 0)) return;
    setInputText('');
    await sendMessage(text, i18n.language);
  };

  const handleRetry = useCallback(
    (id: string) => {
      if (sending) return;
      retryMessage(id, i18n.language);
    },
    [sending, retryMessage, i18n.language]
  );

  const handleClearChat = () => {
    if (messages.length === 0) return;
    Alert.alert(
      t('chat.clearChatTitle'),
      t('chat.clearChatMessage'),
      [
        { text: t('chat.clearChatCancel'), style: 'cancel' },
        { text: t('chat.clearChatConfirm'), style: 'destructive', onPress: clearChat },
      ]
    );
  };

  const handleToggleVoice = () => {
    if (voiceActive) {
      stopVoiceSession();
      return;
    }
    void startVoiceSession({
      questionId: useChatStore.getState().questionId,
      lang: i18n.language,
    });
  };

  // La sessione vocale (e il microfono) non deve restare aperta fuori dalla chat
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (useVoiceStore.getState().active) stopVoiceSession();
      };
    }, [])
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      if (item.id === TYPING_ROW_ID) {
        return (
          <View
            style={[
              styles.messageBubble,
              styles.assistantBubble,
              { backgroundColor: assistantBubbleColor },
            ]}
          >
            <TypingIndicator color={secondaryTextColor} />
          </View>
        );
      }

      // Trascrizione live di un turno vocale in corso (testo parziale)
      if (item.id === VOICE_USER_ROW_ID || item.id === VOICE_ASSISTANT_ROW_ID) {
        const isUser = item.id === VOICE_USER_ROW_ID;
        return (
          <View
            style={[
              styles.messageBubble,
              isUser ? styles.userBubble : styles.assistantBubble,
              { backgroundColor: isUser ? '#2563EB' : assistantBubbleColor, opacity: 0.75 },
            ]}
          >
            <ThemedText
              selectable
              style={[styles.messageText, isUser && { color: '#FFFFFF' }]}
            >
              {item.content}
            </ThemedText>
          </View>
        );
      }

      return (
        <MessageBubble
          item={item}
          isUser={item.role === 'user'}
          isPending={item.status === 'pending'}
          isFailed={item.status === 'failed'}
          assistantBubbleColor={assistantBubbleColor}
          markdownStyles={markdownStyles}
          onRetry={handleRetry}
          retryLabel={t('chat.retry')}
        />
      );
    },
    [assistantBubbleColor, secondaryTextColor, markdownStyles, handleRetry, t]
  );

  if (!chatEnabled) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="lock-closed" size={48} color={iconColor} />
          <ThemedText style={[styles.notEnabledText, { color: secondaryTextColor }]}>
            {t('chat.notEnabled')}
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ThemedView style={styles.container}>
        {/* Header */}
        <View
          style={[
            styles.header,
            { borderBottomColor: borderColor, paddingTop: insets.top + 12 },
          ]}
        >
          <ThemedText type="defaultSemiBold" style={styles.headerText}>
            {t('chat.title')}
          </ThemedText>
          <View style={styles.headerRight}>
            <ThemedText
              style={[
                styles.remainingText,
                {
                  color:
                    remainingRequests === null
                      ? secondaryTextColor
                      : remainingRequests > 0
                        ? '#059669'
                        : '#EF4444',
                },
              ]}
            >
              {remainingRequests !== null &&
                t('chat.remainingRequests', { count: remainingRequests })}
            </ThemedText>
            {messages.length > 0 && (
              <Pressable
                onPress={handleClearChat}
                style={({ pressed }) => [
                  styles.clearButton,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Message list */}
        {rows.length === 0 ? (
          <View style={styles.centerContent}>
            <Ionicons name="chatbubbles-outline" size={48} color={borderColor} />
            <ThemedText style={[styles.noMessagesText, { color: secondaryTextColor }]}>
              {t('chat.noMessages')}
            </ThemedText>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={rows}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            onContentSizeChange={onContentSizeChange}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            removeClippedSubviews
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            windowSize={11}
          />
        )}

        {/* Error message */}
        {error && (
          <View style={[styles.errorContainer, { backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        {/* Voice session error */}
        {voiceError && !voiceActive && (
          <View style={[styles.errorContainer, { backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="mic-off" size={16} color="#EF4444" />
            <ThemedText style={[styles.errorText, styles.voiceErrorText]}>
              {t(`voice.errors.${voiceError}`)}
            </ThemedText>
            <Pressable
              onPress={() => useVoiceStore.getState().setError(null)}
              style={({ pressed }) => [styles.errorDismiss, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="close" size={16} color="#EF4444" />
            </Pressable>
          </View>
        )}

        {/* Input area */}
        <View
          style={[
            styles.inputContainer,
            {
              borderTopColor: borderColor,
              backgroundColor: cardBackgroundColor,
              paddingBottom: Math.max(insets.bottom, 8),
            },
          ]}
        >
          {voiceActive ? (
            /* ── Barra sessione vocale ── */
            <View style={styles.voiceBar}>
              <View
                style={[
                  styles.voiceStatusPill,
                  { backgroundColor: inputBackgroundColor, borderColor },
                ]}
              >
                <Ionicons
                  name={
                    voiceStatus === 'connecting'
                      ? 'sync-outline'
                      : voiceStatus === 'listening'
                        ? 'mic'
                        : voiceStatus === 'thinking'
                          ? 'search'
                          : 'volume-high'
                  }
                  size={18}
                  color={
                    voiceStatus === 'listening'
                      ? '#2563EB'
                      : voiceStatus === 'speaking'
                        ? '#059669'
                        : voiceStatus === 'thinking'
                          ? '#D97706'
                          : secondaryTextColor
                  }
                />
                <ThemedText style={[styles.voiceStatusText, { color: assistantTextColor }]} numberOfLines={1}>
                  {t(`voice.status.${voiceStatus}`)}
                </ThemedText>
                {voiceStatus === 'thinking' && <TypingIndicator color={secondaryTextColor} />}
              </View>
              <Pressable
                onPress={stopVoiceSession}
                accessibilityLabel={t('voice.stopButton')}
                style={({ pressed }) => [styles.voiceStopButton, pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] }]}
              >
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : remainingRequests !== null && remainingRequests <= 0 ? (
            <View style={styles.limitReachedContainer}>
              <Ionicons name="warning" size={16} color="#D97706" />
              <ThemedText style={[styles.limitReachedText, { color: '#D97706' }]}>
                {t('chat.limitReached')}
              </ThemedText>
            </View>
          ) : (
            <>
              <TextInput
                style={[
                  styles.textInput,
                  { color: assistantTextColor, borderColor, backgroundColor: inputBackgroundColor },
                ]}
                value={inputText}
                onChangeText={setInputText}
                placeholder={t('chat.placeholder')}
                placeholderTextColor={placeholderColor}
                editable={!sending}
                multiline
                maxLength={500}
              />
              {canStartVoice && (
                <Pressable
                  onPress={handleToggleVoice}
                  accessibilityLabel={t('voice.micButton')}
                  style={({ pressed }) => [
                    styles.micButton,
                    { borderColor },
                    pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
                  ]}
                >
                  <Ionicons name="mic-outline" size={20} color="#2563EB" />
                </Pressable>
              )}
              <Pressable
                onPress={handleSend}
                disabled={!inputText.trim() || sending}
                style={({ pressed }) => [
                  styles.sendButton,
                  { opacity: !inputText.trim() || sending ? 0.5 : 1 },
                  pressed && !!inputText.trim() && !sending && { transform: [{ scale: 0.94 }] },
                ]}
              >
                <Ionicons name="send" size={20} color="#FFFFFF" />
              </Pressable>
            </>
          )}
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerText: { fontSize: 16 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  remainingText: { fontSize: 13, fontWeight: '500' },
  clearButton: { padding: 4 },
  messageList: { flex: 1 },
  messageListContent: { padding: 16, gap: 12 },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  failedBubble: { borderWidth: 1, borderColor: '#EF4444' },
  failedRow: { alignSelf: 'flex-end', alignItems: 'flex-end', gap: 4 },
  retryButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 2 },
  retryText: { fontSize: 12, color: '#EF4444', fontWeight: '500' },
  messageText: { fontSize: 15, lineHeight: 20 },
  notEnabledText: { fontSize: 16, textAlign: 'center' },
  noMessagesText: { fontSize: 14, textAlign: 'center' },
  typingRow: { flexDirection: 'row', gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },
  errorContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  errorText: { fontSize: 13, color: '#EF4444' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, gap: 8 },
  textInput: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
  micButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  voiceBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceStatusPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  voiceStatusText: { fontSize: 14, flexShrink: 1 },
  voiceStopButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },
  voiceErrorText: { flex: 1 },
  errorDismiss: { padding: 2 },
  limitReachedContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  limitReachedText: { fontSize: 13, fontWeight: '500' },
});