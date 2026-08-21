import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, User, Lock, LogOut, Globe, Camera } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useToast } from '@/hooks/use-toast';
import {
  BROWSER_TIMEZONE,
  buildTimezoneOptions,
  detectBrowserTimezone,
  resolveTimezoneOptionValue,
} from '@/lib/formatTz';
import { avatarUploadErrorMessage, isAllowedAvatarInput, prepareAvatarImage } from '@/lib/avatarImage';

const AVATAR_BUCKET = 'avatars';
const AVATAR_CONTENT_TYPE = 'image/jpeg';

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignOut?: () => void;
}

function avatarStoragePath(userId: string, ext: string) {
  return `${userId}/avatar.${ext}`;
}

function avatarPathFromUrl(url: string): string | null {
  const match = url.match(/\/avatars\/(.+?)(?:\?|$)/);
  return match?.[1] ?? null;
}

function isEmailLikeName(name: string | null | undefined): boolean {
  return !!name?.includes('@');
}

function resolveFullName(authName?: string | null, profileName?: string | null): string {
  const auth = (authName || '').trim();
  if (auth && !isEmailLikeName(auth)) return auth;
  const profile = (profileName || '').trim();
  if (profile && !isEmailLikeName(profile)) return profile;
  return '';
}

function resolveDisplayName(
  authName?: string | null,
  profileName?: string | null,
  email?: string | null,
): string {
  const name = resolveFullName(authName, profileName);
  if (name) return name;
  if (email?.includes('@')) return email.split('@')[0];
  return 'User';
}

export function ProfileDialog({ open, onOpenChange, onSignOut }: ProfileDialogProps) {
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [timezone, setTimezone] = useState(() => resolveTimezoneOptionValue(BROWSER_TIMEZONE));
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const timezoneOptions = buildTimezoneOptions(timezone, profile?.timezone, BROWSER_TIMEZONE);

  useEffect(() => {
    if (open && user) {
      setFullName(resolveFullName(user.user_metadata?.full_name, profile?.full_name));
      setNewPassword('');
      setConfirmPassword('');
      setTimezone(resolveTimezoneOptionValue(profile?.timezone || detectBrowserTimezone()));
    }
  }, [open, user, profile?.full_name, profile?.timezone]);

  const displayName = resolveDisplayName(user?.user_metadata?.full_name, profile?.full_name, user?.email);
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const avatarUrl = profile?.avatar_url ?? null;

  const invalidateProfile = () => {
    queryClient.invalidateQueries({ queryKey: ['user-profile', user!.id] });
    queryClient.invalidateQueries({ queryKey: ['user-timezone', user!.id] });
  };

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!isAllowedAvatarInput(file)) {
        throw new Error('Please upload a JPEG, PNG, or WebP image');
      }

      const blob = await prepareAvatarImage(file);
      const path = avatarStoragePath(user!.id, 'jpg');

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, blob, { upsert: true, contentType: AVATAR_CONTENT_TYPE });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const avatarUrlWithCache = `${publicUrl}?t=${Date.now()}`;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrlWithCache })
        .eq('user_id', user!.id);
      if (profileError) throw profileError;

      return avatarUrlWithCache;
    },
    onSuccess: () => {
      invalidateProfile();
      toast({ title: 'Profile photo updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Upload failed', description: avatarUploadErrorMessage(err), variant: 'destructive' });
    },
  });

  const removeAvatarMutation = useMutation({
    mutationFn: async () => {
      if (avatarUrl) {
        const path = avatarPathFromUrl(avatarUrl);
        if (path) {
          await supabase.storage.from(AVATAR_BUCKET).remove([path]);
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateProfile();
      toast({ title: 'Profile photo removed' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to remove photo', description: err.message, variant: 'destructive' });
    },
  });

  const avatarBusy = uploadAvatarMutation.isPending || removeAvatarMutation.isPending;

  const handleAvatarSelect = (file: File | undefined) => {
    if (!file) return;
    uploadAvatarMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      toast({ title: 'Name cannot be empty', variant: 'destructive' });
      return;
    }
    setSavingProfile(true);
    try {
      const [authRes, profileRes] = await Promise.all([
        supabase.auth.updateUser({ data: { full_name: fullName.trim() } }),
        supabase.from('profiles').update({ full_name: fullName.trim(), timezone } as any).eq('user_id', user!.id),
      ]);
      invalidateProfile();
      if (authRes.error) throw authRes.error;
      if (profileRes.error) throw profileRes.error;
      toast({ title: 'Profile updated' });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed to update profile', description: err.message, variant: 'destructive' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password changed successfully' });
      setNewPassword('');
      setConfirmPassword('');
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed to change password', description: err.message, variant: 'destructive' });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md min-w-0 max-h-[90dvh] overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>My Profile</DialogTitle>
          <DialogDescription className="sr-only">
            Update your profile details, timezone, and password.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 items-center gap-4 pb-2">
          <div className="flex flex-col items-center shrink-0 gap-1">
            <div className="relative">
              <button
                type="button"
                className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                onClick={() => !avatarBusy && fileInputRef.current?.click()}
                disabled={avatarBusy}
                aria-label="Change profile photo"
              >
                <Avatar className="w-16 h-16 border-2 border-primary/20 group-hover:border-primary/40 transition-colors">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                  <AvatarFallback className="bg-primary text-primary-foreground text-lg font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {avatarBusy && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </span>
                )}
                {!avatarBusy && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm">
                    <Camera className="w-3 h-3" />
                  </span>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={avatarBusy}
                onChange={(e) => handleAvatarSelect(e.target.files?.[0])}
              />
            </div>
            {avatarUrl && (
              <button
                type="button"
                className="text-xs text-destructive hover:underline disabled:opacity-50"
                disabled={avatarBusy}
                onClick={() => removeAvatarMutation.mutate()}
              >
                Remove
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-base truncate">{displayName}</p>
            <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>

        <Tabs defaultValue="profile" className="min-w-0">
          <TabsList className="grid h-auto w-full grid-cols-2 p-1">
            <TabsTrigger value="profile" className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
              <User className="h-4 w-4 shrink-0" />
              <span className="truncate">Edit Profile</span>
            </TabsTrigger>
            <TabsTrigger value="password" className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
              <Lock className="h-4 w-4 shrink-0" />
              <span className="truncate">Change Password</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="min-w-0 space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                disabled={savingProfile}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email ?? ''} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                Timezone
              </Label>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={timezone} onValueChange={setTimezone} disabled={savingProfile}>
                  <SelectTrigger className="w-full min-w-0 sm:flex-1">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full shrink-0 text-xs sm:w-auto"
                  disabled={savingProfile}
                  onClick={() => setTimezone(resolveTimezoneOptionValue(detectBrowserTimezone()))}
                >
                  Auto-detect
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Used to display interview times in your local time.
              </p>
            </div>
            <Button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="w-full btn-gradient text-primary-foreground"
            >
              {savingProfile ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : 'Save Changes'}
            </Button>
          </TabsContent>

          <TabsContent value="password" className="min-w-0 space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={savingPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={savingPassword}
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={savingPassword}
              className="w-full btn-gradient text-primary-foreground"
            >
              {savingPassword ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Updating...</> : 'Change Password'}
            </Button>
          </TabsContent>
        </Tabs>

        {onSignOut && (
          <>
            <Separator className="mt-2" />
            <Button
              variant="ghost"
              className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 mt-1"
              onClick={() => { onSignOut(); onOpenChange(false); }}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
