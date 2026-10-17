import { apiRequest } from '@/lib/api/client';
import { normalizeMasterRecord, masterRequestBody } from './compatibility';
async function masterRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const request = { ...options };
  if (typeof request.body === 'string') request.body = JSON.stringify(masterRequestBody(url, JSON.parse(request.body), request.method || 'GET'));
  const result = await apiRequest<any>(url, request);
  if (result && 'data' in result) return { ...result, data: normalizeMasterRecord(result.data) };
  return result;
}


export interface Customer {
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  isActive?: boolean;
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  creditTermsDays: number;
  taxId: string | null;
  currency: string;
  addressJson: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  contacts?: CustomerContact[];
}

export interface CustomerContact {
  id: string;
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
}

export interface Supplier {
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  isActive?: boolean;
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  currency: string;
  leadTimeDays: number;
  addressJson: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UnitOfMeasure {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  precision: number;
  dimension: string;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  type: 'RAW_MATERIAL' | 'COMPONENT' | 'SUBASSEMBLY' | 'FINISHED_GOOD' | 'CONSUMABLE';
  baseUomId: string;
  isLotTracked: boolean;
  isSerialTracked: boolean;
  shelfLifeDays: number | null;
  minStockAtoms: string | null;
  maxStockAtoms: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  version: number;
  createdAt: string;
  updatedAt: string;
  baseUom?: UnitOfMeasure;
  conversions?: ItemConversion[];
}

export interface ItemConversion {
  ratioNumerator?: number;
  ratioDenominator?: number;
  id: string;
  itemId: string;
  toUomId: string;
  factorAtoms: string;
  toUom?: UnitOfMeasure;
}

export interface Location {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  type: 'RAW' | 'WIP' | 'QUARANTINE' | 'FINISHED_GOODS' | 'SCRAP';
  isPickable: boolean;
  isReceiving: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Calendar {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  timezone: string;
  weeklyJson: string;
  shiftJson: string;
  exceptions?: Array<{ id: string; date: string; workingIntervalsJson: string; reason: string | null }>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarException {
  id: string;
  calendarId: string;
  date: string;
  isWorkingDay: boolean;
  intervalsJson: string;
  reason: string | null;
}

export interface Machine {
  machineClassId?: string;
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  machineClass: string;
  departmentId: string;
  calendarId: string;
  hourlyRateCents: number | null;
  recoveryPriority: number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Technician {
  name?: string;
  code?: string;
  id: string;
  workspaceId: string;
  membershipId: string;
  calendarId: string;
  departmentId?: string | null;
  maxWeeklyMinutes?: number;
  hourlyRateCents: number;
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
  version: number;
  createdAt: string;
  updatedAt: string;
  membership?: {
    user: {
      name: string;
      email: string;
    };
  };
  skills?: TechnicianSkill[];
  certifications?: TechnicianCertification[];
}

export interface Skill {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  category: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TechnicianSkill {
  id: string;
  technicianId: string;
  skillId: string;
  level: number;
  skill?: Skill;
}

export interface TechnicianCertification {
  id: string;
  technicianId: string;
  certId: string;
  certificateNumber: string;
  issuedAt: string;
  expiresAt: string | null;
  documentUrl: string | null;
}

export interface OrderType {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  defaultTemplateId: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface QcChecklist {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  revision: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  version: number;
  createdAt: string;
  updatedAt: string;
  checks?: QcChecklistCheck[];
}

export interface QcChecklistCheck {
  id: string;
  checklistId: string;
  code: string;
  description: string;
  method: 'VISUAL' | 'MEASUREMENT' | 'FUNCTIONAL' | 'GAUGE';
  unit: string | null;
  limitsJson: string;
  isRequired: boolean;
  requiresEvidence: boolean;
}

// Client API Methods
export const mastersApi = {
  // Customers
  getCustomers: (params?: { search?: string }) => {
    const q = params?.search ? `?q=${encodeURIComponent(params.search)}` : '';
    return masterRequest<{ data: Customer[] }>(`/api/customers${q}`);
  },
  getCustomer: (id: string) => masterRequest<{ data: Customer }>(`/api/customers/${id}`),
  createCustomer: (data: {
    code: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    isActive?: boolean;
    creditTermsDays?: number;
    taxId?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    currency?: string;
    addressJson?: string;  }) => masterRequest<{ data: Customer }>('/api/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: string, data: {
    expectedVersion: number;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    isActive?: boolean;
    creditTermsDays?: number;
    taxId?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    currency?: string;
    status?: string;  }) => masterRequest<{ data: Customer }>(`/api/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Suppliers
  getSuppliers: (params?: { search?: string }) => {
    const q = params?.search ? `?q=${encodeURIComponent(params.search)}` : '';
    return masterRequest<{ data: Supplier[] }>(`/api/suppliers${q}`);
  },
  getSupplier: (id: string) => masterRequest<{ data: Supplier }>(`/api/suppliers/${id}`),
  createSupplier: (data: {
    code: string;
    name: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    isActive?: boolean;
    currency?: string;
    leadTimeDays?: number;  }) => masterRequest<{ data: Supplier }>('/api/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplier: (id: string, data: {
    expectedVersion: number;
    name?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    isActive?: boolean;
    currency?: string;
    leadTimeDays?: number;
    status?: string;  }) => masterRequest<{ data: Supplier }>(`/api/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // UOMs
  getUoms: () => masterRequest<{ data: UnitOfMeasure[] }>('/api/uoms'),
  createUom: (data: {
    code: string;
    name: string;
    precision: number;
    dimension: string;  }) => masterRequest<{ data: UnitOfMeasure }>('/api/uoms', { method: 'POST', body: JSON.stringify(data) }),

  // Items
  getItems: (params?: { type?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.type) query.set('itemType', ({RAW_MATERIAL:'RAW',FINISHED_GOOD:'FINISHED',SUBASSEMBLY:'WIP'} as Record<string,string>)[params.type] || params.type);
    if (params?.search) query.set('q', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return masterRequest<{ data: Item[] }>(`/api/items${qs}`);
  },
  getItem: (id: string) => masterRequest<{ data: Item }>(`/api/items/${id}`),
  createItem: (data: {
    code: string;
    name: string;
    type: string;
    baseUomId: string;
    isLotTracked?: boolean;
    isSerialTracked?: boolean;
    shelfLifeDays?: number;  }) => masterRequest<{ data: Item }>('/api/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: string, data: {
    expectedVersion: number;
    name?: string;
    isLotTracked?: boolean;
    isSerialTracked?: boolean;
    shelfLifeDays?: number;
    status?: string;  }) => masterRequest<{ data: Item }>(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addItemConversion: (itemId: string, data: { toUomId: string; factorAtoms: string }) =>
    masterRequest<{ data: ItemConversion }>(`/api/items/${itemId}/conversions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Locations
  getLocations: (params?: { type?: string }) => {
    const q = params?.type ? `?type=${encodeURIComponent(params.type)}` : '';
    return masterRequest<{ data: Location[] }>(`/api/locations${q}`);
  },
  createLocation: (data: {
    code: string;
    name: string;
    type: string;
    isPickable?: boolean;
    isReceiving?: boolean;  }) => masterRequest<{ data: Location }>('/api/locations', { method: 'POST', body: JSON.stringify(data) }),
  updateLocation: (id: string, data: {
    expectedVersion: number;
    name?: string;
    isPickable?: boolean;
    isReceiving?: boolean;
    status?: string;  }) => masterRequest<{ data: Location }>(`/api/locations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Organization & Resources
  getDepartments: () => masterRequest<{ data: Department[] }>('/api/resources/departments'),
  createDepartment: (data: { code: string; name: string }) =>
    masterRequest<{ data: Department }>('/api/resources/departments', { method: 'POST', body: JSON.stringify(data) }),

  getCalendars: () => masterRequest<{ data: Calendar[] }>('/api/resources/calendars'),
  createCalendar: (data: {
    code: string;
    name: string;
    timezone: string;
    weeklyJson: string;
    shiftJson?: string;  }) => masterRequest<{ data: Calendar }>('/api/resources/calendars', { method: 'POST', body: JSON.stringify(data) }),
  addCalendarException: (calendarId: string, data: {
    date: string;
    isWorkingDay: boolean;
    intervalsJson?: string;
    reason?: string;  }) => masterRequest<{ data: CalendarException }>(`/api/resources/calendars/${calendarId}/exceptions`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  getMachines: (params?: { departmentId?: string }) => {
    const q = params?.departmentId ? `?departmentId=${encodeURIComponent(params.departmentId)}` : '';
    return masterRequest<{ data: Machine[] }>(`/api/resources/machines${q}`);
  },
  createMachine: (data: {
    code: string;
    name: string;
    machineClass: string;
    departmentId: string;
    calendarId: string;
    hourlyRateCents?: number | null;
    recoveryPriority?: number;
  }) => masterRequest<{ data: Machine }>('/api/resources/machines', { method: 'POST', body: JSON.stringify(data) }),

  getTechnicians: () => masterRequest<{ data: Technician[] }>('/api/resources/technicians'),
  createTechnician: (data: {
    membershipId: string;
    calendarId: string;
    hourlyRateCents?: number;  }) => masterRequest<{ data: Technician }>('/api/resources/technicians', { method: 'POST', body: JSON.stringify(data) }),
  addTechnicianSkill: (technicianId: string, data: { skillId: string; level: number }) =>
    masterRequest<{ data: TechnicianSkill }>(`/api/resources/technicians/${technicianId}/skills`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  addTechnicianCert: (technicianId: string, data: {
    certId: string;
    certificateNumber: string;
    issuedAt: string;
    expiresAt?: string | null;  }) => masterRequest<{ data: TechnicianCertification }>(`/api/resources/technicians/${technicianId}/certs`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  getSkills: () => masterRequest<{ data: Skill[] }>('/api/resources/skills'),
  createSkill: (data: { code: string; name: string; category?: string }) =>
    masterRequest<{ data: Skill }>('/api/resources/skills', { method: 'POST', body: JSON.stringify(data) }),

  getOrderTypes: () => masterRequest<{ data: OrderType[] }>('/api/resources/order-types'),
  createOrderType: (data: { code: string; name: string; defaultTemplateId?: string }) =>
    masterRequest<{ data: OrderType }>('/api/resources/order-types', { method: 'POST', body: JSON.stringify(data) }),

  getQcChecklists: () => masterRequest<{ data: QcChecklist[] }>('/api/resources/qc-checklists'),
  createQcChecklist: (data: {
    code: string;
    name: string;
    revision: number;
    checks: Array<{
      code: string;
      description: string;
      method: string;
      unit?: string | null;
      limitsJson: string;
      isRequired: boolean;
      requiresEvidence?: boolean;
    }>;  }) => masterRequest<{ data: QcChecklist }>('/api/resources/qc-checklists', { method: 'POST', body: JSON.stringify(data) }),
};
