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

    // Check if session is still valid
    const { data: { session: currentSession }, error } = await supabase.auth.getSession();
    
    if (error || !currentSession) {
      // If there's an error or no current session, clear stored session
      await storage.delete(SESSION_KEY);
      return null;
    }

    // If we have a current session, return it
    return currentSession;
  } catch (error) {
    console.error('Error restoring session:', error);
    // If there's any error, clear stored session
    await storage.delete(SESSION_KEY);
    return null;
  }
} 