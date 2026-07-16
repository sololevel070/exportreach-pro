'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  MoreHorizontal,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit,
  BarChart3,
  Users,
  UserPlus,
  Mail,
  MousePointerClick,
  MessageCircle,
  Loader2,
  X,
  AlertCircle,
} from 'lucide-react';
import { cn, STATUS_COLORS, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

const statusColors: Record<string, string> = {
  active: 'bg-green-500',
  paused: 'bg-amber-500',
  draft: 'bg-slate-400',
  completed: 'bg-blue-500',
};

// Sentinel for the "None (use default)" template option (Radix Select forbids empty string values).
const NO_TEMPLATE = '__none__';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  leads: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  repliedLeads?: number;
  dailyLimit: number;
  templateId?: string;
  followupEnabled?: boolean;
  followupAfterDays?: number;
  followupSendHour?: number | null;
  followupTimezone?: string | null;
  scheduleEnabled?: boolean;
  scheduleDate?: string | null;
  scheduleHour?: number | null;
  scheduleTimezone?: string | null;
  scheduleStartedAt?: string | null;
}

// Timezones offered for scheduling follow-ups to a recipient's local time.
const TIMEZONES: { value: string; label: string }[] = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/Los_Angeles', label: 'US Pacific — Los Angeles' },
  { value: 'America/Denver', label: 'US Mountain — Denver' },
  { value: 'America/Chicago', label: 'US Central — Chicago' },
  { value: 'America/New_York', label: 'US Eastern — New York' },
  { value: 'America/Toronto', label: 'Canada — Toronto' },
  { value: 'America/Sao_Paulo', label: 'Brazil — São Paulo' },
  { value: 'Europe/London', label: 'UK — London' },
  { value: 'Europe/Amsterdam', label: 'Netherlands — Amsterdam' },
  { value: 'Europe/Berlin', label: 'Central Europe — Berlin' },
  { value: 'Africa/Nairobi', label: 'East Africa — Nairobi' },
  { value: 'Asia/Dubai', label: 'Gulf — Dubai (UAE)' },
  { value: 'Asia/Qatar', label: 'Qatar — Doha' },
  { value: 'Asia/Bahrain', label: 'Bahrain — Manama' },
  { value: 'Asia/Muscat', label: 'Oman — Muscat' },
  { value: 'Asia/Karachi', label: 'Pakistan — Karachi' },
  { value: 'Asia/Kolkata', label: 'India — Kolkata' },
  { value: 'Asia/Kathmandu', label: 'Nepal — Kathmandu' },
  { value: 'Asia/Dhaka', label: 'Bangladesh — Dhaka' },
  { value: 'Asia/Kuala_Lumpur', label: 'Malaysia — Kuala Lumpur' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Manila', label: 'Philippines — Manila' },
  { value: 'Asia/Shanghai', label: 'China — Shanghai' },
  { value: 'Asia/Tokyo', label: 'Japan — Tokyo' },
  { value: 'Australia/Sydney', label: 'Australia — Sydney' },
];

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12

// Convert a 0-23 hour into { hour12, ampm }.
function to12h(hour24: number): { hour12: number; ampm: 'AM' | 'PM' } {
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, ampm };
}
// Convert { hour12 (1-12), ampm } into a 0-23 hour.
function to24h(hour12: number, ampm: 'AM' | 'PM'): number {
  const h = hour12 % 12; // 12 -> 0
  return ampm === 'PM' ? h + 12 : h;
}

interface Lead {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  country?: string;
  status?: string;
}

interface Template {
  id: string;
  name: string;
  category?: string;
}

