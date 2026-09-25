import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createAppQueryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider, RoleRestrictedRoute, ApplicantRoute } from "@/hooks/useAuth";
import { ApplicantAuthProvider } from "@/hooks/useApplicantAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Jobs from "./pages/Jobs";
import Assessments from "./pages/Assessments";
import AssessmentBuilder from "./pages/AssessmentBuilder";
import Candidates from "./pages/Candidates";
import Evaluations from "./pages/Evaluations";
import EvaluationDetail from "./pages/EvaluationDetail";
import Analytics from "./pages/Analytics";
import CandidatePortal from "./pages/CandidatePortal";
import Careers from "./pages/Careers";
import ApplicantLogin from "./pages/ApplicantLogin";
import ApplicantDashboard from "./pages/ApplicantDashboard";
import ApplicantProfile from "./pages/ApplicantProfile";
import ApplicantApplicationDetail from "./pages/ApplicantApplicationDetail";
import ApplicantJobApplicationForm from "./pages/ApplicantJobApplicationForm";
import ApplicantJobDetail from "./pages/ApplicantJobDetail";
import ApplicantExam from "./pages/ApplicantExam";
import Settings from "./pages/Settings";
import Hiring, { HiringLegacyRedirect } from "./pages/Hiring";
import InterviewCalendar from "./pages/InterviewCalendar";
import MyInterviews from "./pages/MyInterviews";
import Reports from "./pages/Reports";
import ResetPassword from "./pages/ResetPassword";
import FeaturesOverview from "./pages/FeaturesOverview";
import Help from "./pages/Help";
import NotFound from "./pages/NotFound";
import { PendingFeedbackGate } from "@/components/PendingFeedbackGate";
import { ChitraProvider } from "@/components/ChitraWidget";
import { GlobalSearchProvider } from "@/components/GlobalSearchCommand";
import { BottomNav } from "@/components/BottomNav";
import { BrandThemeProvider } from "@/hooks/useBrandTheme";
import { StaffLayout } from "@/components/AppShell";
import {
  applicantEmailRedirectUrl,
  shouldRedirectApplicantEmailConfirm,
} from "@/lib/publicRoutes";

const queryClient = createAppQueryClient();

function AuthEmailConfirmRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const maybeRedirectApplicantConfirm = (
      metadata: Record<string, unknown> | undefined,
    ) => {
      if (!shouldRedirectApplicantEmailConfirm(metadata, location.pathname, location.search)) {
        return;
      }
      const redirect = new URLSearchParams(location.search).get('redirect');
      navigate(applicantEmailRedirectUrl(window.location.origin, redirect), { replace: true });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
      if (!session?.user) return;
      maybeRedirectApplicantConfirm(session.user.user_metadata);
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        maybeRedirectApplicantConfirm(session.user.user_metadata);
      }
    });

    return () => subscription.unsubscribe();
  }, [location.pathname, location.search, navigate]);

  return null;
}

function ConnectivityBar() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    const onOffline = () => {
      setIsOnline(false);
      setShowBackOnline(false);
    };

    const onOnline = () => {
      setIsOnline(true);
      setShowBackOnline(true);
      window.setTimeout(() => setShowBackOnline(false), 3500);
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (isOnline && !showBackOnline) {
    return null;
  }

  return (
    <div
      className={`fixed inset-x-0 top-0 z-[100] px-4 py-2 text-center text-sm font-medium text-white ${
        isOnline ? "bg-green-600" : "bg-red-600"
      }`}
      role="status"
      aria-live="polite"
    >
      {isOnline ? "Back online" : "No internet connection"}
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrandThemeProvider>
    <AuthProvider>
      <ApplicantAuthProvider>
        <TooltipProvider>
          <ConnectivityBar />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthEmailConfirmRedirect />
            <ChitraProvider>
            <GlobalSearchProvider>
            <PendingFeedbackGate />
            <BottomNav />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route path="/" element={<StaffLayout />}>
                <Route index element={<Index />} />
                <Route path="jobs" element={<Jobs />} />
                <Route path="assessments" element={
                  <RoleRestrictedRoute blockedRoles={['interviewer']}>
                    <Assessments />
                  </RoleRestrictedRoute>
                } />
                <Route path="assessments/:id" element={
                  <RoleRestrictedRoute blockedRoles={['interviewer']}>
                    <AssessmentBuilder />
                  </RoleRestrictedRoute>
                } />
                <Route path="hiring" element={<Hiring />} />
                <Route path="candidates" element={<HiringLegacyRedirect view="list" />} />
                <Route path="database" element={<Candidates mode="database" />} />
                <Route path="evaluations" element={<Evaluations />} />
                <Route path="evaluations/:id" element={<EvaluationDetail />} />
                <Route path="analytics" element={
                  <RoleRestrictedRoute blockedRoles={['interviewer']}>
                    <Analytics />
                  </RoleRestrictedRoute>
                } />
                <Route path="settings" element={<Settings />} />
                <Route path="pipeline" element={<HiringLegacyRedirect view="board" />} />
                <Route path="calendar" element={<InterviewCalendar />} />
                <Route path="my-interviews" element={<MyInterviews />} />
                <Route path="reports" element={
                  <RoleRestrictedRoute blockedRoles={['interviewer']}>
                    <Reports />
                  </RoleRestrictedRoute>
                } />
                <Route path="features" element={<FeaturesOverview />} />
                <Route path="help" element={<Help />} />
                <Route path="help/:guideId" element={<Help />} />
              </Route>

              {/* Public candidate portal - legacy magic link support */}
              <Route path="/exam" element={<CandidatePortal />} />
              {/* Applicant portal - OTP login for applicants */}
              <Route path="/applicant/login" element={<ApplicantLogin />} />
              <Route path="/applicant" element={<ApplicantRoute><ApplicantDashboard /></ApplicantRoute>} />
              <Route path="/applicant/dashboard" element={<ApplicantRoute><ApplicantDashboard /></ApplicantRoute>} />
              <Route path="/applicant/profile" element={<ApplicantRoute><ApplicantProfile /></ApplicantRoute>} />
              <Route path="/applicant/applications/:id" element={<ApplicantRoute><ApplicantApplicationDetail /></ApplicantRoute>} />
              <Route path="/applicant/applications/:id/form" element={<ApplicantRoute><ApplicantJobApplicationForm /></ApplicantRoute>} />
              <Route path="/applicant/jobs/:id" element={<ApplicantRoute><ApplicantJobDetail /></ApplicantRoute>} />
              <Route path="/exam/:assessmentId" element={<ApplicantExam />} />
              {/* Public careers/jobs page - no auth required */}
              <Route path="/careers" element={<Careers />} />
              <Route path="/careers/:id" element={<Careers />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </GlobalSearchProvider>
            </ChitraProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ApplicantAuthProvider>
    </AuthProvider>
    </BrandThemeProvider>
  </QueryClientProvider>
);

export default App;
