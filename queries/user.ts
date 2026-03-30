import { storage } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { useUserProfileStore } from '../store/user';


export async function fetchUserProfile() {
const sessionStr = await storage.get('@auth_session');  
  if (!sessionStr) return null;
  const session = JSON.parse(sessionStr);
  const userId = session?.user?.id || session?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
    
  if (error) throw error;
  if (data) {
    useUserProfileStore.getState().setProfile(data);
    return data;
  }
  return null;
}

export async function updateUserLanguage(languageId: string | null, type: 'primary' | 'secondary') {
  const profile = useUserProfileStore.getState().user;
  if (!profile) throw new Error('User profile not found');

  const { data, error } = await supabase
    .from('profiles')
    .update({ [`lang_${type}`]: languageId })
    .eq('id', profile.id)
    .select('*')
    .single();

  if (error) throw error;
  if (data) {
    useUserProfileStore.getState().setProfile(data);
    return data;
  }
  return null;
}

export async function deleteUserAccount() {
  const { error } = await supabase.rpc('delete_user_account');
  if (error) throw error;
}
