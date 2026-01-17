import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordStrengthIndicatorProps {
  password: string;
}

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const requirements: PasswordRequirement[] = [
  { label: 'At least 12 characters', test: (p) => p.length >= 12 },
  { label: 'At least 1 uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'At least 1 lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'At least 1 number', test: (p) => /[0-9]/.test(p) },
  { label: 'At least 1 special character', test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const results = useMemo(() => {
    return requirements.map((req) => ({
      ...req,
      passed: req.test(password),
    }));
  }, [password]);

  const passedCount = results.filter((r) => r.passed).length;
  const strengthPercent = (passedCount / requirements.length) * 100;

  const getStrengthColor = () => {
    if (strengthPercent < 40) return 'bg-destructive';
    if (strengthPercent < 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStrengthLabel = () => {
    if (strengthPercent < 40) return 'Weak';
    if (strengthPercent < 80) return 'Medium';
    return 'Strong';
  };

  if (!password) return null;

  return (
    <div className="space-y-3 mt-2">
      {/* Strength bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Password strength</span>
          <span className={cn(
            strengthPercent < 40 && 'text-destructive',
            strengthPercent >= 40 && strengthPercent < 80 && 'text-yellow-600',
            strengthPercent >= 80 && 'text-green-600'
          )}>
            {getStrengthLabel()}
          </span>
        </div>
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all duration-300', getStrengthColor())}
            style={{ width: `${strengthPercent}%` }}
          />
        </div>
      </div>

      {/* Requirements list */}
      <ul className="space-y-1">
        {results.map((req, index) => (
          <li
            key={index}
            className={cn(
              'flex items-center gap-2 text-xs transition-colors',
              req.passed ? 'text-green-600' : 'text-muted-foreground'
            )}
          >
            {req.passed ? (
              <Check className="h-3 w-3" />
            ) : (
              <X className="h-3 w-3" />
            )}
            {req.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  requirements.forEach((req) => {
    if (!req.test(password)) {
      errors.push(req.label);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}
