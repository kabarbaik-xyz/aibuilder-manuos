import React from 'react';
import { Icon, type IconName } from '../icons';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'soft' | 'ghost' | 'icon' | 'text';
  size?: 'normal' | 'small';
  icon?: IconName;
  iconRight?: IconName;
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = 'default',
  size = 'normal',
  icon,
  iconRight,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  if (variant === 'icon') {
    return (
      <button
        type="button"
        className={`icon-btn ${className}`}
        disabled={disabled}
        {...props}
      >
        {icon && <Icon name={icon} />}
        {children}
      </button>
    );
  }

  if (variant === 'text') {
    return (
      <button
        type="button"
        className={`text-btn ${className}`}
        disabled={disabled}
        {...props}
      >
        {children}
        {iconRight && <Icon name={iconRight} />}
      </button>
    );
  }

  const classes = [
    'btn',
    variant !== 'default' ? variant : '',
    size === 'small' ? 'small-btn' : '',
    fullWidth ? 'full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} disabled={disabled} {...props}>
      {icon && <Icon name={icon} />}
      {children}
      {iconRight && <Icon name={iconRight} />}
    </button>
  );
}
