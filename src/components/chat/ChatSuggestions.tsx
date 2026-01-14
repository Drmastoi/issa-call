import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  CheckSquare, 
  Users, 
  TrendingUp,
  Heart,
  Clock,
  Plus
} from 'lucide-react';

interface ChatSuggestionsProps {
  onSelect: (suggestion: string) => void;
  disabled?: boolean;
}

const suggestions = [
  {
    icon: AlertTriangle,
    label: 'Critical Alerts',
    query: 'Show me all critical health alerts that need immediate attention',
    color: 'text-destructive'
  },
  {
    icon: CheckSquare,
    label: 'Overdue Tasks',
    query: 'What tasks are overdue and need to be addressed?',
    color: 'text-orange-500'
  },
  {
    icon: Users,
    label: 'High-Risk Patients',
    query: 'Which patients are at highest risk and need priority care?',
    color: 'text-blue-500'
  },
  {
    icon: Heart,
    label: 'BP Concerns',
    query: 'Show me patients with elevated or critical blood pressure readings',
    color: 'text-red-500'
  },
  {
    icon: Plus,
    label: 'Create Task',
    query: 'Create a high priority task to review all critical patient alerts by end of today',
    color: 'text-green-500'
  },
  {
    icon: Clock,
    label: 'Recent Calls',
    query: 'Summarize the recent patient call responses and any concerns',
    color: 'text-purple-500'
  }
];

export function ChatSuggestions({ onSelect, disabled }: ChatSuggestionsProps) {
  return (
    <div className="flex flex-wrap gap-2 p-3 border-t bg-muted/30">
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion.label}
          variant="outline"
          size="sm"
          className="h-auto py-1.5 px-2.5 text-xs gap-1.5"
          onClick={() => onSelect(suggestion.query)}
          disabled={disabled}
        >
          <suggestion.icon className={cn('w-3.5 h-3.5', suggestion.color)} />
          {suggestion.label}
        </Button>
      ))}
    </div>
  );
}

function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
