import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, Phone, FileDown, Settings, LogOut, ChevronLeft, ChevronRight, ClipboardList, Brain, User, ShieldCheck, Shield, UsersRound } from 'lucide-react';
import { useUserRole, AppRole, ROLE_ACCESS } from '@/hooks/useUserRole';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  href: string;
  requiredRoles?: AppRole[];
}

const navItems: NavItem[] = [
  {
    icon: LayoutDashboard,
    label: 'Dashboard',
    href: '/dashboard',
  },
  {
    icon: Brain,
    label: 'AI Analytics',
    href: '/ai-analytics',
    requiredRoles: ['admin', 'caldicott_guardian'],
  },
  {
    icon: Users,
    label: 'Patient List',
    href: '/patients',
    requiredRoles: ['care_home_doctor', 'gp', 'admin', 'caldicott_guardian'],
  },
  {
    icon: Calendar,
    label: 'Batch Calls',
    href: '/batches',
    requiredRoles: ['nurse', 'care_home_doctor', 'gp', 'admin', 'caldicott_guardian'],
  },
  {
    icon: Phone,
    label: 'Calls History',
    href: '/calls',
    requiredRoles: ['nurse', 'care_home_doctor', 'gp', 'admin', 'caldicott_guardian'],
  },
  {
    icon: FileDown,
    label: 'Export Data',
    href: '/export',
    requiredRoles: ['admin', 'caldicott_guardian'],
  },
  {
    icon: ClipboardList,
    label: 'Care Home Tasks',
    href: '/meditask',
    requiredRoles: ['care_home_doctor', 'gp', 'admin', 'caldicott_guardian'],
  },
  {
    icon: ShieldCheck,
    label: 'Clinical Verification',
    href: '/clinical-verification',
    requiredRoles: ['care_home_doctor', 'gp', 'admin', 'caldicott_guardian'],
  },
  {
    icon: UsersRound,
    label: 'User Management',
    href: '/user-management',
    requiredRoles: ['admin', 'caldicott_guardian'],
  },
  {
    icon: User,
    label: 'Profile',
    href: '/profile',
  },
];

const ROLE_BADGE_LABELS: Partial<Record<AppRole, string>> = {
  nurse: 'Nurse',
  care_home_doctor: 'Doctor',
  gp: 'GP',
  admin: 'Admin',
  caldicott_guardian: 'Guardian',
};

export function AppSidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { roles, isCaldicottGuardian, isAdmin, hasAnyRole } = useUserRole();
  const [collapsed, setCollapsed] = useState(false);

  // Filter nav items based on user roles
  const visibleNavItems = navItems.filter((item) => {
    // If no required roles, show to everyone
    if (!item.requiredRoles) return true;
    // Check if user has any of the required roles
    return hasAnyRole(item.requiredRoles);
  });

  // Add Caldicott Dashboard for guardians
  if (isCaldicottGuardian) {
    visibleNavItems.push({
      icon: Shield,
      label: 'Caldicott Dashboard',
      href: '/caldicott',
    });
  }

  // Get primary role for badge display
  const primaryRole = roles.find(r => r !== 'staff') || roles[0];

  return (
    <aside className={cn(
      "h-screen bg-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Header with role badge */}
      <div className="p-4 border-b border-sidebar-border">
        {!collapsed && primaryRole && (
          <Badge variant="secondary" className="w-full justify-center">
            {ROLE_BADGE_LABELS[primaryRole] || primaryRole}
          </Badge>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </Link>
          );
        })}
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
        <Button
          variant="ghost"
          size="icon"
          className="w-full text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  );
}