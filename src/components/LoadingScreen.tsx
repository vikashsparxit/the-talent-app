import { useState, useEffect } from 'react';

import talentAppLogo from '@/assets/The-Talent-App-Logo.png';

const MESSAGES = [
  'Loading your talent pipeline…',
  'Fetching candidate profiles…',
  'Checking interview schedules…',
  'Syncing recruitment data…',
  'Preparing your dashboard…',
  'Warming up Chitragupta…',
  'Crunching pipeline metrics…',
  'Almost there…',
];

export function LoadingScreen() {
  const [msgIndex, setMsgIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const cycle = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setMsgIndex(i => (i + 1) % MESSAGES.length);
        setVisible(true);
      }, 300);
    }, 2500);
    return () => clearInterval(cycle);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-8 px-4">
      <img
        src={talentAppLogo}
        alt="The Talent App"
        className="h-14 sm:h-16 w-auto select-none"
      />

      <div className="flex items-center gap-2">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>

      <p
        className="text-sm text-muted-foreground transition-opacity duration-300 h-5 text-center"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {MESSAGES[msgIndex]}
      </p>
    </div>
  );
}
