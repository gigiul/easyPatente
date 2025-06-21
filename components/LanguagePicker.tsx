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
        pressed && styles.languageItemPressed,
        value === item.code && styles.languageItemSelected,
      ]}
      onPress={() => handleLanguageChange(item.code)}
    >
      <ThemedText style={[
        styles.languageText,
        value === item.code && styles.languageTextSelected,
        item.code === '' && styles.noneOption
      ]}>
        {item.code === '' ? '-' : item.native_name || item.name}
      </ThemedText>
      {value === item.code && (
        <Ionicons name="checkmark" size={24} color="#0a7ea4" />
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.dropdownButton,
          pressed && styles.dropdownButtonPressed
        ]}
        onPress={() => setModalVisible(true)}
      >
        <ThemedText style={styles.dropdownButtonText}>
          {value === '' ? '-' : (languages.find(lang => lang.code === value)?.native_name || languages.find(lang => lang.code === value)?.name || '-')}
        </ThemedText>
        <Ionicons name="chevron-down" size={24} color="#0a7ea4" />
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
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText type="defaultSemiBold" style={styles.modalTitle}>
                {title}
              </ThemedText>
              <Pressable onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0a7ea4" />
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
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dropdownButtonPressed: {
    opacity: 0.7,
  },
  dropdownButtonText: {
    fontSize: 16,
    color: '#000',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
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
    borderBottomColor: '#e0e0e0',
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
    borderBottomColor: '#e0e0e0',
  },
  languageItemPressed: {
    backgroundColor: '#f5f5f5',
  },
  languageItemSelected: {
    backgroundColor: '#f0f9ff',
  },
  languageText: {
    fontSize: 16,
  },
  languageTextSelected: {
    color: '#0a7ea4',
    fontWeight: '600',
  },
  noneOption: {
    color: '#666',
  },
});