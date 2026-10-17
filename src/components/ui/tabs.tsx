import React from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '../icons';
import { Badge, type BadgeProps } from './badge';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number | string;
  badge?: string;
  badgeVariant?: BadgeProps['variant'];
  icon?: IconName;
  href?: string;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  activeId: T;
  onChange?: (id: T) => void;
  variant?: 'underline' | 'segmented' | 'pills';
  ariaLabel?: string;
  className?: string;
  rightSlot?: React.ReactNode;
}

export function Tabs<T extends string = string>({
  items,
  activeId,
  onChange,
  variant = 'pills',
  ariaLabel = 'Section navigation',
  className = '',
  rightSlot,
}: TabsProps<T>) {
  if (variant === 'segmented') {
    return (
      <div className={`ui-tabs-toolbar ${className}`.trim()}>
        <div className="segmented" role="tablist" aria-label={ariaLabel}>
          {items.map((item) => {
            const isActive = item.id === activeId;
            const content = (
              <>
                {item.icon && <Icon name={item.icon} />}
                <span>{item.label}</span>
                {item.count !== undefined && (
                  <span className="tab-count">{item.count}</span>
                )}
                {item.badge && (
                  <Badge variant={item.badgeVariant || (isActive ? 'blue' : 'default')}>
                    {item.badge}
                  </Badge>
                )}
              </>
            );

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  role="tab"
                  aria-selected={isActive}
                  className={`segmented-item ${isActive ? 'active' : ''}`}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={item.disabled}
                className={isActive ? 'active' : ''}
                onClick={() => onChange?.(item.id)}
              >
                {content}
              </button>
            );
          })}
        </div>
        {rightSlot && <div className="ui-tabs-right">{rightSlot}</div>}
      </div>
    );
  }

  if (variant === 'pills') {
    return (
      <div className={`ui-tabs-toolbar ${className}`.trim()}>
        <div className="ui-pills-tabs" role="tablist" aria-label={ariaLabel}>
          {items.map((item) => {
            const isActive = item.id === activeId;
            const content = (
              <>
                {item.icon && <Icon name={item.icon} />}
                <span>{item.label}</span>
                {item.count !== undefined && (
                  <span className="tab-count">{item.count}</span>
                )}
                {item.badge && (
                  <Badge variant={item.badgeVariant || (isActive ? 'blue' : 'default')}>
                    {item.badge}
                  </Badge>
                )}
              </>
            );

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  role="tab"
                  aria-selected={isActive}
                  className={`ui-pill-tab ${isActive ? 'active' : ''}`}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={item.disabled}
                className={`ui-pill-tab ${isActive ? 'active' : ''}`}
                onClick={() => onChange?.(item.id)}
              >
                {content}
              </button>
            );
          })}
        </div>
        {rightSlot && <div className="ui-tabs-right">{rightSlot}</div>}
      </div>
    );
  }

  return (
    <div className={`ui-tabs-bar ${className}`.trim()}>
      <div className="ui-tabs-list" role="tablist" aria-label={ariaLabel}>
        {items.map((item) => {
          const isActive = item.id === activeId;
          const content = (
            <>
              {item.icon && <Icon name={item.icon} className="ui-tab-icon" />}
              <span className="ui-tab-label">{item.label}</span>
              {item.count !== undefined && (
                <span className="tab-count">{item.count}</span>
              )}
              {item.badge && (
                <Badge variant={item.badgeVariant || (isActive ? 'blue' : 'default')}>
                  {item.badge}
                </Badge>
              )}
            </>
          );

          if (item.href) {
            return (
              <Link
                key={item.id}
                href={item.href}
                role="tab"
                aria-selected={isActive}
                className={`ui-tab ${isActive ? 'active' : ''}`}
              >
                {content}
              </Link>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={item.disabled}
              className={`ui-tab ${isActive ? 'active' : ''}`}
              onClick={() => onChange?.(item.id)}
            >
              {content}
            </button>
          );
        })}
      </div>
      {rightSlot && <div className="ui-tabs-right">{rightSlot}</div>}
    </div>
  );
}