export default function CampaignsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    dailyLimit: 50,
    templateId: '',
    followupEnabled: true,
    followupAfterDays: 3,
    followupSendHour: 9,
    followupTimezone: 'UTC',
    scheduleEnabled: false,
    scheduleDate: '',
    scheduleHour: 9,
    scheduleTimezone: 'UTC',
  });

  // Manage Leads full-page panel state
  const [managePanel, setManagePanel] = useState<Campaign | null>(null);
  const [manageTab, setManageTab] = useState<'active' | 'replied'>('active');
  const [activeLeads, setActiveLeads] = useState<Lead[]>([]);
  const [repliedLeads, setRepliedLeads] = useState<Lead[]>([]);
  const [availableLeads, setAvailableLeads] = useState<Lead[]>([]);
  const [availableFilter, setAvailableFilter] = useState('');
  const [stagedAdd, setStagedAdd] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsBusy, setLeadsBusy] = useState(false);
  const [panelDeleteConfirm, setPanelDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchCampaigns();
    fetchTemplates();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/campaigns');
      if (!res.ok) throw new Error('Failed to load campaigns');
      const data = await res.json();
      setCampaigns(Array.isArray(data) ? data : []);
      setLoadError(false);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      if (!res.ok) throw new Error('Failed to load templates');
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setNewCampaign({
      name: '',
      description: '',
      dailyLimit: 50,
      templateId: '',
      followupEnabled: true,
      followupAfterDays: 3,
      followupSendHour: 9,
      followupTimezone: 'UTC',
      scheduleEnabled: false,
      scheduleDate: '',
      scheduleHour: 9,
      scheduleTimezone: 'UTC',
    });
    setIsCreateDialogOpen(true);
  };

  const openEdit = (campaign: Campaign) => {
    setEditingId(campaign.id);
    setNewCampaign({
      name: campaign.name,
      description: campaign.description || '',
      dailyLimit: campaign.dailyLimit,
      templateId: campaign.templateId || '',
      followupEnabled: campaign.followupEnabled ?? true,
      followupAfterDays: campaign.followupAfterDays ?? 3,
      followupSendHour: campaign.followupSendHour ?? 9,
      followupTimezone: campaign.followupTimezone ?? 'UTC',
      scheduleEnabled: campaign.scheduleEnabled ?? false,
      scheduleDate: campaign.scheduleDate ?? '',
      scheduleHour: campaign.scheduleHour ?? 9,
      scheduleTimezone: campaign.scheduleTimezone ?? 'UTC',
    });
    setIsCreateDialogOpen(true);
  };

  const saveCampaign = async () => {
    try {
      const url = editingId ? `/api/campaigns/${editingId}` : '/api/campaigns';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCampaign),
      });

      if (res.ok) {
        setIsCreateDialogOpen(false);
        setEditingId(null);
        setNewCampaign({
          name: '',
          description: '',
          dailyLimit: 50,
          templateId: '',
          followupEnabled: true,
          followupAfterDays: 3,
          followupSendHour: 9,
          followupTimezone: 'UTC',
          scheduleEnabled: false,
          scheduleDate: '',
          scheduleHour: 9,
          scheduleTimezone: 'UTC',
        });
        await fetchCampaigns();
        toast({ title: editingId ? 'Campaign updated' : 'Campaign created' });
      } else {
        toast({ title: 'Save failed', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error saving campaign:', error);
      toast({ title: 'Save failed', variant: 'destructive' });
    }
  };

  const startCampaign = async (campaign: Campaign) => {
    setBusyId(campaign.id);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/start`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchCampaigns();
        const anySent = (data.sent ?? 0) > 0;
        toast({
          title: anySent ? 'Campaign started' : 'Nothing sent',
          description: data.message,
          variant: anySent ? undefined : 'destructive',
        });
      } else {
        toast({
          title: 'Could not start campaign',
          description: data.error || 'Add leads first, then try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error starting campaign:', error);
      toast({ title: 'Could not start campaign', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const setCampaignStatus = async (campaign: Campaign, status: string) => {
    setBusyId(campaign.id);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await fetchCampaigns();
        toast({ title: status === 'paused' ? 'Campaign paused' : 'Campaign updated' });
      } else {
        toast({ title: 'Update failed', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error updating campaign status:', error);
      toast({ title: 'Update failed', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const deleteCampaign = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      const res = await fetch(`/api/campaigns/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteTarget(null);
        await fetchCampaigns();
        toast({ title: 'Campaign deleted' });
      } else {
        toast({ title: 'Delete failed', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast({ title: 'Delete failed', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  // Delete from within the full-page Manage Leads panel.
  const deleteCampaignFromPanel = async () => {
    if (!managePanel) return;
    setLeadsBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${managePanel.id}`, { method: 'DELETE' });
      if (res.ok) {
        setPanelDeleteConfirm(false);
        closeManagePanel();
        await fetchCampaigns();
        toast({ title: 'Campaign deleted' });
      } else {
        toast({ title: 'Delete failed', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast({ title: 'Delete failed', variant: 'destructive' });
    } finally {
      setLeadsBusy(false);
    }
  };

  const openManagePanel = async (campaign: Campaign, tab: 'active' | 'replied' = 'active') => {
    setManagePanel(campaign);
    setManageTab(tab);
    setStagedAdd(new Set());
    setSelectedIds(new Set());
    setAvailableFilter('');
    setActiveLeads([]);
    setRepliedLeads([]);
    setAvailableLeads([]);
    setPanelDeleteConfirm(false);
    setLeadsLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/leads`);
      if (!res.ok) throw new Error('Failed to load leads');
      const data = await res.json();
      setActiveLeads(data.active || []);
      setRepliedLeads(data.replied || []);
      setAvailableLeads(data.available || []);
    } catch (error) {
      console.error('Error loading campaign leads:', error);
      toast({ title: 'Could not load leads', variant: 'destructive' });
    } finally {
      setLeadsLoading(false);
    }
  };

  const closeManagePanel = () => {
    setManagePanel(null);
    setStagedAdd(new Set());
    setSelectedIds(new Set());
    setPanelDeleteConfirm(false);
  };

  // Refetch the panel's leads ({active, replied, available}) without touching tab/selection.
  const refetchPanelLeads = async (campaignId: string) => {
    const res = await fetch(`/api/campaigns/${campaignId}/leads`);
    if (res.ok) {
      const data = await res.json();
      setActiveLeads(data.active || []);
      setRepliedLeads(data.replied || []);
      setAvailableLeads(data.available || []);
    }
  };

  // Clear the bulk selection whenever the tab changes.
  const changeManageTab = (tab: 'active' | 'replied') => {
    setManageTab(tab);
    setSelectedIds(new Set());
  };

  // Toggle a single lead in the bulk selection set.
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Select-all toggle for the currently-shown leads.
  const toggleSelectAll = (ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  };

  // Immediate bulk: mark selected leads as replied/active via the status endpoint.
  const bulkSetStatus = async (action: 'mark_replied' | 'mark_active') => {
    if (!managePanel || selectedIds.size === 0) return;
    const leadIds = Array.from(selectedIds);
    setLeadsBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${managePanel.id}/leads/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update leads');
      await refetchPanelLeads(managePanel.id);
      await fetchCampaigns();
      setSelectedIds(new Set());
      const updated = data.updated ?? leadIds.length;
      toast({
        title:
          action === 'mark_replied'
            ? `Marked ${updated} as replied`
            : `Marked ${updated} as active`,
      });
    } catch (error) {
      console.error('Error updating lead status:', error);
      toast({
        title: 'Could not update leads',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setLeadsBusy(false);
    }
  };

  // Immediate bulk: remove selected leads from the campaign.
  const bulkDeleteSelected = async () => {
    if (!managePanel || selectedIds.size === 0) return;
    const leadIds = Array.from(selectedIds);
    setLeadsBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${managePanel.id}/leads`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not remove leads');
      await refetchPanelLeads(managePanel.id);
      await fetchCampaigns();
      setSelectedIds(new Set());
      const removed = data.removed ?? leadIds.length;
      toast({ title: `Removed ${removed} lead${removed === 1 ? '' : 's'}` });
    } catch (error) {
      console.error('Error removing leads:', error);
      toast({
        title: 'Could not remove leads',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setLeadsBusy(false);
    }
  };

  // Toggle staging an available lead for addition.
  const toggleStageAdd = (id: string) => {
    setStagedAdd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Select-all toggle for the available "Add leads" list (stages/unstages all shown).
  const toggleStageAll = (ids: string[]) => {
    setStagedAdd((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  };

  // Immediately add the leads selected in the "Add leads" list to the campaign.
  const addStagedLeads = async () => {
    if (!managePanel || stagedAdd.size === 0) return;
    const leadIds = Array.from(stagedAdd);
    setLeadsBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${managePanel.id}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not add leads');
      await refetchPanelLeads(managePanel.id);
      await fetchCampaigns();
      setStagedAdd(new Set());
      const added = data.added ?? leadIds.length;
      toast({ title: `Added ${added} lead${added === 1 ? '' : 's'}` });
    } catch (error) {
      console.error('Error adding leads:', error);
      toast({
        title: 'Could not add leads',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setLeadsBusy(false);
    }
  };

  // Immediately remove a single lead from the campaign.
  const removeOneLead = async (leadId: string) => {
    if (!managePanel) return;
    setLeadsBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${managePanel.id}/leads`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: [leadId] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not remove lead');
      await refetchPanelLeads(managePanel.id);
      await fetchCampaigns();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
      toast({ title: 'Lead removed' });
    } catch (error) {
      console.error('Error removing lead:', error);
      toast({
        title: 'Could not remove lead',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setLeadsBusy(false);
    }
  };

  // Start the campaign currently shown in the panel, then refresh.
  const startFromPanel = async () => {
    if (!managePanel) return;
    setLeadsBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${managePanel.id}/start`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchCampaigns();
        const anySent = (data.sent ?? 0) > 0;
        toast({
          title: anySent ? 'Campaign started' : 'Nothing sent',
          description: data.message,
          variant: anySent ? undefined : 'destructive',
        });
      } else {
        toast({
          title: 'Could not start campaign',
          description: data.error || 'Add leads first, then try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error starting campaign:', error);
      toast({ title: 'Could not start campaign', variant: 'destructive' });
    } finally {
      setLeadsBusy(false);
    }
  };

  const filteredAvailable = availableLeads.filter((lead) => {
    const q = availableFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      lead.companyName?.toLowerCase().includes(q) ||
      lead.contactName?.toLowerCase().includes(q) ||
      lead.email?.toLowerCase().includes(q)
    );
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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Campaigns</h1>
          <p className="text-slate-500">Manage your outreach campaigns</p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {loadError ? (
        <Card className="border-slate-200/50">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <AlertCircle className="h-10 w-10 text-red-400" />
            <div>
              <p className="font-medium text-slate-900">Couldn&apos;t load campaigns</p>
              <p className="text-sm text-slate-500">Something went wrong. Please try again.</p>
            </div>
            <Button variant="outline" onClick={fetchCampaigns}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <Card className="border-slate-200/50">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Mail className="h-10 w-10 text-slate-300" />
            <div>
              <p className="font-medium text-slate-900">Create your first campaign</p>
              <p className="text-sm text-slate-500">
                Set up an outreach campaign, add leads, and start sending.
              </p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((campaign) => (
          <Card key={campaign.id} className="border-slate-200/50 hover:shadow-md transition-shadow flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <CardTitle className="text-lg break-words">{campaign.name}</CardTitle>
                  <p className="text-sm text-slate-500 line-clamp-2">{campaign.description}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(campaign)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openManagePanel(campaign)}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Manage Leads
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/analytics')}>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Analytics
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {(campaign.status === 'draft' || campaign.status === 'paused') && (
                      <DropdownMenuItem
                        onClick={() => startCampaign(campaign)}
                        disabled={busyId === campaign.id}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        {campaign.status === 'paused' ? 'Resume' : 'Start'}
                      </DropdownMenuItem>
                    )}
                    {campaign.status === 'active' && (
                      <DropdownMenuItem
                        onClick={() => setCampaignStatus(campaign, 'paused')}
                        disabled={busyId === campaign.id}
                      >
                        <Pause className="mr-2 h-4 w-4" />
                        Pause
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => setDeleteTarget(campaign)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <div className="flex items-center gap-2 mb-4">
                <div className={cn('h-2 w-2 rounded-full', statusColors[campaign.status])} />
                <span className="text-sm font-medium capitalize">{campaign.status}</span>
                {campaign.status !== 'draft' && (
                  <span className="text-sm text-slate-400 ml-auto">
                    {campaign.dailyLimit}/day
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 bg-slate-50 rounded">
                  <Users className="h-4 w-4 mx-auto text-slate-400 mb-1" />
                  <div className="text-sm font-semibold">{campaign.leads}</div>
                  <div className="text-xs text-slate-400">Leads</div>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <Mail className="h-4 w-4 mx-auto text-slate-400 mb-1" />
                  <div className="text-sm font-semibold">{campaign.sent}</div>
                  <div className="text-xs text-slate-400">Sent</div>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <MousePointerClick className="h-4 w-4 mx-auto text-slate-400 mb-1" />
                  <div className="text-sm font-semibold">{campaign.opened}</div>
                  <div className="text-xs text-slate-400">Opened</div>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <MessageCircle className="h-4 w-4 mx-auto text-slate-400 mb-1" />
                  <div className="text-sm font-semibold">{campaign.replied}</div>
                  <div className="text-xs text-slate-400">Replied</div>
                </div>
              </div>

              {campaign.status !== 'draft' && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Open Rate</span>
                    <span className="font-medium">
                      {campaign.sent > 0 ? ((campaign.opened / campaign.sent) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-slate-500">Reply Rate</span>
                    <span className="font-medium">
                      {campaign.sent > 0 ? ((campaign.replied / campaign.sent) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
              )}

              {/* Visible primary action buttons at the bottom of the card */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="w-full sm:w-auto flex-1 sm:flex-none"
                  onClick={() => startCampaign(campaign)}
                  disabled={busyId === campaign.id}
                >
                  {busyId === campaign.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {campaign.status === 'paused' ? 'Resume' : 'Start'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto flex-1 sm:flex-none"
                  onClick={() => openEdit(campaign)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto flex-1 sm:flex-none"
                  onClick={() => openManagePanel(campaign, 'active')}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Manage Leads
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto flex-1 sm:flex-none"
                  onClick={() => openManagePanel(campaign, 'replied')}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Replied ({campaign.repliedLeads ?? 0})
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Campaign' : 'Create Campaign'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update your campaign settings' : 'Set up a new outreach campaign'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name</Label>
              <Input
                id="name"
                placeholder="e.g., Summer Export Campaign"
                value={newCampaign.name}
                onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="What is this campaign about?"
                value={newCampaign.description}
                onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dailyLimit">Daily Limit</Label>
              <Input
                id="dailyLimit"
                type="number"
                min={1}
                max={500}
                value={newCampaign.dailyLimit}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  setNewCampaign({
                    ...newCampaign,
                    dailyLimit: Number.isNaN(parsed) ? 50 : parsed,
                  });
                }}
              />
              <p className="text-xs text-slate-500">
                Max emails sent each time you start this campaign. If more leads are pending,
                the rest wait for the next run. Helps protect your sender reputation. (1–500)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template">Template</Label>
              <Select
                value={newCampaign.templateId ? newCampaign.templateId : NO_TEMPLATE}
                onValueChange={(value) =>
                  setNewCampaign({
                    ...newCampaign,
                    templateId: value === NO_TEMPLATE ? '' : value,
                  })
                }
              >
                <SelectTrigger id="template">
                  <SelectValue placeholder="None (use default)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>None (use default)</SelectItem>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">
                Pick a saved template, or leave on default. Manage templates from the Templates page.
              </p>
            </div>

            <div className="space-y-3 rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="schedule">Schedule campaign start</Label>
                <Switch
                  id="schedule"
                  checked={newCampaign.scheduleEnabled}
                  onCheckedChange={(checked) =>
                    setNewCampaign({ ...newCampaign, scheduleEnabled: checked })
                  }
                />
              </div>
              {newCampaign.scheduleEnabled && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="scheduleDate">Start date</Label>
                    <Input
                      id="scheduleDate"
                      type="date"
                      value={newCampaign.scheduleDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) =>
                        setNewCampaign({ ...newCampaign, scheduleDate: e.target.value })
                      }
                    />
                  </div>

                  {/* Start time + timezone */}
                  <div className="space-y-2">
                    <Label>Start at</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={String(to12h(newCampaign.scheduleHour ?? 9).hour12)}
                        onValueChange={(v) =>
                          setNewCampaign({
                            ...newCampaign,
                            scheduleHour: to24h(
                              parseInt(v, 10),
                              to12h(newCampaign.scheduleHour ?? 9).ampm
                            ),
                          })
                        }
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HOURS_12.map((h) => (
                            <SelectItem key={h} value={String(h)}>
                              {h}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={to12h(newCampaign.scheduleHour ?? 9).ampm}
                        onValueChange={(v) =>
                          setNewCampaign({
                            ...newCampaign,
                            scheduleHour: to24h(
                              to12h(newCampaign.scheduleHour ?? 9).hour12,
                              v as 'AM' | 'PM'
                            ),
                          })
                        }
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AM">AM</SelectItem>
                          <SelectItem value="PM">PM</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={newCampaign.scheduleTimezone || 'UTC'}
                        onValueChange={(v) =>
                          setNewCampaign({ ...newCampaign, scheduleTimezone: v })
                        }
                      >
                        <SelectTrigger className="w-full sm:w-64">
                          <SelectValue placeholder="Timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-slate-400">
                      The campaign sends its first batch automatically at this date and hour in
                      the selected timezone. It runs on the top of the hour, so exact minutes
                      aren&apos;t used. Leave off to start manually.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="followup">Enable auto follow-up</Label>
                <Switch
                  id="followup"
                  checked={newCampaign.followupEnabled}
                  onCheckedChange={(checked) =>
                    setNewCampaign({ ...newCampaign, followupEnabled: checked })
                  }
                />
              </div>
              {newCampaign.followupEnabled && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="followupAfterDays">
                      Send follow-up after N days if no reply
                    </Label>
                    <Input
                      id="followupAfterDays"
                      type="number"
                      min={1}
                      value={newCampaign.followupAfterDays}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        setNewCampaign({
                          ...newCampaign,
                          followupAfterDays: Number.isNaN(parsed) || parsed < 1 ? 3 : parsed,
                        });
                      }}
                    />
                  </div>

                  {/* Send time + timezone (target the recipient country's business hours) */}
                  <div className="space-y-2">
                    <Label>Send at</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={String(to12h(newCampaign.followupSendHour ?? 9).hour12)}
                        onValueChange={(v) =>
                          setNewCampaign({
                            ...newCampaign,
                            followupSendHour: to24h(
                              parseInt(v, 10),
                              to12h(newCampaign.followupSendHour ?? 9).ampm
                            ),
                          })
                        }
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HOURS_12.map((h) => (
                            <SelectItem key={h} value={String(h)}>
                              {h}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={to12h(newCampaign.followupSendHour ?? 9).ampm}
                        onValueChange={(v) =>
                          setNewCampaign({
                            ...newCampaign,
                            followupSendHour: to24h(
                              to12h(newCampaign.followupSendHour ?? 9).hour12,
                              v as 'AM' | 'PM'
                            ),
                          })
                        }
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AM">AM</SelectItem>
                          <SelectItem value="PM">PM</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={newCampaign.followupTimezone || 'UTC'}
                        onValueChange={(v) =>
                          setNewCampaign({ ...newCampaign, followupTimezone: v })
                        }
                      >
                        <SelectTrigger className="w-full sm:w-64">
                          <SelectValue placeholder="Timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-slate-400">
                      Follow-ups are sent around this hour in the selected timezone, so they land
                      during business hours abroad.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveCampaign} disabled={!newCampaign.name}>
              {editingId ? 'Save Changes' : 'Create Campaign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full-page Manage Leads panel */}
      {managePanel && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4 sm:p-6">
            {/* Top bar */}
            <div className="flex items-start justify-between gap-3 mb-6">
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">
                  {managePanel.name}
                </h2>
                <p className="text-sm text-slate-500">Manage leads for this campaign</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={closeManagePanel}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {leadsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              </div>
            ) : (
              <Tabs
                value={manageTab}
                onValueChange={(v) => changeManageTab(v as 'active' | 'replied')}
                className="space-y-4"
              >
                <TabsList>
                  <TabsTrigger value="active">Active ({activeLeads.length})</TabsTrigger>
                  <TabsTrigger value="replied">Replied ({repliedLeads.length})</TabsTrigger>
                </TabsList>

                {/* Active tab */}
                <TabsContent value="active" className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label>Active leads ({activeLeads.length})</Label>
                      {activeLeads.length > 0 && (
                        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                          <Checkbox
                            checked={
                              activeLeads.length > 0 &&
                              activeLeads.every((l) => selectedIds.has(l.id))
                            }
                            onCheckedChange={() =>
                              toggleSelectAll(activeLeads.map((l) => l.id))
                            }
                            disabled={leadsBusy}
                          />
                          Select all
                        </label>
                      )}
                    </div>

                    {/* Bulk action bar (Active) */}
                    {selectedIds.size > 0 && (
                      <div className="flex flex-wrap items-center gap-2 rounded border border-orange-200 bg-orange-50 px-3 py-2">
                        <span className="text-sm font-medium text-slate-700">
                          {selectedIds.size} selected
                        </span>
                        <div className="flex flex-wrap gap-2 sm:ml-auto">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => bulkSetStatus('mark_replied')}
                            disabled={leadsBusy}
                          >
                            {leadsBusy && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            <MessageCircle className="mr-2 h-4 w-4" />
                            Mark as replied
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={bulkDeleteSelected}
                            disabled={leadsBusy}
                          >
                            {leadsBusy && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete selected
                          </Button>
                        </div>
                      </div>
                    )}

                    {activeLeads.length === 0 ? (
                      <p className="text-sm text-slate-400">No active leads yet.</p>
                    ) : (
                      <div className="rounded border border-slate-200 divide-y divide-slate-100">
                        {activeLeads.map((lead) => {
                          const selected = selectedIds.has(lead.id);
                          return (
                            <div
                              key={lead.id}
                              className={cn(
                                'flex items-center gap-3 px-3 py-2',
                                selected && 'bg-orange-50'
                              )}
                            >
                              <Checkbox
                                checked={selected}
                                onCheckedChange={() => toggleSelect(lead.id)}
                                disabled={leadsBusy}
                                aria-label={`Select ${lead.companyName}`}
                                className="shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate">
                                  {lead.companyName}
                                </div>
                                <div className="text-xs text-slate-400 truncate">
                                  {lead.contactName} &middot; {lead.email}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0 text-red-500"
                                onClick={() => removeOneLead(lead.id)}
                                disabled={leadsBusy}
                              >
                                Remove
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Add leads section */}
                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-3">
                        <Label>Add leads ({filteredAvailable.length} available)</Label>
                        {filteredAvailable.length > 0 && (
                          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                            <Checkbox
                              checked={
                                filteredAvailable.length > 0 &&
                                filteredAvailable.every((l) => stagedAdd.has(l.id))
                              }
                              onCheckedChange={() =>
                                toggleStageAll(filteredAvailable.map((l) => l.id))
                              }
                              disabled={leadsBusy}
                            />
                            Select all
                          </label>
                        )}
                      </div>
                      <Input
                        placeholder="Filter by company, contact or email"
                        value={availableFilter}
                        onChange={(e) => setAvailableFilter(e.target.value)}
                        className="sm:max-w-xs"
                      />
                    </div>
                    {availableLeads.length === 0 ? (
                      <p className="text-sm text-slate-400">
                        No more leads to add. Create leads from the Leads page.
                      </p>
                    ) : filteredAvailable.length === 0 ? (
                      <p className="text-sm text-slate-400">No leads match your filter.</p>
                    ) : (
                      <div className="max-h-72 overflow-y-auto rounded border border-slate-200 divide-y divide-slate-100">
                        {filteredAvailable.map((lead) => (
                          <label
                            key={lead.id}
                            className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50"
                          >
                            <Checkbox
                              checked={stagedAdd.has(lead.id)}
                              onCheckedChange={() => toggleStageAdd(lead.id)}
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {lead.companyName}
                              </div>
                              <div className="text-xs text-slate-400 truncate">
                                {lead.contactName} &middot; {lead.email}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                    {stagedAdd.size > 0 && (
                      <div className="flex flex-wrap items-center gap-2 rounded border border-orange-200 bg-orange-50 px-3 py-2">
                        <span className="text-sm font-medium text-slate-700">
                          {stagedAdd.size} selected
                        </span>
                        <Button
                          size="sm"
                          onClick={addStagedLeads}
                          disabled={leadsBusy}
                          className="sm:ml-auto bg-orange-500 hover:bg-orange-600 text-white"
                        >
                          {leadsBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          <UserPlus className="mr-2 h-4 w-4" />
                          Add leads
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Replied tab (read-only) */}
                <TabsContent value="replied" className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>Replied leads ({repliedLeads.length})</Label>
                    {repliedLeads.length > 0 && (
                      <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <Checkbox
                          checked={
                            repliedLeads.length > 0 &&
                            repliedLeads.every((l) => selectedIds.has(l.id))
                          }
                          onCheckedChange={() =>
                            toggleSelectAll(repliedLeads.map((l) => l.id))
                          }
                          disabled={leadsBusy}
                        />
                        Select all
                      </label>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    These leads replied and are excluded from follow-ups.
                  </p>

                  {/* Bulk action bar (Replied) */}
                  {selectedIds.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded border border-orange-200 bg-orange-50 px-3 py-2">
                      <span className="text-sm font-medium text-slate-700">
                        {selectedIds.size} selected
                      </span>
                      <div className="flex flex-wrap gap-2 sm:ml-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => bulkSetStatus('mark_active')}
                          disabled={leadsBusy}
                        >
                          {leadsBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          <UserPlus className="mr-2 h-4 w-4" />
                          Mark as active
                        </Button>
                      </div>
                    </div>
                  )}

                  {repliedLeads.length === 0 ? (
                    <p className="text-sm text-slate-400">No replies yet.</p>
                  ) : (
                    <div className="rounded border border-slate-200 divide-y divide-slate-100">
                      {repliedLeads.map((lead) => {
                        const selected = selectedIds.has(lead.id);
                        return (
                          <div
                            key={lead.id}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2',
                              selected && 'bg-orange-50'
                            )}
                          >
                            <Checkbox
                              checked={selected}
                              onCheckedChange={() => toggleSelect(lead.id)}
                              disabled={leadsBusy}
                              aria-label={`Select ${lead.companyName}`}
                              className="shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">
                                {lead.companyName}
                              </div>
                              <div className="text-xs text-slate-400 truncate">
                                {lead.contactName} &middot; {lead.email}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}

            {/* Bottom action bar */}
            {!leadsLoading && (
              <div className="mt-8 pt-4 border-t border-slate-200 flex flex-wrap gap-2">
                <Button onClick={startFromPanel} disabled={leadsBusy} className="w-full sm:w-auto">
                  {leadsBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Start campaign
                </Button>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto text-red-600 hover:text-red-700"
                  onClick={() => setPanelDeleteConfirm(true)}
                  disabled={leadsBusy}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete campaign
                </Button>
              </div>
            )}
          </div>

          {/* Delete confirm inside the panel */}
          <Dialog open={panelDeleteConfirm} onOpenChange={(open) => !open && setPanelDeleteConfirm(false)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Delete campaign?</DialogTitle>
                <DialogDescription>
                  This permanently deletes &quot;{managePanel.name}&quot; and its sent-email history
                  links. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPanelDeleteConfirm(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700"
                  onClick={deleteCampaignFromPanel}
                  disabled={leadsBusy}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete campaign?</DialogTitle>
            <DialogDescription>
              This permanently deletes &quot;{deleteTarget?.name}&quot; and its sent-email history links. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={deleteCampaign}
              disabled={busyId === deleteTarget?.id}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
