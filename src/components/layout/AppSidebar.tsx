import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, Phone, FileDown, Settings, LogOut, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import issaCareLogo from '@/assets/issa-care-logo.jpg';

const navItems = [{
  icon: LayoutDashboard,
  label: 'Dashboard',
  href: '/dashboard'
}, {
  icon: Users,
  label: 'Patients',
  href: '/patients'
}, {
  icon: Calendar,
  label: 'Batches',
  href: '/batches'
}, {
  icon: Phone,
  label: 'Calls',
  href: '/calls'
}, {
  icon: FileDown,
  label: 'Export',
  href: '/export'
}, {
  icon: ClipboardList,
  label: 'MediTask',
  href: '/meditask'
}, {
  icon: Settings,
  label: 'Settings',
  href: '/settings'
}];

export function AppSidebar() {
  const location = useLocation();
  const {
    signOut,
    user
  } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  return <aside className={cn("h-screen bg-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300", collapsed ? "w-16" : "w-64")}>
      {/* Header spacer */}
      <div className="p-4 border-b border-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(item => {
        const isActive = location.pathname === item.href;
        return <Link key={item.href} to={item.href} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors", isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </Link>;
      })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-2">
        {!collapsed && user && <div className="px-3 py-2 text-sm text-sidebar-foreground/70 truncate">
            {user.email}
          </div>}
        <Button variant="ghost" className={cn("w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", collapsed ? "justify-center px-2" : "justify-start")} onClick={() => signOut()}>
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="ml-3">Sign Out</span>}
        </Button>
        <Button variant="ghost" size="icon" className="w-full text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>;
}