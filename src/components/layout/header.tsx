'use client';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, Search, Moon, Sun, LogOut, User, Settings, Menu, X, Mail, AlertCircle, MessageCircle } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';

interface HeaderProps {
  className?: string;
  onMenuClick?: () => void;
}

interface Notification {
  id: string;
  title: string;
  description: string;
  type: 'sent' | 'replied' | 'failed';
  time?: string;
}

export function Header({ className, onMenuClick }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const loadNotifications = async () => {
      try {
        const res = await fetch('/api/emails');
        const data = await res.json();
        if (cancelled || !Array.isArray(data)) return;
        // Derive notifications from the most recent meaningful email events
        const items: Notification[] = data
          .filter((e: any) => ['replied', 'failed', 'sent'].includes(e.status))
          .slice(0, 8)
          .map((e: any) => ({
            id: e.id,
            type: e.status === 'replied' ? 'replied' : e.status === 'failed' ? 'failed' : 'sent',
            title:
              e.status === 'replied'
                ? 'New reply received'
                : e.status === 'failed'
                ? 'Email failed to send'
                : 'Email sent',
            description: `${e.lead || 'Lead'} — ${e.subject}`,
            time: e.sentAt || e.createdAt,
          }));
        setNotifications(items);
      } catch (error) {
        console.error('Error loading notifications:', error);
      }
    };
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const markAllRead = () => setReadIds(new Set(notifications.map((n) => n.id)));

  const submitSearch = () => {
    const q = searchValue.trim();
    if (!q) return;
    router.push(`/leads?q=${encodeURIComponent(q)}`);
    setSearchOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const iconFor = (type: Notification['type']) => {
    if (type === 'replied') return <MessageCircle className="h-4 w-4 text-green-500" />;
    if (type === 'failed') return <AlertCircle className="h-4 w-4 text-red-500" />;
    return <Mail className="h-4 w-4 text-orange-500" />;
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 md:px-6 backdrop-blur-sm',
        className
      )}
    >
      <div className="flex items-center gap-2 md:gap-4">
        {/* Mobile Menu Button */}
        <Button variant="ghost" size="icon" onClick={onMenuClick} className="lg:hidden h-9 w-9">
          <Menu className="h-5 w-5" />
        </Button>

        {/* Search - Desktop */}
        <div className="relative hidden md:block w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
        </div>

        {/* Mobile Search Toggle */}
        <Button variant="ghost" size="icon" onClick={() => setSearchOpen(!searchOpen)} className="md:hidden h-9 w-9">
          {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {/* Mobile search field */}
      {searchOpen && (
        <div className="absolute left-0 top-16 w-full border-b border-slate-200 bg-white p-3 md:hidden">
          <input
            type="text"
            autoFocus
            placeholder="Search leads..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-orange-500"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="h-9 w-9"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Notifications */}
        <DropdownMenu onOpenChange={(open) => open && markAllRead()}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
                  {unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              {notifications.length > 0 && (
                <button onClick={markAllRead} className="text-xs font-normal text-orange-600 hover:underline">
                  Mark all read
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500">No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  onClick={() => router.push('/emails')}
                  className="flex items-start gap-3 py-2"
                >
                  <span className="mt-0.5">{iconFor(n.type)}</span>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="text-xs text-slate-500 line-clamp-1">{n.description}</span>
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 px-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src="/avatar.png" alt="User" />
                <AvatarFallback className="bg-orange-100 text-orange-600 text-sm">
                  {user?.name ? user.name.slice(0, 2).toUpperCase() : 'ER'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user?.name || 'My Account'}</span>
                {user?.email && <span className="text-xs font-normal text-slate-500">{user.email}</span>}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
