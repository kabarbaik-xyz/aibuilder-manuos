export const queryKeys = {
  me: () => ['me'] as const,
  workspace: (id?: string) => ['workspace', id ?? 'current'] as const,
  users: (workspaceId?: string) => ['users', workspaceId ?? 'current'] as const,
  roles: (workspaceId?: string) => ['roles', workspaceId ?? 'current'] as const,
  
  // Masters
  customers: (filters?: Record<string, any>) => ['customers', filters] as const,
  customer: (id: string) => ['customers', id] as const,
  suppliers: (filters?: Record<string, any>) => ['suppliers', filters] as const,
  supplier: (id: string) => ['suppliers', id] as const,
  items: (filters?: Record<string, any>) => ['items', filters] as const,
  item: (id: string) => ['items', id] as const,
  locations: (filters?: Record<string, any>) => ['locations', filters] as const,
  uoms: () => ['uoms'] as const,
  
  // Organization / Resources
  departments: () => ['departments'] as const,
  calendars: () => ['calendars'] as const,
  calendar: (id: string) => ['calendars', id] as const,
  machines: (filters?: Record<string, any>) => ['machines', filters] as const,
  technicians: (filters?: Record<string, any>) => ['technicians', filters] as const,
  skills: () => ['skills'] as const,
  certifications: () => ['certifications'] as const,
  orderTypes: () => ['order-types'] as const,
  qcChecklists: () => ['qc-checklists'] as const,
};
