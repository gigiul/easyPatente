import { useState } from 'react';
import { Subscription, supabase } from '../lib/supabase';

export function useSubscription() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getSubscription = async (userId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      return data as Subscription;
    } catch (err) {
      setError(err as Error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateSubscription = async (userId: string, updates: Partial<Subscription>) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('subscriptions')
        .update(updates)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return data as Subscription;
    } catch (err) {
      setError(err as Error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    getSubscription,
    updateSubscription,
  };
} 