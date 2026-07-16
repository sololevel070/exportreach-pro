'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { User, Key, Mail, Shield, Bell, Globe, Palette, CheckCircle, AlertCircle, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/auth-store';

export default function SettingsPage() {
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [profileName, setProfileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    openaiKey: '',
    resendApiKey: '',
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPass: '',
    companyName: '',
    website: '',
    whatsApp: '',
    linkedInUrl: '',
    twitterUrl: '',
    signature: '',
    dailyLimit: 50,
    warmupEnabled: false,
    smtpConfigured: false,
    resendConfigured: false,
    openaiKeyConfigured: false,
    aiProvider: 'google',
    openaiCompatibleKey: '',
    openaiCompatibleBaseUrl: '',
    openaiCompatibleModel: '',
    openaiCompatibleThinking: false,
    openaiCompatibleKeyConfigured: false,
  });
  const [gmailConnected, setGmailConnected] = useState(false);

  // Change-password dialog
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings({
        ...settings,
        smtpHost: data.smtpHost || '',
        smtpPort: data.smtpPort?.toString() || '587',
        smtpUser: data.smtpUser || '',
        smtpPass: data.smtpConfigured ? 'configured' : '',
        resendApiKey: data.resendConfigured ? 'configured' : '',
        companyName: data.companyName || '',
        website: data.website || '',
        whatsApp: data.whatsApp || '',
        linkedInUrl: data.linkedInUrl || '',
        twitterUrl: data.twitterUrl || '',
        signature: data.signature || '',
        dailyLimit: data.dailyLimit || 50,
        warmupEnabled: data.warmupEnabled || false,
        smtpConfigured: data.smtpConfigured || false,
        resendConfigured: data.resendConfigured || false,
        openaiKey: data.openaiKey ? 'configured' : '',
        openaiKeyConfigured: !!data.openaiKey,
        aiProvider: data.aiProvider || 'google',
        openaiCompatibleKey: data.openaiCompatibleKey ? 'configured' : '',
        openaiCompatibleBaseUrl: data.openaiCompatibleBaseUrl || '',
        openaiCompatibleModel: data.openaiCompatibleModel || '',
        openaiCompatibleThinking: data.openaiCompatibleThinking || false,
        openaiCompatibleKeyConfigured: !!data.openaiCompatibleKey,
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        toast({
          title: 'Settings saved',
          description: 'Your settings have been updated successfully.',
          variant: 'success',
        });
        fetchSettings();
      } else {
        const errorData = await res.json();
        toast({
          title: 'Error saving settings',
          description: errorData.error || 'Something went wrong.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error saving settings',
        description: 'Failed to connect to the server.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (user?.name) setProfileName(user.name);
  }, [user?.name]);

  const handleUpdateProfile = () => {
    // Persist the display name to the auth store so the header avatar/name update immediately,
    // and save the profile/company fields to the backend.
    if (user) {
      setUser({ ...user, name: profileName });
    }
    saveSettings();
    toast({ title: 'Profile updated', description: 'Your profile information has been saved.', variant: 'success' });
  };

  const handleConnectGmail = () => {
    toast({
      title: 'Use SMTP App Password',
      description:
        'Set host smtp.gmail.com, port 465, your Gmail address and a Google App Password in SMTP Configuration to send via Gmail.',
    });
  };

  const handleDisconnectGmail = () => {
    setGmailConnected(false);
    toast({ title: 'Gmail disconnected' });
  };

  const clearSmtpSettings = async () => {
    if (!confirm('Are you sure you want to remove SMTP configuration? You can add a new one anytime.')) {
      return;
    }
    try {
      const res = await fetch('/api/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearSmtp: true }),
      });

      if (res.ok) {
        setSettings({
          ...settings,
          smtpHost: '',
          smtpPort: '587',
          smtpUser: '',
          smtpPass: '',
          smtpConfigured: false,
        });
        toast({
          title: 'SMTP configuration removed',
          description: 'You can add a new configuration anytime.',
          variant: 'success',
        });
      } else {
        throw new Error('Failed to clear SMTP settings');
      }
    } catch (error) {
      console.error('Error clearing SMTP:', error);
      toast({
        title: 'Error removing SMTP configuration',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const clearResendApiKey = async () => {
    if (!confirm('Are you sure you want to remove Resend API key? You can add a new one anytime.')) {
      return;
    }
    try {
      const res = await fetch('/api/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearResend: true }),
      });

      if (res.ok) {
        setSettings({
          ...settings,
          resendApiKey: '',
          resendConfigured: false,
        });
        toast({
          title: 'Resend API key removed',
          description: 'You can add a new one anytime.',
          variant: 'success',
        });
      } else {
        throw new Error('Failed to clear Resend API key');
      }
    } catch (error) {
      console.error('Error clearing Resend:', error);
      toast({
        title: 'Error removing Resend API key',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const clearAiSettings = async () => {
    if (!confirm('Are you sure you want to remove AI configuration? You can add a new one anytime.')) {
      return;
    }
    try {
      const res = await fetch('/api/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAi: true }),
      });

      if (res.ok) {
        setSettings({
          ...settings,
          openaiKey: '',
          openaiKeyConfigured: false,
          openaiCompatibleKey: '',
          openaiCompatibleBaseUrl: '',
          openaiCompatibleModel: '',
          openaiCompatibleThinking: false,
          openaiCompatibleKeyConfigured: false,
        });
        toast({
          title: 'AI configuration removed',
          description: 'You can add a new one anytime.',
          variant: 'success',
        });
      } else {
        throw new Error('Failed to clear AI settings');
      }
    } catch (error) {
      console.error('Error clearing AI settings:', error);
      toast({
        title: 'Error removing AI configuration',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleChangePassword = () => {
    setPwForm({ current: '', next: '', confirm: '' });
    setPwDialogOpen(true);
  };

  const submitPasswordChange = async () => {
    if (pwForm.next.length < 8) {
      toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPwDialogOpen(false);
        toast({ title: 'Password updated', description: 'Your password has been changed.' });
      } else {
        toast({ title: 'Could not change password', description: data.error || 'Try again', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Change password error:', error);
      toast({ title: 'Could not change password', variant: 'destructive' });
    } finally {
      setPwSaving(false);
    }
  };

  const handleEnable2FA = () => {
    toast({ title: 'Two-factor authentication', description: '2FA is not available in offline mode.' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500">Manage your account and integrations</p>
      </div>

      <Tabs defaultValue="integrations">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="signature">Signature</TabsTrigger>
          <TabsTrigger value="sending">Sending</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-slate-200/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Gmail Connection
                </CardTitle>
                <CardDescription>Connect your Gmail account to send emails</CardDescription>
              </CardHeader>
              <CardContent>
                {gmailConnected ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">Connected</p>
                      <p className="text-sm text-slate-500">user@gmail.com</p>
                    </div>
                    <Button variant="outline" size="sm" className="ml-auto" onClick={handleDisconnectGmail}>
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                        <div className="text-sm text-amber-700">
                          Gmail OAuth requires Google Cloud project setup. For production, configure OAuth credentials.
                        </div>
                      </div>
                    </div>
                    <Button className="w-full" onClick={handleConnectGmail}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Connect Gmail
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  SMTP Configuration
                </CardTitle>
                <CardDescription>Configure your SMTP server for email sending</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>SMTP Host</Label>
                      <Input
                        placeholder="smtp.example.com"
                        value={settings.smtpHost}
                        onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Port</Label>
                      <Input
                        placeholder="587"
                        value={settings.smtpPort}
                        onChange={(e) => setSettings({ ...settings, smtpPort: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input
                        placeholder="user@example.com"
                        value={settings.smtpUser}
                        onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={settings.smtpPass}
                        onChange={(e) => setSettings({ ...settings, smtpPass: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={saveSettings} disabled={saving}>
                      {saving ? 'Saving...' : 'Save SMTP Settings'}
                    </Button>
                    {settings.smtpConfigured && (
                      <Button variant="destructive" size="icon" onClick={clearSmtpSettings} title="Remove SMTP configuration">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Resend API
                </CardTitle>
                <CardDescription>Use Resend for reliable email delivery</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      placeholder={settings.resendConfigured ? '••••••••••••' : 're_...'}
                      value={settings.resendApiKey}
                      onChange={(e) => setSettings({ ...settings, resendApiKey: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Status</span>
                    <Badge variant={settings.resendConfigured ? 'default' : 'secondary'}>
                      {settings.resendConfigured ? 'Configured' : 'Not configured'}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={saveSettings} disabled={saving}>
                      {saving ? 'Saving...' : 'Save API Key'}
                    </Button>
                    {settings.resendConfigured && (
                      <Button variant="destructive" size="icon" onClick={clearResendApiKey} title="Remove Resend API key">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200/50 md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  AI Settings
                </CardTitle>
                <CardDescription>Configure the AI provider to power email generation and intelligent lead importing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>AI Provider</Label>
                  <Select
                    value={settings.aiProvider}
                    onValueChange={(val) => setSettings({ ...settings, aiProvider: val })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select AI provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google">Google Gemini</SelectItem>
                      <SelectItem value="openai-compatible">AI provider (OpenAI-compatible)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {settings.aiProvider === 'google' ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Gemini API Key</Label>
                      <Input
                        type="password"
                        placeholder={settings.openaiKeyConfigured ? '••••••••••••' : 'AIzaSy...'}
                        value={settings.openaiKey}
                        onChange={(e) => setSettings({ ...settings, openaiKey: e.target.value })}
                      />
                    </div>
                    <div className="text-sm text-slate-500">
                      Your Gemini API key is encrypted and stored securely.
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Status</span>
                      <Badge variant={settings.openaiKeyConfigured ? 'default' : 'secondary'}>
                        {settings.openaiKeyConfigured ? 'Configured' : 'Not configured'}
                      </Badge>
                    </div>
                    {settings.openaiKeyConfigured && (
                      <Button variant="destructive" size="sm" onClick={clearAiSettings} className="w-full">
                        <Trash2 className="h-3 w-3 mr-2" />
                        Remove Gemini Configuration
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 border-l-2 border-slate-100 pl-4">
                    <div className="text-sm text-slate-500">
                      Works with NVIDIA, OpenRouter (incl. free models), OpenAI, or a local model — set the base URL + model. Your key is encrypted at rest.
                    </div>

                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <Input
                        type="password"
                        placeholder={settings.openaiCompatibleKeyConfigured ? '••••••••••••' : 'Enter API Key...'}
                        value={settings.openaiCompatibleKey}
                        onChange={(e) => setSettings({ ...settings, openaiCompatibleKey: e.target.value })}
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Base URL</Label>
                        <Input
                          placeholder="https://integrate.api.nvidia.com/v1"
                          value={settings.openaiCompatibleBaseUrl}
                          onChange={(e) => setSettings({ ...settings, openaiCompatibleBaseUrl: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Model</Label>
                        <Input
                          placeholder="moonshotai/kimi-k2.6"
                          value={settings.openaiCompatibleModel}
                          onChange={(e) => setSettings({ ...settings, openaiCompatibleModel: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 pt-2">
                      <Switch
                        id="thinking-mode"
                        checked={settings.openaiCompatibleThinking}
                        onCheckedChange={(checked) => setSettings({ ...settings, openaiCompatibleThinking: checked })}
                      />
                      <Label htmlFor="thinking-mode" className="text-sm font-medium leading-none cursor-pointer">
                        Enable provider &quot;thinking&quot; mode (NVIDIA/Moonshot — adds latency; usually off)
                      </Label>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-sm text-slate-500">Status</span>
                      <Badge variant={settings.openaiCompatibleKeyConfigured ? 'default' : 'secondary'}>
                        {settings.openaiCompatibleKeyConfigured ? 'Configured' : 'Not configured'}
                      </Badge>
                    </div>
                    {settings.openaiCompatibleKeyConfigured && (
                      <Button variant="destructive" size="sm" onClick={clearAiSettings} className="w-full">
                        <Trash2 className="h-3 w-3 mr-2" />
                        Remove Configuration
                      </Button>
                    )}
                  </div>
                )}

                <Button className="flex-1" onClick={saveSettings} disabled={saving}>
                  {saving ? 'Saving...' : 'Save AI Configuration'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="signature" className="space-y-6">
          <Card className="border-slate-200/50">
            <CardHeader>
              <CardTitle>Email Signature</CardTitle>
              <CardDescription>Set your default email signature for all outgoing emails</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input
                    placeholder="Your Company Name"
                    value={settings.companyName}
                    onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    placeholder="https://yourwebsite.com"
                    value={settings.website}
                    onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp</Label>
                  <Input
                    placeholder="+1 234 567 8900"
                    value={settings.whatsApp}
                    onChange={(e) => setSettings({ ...settings, whatsApp: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>LinkedIn</Label>
                  <Input
                    placeholder="linkedin.com/in/yourprofile"
                    value={settings.linkedInUrl}
                    onChange={(e) => setSettings({ ...settings, linkedInUrl: e.target.value })}
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Custom Signature (optional)</Label>
                <Textarea
                  placeholder="Enter your custom signature..."
                  className="min-h-[120px]"
                  value={settings.signature}
                  onChange={(e) => setSettings({ ...settings, signature: e.target.value })}
                />
              </div>
              <Button onClick={saveSettings} disabled={saving}>
                {saving ? 'Saving...' : 'Save Signature'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sending" className="space-y-6">
          <Card className="border-slate-200/50">
            <CardHeader>
              <CardTitle>Sending Limits</CardTitle>
              <CardDescription>Configure your email sending limits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label>Daily Email Limit</Label>
                  <p className="text-sm text-slate-500">Maximum emails sent per day</p>
                </div>
                <Input
                  type="number"
                  className="w-full sm:w-24"
                  value={settings.dailyLimit}
                  onChange={(e) => setSettings({ ...settings, dailyLimit: parseInt(e.target.value) })}
                />
              </div>
              <Separator />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label>Warmup Mode</Label>
                  <p className="text-sm text-slate-500">Gradually increase sending volume</p>
                </div>
                <Switch
                  checked={settings.warmupEnabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, warmupEnabled: checked })}
                />
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                  <div className="text-sm text-amber-700">
                    We recommend starting with warmup mode enabled. Gradually increase your daily limit over 2-4 weeks for better inbox placement.
                  </div>
                </div>
              </div>
              <Button onClick={saveSettings} disabled={saving}>
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile" className="space-y-6">
          <Card className="border-slate-200/50">
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    placeholder="Your Name"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" placeholder="you@company.com" value={user?.email || ''} disabled />
                </div>
              </div>
              <Button onClick={handleUpdateProfile} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Update Profile
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200/50">
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Manage your account security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label>Password</Label>
                  <p className="text-sm text-slate-500">Update the password for your account</p>
                </div>
                <Button variant="outline" className="w-full sm:w-auto" onClick={handleChangePassword}>Change Password</Button>
              </div>
              <Separator />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label>Two-Factor Authentication</Label>
                  <p className="text-sm text-slate-500">Add an extra layer of security</p>
                </div>
                <Button variant="outline" className="w-full sm:w-auto" onClick={handleEnable2FA}>Enable 2FA</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Change password dialog */}
      <Dialog open={pwDialogOpen} onOpenChange={setPwDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cur-pw">Current password</Label>
              <Input
                id="cur-pw"
                type="password"
                value={pwForm.current}
                onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pw">New password</Label>
              <Input
                id="new-pw"
                type="password"
                value={pwForm.next}
                onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pw">Confirm new password</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                placeholder="Re-enter new password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitPasswordChange}
              disabled={pwSaving || !pwForm.current || !pwForm.next || !pwForm.confirm}
            >
              {pwSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Update password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}