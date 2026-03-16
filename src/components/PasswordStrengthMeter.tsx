import { useMemo } from 'react';
import { Check, X } from 'lucide-react';

interface PasswordStrengthMeterProps {
  password: string;
}

interface Requirement {
  label: string;
  met: boolean;
}

function getRequirements(password: string): Requirement[] {
  return [
    { label: 'At least 12 characters', met: password.length >= 12 },
    { label: 'Contains uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Contains lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Contains a digit', met: /\d/.test(password) },
    { label: 'Contains special character', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

function getStrengthScore(requirements: Requirement[]): number {
  return requirements.filter((r) => r.met).length;
}

function getStrengthLabel(score: number): string {
  if (score <= 1) return 'Weak';
  if (score === 2) return 'Fair';
  if (score <= 4) return 'Good';
  return 'Strong';
}

function getStrengthColor(score: number): string {
  if (score <= 1) return 'var(--color-danger, #ef4444)';
  if (score === 2) return '#eab308';
  if (score <= 4) return '#f97316';
  return '#22c55e';
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const requirements = useMemo(() => getRequirements(password), [password]);
  const score = useMemo(() => getStrengthScore(requirements), [requirements]);
  const label = getStrengthLabel(score);
  const color = getStrengthColor(score);
  const widthPercent = (score / 5) * 100;

  if (!password) return null;

  return (
    <div className="flex flex-col gap-2 mt-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color }}>
          {label}
        </span>
      </div>

      <div
        className="h-1.5 w-full rounded-full overflow-hidden"
        style={{ background: 'var(--color-muted, #e5e7eb)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${widthPercent}%`, background: color }}
        />
      </div>

      <ul className="flex flex-col gap-1 mt-1">
        {requirements.map((req) => (
          <li key={req.label} className="flex items-center gap-1.5 text-xs">
            {req.met ? (
              <Check size={14} style={{ color: '#22c55e' }} />
            ) : (
              <X size={14} style={{ color: 'var(--color-text-tertiary, #9ca3af)' }} />
            )}
            <span
              style={{
                color: req.met
                  ? 'var(--color-text-secondary, #6b7280)'
                  : 'var(--color-text-tertiary, #9ca3af)',
              }}
            >
              {req.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
