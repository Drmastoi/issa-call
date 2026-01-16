import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, Trash2, Users } from 'lucide-react';
import { AppRole } from '@/hooks/useUserRole';

interface UserWithRoles {
  id: string;
  email: string;
  full_name: string;
  roles: AppRole[];
}

const ROLE_LABELS: Record<AppRole, string> = {
  staff: 'Staff',
  nurse: 'Nurse',
  care_home_doctor: 'Care Home Doctor',
  gp: 'GP',
  admin: 'Admin',
  caldicott_guardian: 'Caldicott Guardian',
};

const ROLE_COLORS: Record<AppRole, string> = {
  staff: 'bg-muted text-muted-foreground',
  nurse: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  care_home_doctor: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  gp: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  admin: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  caldicott_guardian: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole | ''>('');

  // Fetch all users with their roles
  const { data: users, isLoading } = useQuery({
    queryKey: ['users-with-roles'],
    queryFn: async () => {
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      if (profilesError) throw profilesError;

      // Get all user roles
      const { data: userRoles, error: rolesError } = await (supabase as any)
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Get user emails from auth (we'll use profiles as fallback)
      const usersMap = new Map<string, UserWithRoles>();

      profiles?.forEach((profile: any) => {
        usersMap.set(profile.user_id, {
          id: profile.user_id,
          email: '', // Will be filled if available
          full_name: profile.full_name || 'Unknown',
          roles: [],
        });
      });

      userRoles?.forEach((ur: any) => {
        const user = usersMap.get(ur.user_id);
        if (user) {
          user.roles.push(ur.role as AppRole);
        }
      });

      return Array.from(usersMap.values());
    },
  });

  // Add role mutation
  const addRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await (supabase as any)
        .from('user_roles')
        .insert({ user_id: userId, role });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast({ title: 'Role added successfully' });
      setSelectedUser(null);
      setSelectedRole('');
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to add role',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Remove role mutation
  const removeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await (supabase as any)
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast({ title: 'Role removed successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to remove role',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleAddRole = () => {
    if (selectedUser && selectedRole) {
      addRoleMutation.mutate({ userId: selectedUser, role: selectedRole });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">
          Manage user roles and access permissions
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Users
          </CardTitle>
          <CardDescription>
            View and manage roles for all registered users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Current Roles</TableHead>
                <TableHead>Add Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.full_name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length === 0 ? (
                        <Badge variant="outline">No roles</Badge>
                      ) : (
                        user.roles.map((role) => (
                          <Badge
                            key={role}
                            className={`${ROLE_COLORS[role]} cursor-pointer hover:opacity-80`}
                            onClick={() => {
                              if (confirm(`Remove ${ROLE_LABELS[role]} role from ${user.full_name}?`)) {
                                removeRoleMutation.mutate({ userId: user.id, role });
                              }
                            }}
                          >
                            {ROLE_LABELS[role]}
                            <Trash2 className="ml-1 h-3 w-3" />
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedUser === user.id ? selectedRole : ''}
                        onValueChange={(value) => {
                          setSelectedUser(user.id);
                          setSelectedRole(value as AppRole);
                        }}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ROLE_LABELS) as AppRole[])
                            .filter((role) => !user.roles.includes(role))
                            .map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={selectedUser !== user.id || !selectedRole || addRoleMutation.isPending}
                        onClick={handleAddRole}
                      >
                        {addRoleMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserPlus className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {users?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No users found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
