import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Users, Calendar, Phone, LogOut, 
  Brain, Sparkles, ShieldCheck, ChevronDown,
  Shield, UsersRound, User, Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  href: string;
  badge?: number;
}

const mainNav: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Sparkles, label: 'Clinical Actions', href: '/ai-tasks' },
  { icon: Users, label: 'Patients', href: '/patients' },
  { icon: Calendar, label: 'Batches', href: '/batches' },
  { icon: Phone, label: 'Calls', href: '/calls' },
  { icon: ShieldCheck, label: 'Verification', href: '/clinical-verification' },
  { icon: Brain, label: 'Analytics', href: '/ai-analytics' },
];

const adminNav: NavItem[] = [
  { icon: UsersRound, label: 'User Management', href: '/user-management' },
  { icon: Shield, label: 'Caldicott', href: '/caldicott' },
  { icon: User, label: 'Profile & Settings', href: '/profile' },
];

export function AppSidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  // Fetch unverified count for badge
  const { data: unverifiedCount } = useQuery({
    queryKey: ['unverified-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('call_responses')
        .select('id', { count: 'exact', head: true })
        .eq('verification_status', 'unverified');
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  const navWithBadges = mainNav.map(item => {
    if (item.href === '/clinical-verification' && unverifiedCount && unverifiedCount > 0) {
      return { ...item, badge: unverifiedCount };
    }
    return item;
  });

  const renderNavItem = (item: NavItem & { badge?: number }) => {
    const isActive = location.pathname === item.href;
    return (
      <Link
        key={item.href}
        to={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors relative",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <item.icon className="h-5 w-5 shrink-0" />
        {!collapsed && (
          <>
            <span className="font-medium flex-1">{item.label}</span>
            {item.badge && item.badge > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px] font-bold">
                {item.badge > 99 ? '99+' : item.badge}
              </Badge>
            )}
          </>
        )}
      </Link>
    );
  };

  return (
    <aside className={cn(
      "h-screen bg-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300",
      collapsed ? "w-16" : "w-60"
    )}>
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border" />

      {/* Main Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navWithBadges.map(renderNavItem)}

        {/* Admin Section */}
        {!collapsed && (
          <button
            onClick={() => setAdminOpen(!adminOpen)}
            className="flex items-center gap-3 px-3 py-2 w-full text-left text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 mt-4"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="flex-1">Admin</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", adminOpen && "rotate-180")} />
          </button>
        )}
        {(adminOpen || collapsed) && adminNav.map(renderNavItem)}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-2">
        {!collapsed && user && (
          <div className="px-3 py-2 text-sm text-sidebar-foreground/70 truncate">
            {user.email}
          </div>
        )}
        <Button
          variant="ghost"
          className={cn(
            "w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed ? "justify-center px-2" : "justify-start"
          )}
          onClick={() => signOut()}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="ml-3">Sign Out</span>}
        </Button>
      </div>
    </aside>
  );
}
