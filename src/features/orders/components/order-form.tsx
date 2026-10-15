"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateOrderDraft } from "../hooks";
import {
  useCustomers,
  useOrderTypes,
  useItems,
} from "@/features/masters/hooks";
import { Button } from "@/components/ui/button";
import { FormErrorSummary } from "@/components/ui/form-errors";

const PRESETS = [
  {
    name: "Aerospace Valve Manifold",
    text: "Procurement RFQ: 50 units Hydraulic Valve Body per drawing H-2026-A. 5-axis CNC machining, wire EDM and 350-bar pressure test required. Target delivery in 4 weeks.",
  },
  {
    name: "Precision Mounting Bracket",
    text: "Request for Quotation: 120 units Mounting Bracket X1 in stainless steel. Laser cut, 90-deg bending, passivation and CMM inspection required.",
  },
  {
    name: "Industrial Control Panel",
    text: "Custom assembly request: 25 units Industrial Control Enclosure. Dual-track subassembly, CNC milling and functional Hi-Pot testing required.",
  },
];

export function OrderForm() {
  const router = useRouter();
  const createOrder = useCreateOrderDraft();

  const { data: customersRes } = useCustomers();
  const { data: orderTypesRes } = useOrderTypes();
  const { data: itemsRes } = useItems();

  const customers = customersRes?.data || [];
  const orderTypes = orderTypesRes?.data || [];
  const items = itemsRes?.data || [];

  const [customerId, setCustomerId] = useState("");
  const [orderTypeId, setOrderTypeId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [requestedDate, setRequestedDate] = useState("2026-11-20");
  const [promisedDate, setPromisedDate] = useState("2026-11-25");
  const [rfqText, setRfqText] = useState(PRESETS[0].text);
  const [rfqSourceType, setRfqSourceType] = useState<
    "MANUAL" | "EMAIL" | "UPLOAD"
  >("EMAIL");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!customerId || !orderTypeId || !itemId) {
      setErrorMsg("Please select customer, order type, and target item.");
      return;
    }

    createOrder.mutate(
      {
        customerId,
        orderTypeId,
        itemId,
        orderedQuantity: Number(quantity),
        requestedDate: new Date(requestedDate).toISOString(),
        promisedDate: promisedDate
          ? new Date(promisedDate).toISOString()
          : null,
        rfqText,
        rfqSourceType,
      },
      {
        onSuccess: (res: any) => {
          router.push(`/orders/${res.data.id}`);
        },
        onError: (err: any) => {
          setErrorMsg(err.message || "Failed to create order draft");
        },
      },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-3xl space-y-6 rounded-lg border bg-white p-6 shadow-sm"
    >
      <div className="border-b pb-4">
        <h2 className="text-lg font-bold text-slate-900">New Order Intake</h2>
        <p className="text-sm text-slate-500">
          Create an authoritative order draft from customer RFQ or commercial
          demand.
        </p>
      </div>

      {errorMsg && <FormErrorSummary message={errorMsg} />}

      {/* RFQ Draft Preset Shortcuts */}
      <div className="rounded-md border border-blue-100 bg-blue-50/50 p-4">
        <label className="text-xs font-semibold uppercase tracking-wider text-blue-900">
          RFQ Intake Presets
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => setRfqText(p.text)}
              className="rounded bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm border hover:bg-slate-50"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Master References Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-700">
            Customer *
          </label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm mt-1"
            required
          >
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-700">
            Order Type *
          </label>
          <select
            value={orderTypeId}
            onChange={(e) => setOrderTypeId(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm mt-1"
            required
          >
            <option value="">Select order type…</option>
            {orderTypes.map((ot) => (
              <option key={ot.id} value={ot.id}>
                {ot.code} - {ot.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-700">
            Target Item *
          </label>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm mt-1"
            required
          >
            <option value="">Select item…</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.code} - {it.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-700">
            Ordered Quantity *
          </label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            min="1"
            className="w-full rounded border px-3 py-2 text-sm mt-1"
            required
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-700">
            RFQ Source Type
          </label>
          <select
            value={rfqSourceType}
            onChange={(e) => setRfqSourceType(e.target.value as any)}
            className="w-full rounded border px-3 py-2 text-sm mt-1"
          >
            <option value="EMAIL">Email</option>
            <option value="MANUAL">Manual Entry</option>
            <option value="UPLOAD">Document Upload</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-700">
            Requested Delivery Date *
          </label>
          <input
            type="date"
            value={requestedDate}
            onChange={(e) => setRequestedDate(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm mt-1"
            required
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-700">
            Committed / Promised Date
          </label>
          <input
            type="date"
            value={promisedDate}
            onChange={(e) => setPromisedDate(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm mt-1"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-700">
          Raw RFQ Context & Notes
        </label>
        <textarea
          rows={4}
          value={rfqText}
          onChange={(e) => setRfqText(e.target.value)}
          className="w-full rounded border px-3 py-2 text-sm mt-1 font-mono"
          placeholder="Paste customer RFQ specification or notes…"
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="default" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={createOrder.isPending}
        >
          {createOrder.isPending
            ? "Creating Order Draft…"
            : "Create Order Draft"}
        </Button>
      </div>
    </form>
  );
}
