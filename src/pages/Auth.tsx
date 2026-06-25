import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { Loader2, MailCheck } from 'lucide-react';
import { APPLICANT_DASHBOARD_PATH, APPLICANT_LOGIN_VERIFY_PATH, isApplicantPortalUserMetadata } from '@/lib/publicRoutes';
import talentAppLogo from '@/assets/The-Talent-App-Logo.png';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');
const nameSchema = z.string().min(2, 'Name must be at least 2 characters');

export default function Auth() {
  usePageTitle('Sign In');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const [signupPendingEmail, setSignupPendingEmail] = useState<string | null>(null);
  
  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginErrors, setLoginErrors] = useState<{ email?: string; password?: string }>({});
  
  // Signup form
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupErrors, setSignupErrors] = useState<{ email?: string; password?: string; name?: string }>({});
  
  const { signIn, signUp, user, isApplicant, identityResolved } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const staffRedirectTarget = (() => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from && from.startsWith('/') && !from.startsWith('//') && from !== '/auth') {
      return from;
    }
    return '/';
  })();

  const handleForgotPassword = async () => {
    if (!loginEmail.trim()) {
      toast({ title: 'Enter your email first', description: 'Type your email address in the field above, then click "Forgot your password?"', variant: 'destructive' });
      return;
    }
    try {
      emailSchema.parse(loginEmail);
    } catch {
      toast({ title: 'Please enter a valid email address', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    const { error } = await (await import('@/integrations/supabase/client')).supabase.auth.resetPasswordForEmail(loginEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Reset link sent', description: 'Check your email for a password reset link.' });
    }
  };

  useEffect(() => {
    if (user && identityResolved) {
      if (isApplicant) {
        navigate(APPLICANT_DASHBOARD_PATH, { replace: true });
      } else if (isApplicantPortalUserMetadata(user.user_metadata)) {
        navigate(APPLICANT_LOGIN_VERIFY_PATH, { replace: true });
      } else {
        navigate(staffRedirectTarget, { replace: true });
      }
    }
  }, [user, identityResolved, isApplicant, navigate, staffRedirectTarget]);

  const validateLogin = () => {
    const errors: { email?: string; password?: string } = {};
    
    try {
      emailSchema.parse(loginEmail);
    } catch (e) {
      if (e instanceof z.ZodError) {
        errors.email = e.errors[0].message;
      }
    }
    
    try {
      passwordSchema.parse(loginPassword);
    } catch (e) {
      if (e instanceof z.ZodError) {
        errors.password = e.errors[0].message;
      }
    }
    
    setLoginErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateSignup = () => {
    const errors: { email?: string; password?: string; name?: string } = {};
    
    try {
      nameSchema.parse(signupName);
    } catch (e) {
      if (e instanceof z.ZodError) {
        errors.name = e.errors[0].message;
      }
    }
    
    try {
      emailSchema.parse(signupEmail);
    } catch (e) {
      if (e instanceof z.ZodError) {
        errors.email = e.errors[0].message;
      }
    }
    
    try {
      passwordSchema.parse(signupPassword);
    } catch (e) {
      if (e instanceof z.ZodError) {
        errors.password = e.errors[0].message;
      }
    }
    
    setSignupErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateLogin()) return;
    
    setIsLoading(true);
    
    const { error } = await signIn(loginEmail, loginPassword);
    
    if (error) {
      let message = 'An error occurred during login';
      
      if (error.message.includes('Invalid login credentials')) {
        message = 'Invalid email or password. Please try again.';
      } else if (error.message.includes('Email not confirmed')) {
        message = 'Please confirm your email before logging in.';
      }
      
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: message,
      });
    } else {
      toast({
        title: 'Welcome back!',
        description: 'You have successfully logged in.',
      });
    }
    
    setIsLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateSignup()) return;
    
    setIsLoading(true);
    
    const { error, session } = await signUp(signupEmail, signupPassword, signupName);

    if (error) {
      let message = 'An error occurred during signup';

      if (error.message.includes('User already registered')) {
        message = 'This email is already registered. Please log in instead.';
      } else if (error.message.includes('Password')) {
        message = error.message;
      }

      toast({
        variant: 'destructive',
        title: 'Signup Failed',
        description: message,
      });
    } else if (!session) {
      // Email confirmation required — Supabase didn't auto-confirm
      setSignupPendingEmail(signupEmail);
    } else {
      toast({
        title: 'Account created!',
        description: 'Welcome to The Talent App.',
      });
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center justify-center mb-8">
          <img
            src={talentAppLogo}
            alt="The Talent App"
            className="h-14 w-auto mb-3"
          />
          <p className="text-sm text-muted-foreground">Talent Acquisition Platform</p>
        </div>

        {signupPendingEmail ? (
          <Card className="border-border/50 shadow-lg">
            <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
              <div className="p-4 rounded-full bg-primary/10">
                <MailCheck className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Check your email</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  We sent a confirmation link to<br />
                  <span className="font-medium text-foreground">{signupPendingEmail}</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground max-w-xs">
                Click the link in the email to confirm your account. Once confirmed, an admin will assign your role before you can access the platform.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSignupPendingEmail(null); setActiveTab('login'); }}
              >
                Back to login
              </Button>
            </CardContent>
          </Card>
        ) : (
        <Card className="border-border/50 shadow-lg">
          <CardHeader className="text-center pb-4">
            <CardTitle className="font-display text-xl">Welcome</CardTitle>
            <CardDescription>
              Sign in to manage sourcing, pipeline, and hiring in one place
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@company.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className={loginErrors.email ? 'border-destructive' : ''}
                    />
                    {loginErrors.email && (
                      <p className="text-sm text-destructive">{loginErrors.email}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className={loginErrors.password ? 'border-destructive' : ''}
                    />
                    {loginErrors.password && (
                      <p className="text-sm text-destructive">{loginErrors.password}</p>
                    )}
                  </div>
                  
                  <Button
                    type="submit"
                    className="w-full btn-gradient text-primary-foreground"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-sm text-muted-foreground hover:text-primary hover:underline"
                      disabled={isLoading}
                    >
                      Forgot your password?
                    </button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="John Doe"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      className={signupErrors.name ? 'border-destructive' : ''}
                    />
                    {signupErrors.name && (
                      <p className="text-sm text-destructive">{signupErrors.name}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@company.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className={signupErrors.email ? 'border-destructive' : ''}
                    />
                    {signupErrors.email && (
                      <p className="text-sm text-destructive">{signupErrors.email}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className={signupErrors.password ? 'border-destructive' : ''}
                    />
                    {signupErrors.password && (
                      <p className="text-sm text-destructive">{signupErrors.password}</p>
                    )}
                  </div>
                  
                  <Button
                    type="submit"
                    className="w-full btn-gradient text-primary-foreground"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        )}

        <div className="text-center text-sm text-muted-foreground mt-6 space-y-1">
          <p>By continuing, you agree to The Talent App&apos;s terms of service.</p>
          <p>
            Built by{' '}
            <a
              href="https://www.sparxitsolutions.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              SparxIT
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
