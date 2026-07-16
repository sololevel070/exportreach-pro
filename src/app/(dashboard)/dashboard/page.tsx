'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Mail,
  MousePointerClick,
  MessageCircle,
  TrendingUp,
  Upload,
  Plus,
  Send,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// Static Tailwind class maps so classes are emitted at build time
// (dynamic `bg-${color}-500` / `text-${color}-500` are NOT picked up by JIT).
const bgColorMap: Record<string, string> = {
  blue: 'bg-blue-500',
  orange: 'bg-orange-500',
  green: 'bg-green-500',
  purple: 'bg-purple-500',
};

const textColorMap: Record<string, string> = {
  blue: 'text-blue-500',
  orange: 'text-orange-500',
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
  openRateChange: number | null;
  replyRateChange: number | null;
  totalEmailsChange: number | null;
  totalLeadsChange: number | null;
}

// Render a signed percentage delta, or a neutral placeholder when null.
function formatChange(change: number | null | undefined): string {
  if (change === null || change === undefined) return 'No prior data';
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}% vs previous period`;
}

interface Campaign {
  id: string;
  name: string;
  sent: number;
  opened: number;
  replied: number;
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsRes, campaignsRes] = await Promise.all([
        fetch('/api/analytics'),
        fetch('/api/campaigns'),
      ]);

      if (!analyticsRes.ok) {
        throw new Error(`Analytics request failed (${analyticsRes.status})`);
      }

      const analyticsData = await analyticsRes.json();
      const campaignsData = await campaignsRes.json();

      if (analyticsData?.error) {
        throw new Error(analyticsData.error);
      }

      setAnalytics(analyticsData);
      setCampaigns(Array.isArray(campaignsData) ? campaignsData : []);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
        <p className="text-slate-600">{error}</p>
        <button
          onClick={fetchData}
          className="text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const stats = [
    {
      title: 'Total Leads',
      value: analytics?.overview.totalLeads?.toLocaleString() || '0',
      change: analytics?.totalLeadsChange ?? null,
      icon: Users,
      color: 'blue',
    },
    {
      title: 'Emails Sent',
      value: analytics?.overview.totalEmails?.toLocaleString() || '0',
      change: analytics?.totalEmailsChange ?? null,
      icon: Mail,
      color: 'orange',
    },
    {
      title: 'Open Rate',
      value: `${analytics?.overview.openRate || '0.0'}%`,
      change: analytics?.openRateChange ?? null,
      icon: MousePointerClick,
      color: 'green',
    },
    {
      title: 'Reply Rate',
      value: `${analytics?.overview.replyRate || '0.0'}%`,
      change: analytics?.replyRateChange ?? null,
      icon: MessageCircle,
      color: 'purple',
    },
  ];

  // Format daily data for chart — real opened counts from the API.
  const chartData = (analytics?.dailyData || []).map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    sent: d.sent,
    opened: d.opened,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Welcome back! Here&apos;s your outreach overview.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/leads">
              <Upload className="mr-2 h-4 w-4" />
              Import Leads
            </Link>
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/campaigns">
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Link>
          </Button>
        </div>
      </div>

      {/* Unified responsive layout.
          Mobile order (CSS order): Quick Actions → KPIs → Recent Activity → Campaign Performance → Email Performance.
          Desktop (lg grid): KPIs full row, then [Quick Actions | Recent Activity], then [Campaign Performance | Email Performance]. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-7 lg:gap-6">
        {/* KPI stat cards */}
        <div className="order-2 lg:order-1 lg:col-span-7 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="border-slate-200/50">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">{stat.title}</CardTitle>
                  <div className={`p-2 rounded-lg ${bgColorMap[stat.color]} bg-opacity-10`}>
                    <Icon className={`h-4 w-4 ${textColorMap[stat.color]}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                  <div className="flex items-center text-xs">
                    {stat.change === null || stat.change === undefined ? (
                      <span className="text-slate-400">No prior data</span>
                    ) : (
                      <span className={stat.change >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatChange(stat.change)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions — very top on mobile, Email Performance's old slot on desktop */}
        <Card className="order-1 lg:order-2 lg:col-span-4 border-slate-200/50">
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Link href="/leads">
                <Button variant="outline" className="w-full h-20 flex-col gap-2">
                  <Upload className="h-5 w-5 text-orange-500" />
                  <span>Import Leads</span>
                </Button>
              </Link>
              <Link href="/compose">
                <Button variant="outline" className="w-full h-20 flex-col gap-2">
                  <Send className="h-5 w-5 text-orange-500" />
                  <span>Compose Email</span>
                </Button>
              </Link>
              <Link href="/campaigns">
                <Button variant="outline" className="w-full h-20 flex-col gap-2">
                  <Plus className="h-5 w-5 text-orange-500" />
                  <span>New Campaign</span>
                </Button>
              </Link>
              <Link href="/analytics">
                <Button variant="outline" className="w-full h-20 flex-col gap-2">
                  <TrendingUp className="h-5 w-5 text-orange-500" />
                  <span>View Analytics</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="order-3 lg:order-3 lg:col-span-3 border-slate-200/50">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest outreach actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {campaigns.length > 0 ? (
                campaigns.slice(0, 5).map((campaign) => (
                  <div key={campaign.id} className="flex items-start gap-3">
                    <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-green-500" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{campaign.name}</p>
                      <p className="text-xs text-slate-500">Campaign created</p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {campaign.sent} sent
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-400">
                  No campaigns yet. Create your first campaign to get started.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Campaign Performance */}
        <Card className="order-4 lg:order-4 lg:col-span-3 border-slate-200/50">
          <CardHeader>
            <CardTitle className="text-base">Campaign Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {campaigns.length > 0 ? (
                campaigns.slice(0, 3).map((campaign) => (
                  <div key={campaign.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{campaign.name}</p>
                      <p className="text-xs text-slate-500">{campaign.sent} sent</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-green-600">
                        {campaign.sent > 0 ? ((campaign.opened / campaign.sent) * 100).toFixed(1) : 0}% open
                      </p>
                      <p className="text-xs text-slate-500">{campaign.replied} replies</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-slate-400 text-sm">
                  No campaigns yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Email Performance — moved below on desktop */}
        <Card className="order-5 lg:order-5 lg:col-span-4 border-slate-200/50">
          <CardHeader>
            <CardTitle>Email Performance</CardTitle>
            <CardDescription>Emails sent over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
                    <Area
                      type="monotone"
                      dataKey="sent"
                      stroke="#f97316"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorSent)"
                      name="Sent"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  No email data yet. Start by adding leads and creating a campaign.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}