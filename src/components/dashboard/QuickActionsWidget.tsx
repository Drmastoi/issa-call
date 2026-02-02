import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  Users, 
  Phone, 
  ClipboardCheck, 
  FileText, 
  Upload,
  Zap
} from 'lucide-react';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  path: string;
  variant?: 'default' | 'outline' | 'secondary';
}

const quickActions: QuickAction[] = [
  {
    id: 'new-batch',
    label: 'Start Batch',
    icon: <Plus className="h-4 w-4" />,
    description: 'Create a new call batch',
    path: '/batches',
    variant: 'default',
  },
  {
    id: 'add-patient',
    label: 'Add Patient',
    icon: <Users className="h-4 w-4" />,
    description: 'Register a new patient',
    path: '/patients',
    variant: 'outline',
  },
  {
    id: 'verify-responses',
    label: 'Verify',
    icon: <ClipboardCheck className="h-4 w-4" />,
    description: 'Review pending verifications',
    path: '/clinical-verification',
    variant: 'outline',
  },
  {
    id: 'view-calls',
    label: 'Calls',
    icon: <Phone className="h-4 w-4" />,
    description: 'View call history',
    path: '/calls',
    variant: 'secondary',
  },
  {
    id: 'export-data',
    label: 'Export',
    icon: <FileText className="h-4 w-4" />,
    description: 'Export patient data',
    path: '/export',
    variant: 'secondary',
  },
  {
    id: 'upload-patients',
    label: 'Import',
    icon: <Upload className="h-4 w-4" />,
    description: 'Bulk upload patients',
    path: '/patients',
    variant: 'secondary',
  },
];

export function QuickActionsWidget() {
  const navigate = useNavigate();

  return (
    <Card className="h-full shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {quickActions.map((action) => (
            <Button
              key={action.id}
              variant={action.variant}
              size="sm"
              className="h-auto py-3 px-3 flex flex-col gap-1 items-center justify-center text-center"
              onClick={() => navigate(action.path)}
              title={action.description}
            >
              {action.icon}
              <span className="text-xs font-medium">{action.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
