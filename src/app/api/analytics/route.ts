export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';

// Compute open/click/reply rates from a list of email rows.
function computeRates(emails: any[]) {
  const sent = emails.filter((e: any) => e.sent_at);
  const sentCount = sent.length;
  const openedCount = sent.filter((e: any) => e.opened_at).length;
  const clickedCount = sent.filter((e: any) => e.clicked_at).length;
  const repliedCount = sent.filter((e: any) => e.replied_at).length;
  return {
    sentCount,
    openedCount,
    clickedCount,
    repliedCount,
    openRate: sentCount > 0 ? (openedCount / sentCount) * 100 : 0,
    clickRate: sentCount > 0 ? (clickedCount / sentCount) * 100 : 0,
    replyRate: sentCount > 0 ? (repliedCount / sentCount) * 100 : 0,
  };
}

// Signed percentage change between current and previous totals.
// Returns null when there is no previous baseline to compare against.
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Parse the requested time range (days). 'all' => no lower bound.
    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get('days') || '30';
    const days = rangeParam === 'all' ? null : parseInt(rangeParam, 10) || 30;
    const now = Date.now();
    const since = days ? new Date(now - days * 24 * 60 * 60 * 1000) : null;
    // Previous period of equal length, immediately preceding the current one.
    const prevSince = days ? new Date(now - days * 2 * 24 * 60 * 60 * 1000) : null;

    // Get total leads count (all-time, for the overview KPI)
    const { count: totalLeads } = await insforge.database
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Get all of this user's leads (small enough to group in JS) for
    // country / status breakdowns and lead stats.
    const { data: leadsData } = await insforge.database
      .from('leads')
      .select('country, status, created_at')
      .eq('user_id', userId);

    const leads = leadsData || [];

    // byCountry — top ~8, bucket null/empty as 'Unknown'.
    const countryMap: Record<string, number> = {};
    leads.forEach((l: any) => {
      const c = (l.country && String(l.country).trim()) || 'Unknown';
      countryMap[c] = (countryMap[c] || 0) + 1;
    });
    const byCountry = Object.entries(countryMap)
      .map(([country, count]) => ({ country, leads: count }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 8);

    // byStatus — counts grouped by lead status.
    const statusMap: Record<string, number> = {};
    leads.forEach((l: any) => {
      const s = (l.status && String(l.status).trim()) || 'pending';
      statusMap[s] = (statusMap[s] || 0) + 1;
    });
    const byStatus = Object.entries(statusMap)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    // leadsStats — total / thisMonth / converted.
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const CONVERTED_STATUSES = ['replied', 'contacted', 'opened', 'clicked'];
    const leadsThisMonth = leads.filter(
      (l: any) => l.created_at && new Date(l.created_at) >= monthStart
    ).length;
    const convertedLeads = leads.filter((l: any) =>
      CONVERTED_STATUSES.includes(l.status)
    ).length;
    const leadsStats = {
      total: leads.length,
      thisMonth: leadsThisMonth,
      converted: convertedLeads,
    };

    // Pull all non-draft emails for this user covering BOTH the current and the
    // previous period in one query, then split in JS. This keeps it to a single
    // round-trip while still letting us compute deltas.
    let emailsQuery = insforge.database
      .from('emails')
      .select('created_at, sent_at, opened_at, clicked_at, replied_at, campaign_id, leads!inner(user_id)')
      .eq('leads.user_id', userId)
      .neq('status', 'draft');

    if (prevSince) {
      emailsQuery = emailsQuery.gte('created_at', prevSince.toISOString());
    }

    const { data: allEmailsData } = await emailsQuery;
    const allEmails = allEmailsData || [];

    // Split into current vs previous period.
    const currentEmails = since
      ? allEmails.filter((e: any) => e.created_at && new Date(e.created_at) >= since)
      : allEmails;
    const previousEmails =
      since && prevSince
        ? allEmails.filter(
            (e: any) =>
              e.created_at &&
              new Date(e.created_at) >= prevSince &&
              new Date(e.created_at) < since
          )
        : [];

    const totalEmails = currentEmails.length;

    const current = computeRates(currentEmails);
    const previous = computeRates(previousEmails);

    const openRate = current.openRate;
    const clickRate = current.clickRate;
    const replyRate = current.replyRate;

    // Previous-period deltas for the KPIs (signed percentages or null).
    // Leads delta compares leads created in the current vs previous window.
    const leadsCurrentCount = since
      ? leads.filter((l: any) => l.created_at && new Date(l.created_at) >= since).length
      : leads.length;
    const leadsPreviousCount =
      since && prevSince
        ? leads.filter(
            (l: any) =>
              l.created_at &&
              new Date(l.created_at) >= prevSince &&
              new Date(l.created_at) < since
          ).length
        : 0;

    const openRateChange = pctChange(current.openRate, previous.openRate);
    const replyRateChange = pctChange(current.replyRate, previous.replyRate);
    const totalEmailsChange = pctChange(currentEmails.length, previousEmails.length);
    const totalLeadsChange = days
      ? pctChange(leadsCurrentCount, leadsPreviousCount)
      : null;

    // Get templates count
    const { count: templates } = await insforge.database
      .from('templates')
      .select('*', { count: 'exact', head: true })
      .or(`user_id.eq.${userId},is_default.eq.true`);

    // Daily trend — sent / opened / replied per day for the current period
    // (capped at 90 days for the chart). Sent is grouped by created_at; opened
    // and replied are grouped by their respective real timestamps.
    const chartDays = days ? Math.min(days, 90) : 90;
    const chartSince = new Date(now - chartDays * 24 * 60 * 60 * 1000);

    const dailyMap: Record<string, { sent: number; opened: number; replied: number }> = {};
    const ensureDay = (date: string) => {
      if (!dailyMap[date]) dailyMap[date] = { sent: 0, opened: 0, replied: 0 };
      return dailyMap[date];
    };

    currentEmails.forEach((email: any) => {
      if (email.sent_at) {
        const d = new Date(email.created_at).toISOString().split('T')[0];
        if (new Date(email.created_at) >= chartSince) ensureDay(d).sent += 1;
      }
      if (email.opened_at) {
        const d = new Date(email.opened_at).toISOString().split('T')[0];
        if (new Date(email.opened_at) >= chartSince) ensureDay(d).opened += 1;
      }
      if (email.replied_at) {
        const d = new Date(email.replied_at).toISOString().split('T')[0];
        if (new Date(email.replied_at) >= chartSince) ensureDay(d).replied += 1;
      }
    });

    const dailyData = Object.entries(dailyMap)
      .map(([date, v]) => ({ date, sent: v.sent, opened: v.opened, replied: v.replied }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Per-campaign real metrics aggregated from emails joined by campaign_id.
    const { data: campaignRows } = await insforge.database
      .from('campaigns')
      .select('id, name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const campaignAgg: Record<string, { sent: number; opened: number; replied: number }> = {};
    currentEmails.forEach((email: any) => {
      if (!email.campaign_id || !email.sent_at) return;
      if (!campaignAgg[email.campaign_id]) {
        campaignAgg[email.campaign_id] = { sent: 0, opened: 0, replied: 0 };
      }
      const agg = campaignAgg[email.campaign_id];
      agg.sent += 1;
      if (email.opened_at) agg.opened += 1;
      if (email.replied_at) agg.replied += 1;
    });

    const campaigns = (campaignRows || []).map((c: any) => {
      const agg = campaignAgg[c.id] || { sent: 0, opened: 0, replied: 0 };
      return {
        name: c.name,
        sent: agg.sent,
        opened: agg.opened,
        replied: agg.replied,
      };
    });

    return NextResponse.json({
      overview: {
        totalLeads: totalLeads || 0,
        totalEmails,
        templates: templates || 0,
        openRate: openRate.toFixed(1),
        clickRate: clickRate.toFixed(1),
        replyRate: replyRate.toFixed(1),
      },
      dailyData,
      byCountry,
      byStatus,
      campaigns,
      leadsStats,
      openRateChange,
      replyRateChange,
      totalEmailsChange,
      totalLeadsChange,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
