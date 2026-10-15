'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Children, forwardRef, isValidElement, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ChangeEvent, type ReactNode } from 'react';
import { Icon } from '@/components/icons';

type OptionElementProps = { value?: string; disabled?: boolean; children?: ReactNode };
type SelectOption = { value: string; label: ReactNode; disabled?: boolean; group?: string };
type SelectProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value' | 'defaultValue'> & {
  value?: string;
  defaultValue?: string;
  name?: string;
  required?: boolean;
  onChange?: (event: ChangeEvent<HTMLButtonElement>) => void;
};
const EMPTY_VALUE = '__manuos_select_empty__';

function readOptions(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  Children.forEach(children, child => {
    if (!isValidElement(child)) return;
    if (child.type === 'option') {
      const option = child as React.ReactElement<OptionElementProps>;
      options.push({ value: option.props.value ?? '', label: option.props.children, disabled: option.props.disabled });
      return;
    }
    if (child.type === 'optgroup') {
      const group = child as React.ReactElement<{ label?: string; children?: ReactNode }>;
      Children.forEach(group.props.children, nested => {
        if (!isValidElement(nested) || nested.type !== 'option') return;
        const option = nested as React.ReactElement<OptionElementProps>;
        options.push({ value: option.props.value ?? '', label: option.props.children, disabled: option.props.disabled, group: group.props.label });
      });
    }
  });
  return options;
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { className = '', children, value, defaultValue, onChange, disabled, required, name, id, autoFocus, ...triggerProps },
  forwardedRef,
) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const options = useMemo(() => readOptions(children), [children]);
  const emptyOption = options.find(option => option.value === '');
  const placeholder = emptyOption?.label ?? 'Select an option…';
  const currentValue = value === undefined ? undefined : value === '' ? EMPTY_VALUE : value;
  const initialValue = defaultValue === undefined ? undefined : defaultValue === '' ? EMPTY_VALUE : defaultValue;

  useEffect(() => {
    setPortalContainer(triggerRef.current?.closest('dialog') ?? null);
  }, []);

  function setRefs(node: HTMLButtonElement | null) {
    triggerRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }

  function handleValueChange(nextValue: string) {
    const next = nextValue === EMPTY_VALUE ? '' : nextValue;
    if (onChange) {
      const event = { target: { value: next }, currentTarget: { value: next } } as unknown as ChangeEvent<HTMLButtonElement>;
      onChange(event);
    }
  }

  return (
    <SelectPrimitive.Root
      value={currentValue}
      defaultValue={initialValue}
      onValueChange={handleValueChange}
      disabled={disabled}
      name={name}
    >
      <SelectPrimitive.Trigger
        {...triggerProps}
        id={id}
        ref={setRefs}
        autoFocus={autoFocus}
        aria-required={required || undefined}
        className={`form-control select-trigger ${className}`.trim()}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="select-chevron" aria-hidden="true">
          <Icon name="down" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={portalContainer ?? undefined}>
        <SelectPrimitive.Content className="select-content" position="popper" sideOffset={6} collisionPadding={10}>
          <SelectPrimitive.Viewport className="select-viewport">
            {emptyOption && (
              <SelectPrimitive.Item className="select-option" value={EMPTY_VALUE} disabled={required}>
                <SelectPrimitive.ItemText>{emptyOption.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="select-option-check"><Icon name="check" /></SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            )}
            {options.filter(option => option.value !== '').map((option, index) => (
              <SelectPrimitive.Item key={`${option.group ?? ''}-${option.value}-${index}`} className="select-option" value={option.value} disabled={option.disabled}>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="select-option-check"><Icon name="check" /></SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
});
