'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Search,
  Upload,
  MoreHorizontal,
  Trash2,
  Mail,
  Pencil,
  Eye,
  Send,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  FileSpreadsheet,
  BadgeCheck,
  Download,
} from 'lucide-react';
import { cn, STATUS_COLORS } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

interface Lead {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  country: string;
  website?: string;
  linkedIn?: string;
  productInterest?: string;
  status: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
  customFields?: Record<string, any>;
}

interface CustomField {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'url' | 'email';
  sortOrder: number;
}

const countries = ['All', 'USA', 'UK', 'Canada', 'Australia', 'Germany', 'Japan', 'France', 'Italy', 'China', 'India'];

const NO_TEMPLATE = 'none';

// Fill {{placeholders}} in a template using a lead's data (built-in + custom fields).
function fillTemplate(text: string, lead: any): string {
  if (!text) return '';
  let out = text
    .replace(/\{\{\s*company_name\s*\}\}/gi, lead.companyName || '')
    .replace(/\{\{\s*contact_name\s*\}\}/gi, lead.contactName || 'there')
    .replace(/\{\{\s*country\s*\}\}/gi, lead.country || '')
    .replace(/\{\{\s*product_interest\s*\}\}/gi, lead.productInterest || '')
    .replace(/\{\{\s*website\s*\}\}/gi, lead.website || '');
  const cf = lead.customFields || {};
  for (const [k, v] of Object.entries(cf)) {
    const safe = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\{\\{\\s*${safe}\\s*\\}\\}`, 'gi'), String(v ?? ''));
  }
  return out;
}
const statuses = ['all', 'pending', 'generated', 'sent', 'opened', 'clicked', 'replied', 'failed'];

export default function LeadsPage() {
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [newLeadCustom, setNewLeadCustom] = useState<Record<string, string>>({});
  const [editLeadCustom, setEditLeadCustom] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('All');
  // Distinct countries actually present in the leads (dynamic filter options).
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importStep, setImportStep] = useState<'upload' | 'mapping'>('upload');
  const [importProgress, setImportProgress] = useState({ processed: 0, total: 0, inserted: 0, skipped: 0 });
  // Keep the selected File in state — the <input> only exists on the upload step,
  // so we can't rely on fileInputRef once the user is on the mapping step.
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isAnalyzingHeaders, setIsAnalyzingHeaders] = useState(false);
  const [originalHeaders, setOriginalHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [selectedMapping, setSelectedMapping] = useState<Record<string, string>>({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    country: '',
    website: '',
    linked_in: '',
    product_interest: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newLead, setNewLead] = useState({
    companyName: '',
    contactName: '',
    email: '',
    country: '',
    productInterest: '',
    website: '',
  });
  const [isBulkStatusDialogOpen, setIsBulkStatusDialogOpen] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState('');
  const [leadsPerPage, setLeadsPerPage] = useState(10);
  const [isBulkEmailDialogOpen, setIsBulkEmailDialogOpen] = useState(false);
  const [bulkEmailTone, setBulkEmailTone] = useState('professional');
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [bulkSendProgress, setBulkSendProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [generatedEmail, setGeneratedEmail] = useState({ subject: '', body: '' });
  // Saved templates (for the Generate/Send dialogs) + chosen template per flow.
  const [templates, setTemplates] = useState<{ id: string; name: string; subject: string; body: string }[]>([]);
  const [genTemplateId, setGenTemplateId] = useState<string>(NO_TEMPLATE);
  const [bulkTemplateId, setBulkTemplateId] = useState<string>(NO_TEMPLATE);
  const [isGenerating, setIsGenerating] = useState(false);
  const [emailTone, setEmailTone] = useState('professional');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editLead, setEditLead] = useState({
    companyName: '',
    contactName: '',
    email: '',
    country: '',
    productInterest: '',
    website: '',
    linkedIn: '',
    status: 'pending',
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [isAddingToCampaign, setIsAddingToCampaign] = useState(false);

  const availableStatuses = ['pending', 'generated', 'sent', 'opened', 'clicked', 'replied', 'failed'];

  // Initialize the search box from a ?q= URL param (e.g. from the header search)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('q');
      if (q) {
        setSearchQuery(q);
        setDebouncedSearch(q);
      }
    }
  }, []);

  // Fetch admin-defined custom lead fields once on mount. On failure, treat as
  // no custom fields so the page behaves exactly as before.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/lead-fields');
        if (!res.ok) return;
        const data = await res.json();
        const fields: CustomField[] = (Array.isArray(data) ? data : [])
          .map((f: any) => ({
            id: f.id,
            key: f.key,
            label: f.label,
            type: f.type,
            sortOrder: f.sortOrder ?? 0,
          }))
          .sort((a: CustomField, b: CustomField) => a.sortOrder - b.sortOrder);
        setCustomFields(fields);
      } catch (error) {
        console.error('Error fetching custom lead fields:', error);
      }
    })();
  }, []);

  // Map a custom field type to the corresponding HTML input type.
  const customInputType = (type: CustomField['type']): string => {
    switch (type) {
      case 'number':
        return 'number';
      case 'date':
        return 'date';
      case 'url':
        return 'url';
      case 'email':
        return 'email';
      default:
        return 'text';
    }
  };

  // Debounce the search input (~300ms) before it hits the API
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // Reset to page 1 whenever a filter or the debounced search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, countryFilter]);

  const handleBulkDelete = async () => {
    if (selectedLeads.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedLeads.length} lead(s)?`)) return;

    try {
      const res = await fetch('/api/leads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedLeads }),
      });

      if (res.ok) {
        setSelectedLeads([]);
        fetchLeads();
        toast({
          title: 'Leads Deleted',
          description: `Successfully deleted ${selectedLeads.length} lead(s).`,
          variant: 'success',
        });
      } else {
        const data = await res.json();
        toast({
          title: 'Error',
          description: data.error || 'Failed to delete leads',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error deleting leads:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while deleting leads.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteLead = async (lead: Lead) => {
    if (!confirm(`Delete lead "${lead.contactName || lead.email}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedLeads((prev) => prev.filter((id) => id !== lead.id));
        fetchLeads();
        toast({ title: 'Lead Deleted', description: `${lead.contactName || lead.email} was removed.`, variant: 'success' });
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: data.error || 'Failed to delete lead', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    }
  };

  const handleBulkStatusUpdate = async () => {
    if (selectedLeads.length === 0 || !bulkNewStatus) return;

    try {
      const res = await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedLeads, status: bulkNewStatus }),
      });

      if (res.ok) {
        setIsBulkStatusDialogOpen(false);
        setBulkNewStatus('');
        setSelectedLeads([]);
        fetchLeads();
        toast({
          title: 'Status Updated',
          description: `Successfully updated status to ${bulkNewStatus} for ${selectedLeads.length} lead(s).`,
          variant: 'success',
        });
      } else {
        const data = await res.json();
        toast({
          title: 'Error',
          description: data.error || 'Failed to update leads',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error updating leads:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while updating leads.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [leadsPerPage]);

  useEffect(() => {
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, statusFilter, countryFilter, debouncedSearch, leadsPerPage]);

  // Load saved templates for the Generate/Send dialogs (run once on mount).
  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Populate the country filter from the distinct countries actually in the data.
  const fetchCountries = async () => {
    try {
      const res = await fetch('/api/leads/countries');
      if (!res.ok) return;
      const data = await res.json();
      setCountryOptions(Array.isArray(data.countries) ? data.countries : []);
    } catch (error) {
      console.error('Error fetching countries:', error);
    }
  };

  const fetchLeads = async () => {
    try {
      const params = new URLSearchParams();
      params.set('page', currentPage.toString());
      params.set('limit', leadsPerPage.toString());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (countryFilter !== 'All') params.set('country', countryFilter);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      setLeads(data.leads || []);
      setTotalLeads(data.pagination?.total ?? 0);
      setTotalPages(data.pagination?.pages ?? 0);
      // Keep the country filter options in sync with the real data.
      fetchCountries();
    } catch (error) {
      console.error('Error fetching leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const addLead = async () => {
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newLead, customFields: newLeadCustom }),
      });

      if (res.ok) {
        setIsAddDialogOpen(false);
        setNewLead({ companyName: '', contactName: '', email: '', country: '', productInterest: '', website: '' });
        setNewLeadCustom({});
        fetchLeads();
        toast({
          title: 'Lead Added',
          description: 'The lead was added successfully.',
          variant: 'success',
        });
      } else {
        const data = await res.json().catch(() => ({}));
        toast({
          title: res.status === 409 ? 'Lead already exists' : 'Error',
          description: data.error || 'Failed to add lead',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error adding lead:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while adding the lead.',
        variant: 'destructive',
      });
    }
  };

  const openEditDialog = (lead: Lead) => {
    setSelectedLead(lead);
    setEditLead({
      companyName: lead.companyName || '',
      contactName: lead.contactName || '',
      email: lead.email || '',
      country: lead.country || '',
      productInterest: lead.productInterest || '',
      website: lead.website || '',
      linkedIn: lead.linkedIn || '',
      status: lead.status || 'pending',
    });
    const prefilledCustom: Record<string, string> = {};
    customFields.forEach((cf) => {
      const val = lead.customFields?.[cf.key];
      prefilledCustom[cf.key] = val === undefined || val === null ? '' : String(val);
    });
    setEditLeadCustom(prefilledCustom);
    setIsEditDialogOpen(true);
  };

  const handleUpdateLead = async () => {
    if (!selectedLead) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/leads/${selectedLead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editLead, customFields: editLeadCustom }),
      });

      if (res.ok) {
        setIsEditDialogOpen(false);
        setSelectedLead(null);
        fetchLeads();
        toast({
          title: 'Lead Updated',
          description: 'The lead was updated successfully.',
          variant: 'success',
        });
      } else {
        const data = await res.json().catch(() => ({}));
        toast({
          title: 'Error',
          description: data.error || 'Failed to update lead',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error updating lead:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while updating the lead.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openCampaignDialog = async () => {
    if (selectedLeads.length === 0) return;
    setSelectedCampaignId('');
    setIsCampaignDialogOpen(true);
    setIsLoadingCampaigns(true);
    try {
      const res = await fetch('/api/campaigns');
      const data = await res.json();
      if (res.ok) {
        setCampaigns(
          (Array.isArray(data) ? data : []).map((c: any) => ({ id: c.id, name: c.name }))
        );
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to load campaigns',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while loading campaigns.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingCampaigns(false);
    }
  };

  const handleAddToCampaign = async () => {
    if (!selectedCampaignId || selectedLeads.length === 0) return;
    setIsAddingToCampaign(true);
    try {
      const res = await fetch(`/api/campaigns/${selectedCampaignId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: selectedLeads }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setIsCampaignDialogOpen(false);
        setSelectedCampaignId('');
        setSelectedLeads([]);
        toast({
          title: 'Added to Campaign',
          description: `Added ${data.added ?? 0} lead(s) to the campaign.`,
          variant: 'success',
        });
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to add leads to campaign',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error adding leads to campaign:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while adding leads to the campaign.',
        variant: 'destructive',
      });
    } finally {
      setIsAddingToCampaign(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportFileName(file.name);
    setIsImporting(true);

    try {
      let data: any[] = [];

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
      } else if (file.name.endsWith('.csv')) {
        const text = await file.text();
        data = text.split('\n').map(line => line.split(','));
      }

      if (data.length < 2) {
        toast({
          title: 'Invalid File',
          description: 'File must have a header row and at least one data row',
          variant: 'destructive',
        });
        setIsImporting(false);
        return;
      }

      const headers = (data[0] as any[]).map(h => String(h || '').trim()).filter(h => h !== '');
      const rows = data.slice(1).filter((row: any[]) => row.some((cell: any) => cell !== '' && cell !== undefined));

      setOriginalHeaders(headers);

      const parsedSampleRows = rows.slice(0, 5).map((row: any[]) => 
        headers.map((_, colIndex) => row[colIndex] === undefined || row[colIndex] === null ? '' : String(row[colIndex]).trim())
      );
      setSampleRows(parsedSampleRows);

      setImportStep('mapping');
      setIsAnalyzingHeaders(true);

      try {
        const analyzeRes = await fetch('/api/leads/import/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            headers,
            sampleRows: parsedSampleRows.slice(0, 3)
          }),
        });

        if (analyzeRes.ok) {
          const resData = await analyzeRes.json();
          const suggestions = resData.suggestions || {};
          const newMapping: Record<string, string> = {
            company_name: suggestions.company_name || '',
            contact_name: suggestions.contact_name || '',
            email: suggestions.email || '',
            phone: suggestions.phone || '',
            country: suggestions.country || '',
            website: suggestions.website || '',
            linked_in: suggestions.linked_in || '',
            product_interest: suggestions.product_interest || '',
          };
          setSelectedMapping(newMapping);
          toast({
            title: 'AI Mapped Successfully',
            description: 'AI analyzed your sheet and suggested column mappings.',
            variant: 'success',
          });
        } else {
          throw new Error('AI mapping failed');
        }
      } catch (err) {
        console.error('AI header analysis failed, falling back:', err);
        const fallbackMapping: Record<string, string> = {
          company_name: '',
          contact_name: '',
          email: '',
          phone: '',
          country: '',
          website: '',
          linked_in: '',
          product_interest: '',
        };
        headers.forEach(h => {
          const norm = h.toLowerCase().trim();
          if (norm.includes('company')) fallbackMapping.company_name = h;
          else if (norm.includes('contact') || norm.includes('person') || norm.includes('name')) fallbackMapping.contact_name = h;
          else if (norm.includes('email')) fallbackMapping.email = h;
          else if (norm.includes('phone') || norm.includes('tel')) fallbackMapping.phone = h;
          else if (norm.includes('country')) fallbackMapping.country = h;
          else if (norm.includes('website') || norm.includes('url')) fallbackMapping.website = h;
          else if (norm.includes('linkedin')) fallbackMapping.linked_in = h;
          else if (norm.includes('product') || norm.includes('interest') || norm.includes('hs code') || norm.includes('description')) fallbackMapping.product_interest = h;
        });
        setSelectedMapping(fallbackMapping);
        toast({
          title: 'Direct Mapping Applied',
          description: 'Matched columns using fallback header matching.',
          variant: 'default',
        });
      } finally {
        setIsAnalyzingHeaders(false);
      }

      setIsImporting(false);
    } catch (error) {
      console.error('Error reading file:', error);
      toast({
        title: 'Error',
        description: 'Error reading file',
        variant: 'destructive',
      });
      setIsImporting(false);
    }
  };

  const handleImport = async () => {
    const file = importFile || fileInputRef.current?.files?.[0];
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please re-select your spreadsheet and try again.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedMapping.company_name || !selectedMapping.contact_name || !selectedMapping.email) {
      toast({
        title: 'Required Mappings Missing',
        description: 'Please map Company Name, Contact Name, and Email to proceed.',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);
    setImportProgress({ processed: 0, total: 0, inserted: 0, skipped: 0 });

    try {
      // 1. Parse the whole file on the server (robust CSV/XLSX parsing).
      const parseForm = new FormData();
      parseForm.append('file', file);
      const parseRes = await fetch('/api/leads/import/parse', { method: 'POST', body: parseForm });
      const parsed = await parseRes.json();
      if (!parseRes.ok) throw new Error(parsed.error || 'Could not read the file');

      const headers: string[] = parsed.headers || [];
      const rows: string[][] = parsed.rows || [];

      // 2. Build mapped records client-side from the (AI-assisted) mapping.
      const builtinSet = new Set([
        'company_name', 'contact_name', 'email', 'country', 'website', 'linked_in', 'product_interest',
      ]);
      const customKeySet = new Set(customFields.map((f) => f.key));
      const fieldEntries = Object.entries(selectedMapping).filter(([, h]) => h && h !== 'skip');

      const records = rows.map((row) => {
        const rec: any = { custom_fields: {} as Record<string, string> };
        for (const [dbField, header] of fieldEntries) {
          const idx = headers.indexOf(header as string);
          if (idx < 0) continue;
          const raw = row[idx];
          const val = raw === undefined || raw === null ? '' : String(raw).trim();
          if (!val) continue;
          if (builtinSet.has(dbField)) rec[dbField] = val;
          else if (customKeySet.has(dbField)) rec.custom_fields[dbField] = val;
        }
        return rec;
      });

      const total = records.length;
      if (total === 0) throw new Error('No rows with data were found in the file.');
      setImportProgress({ processed: 0, total, inserted: 0, skipped: 0 });

      // 3. Insert in small batches so large files never crash, updating progress.
      const BATCH_SIZE = 50;
      let inserted = 0;
      let skipped = 0;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const res = await fetch('/api/leads/import/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leads: batch }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'A batch failed to import');
        inserted += data.inserted || 0;
        skipped += data.skipped || 0;
        setImportProgress({ processed: Math.min(i + BATCH_SIZE, total), total, inserted, skipped });
      }

      toast({
        title: 'Import Complete',
        description: `Added ${inserted} lead${inserted === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} (duplicates/empty)` : ''}.`,
        variant: 'success',
      });

      setIsImportDialogOpen(false);
      setImportStep('upload');
      setOriginalHeaders([]);
      setSampleRows([]);
      setSelectedMapping({
        company_name: '', contact_name: '', email: '', phone: '',
        country: '', website: '', linked_in: '', product_interest: '',
      });
      setImportFileName('');
      setImportFile(null);
      setImportProgress({ processed: 0, total: 0, inserted: 0, skipped: 0 });
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchLeads();
    } catch (error: any) {
      console.error('Error importing leads:', error);
      toast({
        title: 'Import Failed',
        description: error?.message || 'Error importing leads',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  // The server already filters (search/status/country) and paginates, so we
  // render `leads` directly — no client-side filtering or slicing.
  const hasActiveFilters =
    debouncedSearch.trim() !== '' || statusFilter !== 'all' || countryFilter !== 'All';

  const toggleSelectAll = () => {
    if (selectedLeads.length === leads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leads.map((l) => l.id));
    }
  };

  const toggleSelectLead = (id: string) => {
    if (selectedLeads.includes(id)) {
      setSelectedLeads(selectedLeads.filter((l) => l !== id));
    } else {
      setSelectedLeads([...selectedLeads, id]);
    }
  };

  const handleGenerateEmail = async () => {
    if (!selectedLead) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/emails/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: selectedLead.companyName,
          contactName: selectedLead.contactName,
          country: selectedLead.country,
          productInterest: selectedLead.productInterest,
          website: selectedLead.website,
          linkedIn: selectedLead.linkedIn,
          tone: emailTone,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedEmail({ subject: data.subject || '', body: data.body || '' });
      } else {
        toast({
          title: 'Generation Failed',
          description: data.error || 'Failed to generate email',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error generating email:', error);
      toast({
        title: 'Error',
        description: 'Error generating email',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    if (!selectedLead || !generatedEmail.body) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: selectedLead.id,
          subject: generatedEmail.subject,
          body: generatedEmail.body,
          status: 'sent',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: 'Email Sent',
          description: 'Email sent successfully!',
          variant: 'success',
        });
        setIsGenerateDialogOpen(false);
        setGeneratedEmail({ subject: '', body: '' });
        fetchLeads();
      } else {
        toast({
          title: 'Send Failed',
          description: data.error || 'Failed to send email',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: 'Error',
        description: 'Error sending email',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBulkEmailGenerateAndSend = async () => {
    if (selectedLeads.length === 0) return;
    setIsBulkSending(true);
    setBulkSendProgress({ current: 0, total: selectedLeads.length, success: 0, failed: 0 });

    let successCount = 0;
    let failCount = 0;

    // Get full lead details for selected IDs
    const fullLeads = leads.filter(l => selectedLeads.includes(l.id));
    // If a template was chosen, use it (rendered per lead) instead of AI.
    const tmpl = bulkTemplateId !== NO_TEMPLATE ? templates.find(t => t.id === bulkTemplateId) : null;

    for (let i = 0; i < fullLeads.length; i++) {
      const lead = fullLeads[i];
      setBulkSendProgress(prev => ({ ...prev, current: i + 1 }));

      try {
        let subject = '';
        let body = '';

        if (tmpl) {
          // Template path — fill placeholders for this lead, no AI call.
          subject = fillTemplate(tmpl.subject, lead);
          body = fillTemplate(tmpl.body, lead);
        } else {
          // AI path.
          const res = await fetch('/api/emails/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyName: lead.companyName,
              contactName: lead.contactName,
              country: lead.country,
              productInterest: lead.productInterest,
              website: lead.website,
              linkedIn: lead.linkedIn,
              tone: bulkEmailTone,
            }),
          });
          if (!res.ok) {
            failCount++;
            setBulkSendProgress(prev => ({ ...prev, failed: failCount }));
            continue;
          }
          const data = await res.json();
          subject = data.subject;
          body = data.body;
        }

        // Save + send the email (also updates lead status).
        const saveRes = await fetch('/api/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead.id,
            subject,
            body,
            status: 'sent',
          }),
        });

        if (saveRes.ok) {
          successCount++;
          setBulkSendProgress(prev => ({ ...prev, success: successCount }));
        } else {
          failCount++;
          setBulkSendProgress(prev => ({ ...prev, failed: failCount }));
        }
      } catch (error) {
        console.error(`Error sending to ${lead.email}:`, error);
        failCount++;
        setBulkSendProgress(prev => ({ ...prev, failed: failCount }));
      }
    }

    setIsBulkSending(false);
    
    toast({
      title: 'Bulk Email Process Completed',
      description: `Sent ${successCount} emails successfully, ${failCount} failed.`,
      variant: successCount > 0 ? 'success' : 'destructive',
    });
    fetchLeads();
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Leads</h1>
          <p className="text-slate-500">Manage your B2B leads and contacts</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => {
            // Download sample excel file
            window.open('/api/leads/sample', '_blank');
          }}>
            <Download className="mr-2 h-4 w-4" />
            Sample Excel
          </Button>
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import Leads
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Lead
          </Button>
        </div>
      </div>

      <Card className="border-slate-200/50">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap w-full">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search leads..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === 'all' ? 'All Status' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Countries</SelectItem>
                {countryOptions.map((country) => (
                  <SelectItem key={country} value={country}>
                    {country}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        {selectedLeads.length > 0 && (
          <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-orange-700">
                {selectedLeads.length} lead(s) selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLeads([])}
                className="text-orange-600 hover:text-orange-700 hover:bg-orange-100"
              >
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsBulkStatusDialogOpen(true)}
                className="border-orange-200 text-orange-700 hover:bg-orange-100"
              >
                <BadgeCheck className="mr-1 h-4 w-4" />
                Update Status
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={openCampaignDialog}
                className="border-purple-200 text-purple-700 hover:bg-purple-50"
              >
                <Mail className="mr-1 h-4 w-4" />
                Add to Campaign
              </Button>
               <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBulkSendProgress({ current: 0, total: 0, success: 0, failed: 0 });
                  setIsBulkEmailDialogOpen(true);
                }}
                className="border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <Send className="mr-1 h-4 w-4" />
                Generate & Send
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDelete}
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        )}

        <CardContent>
          {leads.length === 0 ? (
            hasActiveFilters ? (
              <div className="text-center py-12 text-slate-500">
                <p>No leads match your filters.</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setCountryFilter('All');
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <p>No leads found. Add your first lead to get started.</p>
                <Button className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Lead
                </Button>
              </div>
            )
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200 -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-2 py-3 text-left sm:px-4">
                        <Checkbox
                          checked={selectedLeads.length === leads.length && leads.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-slate-500 uppercase sm:px-4">Company</th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-slate-500 uppercase sm:px-4">Contact</th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-slate-500 uppercase sm:px-4">Email</th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-slate-500 uppercase sm:px-4">Phone</th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-slate-500 uppercase sm:px-4">Country</th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-slate-500 uppercase sm:px-4">Status</th>
                      <th className="px-2 py-3 text-right text-xs font-semibold text-slate-500 uppercase sm:px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-2 py-3 sm:px-4">
                          <Checkbox
                            checked={selectedLeads.includes(lead.id)}
                            onCheckedChange={() => toggleSelectLead(lead.id)}
                          />
                        </td>
                        <td className="px-2 py-3 sm:px-4">
                          <div className="font-medium text-slate-900">{lead.companyName || '-'}</div>
                          <div className="text-xs text-slate-500">{lead.source || 'Manual'}</div>
                        </td>
                        <td className="px-2 py-3 text-slate-700 sm:px-4">{lead.contactName || '-'}</td>
                        <td className="px-2 py-3 text-slate-600 sm:px-4">{lead.email || '-'}</td>
                        <td className="px-2 py-3 text-slate-600 sm:px-4">{lead.phone || '-'}</td>
                        <td className="px-2 py-3 sm:px-4">
                          <Badge variant="outline" className="text-xs">{lead.country || '-'}</Badge>
                        </td>
                        <td className="px-2 py-3 sm:px-4">
                          <Badge className={cn(STATUS_COLORS[lead.status] || 'bg-slate-100')}>
                            {lead.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setSelectedLead(lead); setIsGenerateDialogOpen(true); }}>
                                <Sparkles className="mr-2 h-4 w-4" />
                                Generate Email
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(lead)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteLead(lead)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between px-4 py-4 flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-500">
                    Rows per page:
                  </span>
                  <Select value={leadsPerPage.toString()} onValueChange={(val) => setLeadsPerPage(Number(val))}>
                    <SelectTrigger className="w-20 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-slate-500">
                    {totalLeads === 0 ? 0 : ((currentPage - 1) * leadsPerPage) + 1}-{Math.min(currentPage * leadsPerPage, totalLeads)} of {totalLeads}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={currentPage === page ? 'default' : 'outline'}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(currentPage + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
            <DialogDescription>Enter the lead details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input value={newLead.companyName} onChange={(e) => setNewLead({ ...newLead, companyName: e.target.value })} placeholder="TechCorp Inc" />
              </div>
              <div className="space-y-2">
                <Label>Contact Name *</Label>
                <Input value={newLead.contactName} onChange={(e) => setNewLead({ ...newLead, contactName: e.target.value })} placeholder="John Smith" />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} placeholder="john@techcorp.com" />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={newLead.country} onValueChange={(v) => setNewLead({ ...newLead, country: v })}>
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    {countries.filter(c => c !== 'All').map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Product Interest</Label>
                <Input value={newLead.productInterest} onChange={(e) => setNewLead({ ...newLead, productInterest: e.target.value })} placeholder="Industrial Machinery" />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input value={newLead.website} onChange={(e) => setNewLead({ ...newLead, website: e.target.value })} placeholder="https://..." />
              </div>
              {customFields.map((cf) => (
                <div key={cf.id} className="space-y-2">
                  <Label>{cf.label}</Label>
                  <Input
                    type={customInputType(cf.type)}
                    value={newLeadCustom[cf.key] || ''}
                    onChange={(e) => setNewLeadCustom((prev) => ({ ...prev, [cf.key]: e.target.value }))}
                    placeholder={cf.label}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={addLead} disabled={!newLead.companyName || !newLead.contactName || !newLead.email}>Add Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isGenerateDialogOpen} onOpenChange={(open) => { setIsGenerateDialogOpen(open); if (!open) { setGeneratedEmail({ subject: '', body: '' }); setEmailTone('professional'); setGenTemplateId(NO_TEMPLATE); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate or use a template</DialogTitle>
            <DialogDescription>Personalized outreach email for {selectedLead?.contactName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Use a template</Label>
                <Select
                  value={genTemplateId}
                  onValueChange={(v) => {
                    setGenTemplateId(v);
                    if (v !== NO_TEMPLATE && selectedLead) {
                      const t = templates.find((tpl) => tpl.id === v);
                      if (t) {
                        setGeneratedEmail({
                          subject: fillTemplate(t.subject, selectedLead),
                          body: fillTemplate(t.body, selectedLead),
                        });
                      }
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Choose a template" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEMPLATE}>None (write / AI)</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>AI tone</Label>
                <Select value={emailTone} onValueChange={setEmailTone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="Email subject line..."
                value={generatedEmail.subject}
                onChange={(e) => setGeneratedEmail({ ...generatedEmail, subject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                placeholder="Generated email will appear here..."
                className="min-h-[200px]"
                value={generatedEmail.body}
                onChange={(e) => setGeneratedEmail({ ...generatedEmail, body: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGenerateDialogOpen(false)}>Cancel</Button>
            <Button variant="outline" onClick={handleGenerateEmail} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate
            </Button>
            <Button 
              disabled={!generatedEmail.body || isGenerating} 
              onClick={handleSendEmail}
            >
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
        setIsImportDialogOpen(open);
        if (!open) {
          setImportStep('upload');
          setOriginalHeaders([]);
          setSampleRows([]);
          setSelectedMapping({
            company_name: '',
            contact_name: '',
            email: '',
            phone: '',
            country: '',
            website: '',
            linked_in: '',
            product_interest: '',
          });
          setImportFileName('');
          setImportFile(null);
          setImportProgress({ processed: 0, total: 0, inserted: 0, skipped: 0 });
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      }}>
        <DialogContent className={cn(
          "max-h-[90vh] overflow-y-auto transition-all duration-300",
          importStep === 'mapping' ? "sm:max-w-4xl" : "sm:max-w-2xl"
        )}>
          <DialogHeader>
            <DialogTitle>Import Leads</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {importStep === 'upload' 
                ? 'Upload a CSV or Excel spreadsheet containing your lead details.'
                : 'Map target database fields to the columns detected in your spreadsheet.'
              }
            </DialogDescription>
          </DialogHeader>

          {importStep === 'upload' ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 sm:p-8 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer block">
                  {isImporting ? (
                    <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 mx-auto mb-3 sm:mb-4 text-orange-500 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-8 w-8 sm:h-10 sm:w-10 mx-auto mb-3 sm:mb-4 text-slate-400" />
                  )}
                  <p className="text-sm text-slate-600 truncate">
                    {importFileName ? importFileName : 'Click to upload CSV or Excel'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 sm:mt-2">Supports .csv, .xlsx, .xls</p>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {isAnalyzingHeaders ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
                  <div className="space-y-1 text-center">
                    <h3 className="font-semibold text-slate-800 text-lg">🤖 AI is analyzing column headers...</h3>
                    <p className="text-sm text-slate-500">Mapping your spreadsheet to database fields automatically.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* AI Status Badge */}
                  <div className="bg-orange-50/50 border border-orange-100/80 rounded-lg p-3 text-xs sm:text-sm text-orange-800 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-orange-600 shrink-0 animate-pulse" />
                    <span>
                      <strong>AI Suggestion Applied:</strong> Columns were matched automatically. Verify the mappings below and adjust them if needed.
                    </span>
                  </div>

                  {/* Two column layout: Left is selector fields, Right is mapped data preview */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    {/* Selector Column */}
                    <div className="md:col-span-3 space-y-4 pr-1">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Field Mapping</h3>
                      <div className="grid grid-cols-1 gap-4 max-h-[40vh] overflow-y-auto pr-2">
                        {[
                          { key: 'company_name', label: 'Company Name', required: true, desc: 'Google, Stripe, etc.' },
                          { key: 'contact_name', label: 'Contact Person', required: true, desc: 'Primary contact name.' },
                          { key: 'email', label: 'Email Address', required: true, desc: 'Contact email address.' },
                          { key: 'phone', label: 'Phone Number', required: false, desc: 'Optional phone/tel.' },
                          { key: 'country', label: 'Country', required: false, desc: 'E.g., USA, Germany' },
                          { key: 'website', label: 'Website URL', required: false, desc: 'E.g., stripe.com' },
                          { key: 'linked_in', label: 'LinkedIn Profile', required: false, desc: 'LinkedIn member URL' },
                          { key: 'product_interest', label: 'Product Description', required: false, desc: 'Products or HS Code interests' },
                          ...customFields.map((cf) => ({
                            key: cf.key,
                            label: cf.label,
                            required: false,
                            desc: 'Custom field',
                          })),
                        ].map((field) => (
                          <div key={field.key} className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <Label className="text-sm font-medium flex items-center gap-1 text-slate-700">
                                {field.label}
                                {field.required && <span className="text-red-500 font-bold">*</span>}
                              </Label>
                              <span className="text-[10px] text-slate-400">{field.desc}</span>
                            </div>
                            <Select 
                              value={selectedMapping[field.key] || 'skip'} 
                              onValueChange={(val) => {
                                setSelectedMapping(prev => ({
                                  ...prev,
                                  [field.key]: val === 'skip' ? '' : val
                                }));
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Do not import (Skip)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="skip">Do not import (Skip)</SelectItem>
                                {originalHeaders.map(header => (
                                  <SelectItem key={header} value={header}>{header}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Preview Column */}
                    <div className="md:col-span-2 space-y-4">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Live Preview (First 3 Rows)</h3>
                      {sampleRows.length === 0 ? (
                        <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center text-xs text-slate-400">
                          No data available to preview.
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                          {sampleRows.slice(0, 3).map((rowCells, rIndex) => {
                            return (
                              <div key={rIndex} className="bg-slate-50/60 border border-slate-100 rounded-lg p-3 text-xs space-y-2">
                                <div className="font-semibold text-slate-600 border-b pb-1 mb-1">Row #{rIndex + 1}</div>
                                <div className="space-y-1">
                                  <div className="flex justify-between gap-2">
                                    <span className="text-slate-400">Company:</span>
                                    <span className="font-medium text-slate-700 truncate max-w-[150px]">
                                      {(() => {
                                        const h = selectedMapping.company_name;
                                        const idx = h ? originalHeaders.indexOf(h) : -1;
                                        return idx !== -1 ? rowCells[idx] || '-' : '-';
                                      })()}
                                    </span>
                                  </div>
                                  <div className="flex justify-between gap-2">
                                    <span className="text-slate-400">Contact:</span>
                                    <span className="font-medium text-slate-700 truncate max-w-[150px]">
                                      {(() => {
                                        const h = selectedMapping.contact_name;
                                        const idx = h ? originalHeaders.indexOf(h) : -1;
                                        return idx !== -1 ? rowCells[idx] || '-' : '-';
                                      })()}
                                    </span>
                                  </div>
                                  <div className="flex justify-between gap-2">
                                    <span className="text-slate-400">Email:</span>
                                    <span className="font-medium text-slate-700 truncate max-w-[150px]">
                                      {(() => {
                                        const h = selectedMapping.email;
                                        const idx = h ? originalHeaders.indexOf(h) : -1;
                                        return idx !== -1 ? rowCells[idx] || '-' : '-';
                                      })()}
                                    </span>
                                  </div>
                                  <div className="flex justify-between gap-2">
                                    <span className="text-slate-400">Phone:</span>
                                    <span className="font-medium text-slate-600 truncate max-w-[150px]">
                                      {(() => {
                                        const h = selectedMapping.phone;
                                        const idx = h ? originalHeaders.indexOf(h) : -1;
                                        return idx !== -1 ? rowCells[idx] || '-' : '-';
                                      })()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Live progress bar while batches are being imported */}
          {isImporting && importProgress.total > 0 && (
            <div className="mt-4 space-y-2 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
              <div className="flex items-center justify-between text-sm font-medium text-slate-700">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                  Importing leads…
                </span>
                <span>
                  {Math.min(importProgress.processed, importProgress.total)} / {importProgress.total}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-orange-500 transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (Math.min(importProgress.processed, importProgress.total) / importProgress.total) * 100
                    )}%`,
                  }}
                />
              </div>
              <p className="text-xs text-slate-500">
                {importProgress.inserted} added
                {importProgress.skipped > 0 ? ` · ${importProgress.skipped} skipped (duplicates/empty)` : ''}
              </p>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            {importStep === 'mapping' && !isAnalyzingHeaders && (
              <Button 
                variant="outline" 
                onClick={() => {
                  setImportStep('upload');
                  setSelectedMapping({
                    company_name: '',
                    contact_name: '',
                    email: '',
                    phone: '',
                    country: '',
                    website: '',
                    linked_in: '',
                    product_interest: '',
                  });
                }}
                className="w-full sm:w-auto"
              >
                Back to Upload
              </Button>
            )}
            <Button variant="ghost" onClick={() => {
              setIsImportDialogOpen(false);
            }} className="w-full sm:w-auto">
              Cancel
            </Button>
            {importStep === 'mapping' && !isAnalyzingHeaders ? (
              <Button 
                onClick={handleImport} 
                disabled={
                  !selectedMapping.company_name || 
                  !selectedMapping.contact_name || 
                  !selectedMapping.email || 
                  isImporting
                } 
                className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-white"
              >
                {isImporting ? 'Importing...' : 'Confirm & Import Leads'}
              </Button>
            ) : importStep === 'upload' ? (
              <Button disabled className="w-full sm:w-auto">
                Import Leads
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkStatusDialogOpen} onOpenChange={setIsBulkStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Status</DialogTitle>
            <DialogDescription>
              Update status for {selectedLeads.length} selected lead(s)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="mb-2 block">Select new status</Label>
            <Select value={bulkNewStatus} onValueChange={setBulkNewStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Choose status" />
              </SelectTrigger>
              <SelectContent>
                {availableStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    <span className="flex items-center gap-2">
                      <Badge className={cn(STATUS_COLORS[status])}>{status}</Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkStatusDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkStatusUpdate} disabled={!bulkNewStatus}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkEmailDialogOpen} onOpenChange={(open) => { setIsBulkEmailDialogOpen(open); if (!open) setBulkTemplateId(NO_TEMPLATE); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate &amp; Send Emails</DialogTitle>
            <DialogDescription>
              Send personalized emails to {selectedLeads.length} selected lead(s) — pick a template, or let AI write them.
            </DialogDescription>
          </DialogHeader>
          {bulkSendProgress.current > 0 && bulkSendProgress.current === bulkSendProgress.total ? (
            <div className="py-6 text-center">
              <div className="text-4xl mb-4">✅</div>
              <p className="text-lg font-medium">Emails Sent!</p>
              <p className="text-sm text-slate-500 mt-2">
                {bulkSendProgress.success} succeeded, {bulkSendProgress.failed} failed
              </p>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              <div>
                <Label className="mb-2 block">Use a template</Label>
                <Select value={bulkTemplateId} onValueChange={setBulkTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEMPLATE}>None (AI-generated)</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">
                  AI tone {bulkTemplateId !== NO_TEMPLATE && <span className="text-slate-400">(ignored — using template)</span>}
                </Label>
                <Select value={bulkEmailTone} onValueChange={setBulkEmailTone} disabled={bulkTemplateId !== NO_TEMPLATE}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isBulkSending && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Progress</span>
                    <span className="text-slate-700">{bulkSendProgress.current} / {bulkSendProgress.total}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-orange-500 h-2 rounded-full transition-all"
                      style={{ width: `${(bulkSendProgress.current / bulkSendProgress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 text-center">
                    Generating and sending emails...
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setIsBulkEmailDialogOpen(false); }}
            >
              {(bulkSendProgress.total > 0 && bulkSendProgress.current >= bulkSendProgress.total) ? 'Close' : 'Cancel'}
            </Button>
            {(!isBulkSending && (bulkSendProgress.total === 0 || bulkSendProgress.current < bulkSendProgress.total)) && (
              <Button onClick={handleBulkEmailGenerateAndSend}>
                <Send className="mr-2 h-4 w-4" />
                Generate & Send
              </Button>
            )}
            {isBulkSending && (
              <Button disabled>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setSelectedLead(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>Update the lead details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input value={editLead.companyName} onChange={(e) => setEditLead({ ...editLead, companyName: e.target.value })} placeholder="TechCorp Inc" />
              </div>
              <div className="space-y-2">
                <Label>Contact Name *</Label>
                <Input value={editLead.contactName} onChange={(e) => setEditLead({ ...editLead, contactName: e.target.value })} placeholder="John Smith" />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={editLead.email} onChange={(e) => setEditLead({ ...editLead, email: e.target.value })} placeholder="john@techcorp.com" />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={editLead.country} onValueChange={(v) => setEditLead({ ...editLead, country: v })}>
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    {countries.filter(c => c !== 'All').map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Product Interest</Label>
                <Input value={editLead.productInterest} onChange={(e) => setEditLead({ ...editLead, productInterest: e.target.value })} placeholder="Industrial Machinery" />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input value={editLead.website} onChange={(e) => setEditLead({ ...editLead, website: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>LinkedIn</Label>
                <Input value={editLead.linkedIn} onChange={(e) => setEditLead({ ...editLead, linkedIn: e.target.value })} placeholder="https://linkedin.com/in/..." />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editLead.status} onValueChange={(v) => setEditLead({ ...editLead, status: v })}>
                  <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    {availableStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {customFields.map((cf) => (
                <div key={cf.id} className="space-y-2">
                  <Label>{cf.label}</Label>
                  <Input
                    type={customInputType(cf.type)}
                    value={editLeadCustom[cf.key] || ''}
                    onChange={(e) => setEditLeadCustom((prev) => ({ ...prev, [cf.key]: e.target.value }))}
                    placeholder={cf.label}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleUpdateLead}
              disabled={!editLead.companyName || !editLead.contactName || !editLead.email || isSavingEdit}
            >
              {isSavingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCampaignDialogOpen} onOpenChange={setIsCampaignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to Campaign</DialogTitle>
            <DialogDescription>
              Add {selectedLeads.length} selected lead(s) to a campaign
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="mb-2 block">Select campaign</Label>
            {isLoadingCampaigns ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading campaigns...
              </div>
            ) : campaigns.length === 0 ? (
              <p className="text-sm text-slate-500 py-2">No campaigns found. Create a campaign first.</p>
            ) : (
              <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCampaignDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddToCampaign} disabled={!selectedCampaignId || isAddingToCampaign}>
              {isAddingToCampaign && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add to Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}