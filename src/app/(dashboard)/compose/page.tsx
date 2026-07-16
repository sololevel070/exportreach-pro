'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Send, Copy, RefreshCw, Save, FileText, User, Mail, Globe, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
}

interface Lead {
  id: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  country?: string;
  website?: string;
  productInterest?: string;
}

const tones = [
  { value: 'professional', label: 'Professional', description: 'Formal business tone' },
  { value: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
  { value: 'premium', label: 'Premium', description: 'Exclusive, high-end' },
  { value: 'short', label: 'Short', description: 'Concise and direct' },
  { value: 'formal', label: 'Formal', description: 'Traditional and proper' },
];

const PLACEHOLDERS = [
  '{{company_name}}',
  '{{contact_name}}',
  '{{country}}',
  '{{product_interest}}',
];

export default function ComposePage() {
  const { toast } = useToast();
  const [leadData, setLeadData] = useState({
    companyName: '',
    contactName: '',
    email: '',
    country: '',
    productInterest: '',
    website: '',
  });
  // When a saved lead is chosen, keep its id so we send leadId (not an inline lead).
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [selectedTone, setSelectedTone] = useState('professional');
  const [generatedEmail, setGeneratedEmail] = useState<{
    subject: string;
    body: string;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('compose');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [copiedPlaceholder, setCopiedPlaceholder] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  // Refs to track cursor position in subject/body
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Track which field was last focused: 'subject' | 'body'
  const lastFocusedField = useRef<'subject' | 'body'>('body');

  useEffect(() => {
    fetchTemplates();
    fetchLeads();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      setLeads(Array.isArray(data?.leads) ? data.leads : []);
    } catch (error) {
      console.error('Error fetching leads:', error);
    } finally {
      setLoadingLeads(false);
    }
  };

  /** Populate the Lead Information fields from a chosen saved lead and keep its id. */
  const handleSelectLead = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    setSelectedLeadId(lead.id);
    setLeadData({
      companyName: lead.companyName || '',
      contactName: lead.contactName || '',
      email: lead.email || '',
      country: lead.country || '',
      productInterest: lead.productInterest || '',
      website: lead.website || '',
    });
  };

  const handleGenerate = async () => {
    if (!leadData.companyName || !leadData.contactName) {
      toast({
        title: 'Missing information',
        description: 'Company name and contact name are required to generate an email.',
        variant: 'destructive',
      });
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch('/api/emails/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: leadData.companyName,
          contactName: leadData.contactName,
          country: leadData.country,
          productInterest: leadData.productInterest,
          website: leadData.website,
          tone: selectedTone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Generation failed');
      }
      setGeneratedEmail({ subject: data.subject, body: data.body });
    } catch (error) {
      console.error('Error generating email:', error);
      toast({ title: 'Generation failed', description: String(error), variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!generatedEmail) return;
    setIsSavingTemplate(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: generatedEmail.subject?.slice(0, 60) || 'Untitled Template',
          subject: generatedEmail.subject,
          body: generatedEmail.body,
          category: 'Cold Outreach',
          isDefault: false,
        }),
      });
      if (res.ok) {
        toast({ title: 'Saved as template', description: 'Find it on the Templates page.' });
      } else {
        toast({ title: 'Could not save template', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast({ title: 'Could not save template', variant: 'destructive' });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  /**
   * Build the recipient portion of an /api/emails POST body. Prefer a saved
   * lead's id; fall back to the inline lead object for a manually-typed recipient.
   */
  const buildRecipientPayload = () =>
    selectedLeadId
      ? { leadId: selectedLeadId }
      : {
          lead: {
            email: leadData.email,
            companyName: leadData.companyName,
            contactName: leadData.contactName,
            country: leadData.country,
            productInterest: leadData.productInterest,
            website: leadData.website,
          },
        };

  const handleSendNow = async () => {
    if (!generatedEmail) return;
    if (!selectedLeadId && !leadData.email) {
      toast({
        title: 'Recipient required',
        description: 'Enter the lead\'s email address before sending.',
        variant: 'destructive',
      });
      return;
    }
    setIsSending(true);
    try {
      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: generatedEmail.subject,
          body: generatedEmail.body,
          status: 'sent',
          ...buildRecipientPayload(),
        }),
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        toast({ title: 'Email sent', description: `Sent to ${leadData.email}` });
      } else {
        toast({
          title: 'Send failed',
          description: data.error || 'Configure SMTP/Resend in Settings to send emails.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast({ title: 'Send failed', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  /** Persist the current email as a draft row (does not send). */
  const handleSaveDraft = async () => {
    if (!generatedEmail) return;
    if (!selectedLeadId && !leadData.email) {
      toast({
        title: 'Recipient required',
        description: 'Pick a saved lead or enter the lead\'s email address before saving a draft.',
        variant: 'destructive',
      });
      return;
    }
    setIsSavingDraft(true);
    try {
      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: generatedEmail.subject,
          body: generatedEmail.body,
          status: 'draft',
          ...buildRecipientPayload(),
        }),
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        toast({ title: 'Draft saved', description: 'Saved to Emails as draft' });
      } else {
        toast({
          title: 'Could not save draft',
          description: data.error || undefined,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      toast({ title: 'Could not save draft', variant: 'destructive' });
    } finally {
      setIsSavingDraft(false);
    }
  };

  /** Load a saved template into the editor */
  const loadTemplate = (template: Template) => {
    setGeneratedEmail({ subject: template.subject, body: template.body });
    setActiveTab('compose');
    toast({ title: 'Template loaded', description: 'Edit and send from the Compose tab.' });
  };

  /** Insert a placeholder at the current cursor position in the focused field */
  const insertPlaceholder = (placeholder: string) => {
    if (!generatedEmail) return;

    if (lastFocusedField.current === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newValue =
        el.value.substring(0, start) + placeholder + el.value.substring(end);
      setGeneratedEmail({ ...generatedEmail, subject: newValue });

      // Restore cursor after the inserted text
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + placeholder.length, start + placeholder.length);
      });
    } else if (bodyRef.current) {
      const el = bodyRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newValue =
        el.value.substring(0, start) + placeholder + el.value.substring(end);
      setGeneratedEmail({ ...generatedEmail, body: newValue });

      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + placeholder.length, start + placeholder.length);
      });
    }
  };

  /** Copy placeholder text to clipboard */
  const copyPlaceholder = async (placeholder: string) => {
    try {
      await navigator.clipboard.writeText(placeholder);
      setCopiedPlaceholder(placeholder);
      setTimeout(() => setCopiedPlaceholder(null), 1500);
    } catch {
      // Fallback for environments without clipboard API
      insertPlaceholder(placeholder);
    }
  };

  /** Copy full email to clipboard */
  const copyEmail = async () => {
    if (!generatedEmail) return;
    const text = `Subject: ${generatedEmail.subject}\n\n${generatedEmail.body}`;
    await navigator.clipboard.writeText(text);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Compose Email</h1>
          <p className="text-slate-500">Generate and send personalized outreach emails</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start">
              <TabsTrigger value="compose">Compose</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
            </TabsList>

            <TabsContent value="compose" className="space-y-4">
              <Card className="border-slate-200/50">
                <CardHeader>
                  <CardTitle className="text-base">Lead Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    <Label>Use existing lead</Label>
                    <Select
                      value={selectedLeadId}
                      onValueChange={handleSelectLead}
                      disabled={loadingLeads || leads.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingLeads
                              ? 'Loading leads…'
                              : leads.length === 0
                                ? 'No saved leads — type details below'
                                : 'Select a saved lead to autofill'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {leads.map((lead) => (
                          <SelectItem key={lead.id} value={lead.id}>
                            {[lead.contactName, lead.companyName].filter(Boolean).join(' — ') ||
                              lead.email ||
                              'Unnamed lead'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedLeadId && (
                      <p className="text-xs text-slate-400">
                        Using a saved lead. Editing any field below switches to a manual recipient.
                      </p>
                    )}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Company Name</Label>
                      <Input
                        placeholder="e.g., TechCorp Industries"
                        value={leadData.companyName}
                        onChange={(e) => {
                          setSelectedLeadId('');
                          setLeadData({ ...leadData, companyName: e.target.value });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Name</Label>
                      <Input
                        placeholder="e.g., John Smith"
                        value={leadData.contactName}
                        onChange={(e) => {
                          setSelectedLeadId('');
                          setLeadData({ ...leadData, contactName: e.target.value });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email Address</Label>
                      <Input
                        type="email"
                        placeholder="john@techcorp.com"
                        value={leadData.email}
                        onChange={(e) => {
                          setSelectedLeadId('');
                          setLeadData({ ...leadData, email: e.target.value });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Country</Label>
                      <Select
                        value={leadData.country}
                        onValueChange={(value) => {
                          setSelectedLeadId('');
                          setLeadData({ ...leadData, country: value });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USA">United States</SelectItem>
                          <SelectItem value="UK">United Kingdom</SelectItem>
                          <SelectItem value="Germany">Germany</SelectItem>
                          <SelectItem value="France">France</SelectItem>
                          <SelectItem value="Canada">Canada</SelectItem>
                          <SelectItem value="Australia">Australia</SelectItem>
                          <SelectItem value="Japan">Japan</SelectItem>
                          <SelectItem value="China">China</SelectItem>
                          <SelectItem value="India">India</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Product Interest</Label>
                      <Input
                        placeholder="e.g., Industrial Machinery"
                        value={leadData.productInterest}
                        onChange={(e) => {
                          setSelectedLeadId('');
                          setLeadData({ ...leadData, productInterest: e.target.value });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Website (Optional)</Label>
                      <Input
                        placeholder="https://example.com"
                        value={leadData.website}
                        onChange={(e) => {
                          setSelectedLeadId('');
                          setLeadData({ ...leadData, website: e.target.value });
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200/50">
                <CardHeader>
                  <CardTitle className="text-base">Email Tone</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {tones.map((tone) => (
                      <button
                        key={tone.value}
                        onClick={() => setSelectedTone(tone.value)}
                        className={cn(
                          'p-3 rounded-lg border-2 text-left transition-all',
                          selectedTone === tone.value
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-slate-200 hover:border-slate-300'
                        )}
                      >
                        <div className="font-medium text-sm">{tone.label}</div>
                        <div className="text-xs text-slate-500">{tone.description}</div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200/50">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">Generated Email</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerate}
                      disabled={isGenerating}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {isGenerating ? 'Generating...' : 'Generate'}
                    </Button>
                    {generatedEmail && (
                      <>
                        <Button variant="outline" size="sm" onClick={copyEmail}>
                          {copiedEmail ? (
                            <Check className="mr-2 h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="mr-2 h-4 w-4" />
                          )}
                          {copiedEmail ? 'Copied!' : 'Copy'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Regenerate
                        </Button>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {generatedEmail ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Subject Line</Label>
                        <Input
                          ref={subjectRef}
                          value={generatedEmail.subject}
                          onChange={(e) =>
                            setGeneratedEmail({ ...generatedEmail, subject: e.target.value })
                          }
                          onFocus={() => (lastFocusedField.current = 'subject')}
                          placeholder="Email subject…"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email Body</Label>
                        <Textarea
                          ref={bodyRef}
                          value={generatedEmail.body}
                          onChange={(e) =>
                            setGeneratedEmail({ ...generatedEmail, body: e.target.value })
                          }
                          onFocus={() => (lastFocusedField.current = 'body')}
                          className="min-h-[250px]"
                          placeholder="Email body…"
                        />
                      </div>
                      <p className="text-xs text-slate-400">
                        💡 Click a placeholder on the right to insert it at your cursor position.
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      <Sparkles className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                      <p>Enter lead information and click Generate to create a personalized email</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {generatedEmail && (
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button variant="outline" className="w-full sm:w-auto" onClick={handleSaveAsTemplate} disabled={isSavingTemplate}>
                    {isSavingTemplate ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save as Template
                  </Button>
                  <Button variant="outline" className="w-full sm:w-auto" onClick={handleSaveDraft} disabled={isSavingDraft}>
                    {isSavingDraft ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="mr-2 h-4 w-4" />
                    )}
                    Save as Draft
                  </Button>
                  <Button className="w-full sm:w-auto" onClick={handleSendNow} disabled={isSending}>
                    {isSending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send Now
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="templates">
              <Card className="border-slate-200/50">
                <CardContent className="pt-6">
                  {loadingTemplates ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                    </div>
                  ) : templates.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {templates.map((template) => (
                        <div
                          key={template.id}
                          onClick={() => loadTemplate(template)}
                          className="p-4 border border-slate-200 rounded-lg hover:border-orange-500 hover:bg-orange-50/50 cursor-pointer transition-all"
                        >
                          <div className="flex items-start gap-3">
                            <FileText className="h-5 w-5 text-slate-400 shrink-0" />
                            <div>
                              <div className="font-medium text-sm">{template.name}</div>
                              <Badge variant="secondary" className="mt-1 text-xs">
                                {template.category}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      <p>No templates found. Create your first template in the Templates page.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card className="border-slate-200/50">
            <CardHeader>
              <CardTitle className="text-base">Quick Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <div className="flex gap-2">
                <User className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                <p>Include the contact&apos;s name for personalization</p>
              </div>
              <div className="flex gap-2">
                <Globe className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                <p>Reference their country to show you&apos;ve done research</p>
              </div>
              <div className="flex gap-2">
                <Mail className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                <p>Keep subject lines under 50 characters</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/50">
            <CardHeader>
              <CardTitle className="text-base">Variable Placeholders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-slate-500 mb-3">
                Click <strong>Insert</strong> to add at cursor, or <strong>Copy</strong> to copy to clipboard.
              </p>
              {PLACEHOLDERS.map((placeholder) => (
                <div
                  key={placeholder}
                  className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm gap-2"
                >
                  <code className="text-orange-600 truncate">{placeholder}</code>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => insertPlaceholder(placeholder)}
                      title="Insert at cursor in email"
                      disabled={!generatedEmail}
                    >
                      Insert
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => copyPlaceholder(placeholder)}
                      title="Copy to clipboard"
                    >
                      {copiedPlaceholder === placeholder ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}