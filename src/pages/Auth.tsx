import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Phone, Shield, Users, FileText, Database } from 'lucide-react';
import { PasswordStrengthIndicator, validatePassword } from '@/components/auth/PasswordStrengthIndicator';

const CURRENT_POLICY_VERSION = '1.0';

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [signupPassword, setSignupPassword] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [dataProcessingAccepted, setDataProcessingAccepted] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const allConsentsAccepted = privacyAccepted && termsAccepted && dataProcessingAccepted;

  const logLoginActivity = async (userId: string | null, email: string, eventType: string) => {
    try {
      await supabase.from('login_activity').insert({
        user_id: userId,
        email,
        event_type: eventType,
        user_agent: navigator.userAgent,
      });
    } catch (error) {
      console.error('Failed to log login activity:', error);
    }
  };

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const { error } = await signIn(email, password);
    
    if (error) {
      await logLoginActivity(null, email, 'login_failed');
      toast({
        variant: 'destructive',
        title: 'Sign in failed',
        description: error.message,
      });
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      await logLoginActivity(user?.id ?? null, email, 'login_success');
      navigate('/dashboard');
    }
    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Validate password strength
    const { isValid, errors } = validatePassword(signupPassword);
    if (!isValid) {
      toast({
        variant: 'destructive',
        title: 'Password requirements not met',
        description: errors[0],
      });
      return;
    }

    if (!allConsentsAccepted) {
      toast({
        variant: 'destructive',
        title: 'Consent required',
        description: 'Please accept all policies to create an account.',
      });
      return;
    }

    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const fullName = formData.get('fullName') as string;

    const { error } = await signUp(email, signupPassword, fullName);
    
    if (error) {
      await logLoginActivity(null, email, 'signup_failed');
      toast({
        variant: 'destructive',
        title: 'Sign up failed',
        description: error.message,
      });
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Log consent records
        const consentTypes = ['privacy_policy', 'terms_of_service', 'data_processing'];
        for (const consentType of consentTypes) {
          await supabase.from('user_consent_log').insert({
            user_id: user.id,
            consent_type: consentType,
            policy_version: CURRENT_POLICY_VERSION,
            user_agent: navigator.userAgent,
          });
        }

        // Update profile with consent version
        await supabase.from('profiles').update({
          consent_version_accepted: CURRENT_POLICY_VERSION,
          consent_accepted_at: new Date().toISOString(),
        }).eq('user_id', user.id);

        await logLoginActivity(user.id, email, 'signup');
      }

      toast({
        title: 'Account created',
        description: 'Welcome to PatientCall!',
      });
      navigate('/dashboard');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 text-sidebar-foreground">
            <div className="p-2 bg-sidebar-primary rounded-lg">
              <Phone className="h-6 w-6 text-sidebar-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">PatientCall</span>
          </div>
        </div>
        
        <div className="space-y-8">
          <h1 className="text-4xl font-bold text-sidebar-foreground leading-tight">
            Automated Patient Health Data Collection
          </h1>
          <p className="text-sidebar-foreground/70 text-lg">
            Streamline your practice with AI-powered phone calls that collect patient health metrics efficiently and securely.
          </p>
          
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sidebar-foreground/80">
              <div className="p-2 bg-sidebar-accent rounded-lg">
                <Users className="h-5 w-5" />
              </div>
              <span>Batch upload patient lists</span>
            </div>
            <div className="flex items-center gap-4 text-sidebar-foreground/80">
              <div className="p-2 bg-sidebar-accent rounded-lg">
                <Phone className="h-5 w-5" />
              </div>
              <span>Automated AI voice calls</span>
            </div>
            <div className="flex items-center gap-4 text-sidebar-foreground/80">
              <div className="p-2 bg-sidebar-accent rounded-lg">
                <Shield className="h-5 w-5" />
              </div>
              <span>GDPR compliant data handling</span>
            </div>
          </div>
        </div>

        <p className="text-sidebar-foreground/50 text-sm">
          © 2025 PatientCall. Designed for healthcare professionals.
        </p>
      </div>

      {/* Right side - Auth forms */}
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <Tabs defaultValue="signin">
            <CardHeader>
              <div className="lg:hidden flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary rounded-lg">
                  <Phone className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="text-lg font-semibold">PatientCall</span>
              </div>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn}>
                <CardContent className="space-y-4">
                  <CardTitle>Welcome back</CardTitle>
                  <CardDescription>
                    Sign in to your account to continue
                  </CardDescription>
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      name="email"
                      type="email"
                      placeholder="you@practice.nhs.uk"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="signin-password">Password</Label>
                      <Link 
                        to="/forgot-password" 
                        className="text-sm text-primary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <Input
                      id="signin-password"
                      name="password"
                      type="password"
                      required
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp}>
                <CardContent className="space-y-4">
                  <CardTitle>Create an account</CardTitle>
                  <CardDescription>
                    Get started with PatientCall
                  </CardDescription>
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      name="fullName"
                      type="text"
                      placeholder="Dr. Jane Smith"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      placeholder="you@practice.nhs.uk"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      name="password"
                      type="password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                    />
                    <PasswordStrengthIndicator password={signupPassword} />
                  </div>

                  {/* GDPR Consent Checkboxes */}
                  <div className="space-y-3 pt-2 border-t">
                    <p className="text-sm font-medium">Required Consents</p>
                    
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="privacy"
                        checked={privacyAccepted}
                        onCheckedChange={(checked) => setPrivacyAccepted(checked === true)}
                      />
                      <div className="grid gap-1 leading-none">
                        <Label htmlFor="privacy" className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <FileText className="h-3.5 w-3.5" />
                          I accept the Privacy Policy
                        </Label>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="terms"
                        checked={termsAccepted}
                        onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                      />
                      <div className="grid gap-1 leading-none">
                        <Label htmlFor="terms" className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <Shield className="h-3.5 w-3.5" />
                          I accept the Terms of Service
                        </Label>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="dataProcessing"
                        checked={dataProcessingAccepted}
                        onCheckedChange={(checked) => setDataProcessingAccepted(checked === true)}
                      />
                      <div className="grid gap-1 leading-none">
                        <Label htmlFor="dataProcessing" className="flex items-center gap-1.5 text-sm cursor-pointer">
                          <Database className="h-3.5 w-3.5" />
                          I consent to data processing
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          In accordance with NHS data protection standards
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading || !allConsentsAccepted}
                  >
                    {isLoading ? 'Creating account...' : 'Create Account'}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
