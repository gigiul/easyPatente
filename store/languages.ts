import { create } from 'zustand';
import { Language } from '../types/languages';

interface LanguagesState {
  languages: Language[];
  setLanguages: (languages: Language[]) => void;
}

export const useLanguagesStore = create<LanguagesState>()(
    (set) => ({
        languages: [],
        setLanguages: (languages) => set({ languages }),
    })
);



