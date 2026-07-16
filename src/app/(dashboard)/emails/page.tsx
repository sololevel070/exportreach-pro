'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  MoreHorizontal,
  Eye,
  RefreshCw,
  Mail,
  MousePointerClick,
  MessageCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { cn, STATUS_COLORS, formatDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Email {
  id: string;
  lead: string;
  leadId?: string;
  subject: string;
  body?: string;
  status: string;
  campaign: string;
  campaignId?: string;
  sentAt?: string;
  openedAt?: string;
  clickedAt?: string;
  repliedAt?: string;
  error?: string;
}

interface Followup {
  id: string;
  sequence: number;
  subject: string;
  status: string;
  sentAt?: string;
}

const statuses = ['all', 'pending', 'sent', 'opened', 'clicked', 'replied', 'failed'];

export default function EmailsPage() {
  const { toast } = useToast();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loadingFollowups, setLoadingFollowups] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const emailsPerPage = 10;

  useEffect(() => {
    fetchEmails();
  }, [statusFilter]);

  // Reset to the first page whenever the filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery]);

  // Load follow-up history whenever the detail dialog opens for an email.
  useEffect(() => {
    if (!selectedEmail) {
      setFollowups([]);
      return;
    }
    fetchFollowups(selectedEmail.id);
  }, [selectedEmail]);

  const fetchFollowups = async (emailId: string) => {
    setLoadingFollowups(true);
    try {
      const res = await fetch(`/api/emails/followup?emailId=${emailId}`);
      const data = await res.json();
      setFollowups(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching follow-ups:', error);
      setFollowups([]);
    } finally {
      setLoadingFollowups(false);
    }
  };

  const fetchEmails = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/emails?${params}`);
      const data = await res.json();
      // The API returns an array on success but an { error } object on failure.
      // Guard against the non-array case so filter/map/statusCounts never crash.
      if (Array.isArray(data)) {
        setEmails(data);
        setLoadError(false);
      } else {
        setEmails([]);
        setLoadError(true);
        toast({
          title: 'Could not load emails',
          description: (data && data.error) || 'Unexpected response from the server.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error fetching emails:', error);
      setEmails([]);
      setLoadError(true);
      toast({ title: 'Could not load emails', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const resendEmail = async (email: Email) => {
    if (!email.leadId) {
      toast({ title: 'Cannot resend', description: 'This email has no associated lead.', variant: 'destructive' });
      return;
    }
    setBusyId(email.id);
    try {
      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: email.leadId,
          subject: email.subject,
          body: email.body || '',
          status: 'sent',
          campaignId: email.campaignId,
        }),
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        await fetchEmails();
        toast({ title: 'Email resent' });
      } else {
        toast({ title: 'Resend failed', description: data.error || 'Configure email sending in Settings.', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error resending email:', error);
      toast({ title: 'Resend failed', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const sendFollowup = async (email: Email) => {
    setBusyId(email.id);
    try {
      const res = await fetch('/api/emails/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: email.id, send: true }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchEmails();
        // If this email's detail dialog is open, refresh its follow-up history.
        if (selectedEmail?.id === email.id) {
          fetchFollowups(email.id);
        }
        toast({
          title: data.status === 'sent' ? 'Follow-up sent' : 'Follow-up created',
          description: data.subject,
        });
      } else {
        toast({ title: 'Follow-up failed', description: data.error, variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error sending follow-up:', error);
      toast({ title: 'Follow-up failed', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const statusCounts = {
    all: emails.length,
    pending: emails.filter(e => e.status === 'pending').length,
    sent: emails.filter(e => e.status === 'sent').length,
    opened: emails.filter(e => e.status === 'opened').length,
    clicked: emails.filter(e => e.status === 'clicked').length,
    replied: emails.filter(e => e.status === 'replied').length,
    failed: emails.filter(e => e.status === 'failed').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const filteredEmails = emails.filter((email) => {
    const matchesSearch =
      email.lead.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.subject.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || email.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredEmails.length / emailsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * emailsPerPage;
  const pagedEmails = filteredEmails.slice(startIndex, startIndex + emailsPerPage);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Emails</h1>
          <p className="text-slate-500">Track all your sent and scheduled emails</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {Object.entries(statusCounts).map(([status, count]) => (
          <Button
            key={status}
            variant={statusFilter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(status)}
            className="capitalize"
          >
            {status} ({count})
          </Button>
        ))}
      </div>

      <Card className="border-slate-200/50">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search emails..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="rounded-lg border border-slate-200">
              <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Lead
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Subject
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Campaign
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Sent
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadError ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="text-sm font-medium text-red-600">
                        Couldn&apos;t load emails
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        Something went wrong fetching your emails.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          setLoading(true);
                          fetchEmails();
                        }}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Try again
                      </Button>
                    </td>
                  </tr>
                ) : filteredEmails.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                      No emails found.
                    </td>
                  </tr>
                ) : (
                  pagedEmails.map((email) => (
                  <tr key={email.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{email.lead}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs truncate">
                      {email.subject}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{email.campaign}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn(STATUS_COLORS[email.status])}>
                        {email.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {email.sentAt ? formatDateTime(email.sentAt) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedEmail(email)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => resendEmail(email)}
                            disabled={busyId === email.id}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Resend
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => sendFollowup(email)}
                            disabled={busyId === email.id}
                          >
                            <Mail className="mr-2 h-4 w-4" />
                            Send Follow-up
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-4">
            <div className="text-sm text-slate-500">
              {filteredEmails.length === 0
                ? 'No results'
                : `Showing ${startIndex + 1} to ${Math.min(startIndex + emailsPerPage, filteredEmails.length)} of ${filteredEmails.length} results`}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">
                Page {safePage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(safePage - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(safePage + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Email Details</DialogTitle>
            <DialogDescription>
              {selectedEmail?.lead}
            </DialogDescription>
          </DialogHeader>
          {selectedEmail && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                <div>
                  <span className="text-sm text-slate-500">Subject: </span>
                  <span className="text-sm font-medium break-words">{selectedEmail.subject}</span>
                </div>
                <div>
                  <span className="text-sm text-slate-500">Campaign: </span>
                  <span className="text-sm break-words">{selectedEmail.campaign}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-slate-50 rounded">
                  <Mail className="h-5 w-5 mx-auto mb-1 text-slate-400" />
                  <div className="text-xs text-slate-500">Sent</div>
                  <div className="text-sm font-medium">
                    {selectedEmail.sentAt ? 'Yes' : 'No'}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded">
                  <MousePointerClick className="h-5 w-5 mx-auto mb-1 text-slate-400" />
                  <div className="text-xs text-slate-500">Opened</div>
                  <div className="text-sm font-medium">
                    {selectedEmail.openedAt ? 'Yes' : 'No'}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded">
                  <MessageCircle className="h-5 w-5 mx-auto mb-1 text-slate-400" />
                  <div className="text-xs text-slate-500">Replied</div>
                  <div className="text-sm font-medium">
                    {selectedEmail.repliedAt ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>

              {selectedEmail.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600 break-words">
                  {selectedEmail.error}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">Follow-ups</div>
                {loadingFollowups ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                  </div>
                ) : followups.length > 0 ? (
                  <div className="space-y-2">
                    {followups.map((f) => (
                      <div
                        key={f.id}
                        className="p-3 bg-slate-50 rounded space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-slate-900">
                            Follow-up #{f.sequence} — {f.status}
                          </span>
                          <Badge className={cn(STATUS_COLORS[f.status])}>
                            {f.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-slate-600 break-words">{f.subject}</div>
                        {f.sentAt && (
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Calendar className="h-3 w-3" />
                            {formatDateTime(f.sentAt)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">No follow-ups yet</div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}