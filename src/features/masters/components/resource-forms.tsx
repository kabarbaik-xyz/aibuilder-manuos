'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormErrorSummary, FieldError } from '@/components/ui/form-errors';
import { ApiError } from '@/lib/api/client';
import {
  useCreateCustomer,
  useCreateSupplier,
  useCreateItem,
  useCreateUom,
  useCreateLocation,
  useCreateDepartment,
  useCreateCalendar,
  useCreateMachine,
  useCreateTechnician,
  useCreateSkill,
  useCreateOrderType,
  useCreateQcChecklist,
  useUoms,
  useDepartments,
  useCalendars,
  useSkills,
} from '../hooks';

// ==========================================
// Customer Drawer
// ==========================================
export function CreateCustomerDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createCustomer = useCreateCustomer();
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    creditTermsDays: 30,
    currency: 'USD',
    taxId: '',
  });
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createCustomer.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        creditTermsDays: Number(formData.creditTermsDays) || 30,
        currency: formData.currency.trim().toUpperCase(),
        taxId: formData.taxId.trim() || undefined,
      });
      onClose();
      setFormData({ code: '', name: '', creditTermsDays: 30, currency: 'USD', taxId: '' });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New Customer" subtitle="Register a commercial customer account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Customer Code *</label>
          <input
            type="text"
            required
            placeholder="e.g. CUST-ACME"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Company / Customer Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Acme Aerospace Corp"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="name" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Credit Terms (Days)</label>
            <input
              type="number"
              min={0}
              value={formData.creditTermsDays}
              onChange={(e) => setFormData({ ...formData, creditTermsDays: Number(e.target.value) })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Currency</label>
            <input
              type="text"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Tax ID / VAT</label>
          <input
            type="text"
            placeholder="e.g. US99-8877665"
            value={formData.taxId}
            onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createCustomer.isPending}>
            {createCustomer.isPending ? 'Saving...' : 'Create Customer'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ==========================================
// Supplier Drawer
// ==========================================
export function CreateSupplierDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createSupplier = useCreateSupplier();
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    currency: 'USD',
    leadTimeDays: 7,
  });
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createSupplier.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        currency: formData.currency.trim().toUpperCase(),
        leadTimeDays: Number(formData.leadTimeDays) || 7,
      });
      onClose();
      setFormData({ code: '', name: '', currency: 'USD', leadTimeDays: 7 });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New Supplier" subtitle="Register a material or service vendor">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Supplier Code *</label>
          <input
            type="text"
            required
            placeholder="e.g. SUP-TITAN"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Supplier Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Titan Raw Metals Ltd"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="name" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Default Lead Time (Days)</label>
            <input
              type="number"
              min={0}
              value={formData.leadTimeDays}
              onChange={(e) => setFormData({ ...formData, leadTimeDays: Number(e.target.value) })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Currency</label>
            <input
              type="text"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createSupplier.isPending}>
            {createSupplier.isPending ? 'Saving...' : 'Create Supplier'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ==========================================
// UOM Drawer
// ==========================================
export function CreateUomDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createUom = useCreateUom();
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    precision: 0,
    dimension: 'PIECE',
  });
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createUom.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        precision: Number(formData.precision),
        dimension: formData.dimension,
      });
      onClose();
      setFormData({ code: '', name: '', precision: 0, dimension: 'PIECE' });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New Unit of Measure" subtitle="Define physical measure unit and decimal precision">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">UOM Code *</label>
          <input
            type="text"
            required
            placeholder="e.g. PCS, KG, M"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Unit Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Pieces, Kilogram, Meter"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="name" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Decimal Precision (0-6)</label>
            <input
              type="number"
              min={0}
              max={6}
              value={formData.precision}
              onChange={(e) => setFormData({ ...formData, precision: Number(e.target.value) })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Dimension</label>
            <select
              value={formData.dimension}
              onChange={(e) => setFormData({ ...formData, dimension: e.target.value })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="PIECE">Piece / Count</option>
              <option value="MASS">Mass / Weight</option>
              <option value="LENGTH">Length</option>
              <option value="VOLUME">Volume</option>
              <option value="TIME">Time</option>
              <option value="AREA">Area</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createUom.isPending}>
            {createUom.isPending ? 'Saving...' : 'Create UOM'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ==========================================
// Item Drawer
// ==========================================
export function CreateItemDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createItem = useCreateItem();
  const { data: uomsData } = useUoms();
  const uoms = uomsData?.data || [];

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'RAW_MATERIAL',
    baseUomId: '',
    isLotTracked: false,
    isSerialTracked: false,
    shelfLifeDays: '',
  });
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createItem.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        type: formData.type,
        baseUomId: formData.baseUomId || (uoms[0]?.id ?? ''),
        isLotTracked: formData.isLotTracked,
        isSerialTracked: formData.isSerialTracked,
        shelfLifeDays: formData.shelfLifeDays ? Number(formData.shelfLifeDays) : undefined,
      });
      onClose();
      setFormData({
        code: '',
        name: '',
        type: 'RAW_MATERIAL',
        baseUomId: '',
        isLotTracked: false,
        isSerialTracked: false,
        shelfLifeDays: '',
      });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New Item" subtitle="Create raw material, component or finished product">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Item Code / Part No *</label>
          <input
            type="text"
            required
            placeholder="e.g. AL-6061-ROD"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Item Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Aluminium 6061-T6 Round Bar 25mm"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="name" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Item Type *</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="RAW_MATERIAL">Raw Material</option>
              <option value="COMPONENT">Component</option>
              <option value="SUBASSEMBLY">Subassembly</option>
              <option value="FINISHED_GOOD">Finished Good</option>
              <option value="CONSUMABLE">Consumable</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Base UOM *</label>
            <select
              required
              value={formData.baseUomId || (uoms[0]?.id ?? '')}
              onChange={(e) => setFormData({ ...formData, baseUomId: e.target.value })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            >
              {uoms.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} ({u.name})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-6 pt-2">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={formData.isLotTracked}
              onChange={(e) => setFormData({ ...formData, isLotTracked: e.target.checked })}
              className="rounded border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-0"
            />
            Lot / Batch Tracked
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={formData.isSerialTracked}
              onChange={(e) => setFormData({ ...formData, isSerialTracked: e.target.checked })}
              className="rounded border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-0"
            />
            Serial Tracked
          </label>
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Shelf Life (Days)</label>
          <input
            type="number"
            min={0}
            placeholder="Optional expiry days"
            value={formData.shelfLifeDays}
            onChange={(e) => setFormData({ ...formData, shelfLifeDays: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createItem.isPending}>
            {createItem.isPending ? 'Saving...' : 'Create Item'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ==========================================
// Location Drawer
// ==========================================
export function CreateLocationDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createLocation = useCreateLocation();
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'RAW',
    isPickable: true,
    isReceiving: false,
  });
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createLocation.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        type: formData.type,
        isPickable: formData.isPickable,
        isReceiving: formData.isReceiving,
      });
      onClose();
      setFormData({ code: '', name: '', type: 'RAW', isPickable: true, isReceiving: false });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New Warehouse Location" subtitle="Define physical zone, aisle, bin or staging area">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Location Code *</label>
          <input
            type="text"
            required
            placeholder="e.g. WH-RAW-A01"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Location Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Raw Material Rack A - Shelf 01"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="name" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Zone Type *</label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="RAW">Raw Material Zone</option>
            <option value="WIP">Work in Progress (WIP)</option>
            <option value="QUARANTINE">Quarantine / Inspection</option>
            <option value="FINISHED_GOODS">Finished Goods (FG)</option>
            <option value="SCRAP">Scrap / Defect Bin</option>
          </select>
        </div>
        <div className="flex gap-6 pt-2">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={formData.isPickable}
              onChange={(e) => setFormData({ ...formData, isPickable: e.target.checked })}
              className="rounded border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-0"
            />
            Eligible for Picking
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={formData.isReceiving}
              onChange={(e) => setFormData({ ...formData, isReceiving: e.target.checked })}
              className="rounded border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-0"
            />
            Receiving Staging Zone
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createLocation.isPending}>
            {createLocation.isPending ? 'Saving...' : 'Create Location'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ==========================================
// Department Drawer
// ==========================================
export function CreateDepartmentDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createDepartment = useCreateDepartment();
  const [formData, setFormData] = useState({ code: '', name: '' });
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createDepartment.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
      });
      onClose();
      setFormData({ code: '', name: '' });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New Department" subtitle="Define workshop or manufacturing functional department">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Department Code *</label>
          <input
            type="text"
            required
            placeholder="e.g. CNC, ASSY, QA"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Department Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Precision CNC Machining"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="name" />
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createDepartment.isPending}>
            {createDepartment.isPending ? 'Saving...' : 'Create Department'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ==========================================
// Calendar Drawer
// ==========================================
export function CreateCalendarDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createCalendar = useCreateCalendar();
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    timezone: 'UTC',
    startHour: '08:00',
    endHour: '17:00',
  });
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const weekly = {
        days: [
          { dayOfWeek: 1, intervals: [{ start: formData.startHour, end: formData.endHour }] },
          { dayOfWeek: 2, intervals: [{ start: formData.startHour, end: formData.endHour }] },
          { dayOfWeek: 3, intervals: [{ start: formData.startHour, end: formData.endHour }] },
          { dayOfWeek: 4, intervals: [{ start: formData.startHour, end: formData.endHour }] },
          { dayOfWeek: 5, intervals: [{ start: formData.startHour, end: formData.endHour }] },
        ],
      };
      await createCalendar.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        timezone: formData.timezone,
        weeklyJson: JSON.stringify(weekly),
      });
      onClose();
      setFormData({ code: '', name: '', timezone: 'UTC', startHour: '08:00', endHour: '17:00' });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New Working Calendar" subtitle="Set regular shift intervals and timezone">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Calendar Code *</label>
          <input
            type="text"
            required
            placeholder="e.g. CAL-DAY-SHIFT"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Calendar Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Standard 5-Day Single Shift"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="name" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Timezone *</label>
          <input
            type="text"
            required
            value={formData.timezone}
            onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Work Start (Mon-Fri)</label>
            <input
              type="time"
              required
              value={formData.startHour}
              onChange={(e) => setFormData({ ...formData, startHour: e.target.value })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Work End (Mon-Fri)</label>
            <input
              type="time"
              required
              value={formData.endHour}
              onChange={(e) => setFormData({ ...formData, endHour: e.target.value })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createCalendar.isPending}>
            {createCalendar.isPending ? 'Saving...' : 'Create Calendar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ==========================================
// Machine Drawer
// ==========================================
export function CreateMachineDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createMachine = useCreateMachine();
  const { data: deptData } = useDepartments();
  const { data: calData } = useCalendars();
  const departments = deptData?.data || [];
  const calendars = calData?.data || [];

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    machineClass: 'CNC_MILL',
    departmentId: '',
    calendarId: '',
    hourlyRateCents: 8500,
  });
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createMachine.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        machineClass: formData.machineClass,
        departmentId: formData.departmentId || (departments[0]?.id ?? ''),
        calendarId: formData.calendarId || (calendars[0]?.id ?? ''),
        hourlyRateCents: Number(formData.hourlyRateCents) || 0,
      });
      onClose();
      setFormData({
        code: '',
        name: '',
        machineClass: 'CNC_MILL',
        departmentId: '',
        calendarId: '',
        hourlyRateCents: 8500,
      });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New Machine" subtitle="Register a manufacturing machine resource">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Machine Code *</label>
          <input
            type="text"
            required
            placeholder="e.g. CNC-01"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Machine Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Haas VF-2SS 5-Axis Milling Center"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="name" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Machine Class *</label>
            <input
              type="text"
              required
              value={formData.machineClass}
              onChange={(e) => setFormData({ ...formData, machineClass: e.target.value })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Hourly Cost ($/hr)</label>
            <input
              type="number"
              step="0.01"
              value={(formData.hourlyRateCents / 100).toFixed(2)}
              onChange={(e) => setFormData({ ...formData, hourlyRateCents: Math.round(Number(e.target.value) * 100) })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Department *</label>
            <select
              required
              value={formData.departmentId || (departments[0]?.id ?? '')}
              onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Calendar *</label>
            <select
              required
              value={formData.calendarId || (calendars[0]?.id ?? '')}
              onChange={(e) => setFormData({ ...formData, calendarId: e.target.value })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createMachine.isPending}>
            {createMachine.isPending ? 'Saving...' : 'Create Machine'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ==========================================
// Skill Drawer
// ==========================================
export function CreateSkillDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createSkill = useCreateSkill();
  const [formData, setFormData] = useState({ code: '', name: '', category: 'MACHINING' });
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createSkill.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        category: formData.category,
      });
      onClose();
      setFormData({ code: '', name: '', category: 'MACHINING' });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New Skill" subtitle="Define technician skill qualification">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Skill Code *</label>
          <input
            type="text"
            required
            placeholder="e.g. 5AXIS-MILL"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Skill Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. 5-Axis Simultaneous Milling"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="name" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Category</label>
          <input
            type="text"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createSkill.isPending}>
            {createSkill.isPending ? 'Saving...' : 'Create Skill'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ==========================================
// Order Type Drawer
// ==========================================
export function CreateOrderTypeDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createOrderType = useCreateOrderType();
  const [formData, setFormData] = useState({ code: '', name: '' });
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createOrderType.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
      });
      onClose();
      setFormData({ code: '', name: '' });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New Order Type" subtitle="Define order family classification">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Type Code *</label>
          <input
            type="text"
            required
            placeholder="e.g. MAKE-TO-ORDER"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Type Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Custom Make to Order"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="name" />
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createOrderType.isPending}>
            {createOrderType.isPending ? 'Saving...' : 'Create Order Type'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ==========================================
// QC Checklist Drawer
// ==========================================
export function CreateQcChecklistDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createQcChecklist = useCreateQcChecklist();
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    revision: 1,
    checkCode: 'DIM-01',
    checkDesc: 'Initial visual & dimensional check',
    checkMethod: 'MEASUREMENT',
    checkUnit: 'mm',
  });
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createQcChecklist.mutateAsync({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        revision: Number(formData.revision) || 1,
        checks: [
          {
            code: formData.checkCode.trim().toUpperCase(),
            description: formData.checkDesc.trim(),
            method: formData.checkMethod,
            unit: formData.checkUnit || null,
            limitsJson: JSON.stringify({ required: true }),
            isRequired: true,
          },
        ],
      });
      onClose();
      setFormData({
        code: '',
        name: '',
        revision: 1,
        checkCode: 'DIM-01',
        checkDesc: 'Initial visual & dimensional check',
        checkMethod: 'MEASUREMENT',
        checkUnit: 'mm',
      });
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New QC Checklist" subtitle="Define quality inspection criteria and tolerances">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormErrorSummary error={error} />
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Checklist Code *</label>
          <input
            type="text"
            required
            placeholder="e.g. QC-INCOMING-RAW"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="code" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Checklist Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Incoming Raw Barstock Quality Inspection"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <FieldError error={error} field="name" />
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 space-y-3">
          <div className="text-xs font-semibold text-neutral-300">Initial Inspection Point</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Check Code</label>
              <input
                type="text"
                required
                value={formData.checkCode}
                onChange={(e) => setFormData({ ...formData, checkCode: e.target.value })}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Method</label>
              <select
                value={formData.checkMethod}
                onChange={(e) => setFormData({ ...formData, checkMethod: e.target.value })}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="MEASUREMENT">Measurement</option>
                <option value="VISUAL">Visual</option>
                <option value="FUNCTIONAL">Functional</option>
                <option value="GAUGE">Gauge (Go / No-Go)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Description</label>
            <input
              type="text"
              required
              value={formData.checkDesc}
              onChange={(e) => setFormData({ ...formData, checkDesc: e.target.value })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={createQcChecklist.isPending}>
            {createQcChecklist.isPending ? 'Saving...' : 'Create Checklist'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
