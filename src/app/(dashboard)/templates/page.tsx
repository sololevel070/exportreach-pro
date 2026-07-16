'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Plus, MoreHorizontal, Copy, Pencil, Trash2, Sparkles, Search, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  category?: string;
  isDefault: boolean;
  usageCount?: number;
}

const categories = ['All', 'Cold Outreach', 'Follow-up', 'Meeting', 'Announcement', 'Content'];
const emptyForm = { name: '', subject: '', body: '', category: 'Cold Outreach', isDefault: false };

// Merge fields that get replaced with real lead data when an email is sent.
const PLACEHOLDERS = [
  '{{contact_name}}',
  '{{company_name}}',
  '{{country}}',
  '{{product_interest}}',
];

// Tones offered for AI template generation.
const AI_TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'premium', label: 'Premium' },
  { value: 'short', label: 'Short' },
  { value: 'formal', label: 'Formal' },
];

export default function TemplatesPage() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Unified create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  // AI improve in-flight tracking (by template id)
  const [improvingId, setImprovingId] = useState<string | null>(null);

  // AI generation inside the create/edit dialog
  const [genTone, setGenTone] = useState('professional');
  const [generating, setGenerating] = useState(false);

  // Refs + focus tracking so placeholders insert at the cursor of the active field
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocusedField = useRef<'subject' | 'body'>('body');

  useEffect(() => {
    fetchTemplates();
  }, []);

  /** Insert a placeholder at the cursor of whichever field was last focused. */
  const insertPlaceholder = (placeholder: string) => {
    const field = lastFocusedField.current;
    const el = field === 'subject' ? subjectRef.current : bodyRef.current;
    if (!el) {
      // No active field — just append to the body.
      setForm((f) => ({ ...f, body: f.body + placeholder }));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.substring(0, start) + placeholder + el.value.substring(end);
    setForm((f) => ({ ...f, [field]: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  };

  /** Generate subject + body with AI in the selected tone, keeping placeholders. */
  const generateWithAI = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tone: genTone,
          category: form.category,
          purpose: form.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setForm((f) => ({
        ...f,
        subject: data.subject || f.subject,
        body: data.body || f.body,
      }));
      if (data.fallback) {
        toast({
          title: 'AI not configured',
          description: 'Inserted a starter template. Add an AI key in Settings for tailored output.',
        });
      } else {
        toast({ title: 'Template generated', description: 'Review and tweak before saving.' });
      }
    } catch (error) {
      console.error('Error generating template:', error);
      toast({ title: 'Generation failed', description: String(error), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (template: Template) => {
    setEditingId(template.id);
    setForm({
      name: template.name,
      subject: template.subject,
      body: template.body,
      category: template.category || 'Cold Outreach',
      isDefault: template.isDefault,
    });
    setDialogOpen(true);
  };

  const saveTemplate = async () => {
    setSaving(true);
    try {
      const url = editingId ? `/api/templates/${editingId}` : '/api/templates';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setDialogOpen(false);
        setForm(emptyForm);
        setEditingId(null);
        await fetchTemplates();
        toast({ title: editingId ? 'Template updated' : 'Template created' });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Save failed', description: err.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const duplicateTemplate = async (template: Template) => {
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (Copy)`,
          subject: template.subject,
          body: template.body,
          category: template.category,
          isDefault: false,
        }),
      });
      if (res.ok) {
        await fetchTemplates();
        toast({ title: 'Template duplicated' });
      } else {
        toast({ title: 'Duplicate failed', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error duplicating template:', error);
      toast({ title: 'Duplicate failed', variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/templates/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteTarget(null);
        await fetchTemplates();
        toast({ title: 'Template deleted' });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Delete failed', description: err.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({ title: 'Delete failed', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const aiImprove = async (template: Template) => {
    setImprovingId(template.id);
    try {
      const res = await fetch('/api/ai/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: template.subject, body: template.body, contactName: 'there' }),
      });
      const improved = await res.json();
      if (improved.fallback) {
        toast({
          title: 'AI not configured',
          description: 'Add an AI key in Settings to use AI Improve.',
          variant: 'destructive',
        });
        return;
      }
      // Open the edit dialog pre-filled with the improved copy so the user can review before saving.
      setEditingId(template.id);
      setForm({
        name: template.name,
        subject: improved.subject || template.subject,
        body: improved.body || template.body,
        category: template.category || 'Cold Outreach',
        isDefault: template.isDefault,
      });
      setDialogOpen(true);
      toast({ title: 'AI improved this template', description: 'Review the changes and save.' });
    } catch (error) {
      console.error('Error improving template:', error);
      toast({ title: 'AI Improve failed', variant: 'destructive' });
    } finally {
      setImprovingId(null);
    }
  };

  const filteredTemplates = templates.filter((template) => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || template.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Templates</h1>
          <p className="text-slate-500">Manage your email templates</p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search templates..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <FileText className="h-12 w-12 mx-auto mb-4 text-slate-300" />
          <p>No templates found. Create your first template to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="border-slate-200/50 hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <FileText className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {template.category}
                        </Badge>
                        {template.isDefault && (
                          <Badge variant="outline" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        {improvingId === template.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="h-4 w-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(template)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicateTemplate(template)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => aiImprove(template)}>
                        <Sparkles className="mr-2 h-4 w-4" />
                        AI Improve
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => setDeleteTarget(template)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-slate-500">Subject: </span>
                    <span className="text-slate-700">{template.subject}</span>
                  </div>
                  <div className="text-slate-500 line-clamp-2 whitespace-pre-wrap">
                    {template.body}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400">
                  Used {(template.usageCount || 0).toLocaleString()} times
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Template' : 'Create Template'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update your email template' : 'Create a new email template'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                placeholder="e.g., Cold Outreach - Professional"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cold Outreach">Cold Outreach</SelectItem>
                  <SelectItem value="Follow-up">Follow-up</SelectItem>
                  <SelectItem value="Meeting">Meeting</SelectItem>
                  <SelectItem value="Announcement">Announcement</SelectItem>
                  <SelectItem value="Content">Content</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* AI generation */}
            <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-600" />
                <Label className="text-sm font-medium">Generate using AI</Label>
              </div>
              <p className="text-xs text-slate-500">
                Pick a tone and let AI draft the subject and body with placeholders filled in.
              </p>
              <div className="flex items-center gap-2">
                <Select value={genTone} onValueChange={setGenTone}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Tone" />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_TONES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={generateWithAI} disabled={generating}>
                  {generating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {generating ? 'Generating…' : 'Generate'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Subject Line</Label>
              <Input
                ref={subjectRef}
                placeholder="Partnership Opportunity - {{company_name}}"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                onFocus={() => (lastFocusedField.current = 'subject')}
              />
            </div>
            <div className="space-y-2">
              <Label>Email Body</Label>
              <Textarea
                ref={bodyRef}
                placeholder="Dear {{contact_name}},..."
                className="min-h-[200px]"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                onFocus={() => (lastFocusedField.current = 'body')}
              />
            </div>

            {/* Placeholder picker */}
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">
                Insert a placeholder at your cursor (auto-filled per lead when sending)
              </Label>
              <div className="flex flex-wrap gap-2">
                {PLACEHOLDERS.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs font-mono text-orange-600"
                    onClick={() => insertPlaceholder(p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="default"
                checked={form.isDefault}
                onCheckedChange={(checked) => setForm({ ...form, isDefault: !!checked })}
              />
              <Label htmlFor="default">Set as default template</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveTemplate}
              disabled={saving || !form.name || !form.subject || !form.body}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingId ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete template?</DialogTitle>
            <DialogDescription>
              This will permanently delete &quot;{deleteTarget?.name}&quot;. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
