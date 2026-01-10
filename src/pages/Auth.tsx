import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Phone, Shield, Users } from 'lucide-react';

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const { error } = await signIn(email, password);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Sign in failed',
        description: error.message,
      });
    } else {
      navigate('/dashboard');
    }
    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const fullName = formData.get('fullName') as string;

    const { error } = await signUp(email, password, fullName);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Sign up failed',
        description: error.message,
      });
    } else {
      toast({
        title: 'Account created',
        description: 'You can now sign in with your credentials.',
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
              <span>Secure data storage & export</span>
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
                    <Label htmlFor="signin-password">Password</Label>
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
                      minLength={6}
                      required
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isLoading}>
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
