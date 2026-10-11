import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Camera, Loader2, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useApplicantAuth } from '@/hooks/useApplicantAuth';
import { useToast } from '@/hooks/use-toast';
import {
  avatarUploadErrorMessage,
  isAllowedAvatarInput,
  prepareAvatarImage,
} from '@/lib/avatarImage';
import { getApplicantDisplayName } from '@/lib/applicantProfile';
import { cn } from '@/lib/utils';

const AVATAR_BUCKET = 'avatars';
const AVATAR_CONTENT_TYPE = 'image/jpeg';

function avatarStoragePath(userId: string) {
  return `${userId}/avatar.jpg`;
}

function avatarPathFromUrl(url: string): string | null {
  const match = url.match(/\/avatars\/(.+?)(?:\?|$)/);
  return match?.[1] ?? null;
}

interface ApplicantAvatarUploadProps {
  avatarUrl?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const sizeClasses = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-24 w-24',
};

export function ApplicantAvatarUpload({
  avatarUrl,
  className,
  size = 'md',
  showLabel = false,
}: ApplicantAvatarUploadProps) {
  const { user, profile, updateProfile } = useApplicantAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayName = getApplicantDisplayName(profile ?? {}) || profile?.email || 'Applicant';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error('Not authenticated');
      if (!isAllowedAvatarInput(file)) {
        throw new Error('Please upload a JPEG, PNG, or WebP image');
      }

      const blob = await prepareAvatarImage(file);
      const path = avatarStoragePath(user.id);

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, blob, { upsert: true, contentType: AVATAR_CONTENT_TYPE });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const urlWithCache = `${publicUrl}?t=${Date.now()}`;

      const { error: profileError } = await updateProfile({ avatar_url: urlWithCache });
      if (profileError) throw profileError;

      return urlWithCache;
    },
    onSuccess: () => {
      toast({ title: 'Profile photo updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Upload failed', description: avatarUploadErrorMessage(err), variant: 'destructive' });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (avatarUrl) {
        const path = avatarPathFromUrl(avatarUrl);
        if (path) {
          await supabase.storage.from(AVATAR_BUCKET).remove([path]);
        }
      }

      const { error } = await updateProfile({ avatar_url: null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Profile photo removed' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to remove photo', description: err.message, variant: 'destructive' });
    },
  });

  const busy = uploadMutation.isPending || removeMutation.isPending;

  const handleSelect = (file: File | undefined) => {
    if (!file) return;
    uploadMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="relative shrink-0">
        <Avatar className={sizeClasses[size]}>
          {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted disabled:opacity-50"
          aria-label="Change profile photo"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleSelect(e.target.files?.[0])}
        />
      </div>
      {showLabel && (
        <div className="min-w-0">
          <p className="text-sm font-medium">Profile photo</p>
          <p className="text-xs text-muted-foreground">Optional — JPEG, PNG, or WebP</p>
          {avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-0 text-xs text-muted-foreground hover:text-destructive mt-1"
              disabled={busy}
              onClick={() => removeMutation.mutate()}
            >
              <X className="h-3 w-3 mr-1" />
              Remove photo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
