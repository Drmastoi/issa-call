import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const CURRENT_POLICY_VERSION = '1.0';

interface ConsentCheckResult {
  needsConsent: boolean;
  currentVersion: string;
  userVersion: string | null;
  loading: boolean;
}

export function useConsentCheck(): ConsentCheckResult {
  const { user } = useAuth();
  const [needsConsent, setNeedsConsent] = useState(false);
  const [userVersion, setUserVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkConsent() {
      if (!user) {
        setLoading(false);
        setNeedsConsent(false);
        return;
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('consent_version_accepted')
          .eq('user_id', user.id)
          .single();

        const acceptedVersion = profile?.consent_version_accepted;
        setUserVersion(acceptedVersion ?? null);
        
        // Check if user needs to accept new policies
        if (!acceptedVersion || acceptedVersion !== CURRENT_POLICY_VERSION) {
          setNeedsConsent(true);
        } else {
          setNeedsConsent(false);
        }
      } catch (error) {
        console.error('Error checking consent:', error);
        // If we can't check, assume consent is needed for safety
        setNeedsConsent(true);
      } finally {
        setLoading(false);
      }
    }

    checkConsent();
  }, [user]);

  return {
    needsConsent,
    currentVersion: CURRENT_POLICY_VERSION,
    userVersion,
    loading,
  };
}
