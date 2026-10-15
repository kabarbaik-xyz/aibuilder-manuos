import Link from 'next/link';
import type { ComponentProps } from 'react';
export function ButtonLink({
  variant = 'default',
  size = 'normal',
  className = '',
  ...props
}: ComponentProps<typeof Link> & {
  variant?: 'default' | 'primary' | 'soft' | 'ghost';
  size?: 'normal' | 'small';
}) {
  const classes = [
    'btn',
    variant !== 'default' ? variant : '',
    size === 'small' ? 'small-btn' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <Link className={classes} {...props} />;
}
