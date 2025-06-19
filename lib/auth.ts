import { Session } from '@supabase/supabase-js';
import { storage } from './storage';
import { supabase } from './supabase';

const SESSION_KEY = '@auth_session';

export async function restoreSession(): Promise<Session | null> {
  try {
    // Try to get session from storage
    const storedSession = await storage.get(SESSION_KEY);
    if (!storedSession) {
      return null;
    }

    // Parse stored session
    const session = JSON.parse(storedSession) as Session;

    // Check if Supabase already has a session
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession) {
      return currentSession;
    }

    // Set the session in Supabase
    const { data, error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    if (error || !data.session) {
      // Optional: remove invalid session from storage
      await storage.delete(SESSION_KEY);
      return null;
    }

    return data.session;
  } catch (error) {
    console.error('Error restoring session:', error);
    await storage.delete(SESSION_KEY);
    return null;
  }
}
