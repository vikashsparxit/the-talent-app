import { useEffect } from 'react';
import { useBusinessBranding, DEFAULT_BUSINESS_BRANDING } from '@/hooks/useSystemConfig';
import { applyBrandTheme } from '@/lib/brandTheme';

export function BrandThemeProvider({ children }: { children: React.ReactNode }) {
  const { branding, isLoading } = useBusinessBranding();

  useEffect(() => {
    if (!isLoading) {
      applyBrandTheme(
        branding.primary_color ?? DEFAULT_BUSINESS_BRANDING.primary_color,
        branding.primary_foreground_color ?? DEFAULT_BUSINESS_BRANDING.primary_foreground_color,
      );
    }
  }, [branding.primary_color, branding.primary_foreground_color, isLoading]);

  return <>{children}</>;
}
