import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { NotificationPrefs } from '@/lib/applicantProfile';

interface ApplicantNotificationMenuProps {
  notificationPrefs: NotificationPrefs;
  onNotificationChange: (key: keyof NotificationPrefs, value: boolean) => void;
  pending?: boolean;
}

export function ApplicantNotificationMenu({
  notificationPrefs,
  onNotificationChange,
  pending,
}: ApplicantNotificationMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Email notification settings">
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-1 mb-3">
          <p className="font-medium text-sm">Email Notifications</p>
          <p className="text-xs text-muted-foreground">Choose which emails you&apos;d like to receive</p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="nav-pref-updates" className="flex-1 cursor-pointer">
              <p className="font-medium text-sm">Application updates</p>
              <p className="text-xs text-muted-foreground font-normal">Status changes on your applications</p>
            </Label>
            <Switch
              id="nav-pref-updates"
              checked={notificationPrefs.application_updates}
              onCheckedChange={(v) => onNotificationChange('application_updates', v)}
              disabled={pending}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="nav-pref-assessments" className="flex-1 cursor-pointer">
              <p className="font-medium text-sm">Assessment reminders</p>
              <p className="text-xs text-muted-foreground font-normal">Deadlines and new assignments</p>
            </Label>
            <Switch
              id="nav-pref-assessments"
              checked={notificationPrefs.assessment_reminders}
              onCheckedChange={(v) => onNotificationChange('assessment_reminders', v)}
              disabled={pending}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="nav-pref-marketing" className="flex-1 cursor-pointer">
              <p className="font-medium text-sm">Career opportunities</p>
              <p className="text-xs text-muted-foreground font-normal">New job openings and company news</p>
            </Label>
            <Switch
              id="nav-pref-marketing"
              checked={notificationPrefs.marketing}
              onCheckedChange={(v) => onNotificationChange('marketing', v)}
              disabled={pending}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
