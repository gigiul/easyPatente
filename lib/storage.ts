import AsyncStorage from '@react-native-async-storage/async-storage';

function hasWindowLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      const v = await AsyncStorage.getItem(key);
      if (v !== null) return v;
      // Fallback su web se AsyncStorage è vuoto ma localStorage ha il dato
      if (hasWindowLocalStorage()) {
        return window.localStorage.getItem(key);
      }
      return null;
    } catch (error) {
      console.error('Error reading from storage:', error);
      if (hasWindowLocalStorage()) {
        try { return window.localStorage.getItem(key); } catch { return null; }
      }
      return null;
    }
  },

  async set(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error('Error writing to storage:', error);
    }
    // Mirror su localStorage per debug web
    if (hasWindowLocalStorage()) {
      try { window.localStorage.setItem(key, value); } catch {}
    }
  },

  async delete(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('Error deleting from storage:', error);
    }
    if (hasWindowLocalStorage()) {
      try { window.localStorage.removeItem(key); } catch {}
    }
  },
}; 