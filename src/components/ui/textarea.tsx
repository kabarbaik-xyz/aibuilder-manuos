import { forwardRef, type TextareaHTMLAttributes } from 'react';
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...props }, ref) { return <textarea ref={ref} className={`form-control form-textarea ${className}`} {...props} />; });
