import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useNavigate, Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useApplicantAuth } from '@/hooks/useApplicantAuth';
import { useAuth } from '@/hooks/useAuth';
import {
  APPLICANT_DASHBOARD_PATH,
  isSafeApplicantRedirect,
} from '@/lib/publicRoutes';
import { useToast } from '@/hooks/use-toast';
import { Mail, ArrowRight, Loader2, Briefcase, User, Lock, Eye, EyeOff } from 'lucide-react';
import { ApplicantPortalHeader, useCompanyDisplayName } from '@/components/CompanyLogo';

export default function ApplicantLogin() {
  const companyName = useCompanyDisplayName();
  usePageTitle(companyName ? `${companyName} | Applicant Login` : 'Applicant Login');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp, user, isLoading: authLoading, ensureProfile } = useApplicantAuth();
  const { isStaff, identityResolved, applicantPortalSynced } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const resolvePostLoginPath = () => {
    const redirect = searchParams.get('redirect');
    if (isSafeApplicantRedirect(redirect)) {
      return redirect;
    }
    return APPLICANT_DASHBOARD_PATH;
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast({ title: 'Enter your email first', description: 'Type your email address above, then click "Forgot your password?"', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    const { supabase } = await import('@/integrations/supabase/client');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
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
    if (searchParams.get('verified') !== '1' || !user) return;
    void ensureProfile();
    toast({
      title: 'Email verified',
      description: 'Your account is confirmed. Welcome to the applicant portal.',
    });
  }, [searchParams, user, ensureProfile, toast]);

  useEffect(() => {
    if (!authLoading && user && identityResolved && applicantPortalSynced) {
      if (isStaff) {
        toast({
          title: 'Staff account detected',
          description: 'Redirecting you to the internal dashboard.',
        });
        navigate('/', { replace: true });
      } else {
        navigate(resolvePostLoginPath(), { replace: true });
      }
    }
  }, [user, authLoading, identityResolved, applicantPortalSynced, isStaff, navigate, toast, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast({ title: 'Please fill in all fields', variant: 'destructive' });
      return;
    }

    if (mode === 'signup' && !fullName.trim()) {
      toast({ title: 'Please enter your full name', variant: 'destructive' });
      return;
    }

    if (password.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }

    setIsLoading(true);

    if (mode === 'signup') {
      const { error } = await signUp(
        email.trim().toLowerCase(),
        password,
        fullName.trim(),
        searchParams.get('redirect'),
      );
      setIsLoading(false);

      if (error) {
        toast({ title: 'Signup failed', description: error.message, variant: 'destructive' });
        return;
      }

      toast({ 
        title: 'Account created!', 
        description: 'Please check your email to verify your account before signing in.' 
      });
      setMode('login');
    } else {
      const { error } = await signIn(email.trim().toLowerCase(), password);
      setIsLoading(false);

      if (error) {
        toast({ title: 'Login failed', description: error.message, variant: 'destructive' });
        return;
      }
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex flex-col">
      <ApplicantPortalHeader
        homeHref="/careers"
        actions={
          <Link to="/careers">
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              <Briefcase className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">View Jobs</span>
              <span className="sm:hidden">Jobs</span>
            </Button>
          </Link>
        }
      />

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 rounded-full bg-primary/10">
              {mode === 'login' ? (
                <Lock className="h-8 w-8 text-primary" />
              ) : (
                <User className="h-8 w-8 text-primary" />
              )}
            </div>
            <CardTitle className="text-2xl">
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </CardTitle>
            <CardDescription>
              {mode === 'login' 
                ? 'Sign in to your applicant portal to view jobs and track applications'
                : 'Create an account to apply for jobs and track your applications'
              }
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                {isLoading 
                  ? (mode === 'login' ? 'Signing in...' : 'Creating account...') 
                  : (mode === 'login' ? 'Sign In' : 'Create Account')
                }
              </Button>
              {mode === 'login' && (
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
              )}
            </form>
          </CardContent>
          
          <CardFooter className="flex flex-col gap-4 text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <p>
                Don't have an account?{' '}
                <button 
                  onClick={() => setMode('signup')} 
                  className="text-primary font-medium hover:underline"
                >
                  Create one
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button 
                  onClick={() => setMode('login')} 
                  className="text-primary font-medium hover:underline"
                >
                  Sign in
                </button>
              </p>
            )}
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}