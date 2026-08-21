import { Link, Navigate, useParams } from 'react-router';
import { ArrowLeft, BookOpen, ExternalLink, LayoutGrid } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GuideMarkdown } from '@/components/GuideMarkdown';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  getGuide,
  getVisibleGuides,
  GUIDE_ROLE_COLORS,
  type Guide,
} from '@/lib/guides';

function GuideCard({ guide, compact }: { guide: Guide; compact?: boolean }) {
  const color = GUIDE_ROLE_COLORS[guide.audience] ?? GUIDE_ROLE_COLORS['All staff'];

  return (
    <Link to={`/help/${guide.id}`} className="block h-full">
      <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
        <CardContent className={cn('flex flex-col gap-2', compact ? 'p-4' : 'p-5')}>
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-sm leading-tight">{guide.title}</span>
            <span className={cn('shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none', color)}>
              {guide.audience}
            </span>
          </div>
          <p className="text-xs text-muted-foreground flex-1">{guide.description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Help() {
  const { role } = useAuth();
  const { guideId } = useParams<{ guideId?: string }>();
  const visibleGuides = getVisibleGuides(role);
  const selected = guideId ? getGuide(guideId) : undefined;
  const canViewSelected = selected && visibleGuides.some(g => g.id === selected.id);

  usePageTitle(selected && canViewSelected ? selected.title : 'Help & Guides');

  if (!role) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header showSearch={false} />
        <main className="flex-1 container mx-auto px-4 py-8">
          <p className="text-muted-foreground">Sign in to view role-based guides.</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (guideId && (!selected || !canViewSelected)) {
    return <Navigate to="/help" replace />;
  }

  if (selected && canViewSelected) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header showSearch={false} />
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 space-y-4">
            <Button variant="ghost" size="sm" className="-ml-2" asChild>
              <Link to="/help">
                <ArrowLeft className="h-4 w-4 mr-1" />
                All guides
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-bold">{selected.title}</h1>
              </div>
              <p className="text-sm text-muted-foreground">{selected.description}</p>
            </div>
          </div>
          <GuideMarkdown content={selected.content} />
          <div className="mt-8 pt-6 border-t flex flex-wrap gap-3 text-sm text-muted-foreground">
            <Link to="/features" className="inline-flex items-center gap-1 hover:text-foreground">
              <LayoutGrid className="h-4 w-4" />
              Features Overview
            </Link>
            <a
              href="https://github.com/vikashsparxit/the-talent-app/tree/main/docs/guides"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              View source on GitHub
            </a>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const hiringSequence = visibleGuides.find(g => g.id === 'hiring-sequence');
  const primaryGuide = visibleGuides.find(g => g.roles.includes(role));
  const otherGuides = visibleGuides.filter(
    g => g.id !== 'hiring-sequence' && g !== primaryGuide,
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header showSearch={false} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Help & Guides</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Process playbooks for your role. For capability lists, see{' '}
            <Link to="/features" className="text-primary hover:underline">
              Features Overview
            </Link>
            .
          </p>
        </div>

        {primaryGuide && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Your guide
            </h2>
            <div className="max-w-md">
              <GuideCard guide={primaryGuide} />
            </div>
          </section>
        )}

        {hiringSequence && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Hiring sequence
            </h2>
            <div className="max-w-md">
              <GuideCard guide={hiringSequence} />
            </div>
          </section>
        )}

        {otherGuides.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {role === 'admin' ? 'All playbooks' : 'Related guides'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherGuides.map(guide => (
                <GuideCard key={guide.id} guide={guide} compact />
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
