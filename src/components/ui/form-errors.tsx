import React from 'react';

export function FormErrorSummary({
  error,
  message,
  fieldErrors,
}: {
  error?: { message?: string; fieldErrors?: Record<string, string> } | Error | null;
  message?: string | null;
  fieldErrors?: Record<string, string> | null;
}) {
  const displayMessage = message || (error ? (error as any).message : null);
  const displayFields = fieldErrors || (error ? (error as any).fieldErrors : null);

  if (!displayMessage && (!displayFields || Object.keys(displayFields).length === 0)) {
    return null;
  }

  return (
    <div
      role="alert"
      className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 space-y-1"
    >
      {displayMessage && <div className="font-medium">{displayMessage}</div>}
      {displayFields && Object.keys(displayFields).length > 0 && (
        <ul className="list-disc pl-5 text-xs text-red-400 space-y-0.5">
          {Object.entries(displayFields).map(([field, err]) => (
            <li key={field}>
              <span className="font-semibold">{field}:</span> {String(err)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FieldError({
  error,
  field,
}: {
  error?: string | { fieldErrors?: Record<string, string> } | null;
  field?: string;
}) {
  if (!error) return null;
  let text: string | undefined;
  if (typeof error === 'string') {
    text = error;
  } else if (field && error.fieldErrors && error.fieldErrors[field]) {
    text = error.fieldErrors[field];
  }
  if (!text) return null;
  return <p className="mt-1 text-xs text-red-400">{text}</p>;
}
