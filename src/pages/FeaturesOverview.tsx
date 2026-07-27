import { useEffect, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';
import {
  FEATURES,
  markFeaturesAsSeen,
  type Role,
  type Feature,
} from '@/lib/features';

type Tab = 'All' | Role;

const TABS: Tab[] = ['All', 'Admin', 'HR', 'Recruiter', 'Interviewer', 'Candidate'];

const roleColors: Record<Role, string> = {
  Admin: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  HR: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Recruiter: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Interviewer: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  Candidate: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

function isNew(addedAt: string): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return new Date(addedAt) >= cutoff;
}

function FeatureCard({ feature }: { feature: Feature }) {
  const newFeature = isNew(feature.addedAt);
  return (
    <Card className="flex flex-col h-full">
      <CardContent className="flex flex-col h-full gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-sm leading-tight">{feature.title}</span>
          {newFeature && (
            <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500 text-white leading-none">
              New
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground flex-1">{feature.description}</p>
        <div className="flex flex-wrap gap-1 pt-1">
          {feature.roles.map(role => (
            <span
              key={role}
              className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none',
                roleColors[role],
              )}
            >
              {role}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FeaturesOverview() {
  usePageTitle('Features Overview');

  const [activeTab, setActiveTab] = useState<Tab>('All');

  useEffect(() => {
    markFeaturesAsSeen();
  }, []);

  const filtered = (activeTab === 'All'
    ? FEATURES
    : FEATURES.filter(f => f.roles.includes(activeTab as Role))
  ).sort((a, b) => (isNew(b.addedAt) ? 1 : 0) - (isNew(a.addedAt) ? 1 : 0));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header showSearch={false} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <LayoutGrid className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Platform Features</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Everything The Talent App can do, organised by role.
          </p>
        </div>

        {/* Role tabs */}
        <div className="border-b border-border mb-6">
          <div className="flex items-center gap-0 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                  activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {tab === 'All'
                    ? FEATURES.length
                    : FEATURES.filter(f => f.roles.includes(tab as Role)).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(feature => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
