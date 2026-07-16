'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Settings, Plus, MoreHorizontal, Pencil, Trash2, Loader2, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type FieldType = 'text' | 'number' | 'date' | 'url' | 'email';

interface LeadField {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  sortOrder: number;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
];

// Standard fields that always exist on a lead — shown read-only for reference.
const BUILT_IN_FIELDS: { label: string; key: string }[] = [
  { label: 'Company Name', key: 'company_name' },
  { label: 'Contact Person', key: 'contact_name' },
  { label: 'Email', key: 'email' },
  { label: 'Country', key: 'country' },
  { label: 'Website', key: 'website' },
  { label: 'LinkedIn', key: 'linked_in' },
  { label: 'Product Interest', key: 'product_interest' },
];

const emptyForm: { label: string; type: FieldType } = { label: '', type: 'text' };

/** Mirror the server's slug derivation so the user previews the key they'll get. */
function deriveKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default function AdminPage() {
  const { toast } = useToast();
  const [fields, setFields] = useState<LeadField[]>([]);
  const [loading, setLoading] = useState(true);

  // Unified create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<LeadField | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchFields();
  }, []);

  const fetchFields = async () => {
    try {
      const res = await fetch('/api/admin/lead-fields');
      const data = await res.json();
      setFields(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching lead fields:', error);
      toast({ title: 'Failed to load fields', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setEditingKey(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (field: LeadField) => {
    setEditingId(field.id);
    setEditingKey(field.key);
    setForm({ label: field.label, type: field.type });
    setDialogOpen(true);
  };

  const saveField = async () => {
    setSaving(true);
    try {
      const url = editingId ? `/api/admin/lead-fields/${editingId}` : '/api/admin/lead-fields';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        // Server derives `key` from the label — never send it.
        body: JSON.stringify({ label: form.label, type: form.type }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setForm(emptyForm);
        setEditingId(null);
        setEditingKey(null);
        await fetchFields();
        toast({ title: editingId ? 'Field updated' : 'Field created' });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Save failed', description: err.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error saving lead field:', error);
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/lead-fields/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteTarget(null);
        await fetchFields();
        toast({ title: 'Field deleted' });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Delete failed', description: err.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error deleting lead field:', error);
      toast({ title: 'Delete failed', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const previewKey = deriveKey(form.label);

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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Admin</h1>
          <p className="text-slate-500">Customize what data you capture for leads.</p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          New Field
        </Button>
      </div>

      {/* Custom lead fields */}
      <Card className="border-slate-200/50">
        <CardHeader>
          <CardTitle className="text-base">Custom Lead Fields</CardTitle>
          <p className="text-sm text-slate-500">
            Add fields beyond the built-ins. Custom fields automatically appear when importing leads
            from Excel (column mapping) and when adding or editing a lead.
          </p>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Settings className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              <p>No custom fields yet. Add one to capture extra details.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {fields.map((field) => (
                <li
                  key={field.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900 break-words">{field.label}</span>
                      <Badge variant="secondary" className="text-xs">
                        {field.type}
                      </Badge>
                    </div>
                    <code className="mt-1 inline-block max-w-full break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                      {field.key}
                    </code>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    {/* Inline on mobile-friendly screens; dropdown keeps it tidy */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(field)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => setDeleteTarget(field)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Built-in reference fields */}
      <Card className="border-slate-200/50">
        <CardHeader>
          <CardTitle className="text-base">
            <span className="inline-flex items-center gap-2">
              <Lock className="h-4 w-4 text-slate-400" />
              Built-in fields
            </span>
          </CardTitle>
          <p className="text-sm text-slate-500">
            These standard fields always exist and can&apos;t be edited or removed.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {BUILT_IN_FIELDS.map((field) => (
              <div
                key={field.key}
                className="flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5"
              >
                <span className="text-sm text-slate-600">{field.label}</span>
                <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-400">
                  {field.key}
                </code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Field' : 'New Field'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update this custom field. Its key is fixed and can’t be changed.'
                : 'Create a custom field. The key is derived automatically from the label.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                placeholder="e.g., Industry"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>

            {editingId ? (
              <div className="space-y-2">
                <Label>Key</Label>
                <Input value={editingKey ?? ''} readOnly disabled className="font-mono text-sm" />
                <p className="text-xs text-slate-400">The key is fixed and can&apos;t be changed.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Derived key</Label>
                <code className="block break-all rounded bg-slate-100 px-2 py-1.5 text-xs text-slate-500">
                  {previewKey || '—'}
                </code>
              </div>
            )}

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as FieldType })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveField} disabled={saving || !form.label.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingId ? 'Save Changes' : 'Create Field'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete field?</DialogTitle>
            <DialogDescription>
              &quot;{deleteTarget?.label}&quot; will stop appearing when importing or editing leads.
              Any values already imported for this field are kept.
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
