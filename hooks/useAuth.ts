import { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { restoreSession } from '../lib/auth';
import { getDeviceId } from '../lib/device';
import { storage } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { isAllowedEmailDomain } from '../lib/emailValidation';

const SESSION_KEY = '@auth_session';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const restoredSession = await restoreSession();
    
        if (restoredSession) {
          // Inizializza la sessione in Supabase
          const { data, error } = await supabase.auth.setSession({
            access_token: restoredSession.access_token,
            refresh_token: restoredSession.refresh_token,
          });
    
          if (error) {
            console.error('[useAuth] Error setting session in Supabase:', error);
          } else {
            if (mounted) {
              setSession(data.session);
            }
          }
        }
      } catch (error) {
        console.error('[useAuth] Error initializing auth:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (mounted) {
        setSession(session);
        if (session) {
          // Save session to storage
          await storage.set(SESSION_KEY, JSON.stringify(session));
        } else {
          // Remove session from storage
          await storage.delete(SESSION_KEY);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };

    const deviceId = await getDeviceId();
    const { data: isValid, error: deviceError } = await supabase.rpc('validate_device', { p_device_id: deviceId });

    if (deviceError) {
      await supabase.auth.signOut();
      return { error: { message: 'auth.login.errors.deviceMismatch' } };
    }

    if (isValid) {
      await supabase.rpc('register_device', { p_device_id: deviceId });
    } else {
      await supabase.auth.signOut();
      return { error: { message: 'auth.login.errors.deviceMismatch' } };
    }

    return { error: null };
  };

  const signUp = async (email: string, password: string) => {
    if (!isAllowedEmailDomain(email)) {
      return { error: { message: 'auth.signup.errors.invalidDomain' } };
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };

    // Su PROD con email confirmation, signUp non ha sessione (auth.uid()=null) → register_device fallirebbe con 23502
    if (data.session) {
      const deviceId = await getDeviceId();
      await supabase.rpc('register_device', { p_device_id: deviceId });
    }

    return { error: null };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      // Remove session from storage
      await storage.delete(SESSION_KEY);
    }
    return { error };
  };

  return {
    session,
    loading,
    signIn,
    signUp,
    signOut,
  };
} 