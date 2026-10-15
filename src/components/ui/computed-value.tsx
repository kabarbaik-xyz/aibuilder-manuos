import React from 'react';

export interface ComputedValueProps {
  value: React.ReactNode;
  calculationExplanation: string;
  className?: string;
}

export function ComputedValue({
  value,
  calculationExplanation,
  className = '',
}: ComputedValueProps) {
  return (
    <span
      className={`numeric inline-flex items-center gap-1 ${className}`}
      title={`Deterministic calculation: ${calculationExplanation}`}
    >
      {value}
    </span>
  );
}
