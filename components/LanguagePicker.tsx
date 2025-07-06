import { useThemeColor } from '@/hooks/useThemeColor';
import type { Language } from '@/types/languages';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from './ThemedText';

interface LanguagePickerProps {
  value: string | null;
  onChange: (value: string) => void;
  title: string;
  languages: Language[];
  excludeLanguage?: string | null;
  allowNone?: boolean;
}

export function LanguagePicker({ value, onChange, title, languages, excludeLanguage, allowNone }: LanguagePickerProps) {
  const [modalVisible, setModalVisible] = useState(false);

  // Theme colors
  const iconColor = useThemeColor({}, 'icon');
  const tintColor = useThemeColor({}, 'tint');
  const cardBackground = useThemeColor({ light: '#fff', dark: '#1F2937' }, 'background');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#374151' }, 'icon');
  const selectedBackground = useThemeColor({ light: '#f0f9ff', dark: '#1E3A8A' }, 'background');
  const pressedBackground = useThemeColor({ light: '#f5f5f5', dark: '#374151' }, 'background');

  const handleLanguageChange = (langCode: string) => {
    onChange(langCode);
    setModalVisible(false);
  };

  const filteredLanguages = excludeLanguage
    ? languages.filter(lang => lang.code !== excludeLanguage)
    : languages;

  const displayLanguages = allowNone
    ? [{ code: '', name: '-', native_name: '', is_active: true, is_default: false, created_at: '' }, ...filteredLanguages]
    : filteredLanguages;

  const renderLanguageItem = ({ item }: { item: Language }) => (
    <Pressable
      style={({ pressed }) => [
        styles.languageItem,
        { borderBottomColor: borderColor },
        pressed && { backgroundColor: pressedBackground },
        value === item.code && { backgroundColor: selectedBackground },
      ]}
      onPress={() => handleLanguageChange(item.code)}
    >
      <ThemedText style={[
        styles.languageText,
        value === item.code && { color: tintColor, fontWeight: '600' },
        item.code === '' && { color: iconColor }
      ]}>
        {item.code === '' ? '-' : item.native_name || item.name}
      </ThemedText>
      {value === item.code && (
        <Ionicons name="checkmark" size={24} color={tintColor} />
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.dropdownButton,
          { backgroundColor: cardBackground, borderColor: borderColor },
          pressed && { opacity: 0.7 }
        ]}
        onPress={() => setModalVisible(true)}
      >
        <ThemedText style={styles.dropdownButtonText}>
          {value === '' ? '-' : (languages.find(lang => lang.code === value)?.native_name || languages.find(lang => lang.code === value)?.name || '-')}
        </ThemedText>
        <Ionicons name="chevron-down" size={24} color={tintColor} />
      </Pressable>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: cardBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
              <ThemedText type="defaultSemiBold" style={styles.modalTitle}>
                {title}
              </ThemedText>
              <Pressable onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={tintColor} />
              </Pressable>
            </View>
            <FlatList
              data={displayLanguages}
              renderItem={renderLanguageItem}
              keyExtractor={item => item.code || 'none'}
              style={styles.languageList}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  dropdownButtonText: {
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
  },
  languageList: {
    marginBottom: 16,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  languageText: {
    fontSize: 16,
  },
});