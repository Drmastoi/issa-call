import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Shield, FileText, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PolicyAcceptanceModalProps {
  open: boolean;
  currentVersion: string;
  onAccepted: () => void;
}

const CURRENT_POLICY_VERSION = '1.0';

export function PolicyAcceptanceModal({ open, currentVersion, onAccepted }: PolicyAcceptanceModalProps) {
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [dataProcessingAccepted, setDataProcessingAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allAccepted = privacyAccepted && termsAccepted && dataProcessingAccepted;

  const handleAccept = async () => {
    if (!allAccepted) return;

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Log consent
      const consentTypes = ['privacy_policy', 'terms_of_service', 'data_processing'];
      for (const consentType of consentTypes) {
        await supabase.from('user_consent_log').insert({
          user_id: user.id,
          consent_type: consentType,
          policy_version: CURRENT_POLICY_VERSION,
          user_agent: navigator.userAgent,
        });
      }

      // Update profile with new consent version
      await supabase
        .from('profiles')
        .update({
          consent_version_accepted: CURRENT_POLICY_VERSION,
          consent_accepted_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      toast.success('Policies accepted successfully');
      onAccepted();
    } catch (error) {
      console.error('Error accepting policies:', error);
      toast.error('Failed to accept policies. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Policy Update Required
          </DialogTitle>
          <DialogDescription>
            We've updated our policies. Please review and accept them to continue using the application.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4 bg-muted/50">
            <h4 className="font-medium mb-2">What's changed in v{CURRENT_POLICY_VERSION}:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Enhanced data protection measures</li>
              <li>• Updated GDPR compliance procedures</li>
              <li>• Improved security controls</li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="privacy"
                checked={privacyAccepted}
                onCheckedChange={(checked) => setPrivacyAccepted(checked === true)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="privacy" className="flex items-center gap-2 cursor-pointer">
                  <FileText className="h-4 w-4" />
                  I accept the Privacy Policy
                </Label>
                <p className="text-xs text-muted-foreground">
                  View our{' '}
                  <a href="/privacy-policy" className="text-primary underline" target="_blank">
                    Privacy Policy
                  </a>
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="terms"
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked === true)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="terms" className="flex items-center gap-2 cursor-pointer">
                  <FileText className="h-4 w-4" />
                  I accept the Terms of Service
                </Label>
                <p className="text-xs text-muted-foreground">
                  View our{' '}
                  <a href="/terms-of-service" className="text-primary underline" target="_blank">
                    Terms of Service
                  </a>
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="dataProcessing"
                checked={dataProcessingAccepted}
                onCheckedChange={(checked) => setDataProcessingAccepted(checked === true)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="dataProcessing" className="flex items-center gap-2 cursor-pointer">
                  <Database className="h-4 w-4" />
                  I consent to data processing
                </Label>
                <p className="text-xs text-muted-foreground">
                  Your data is processed in accordance with NHS data protection standards
                </p>
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={handleAccept}
          disabled={!allAccepted || isSubmitting}
          className="w-full"
        >
          {isSubmitting ? 'Processing...' : 'Accept and Continue'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export { CURRENT_POLICY_VERSION };
