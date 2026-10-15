import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/query-keys';
import { mastersApi } from './api';

// Customers
export function useCustomers(params?: { search?: string }) {
  return useQuery({
    queryKey: queryKeys.customers(params),
    queryFn: () => mastersApi.getCustomers(params),
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: queryKeys.customer(id),
    queryFn: () => mastersApi.getCustomer(id),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mastersApi.createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useUpdateCustomer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof mastersApi.updateCustomer>[1]) => mastersApi.updateCustomer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customer(id) });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

// Suppliers
export function useSuppliers(params?: { search?: string }) {
  return useQuery({
    queryKey: queryKeys.suppliers(params),
    queryFn: () => mastersApi.getSuppliers(params),
  });
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: queryKeys.supplier(id),
    queryFn: () => mastersApi.getSupplier(id),
    enabled: !!id,
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mastersApi.createSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}

export function useUpdateSupplier(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof mastersApi.updateSupplier>[1]) => mastersApi.updateSupplier(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.supplier(id) });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}

// UOMs
export function useUoms() {
  return useQuery({
    queryKey: queryKeys.uoms(),
    queryFn: mastersApi.getUoms,
  });
}

export function useCreateUom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mastersApi.createUom,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.uoms() });
    },
  });
}

// Items
export function useItems(params?: { type?: string; search?: string }) {
  return useQuery({
    queryKey: queryKeys.items(params),
    queryFn: () => mastersApi.getItems(params),
  });
}

export function useItem(id: string) {
  return useQuery({
    queryKey: queryKeys.item(id),
    queryFn: () => mastersApi.getItem(id),
    enabled: !!id,
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mastersApi.createItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useUpdateItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof mastersApi.updateItem>[1]) => mastersApi.updateItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.item(id) });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useAddItemConversion(itemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { toUomId: string; factorAtoms: string }) => mastersApi.addItemConversion(itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.item(itemId) });
    },
  });
}

// Locations
export function useLocations(params?: { type?: string }) {
  return useQuery({
    queryKey: queryKeys.locations(params),
    queryFn: () => mastersApi.getLocations(params),
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mastersApi.createLocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}

export function useUpdateLocation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof mastersApi.updateLocation>[1]) => mastersApi.updateLocation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}

// Organization & Resources
export function useDepartments() {
  return useQuery({
    queryKey: queryKeys.departments(),
    queryFn: mastersApi.getDepartments,
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mastersApi.createDepartment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.departments() });
    },
  });
}

export function useCalendars() {
  return useQuery({
    queryKey: queryKeys.calendars(),
    queryFn: mastersApi.getCalendars,
  });
}

export function useCreateCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mastersApi.createCalendar,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars() });
    },
  });
}

export function useAddCalendarException(calendarId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { date: string; isWorkingDay: boolean; intervalsJson?: string; reason?: string }) =>
      mastersApi.addCalendarException(calendarId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars() });
    },
  });
}

export function useMachines(params?: { departmentId?: string }) {
  return useQuery({
    queryKey: queryKeys.machines(params),
    queryFn: () => mastersApi.getMachines(params),
  });
}

export function useCreateMachine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mastersApi.createMachine,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] });
    },
  });
}

export function useTechnicians() {
  return useQuery({
    queryKey: queryKeys.technicians(),
    queryFn: mastersApi.getTechnicians,
  });
}

export function useCreateTechnician() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mastersApi.createTechnician,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.technicians() });
    },
  });
}

export function useAddTechnicianSkill(technicianId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { skillId: string; level: number }) => mastersApi.addTechnicianSkill(technicianId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.technicians() });
    },
  });
}

export function useAddTechnicianCert(technicianId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { certId: string; certificateNumber: string; issuedAt: string; expiresAt?: string | null }) =>
      mastersApi.addTechnicianCert(technicianId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.technicians() });
    },
  });
}

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills(),
    queryFn: mastersApi.getSkills,
  });
}

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mastersApi.createSkill,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills() });
    },
  });
}

export function useOrderTypes() {
  return useQuery({
    queryKey: queryKeys.orderTypes(),
    queryFn: mastersApi.getOrderTypes,
  });
}

export function useCreateOrderType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mastersApi.createOrderType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orderTypes() });
    },
  });
}

export function useQcChecklists() {
  return useQuery({
    queryKey: queryKeys.qcChecklists(),
    queryFn: mastersApi.getQcChecklists,
  });
}

export function useCreateQcChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mastersApi.createQcChecklist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.qcChecklists() });
    },
  });
}
