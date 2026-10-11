import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { AppNotification } from '@/hooks/useNotifications';

export interface SettingsTabExtension {
  value: string;
  label: string;
  icon: LucideIcon;
  superAdminOnly?: boolean;
  Component: ComponentType;
}

export interface ChitraMessageAttachmentProps {
  notification: AppNotification;
  messages: AppNotification[];
  isOpen: boolean;
}

export interface AppExtensions {
  settingsTabs?: SettingsTabExtension[];
  ChitraMessageAttachment?: ComponentType<ChitraMessageAttachmentProps>;
}

// Deployment-specific add-ons are picked up from src/extensions/index.ts when that module exists.
const modules = import.meta.glob<{ default: AppExtensions }>('../extensions/index.ts', { eager: true });

export const extensions: AppExtensions = Object.values(modules)[0]?.default ?? {};
