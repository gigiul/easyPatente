import { create } from 'zustand';
import { Profile } from '../types/profiles';

interface UserProfile {
  user: Profile | null;
  setProfile: (user: Profile | null) => void;
}

export const useUserProfileStore = create<UserProfile>()(
    (set) => ({
    user: null,
    setProfile: (user: Profile | null) => set({ user })
}));