import { useAuth } from '@/hooks/useAuth';
import { fetchUserProfile } from '@/queries/user';
import { useEffect, useState } from 'react';

export function usePremiumStatus() {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.user?.id) {
      setIsPremium(false);
      setLoading(false);
      return;
    }

    const fetchPremiumStatus = async () => {
      try {
        setLoading(true);
        const profile = await fetchUserProfile();
        setIsPremium(profile?.is_premium || false);
      } catch (error) {
        console.error('Error fetching premium status:', error);
        setIsPremium(false);
      } finally {
        setLoading(false);
      }
    };

    fetchPremiumStatus();
  }, [session?.user?.id]);

  return { isPremium, loading };
}
