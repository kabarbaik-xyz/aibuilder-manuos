import Link from 'next/link';
import type { ComponentProps } from 'react';
export function ButtonLink({ variant = 'default', className = '', ...props }: ComponentProps<typeof Link> & { variant?: 'default' | 'primary' | 'soft' | 'ghost' }) { return <Link className={`btn ${variant === 'default' ? '' : variant} ${className}`} {...props} />; }
