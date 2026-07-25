import { create } from 'zustand';
import { Profile } from '../types/profiles';

interface UserProfile {
  user: Profile | null;
  has_ai: boolean
  setProfile: (user: Profile | null) => void;
}

export const useUserProfileStore = create<UserProfile>()(
  (set) => ({
    user: null,
    has_ai: false,
    setProfile: (user: Profile | null) => set({ user })
  }));