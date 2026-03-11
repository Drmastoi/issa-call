import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Users, Calendar, Phone, LogOut, 
  Brain, Sparkles, ShieldCheck, ChevronDown, ChevronLeft, ChevronRight,
  Shield, UsersRound, User, Settings, ListChecks, Menu, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import issaCareLogo from '@/assets/issa-care-logo.jpg';

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
  { icon: ListChecks, label: 'MediTask', href: '/meditask' },
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

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

  const isCollapsed = isMobile ? false : collapsed;

  const renderNavItem = (item: NavItem & { badge?: number }) => {
    const isActive = location.pathname === item.href;
    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={() => isMobile && setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative group",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <item.icon className="h-5 w-5 shrink-0" />
        {!isCollapsed && (
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

  const sidebarContent = (
    <>
      {/* Header with Logo */}
      <div className={cn(
        "p-4 border-b border-sidebar-border flex items-center",
        isCollapsed ? "justify-center" : "gap-3"
      )}>
        <img 
          src={issaCareLogo} 
          alt="ISSA.CARE" 
          className={cn(
            "object-contain transition-all duration-300",
            isCollapsed ? "h-8 w-8 rounded-md" : "h-9"
          )}
        />
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navWithBadges.map(renderNavItem)}

        {/* Admin Section */}
        {!isCollapsed && (
          <button
            onClick={() => setAdminOpen(!adminOpen)}
            className="flex items-center gap-3 px-3 py-2 w-full text-left text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 mt-4 hover:text-sidebar-foreground/70 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="flex-1">Admin</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", adminOpen && "rotate-180")} />
          </button>
        )}
        {(adminOpen || isCollapsed) && adminNav.map(renderNavItem)}
      </nav>

      {/* Collapse Toggle (desktop only) */}
      {!isMobile && (
        <div className="px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
              isCollapsed ? "justify-center px-2" : "justify-start"
            )}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span className="text-xs">Collapse</span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-2">
        {!isCollapsed && user && (
          <div className="px-3 py-2 text-sm text-sidebar-foreground/70 truncate">
            {user.email}
          </div>
        )}
        <Button
          variant="ghost"
          className={cn(
            "w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            isCollapsed ? "justify-center px-2" : "justify-start"
          )}
          onClick={() => signOut()}
          aria-label="Sign out"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span className="ml-3">Sign Out</span>}
        </Button>
      </div>
    </>
  );

  // Mobile: hamburger trigger + overlay sidebar
  if (isMobile) {
    return (
      <>
        {/* Mobile hamburger - rendered via AppLayout header */}
        {!mobileOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="fixed top-2 left-2 z-50 bg-background/80 backdrop-blur-sm shadow-sm border border-border"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}

        {/* Overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Slide-out sidebar */}
        <aside className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar flex flex-col border-r border-sidebar-border transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          {sidebarContent}
        </aside>
      </>
    );
  }

  // Desktop: collapsible sidebar
  return (
    <aside className={cn(
      "h-screen bg-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300",
      collapsed ? "w-16" : "w-60"
    )}>
      {sidebarContent}
    </aside>
  );
}
