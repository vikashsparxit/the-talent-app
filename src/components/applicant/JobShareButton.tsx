import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { buildMailtoReferralLink, copyJobLink, incrementReferralShareCount, shareJob } from '@/lib/jobShare';
import { useApplicantAuth } from '@/hooks/useApplicantAuth';
import type { Job } from '@/types/jobs';
import { Copy, Mail, Share2, UserPlus } from 'lucide-react';

interface JobShareButtonProps {
  job: Pick<Job, 'title' | 'id'>;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  onReferralShared?: () => void;
}

export function JobShareButton({
  job,
  variant = 'outline',
  size = 'sm',
  className,
  onReferralShared,
}: JobShareButtonProps) {
  const { toast } = useToast();
  const { user } = useApplicantAuth();
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  const trackReferral = () => {
    if (user?.id) {
      incrementReferralShareCount(user.id);
      onReferralShared?.();
    }
  };

  const handleCopy = async () => {
    const copied = await copyJobLink(job.id);
    if (copied) {
      trackReferral();
      toast({ title: 'Link copied', description: 'Job link copied to clipboard.' });
    } else {
      toast({ title: 'Copy failed', description: 'Could not copy the link.', variant: 'destructive' });
    }
  };

  const handleShare = async () => {
    const result = await shareJob(job);
    if (result === 'shared' || result === 'copied') {
      trackReferral();
    }
    if (result === 'copied') {
      toast({ title: 'Link copied', description: 'Sharing is unavailable — link copied instead.' });
    } else if (result === 'unsupported') {
      toast({ title: 'Share unavailable', description: 'Try copy link or email instead.', variant: 'destructive' });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className} type="button">
          <UserPlus className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Refer a Friend</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canNativeShare && (
          <DropdownMenuItem onClick={handleShare}>
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleCopy}>
          <Copy className="h-4 w-4 mr-2" />
          Copy link
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={buildMailtoReferralLink(job)} onClick={trackReferral}>
            <Mail className="h-4 w-4 mr-2" />
            Email friend
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
