'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, Mail, MousePointerClick, MessageCircle, Users, AlertCircle, Loader2 } from 'lucide-react';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#6b7280'];

// Static Tailwind class map so colors are emitted at build time
// (dynamic `text-${color}-500` strings are NOT picked up by the JIT compiler).
const ICON_COLORS: Record<string, string> = {
  orange: 'text-orange-500',
  blue: 'text-blue-500',
  green: 'text-green-500',
  purple: 'text-purple-500',
};

interface AnalyticsData {
  overview: {
    totalLeads: number;
    totalEmails: number;
    templates: number;
    openRate: string;
    clickRate: string;
    replyRate: string;
  };
  dailyData: Array<{ date: string; sent: number; opened: number; replied: number }>;
  byCountry: Array<{ country: string; leads: number }>;
  byStatus: Array<{ status: string; count: number }>;
  campaigns: Array<{ name: string; sent: number; opened: number; replied: number }>;
  leadsStats: { total: number; thisMonth: number; converted: number };
  openRateChange: number | null;
  replyRateChange: number | null;
  totalEmailsChange: number | null;
  totalLeadsChange: number | null;
}

// Render a signed percentage delta, or a neutral placeholder when null.
function formatChange(change: number | null): string {
  if (change === null || change === undefined) return '—';
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('30');

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?days=${timeRange}`);
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const data = await res.json();
      if (data?.error) {
        throw new Error(data.error);
      }
      setAnalytics(data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics. Please try again.');
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  // Real per-day sent / opened / replied straight from the API.
  const performanceData = (analytics?.dailyData || []).map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    sent: d.sent,
    opened: d.opened,
    replied: d.replied,
  }));

  // Real leads-by-country distribution as pie slices.
  const totalCountryLeads = (analytics?.byCountry || []).reduce((sum, c) => sum + c.leads, 0);
  const countryData = (analytics?.byCountry || []).map((c) => ({
    name: c.country,
    value: c.leads,
    pct: totalCountryLeads > 0 ? Math.round((c.leads / totalCountryLeads) * 100) : 0,
  }));

  const campaigns = analytics?.campaigns || [];
  const leadsStats = analytics?.leadsStats;
  const convertedRate =
    leadsStats && leadsStats.total > 0
      ? Math.round((leadsStats.converted / leadsStats.total) * 100)
      : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-slate-600">{error}</p>
        <button
          onClick={fetchAnalytics}
          className="text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500">Track your outreach performance</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Total Emails', value: analytics?.overview.totalEmails?.toLocaleString() || '0', change: analytics?.totalEmailsChange ?? null, icon: Mail, color: 'orange' },
          { title: 'Open Rate', value: `${analytics?.overview.openRate || '0.0'}%`, change: analytics?.openRateChange ?? null, icon: MousePointerClick, color: 'blue' },
          { title: 'Reply Rate', value: `${analytics?.overview.replyRate || '0.0'}%`, change: analytics?.replyRateChange ?? null, icon: MessageCircle, color: 'green' },
          { title: 'Total Leads', value: analytics?.overview.totalLeads?.toLocaleString() || '0', change: analytics?.totalLeadsChange ?? null, icon: Users, color: 'purple' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          const isPositive = (stat.change ?? 0) >= 0;
          return (
            <Card key={i} className="border-slate-200/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">{stat.title}</CardTitle>
                <Icon className={`h-4 w-4 ${ICON_COLORS[stat.color]}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="flex items-center text-xs">
                  {stat.change === null || stat.change === undefined ? (
                    <span className="text-slate-400">No prior data</span>
                  ) : (
                    <>
                      {isPositive ? (
                        <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
                      )}
                      <span className={isPositive ? 'text-green-500' : 'text-red-500'}>
                        {formatChange(stat.change)}
                      </span>
                      <span className="text-slate-400 ml-1">vs previous period</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <Card className="border-slate-200/50">
              <CardHeader>
                <CardTitle>Email Performance</CardTitle>
                <CardDescription>Sent, opened, and replied over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {performanceData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={performanceData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                          }}
                        />
                        <Line type="monotone" dataKey="sent" stroke="#f97316" strokeWidth={2} name="Sent" />
                        <Line type="monotone" dataKey="opened" stroke="#3b82f6" strokeWidth={2} name="Opened" />
                        <Line type="monotone" dataKey="replied" stroke="#10b981" strokeWidth={2} name="Replied" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm text-center">
                      No email activity in this period yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200/50">
              <CardHeader>
                <CardTitle>Leads by Country</CardTitle>
                <CardDescription>Geographic distribution of leads</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {countryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={countryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, pct }) => `${name}: ${pct}%`}
                        >
                          {countryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm text-center">
                      No leads yet. Import leads to see their distribution.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-6">
          {campaigns.length > 0 ? (
            <>
              <Card className="border-slate-200/50">
                <CardHeader>
                  <CardTitle>Campaign Performance</CardTitle>
                  <CardDescription>Compare metrics across campaigns</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={campaigns}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend />
                        <Bar dataKey="sent" fill="#f97316" name="Sent" />
                        <Bar dataKey="opened" fill="#3b82f6" name="Opened" />
                        <Bar dataKey="replied" fill="#8b5cf6" name="Replied" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200/50">
                <CardHeader>
                  <CardTitle>Campaign Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {campaigns.map((campaign, i) => {
                      const openRate = campaign.sent > 0 ? (campaign.opened / campaign.sent) * 100 : 0;
                      const replyRate = campaign.sent > 0 ? (campaign.replied / campaign.sent) * 100 : 0;

                      return (
                        <div key={i} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-slate-50 rounded-lg">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{campaign.name}</div>
                            <div className="text-sm text-slate-500">{campaign.sent.toLocaleString()} emails sent</div>
                          </div>
                          <div className="flex gap-4 sm:gap-6 text-sm">
                            <div className="text-center">
                              <div className="font-semibold">{openRate.toFixed(1)}%</div>
                              <div className="text-slate-400">Open</div>
                            </div>
                            <div className="text-center">
                              <div className="font-semibold">{replyRate.toFixed(1)}%</div>
                              <div className="text-slate-400">Reply</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-slate-200/50">
              <CardContent className="py-12 text-center text-slate-400">
                No campaign activity yet. Create a campaign and send emails to see metrics here.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="leads">
          <Card className="border-slate-200/50">
            <CardHeader>
              <CardTitle>Lead Analytics</CardTitle>
              <CardDescription>Lead acquisition and status breakdown</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-900">
                    {(leadsStats?.total ?? 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-500">Total Leads</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-900">
                    {(leadsStats?.thisMonth ?? 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-500">Added This Month</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-900">{convertedRate}%</div>
                  <div className="text-sm text-slate-500">Converted to Opportunity</div>
                </div>
              </div>

              {(analytics?.byStatus?.length ?? 0) > 0 && (
                <div>
                  <div className="text-sm font-medium text-slate-500 mb-3">Status Breakdown</div>
                  <div className="flex flex-wrap gap-2">
                    {analytics?.byStatus.map((s) => (
                      <Badge key={s.status} variant="secondary" className="text-xs">
                        {s.status}: {s.count.toLocaleString()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
