import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(date: Date | string | null): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

export function formatPercentage(num: number): string {
  return `${num.toFixed(1)}%`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

export function generateTrackingId(): string {
  return `trk_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  generated: 'bg-blue-100 text-blue-700',
  sent: 'bg-purple-100 text-purple-700',
  opened: 'bg-green-100 text-green-700',
  clicked: 'bg-emerald-100 text-emerald-700',
  replied: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
};

export const COUNTRY_FLAGS: Record<string, string> = {
  USA: '🇺🇸',
  UK: '🇬🇧',
  Germany: '🇩🇪',
  France: '🇫🇷',
  Japan: '🇯🇵',
  China: '🇨🇳',
  India: '🇮🇳',
  Brazil: '🇧🇷',
  Canada: '🇨🇦',
  Australia: '🇦🇺',
  Spain: '🇪🇸',
  Italy: '🇮🇹',
  Netherlands: '🇳🇱',
  Belgium: '🇧🇪',
  Mexico: '🇲🇽',
  SouthKorea: '🇰🇷',
  Singapore: '🇸🇬',
  UAE: '🇦🇪',
  Saudi: '🇸🇦',
  Default: '🌍',
};