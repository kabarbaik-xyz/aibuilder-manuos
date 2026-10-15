import { cloneElement, type ReactElement } from 'react';
type ControlProps = { id?: string; required?: boolean; 'aria-invalid'?: boolean; 'aria-describedby'?: string };
export function FormField({ id, label, help, error, required, children }: { id: string; label: string; help?: string; error?: string; required?: boolean; children: ReactElement<ControlProps> }) {
 const describedBy = [help && `${id}-help`, error && `${id}-error`, children.props['aria-describedby']].filter(Boolean).join(' ') || undefined;
 return <div className="form-field"><label htmlFor={id}>{label}{required && <span aria-label="required"> *</span>}</label>{cloneElement(children, { id, required: required ?? children.props.required, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}{help && <p className="field-help" id={`${id}-help`}>{help}</p>}{error && <p className="field-error" id={`${id}-error`}>{error}</p>}</div>;
}
