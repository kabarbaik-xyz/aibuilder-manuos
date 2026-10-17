"use client";

import { Icon } from "@/components/icons";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateSupplyOrder } from "../hooks";
import { useSuppliers, useItems } from "@/features/masters/hooks";
import { Button } from "@/components/ui/button";
import { FormErrorSummary } from "@/components/ui/form-errors";
import { parseQuantity } from "@/domain/quantity";

interface LineItemDraft {
  itemId: string;
  quantity: number;
  unitPrice: number;
  notes: string;
}

export function SupplyOrderForm() {
  const router = useRouter();
  const createOrder = useCreateSupplyOrder();

  const suppliersQuery = useSuppliers();
  const itemsQuery = useItems();
  const suppliersRes = suppliersQuery.data;
  const itemsRes = itemsQuery.data;

  const suppliers = (suppliersRes?.data || []).filter(
    (s) => s.status === "ACTIVE",
  );
  const items = (itemsRes?.data || []).filter((i) => i.status === "ACTIVE");

  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItemDraft[]>([
    { itemId: "", quantity: 1, unitPrice: 0, notes: "" },
  ]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddLine = () => {
    setLines([...lines, { itemId: "", quantity: 1, unitPrice: 0, notes: "" }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (
    index: number,
    field: keyof LineItemDraft,
    val: any,
  ) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: val };
    setLines(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createOrder.isPending) return;
    setErrorMsg(null);

    if (!expectedDate) {
      setErrorMsg("Please select an expected delivery date");
      return;
    }
    if (!supplierId) {
      setErrorMsg("Please select a supplier");
      return;
    }

    if (lines.some((l) => !l.itemId || l.quantity <= 0)) {
      setErrorMsg("Each line item must specify a valid item and quantity > 0");
      return;
    }

    try {
      const payload = {
        supplierId,
        expectedDate: new Date(expectedDate).toISOString(),
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          orderedAtoms: parseQuantity(String(l.quantity), 0),
          unitPriceCents: Math.round(l.unitPrice),
          notes: l.notes.trim() || undefined,
        })),
      };

      const res = await createOrder.mutateAsync({
        input: payload,
      });

      router.push(`/supply-orders/${res.data.id}`);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create purchase order");
    }
  };

  const selectedSupplier = suppliers.find(
    (supplier) => supplier.id === supplierId,
  );
  const configuredLines = lines.filter(
    (line) => line.itemId && line.quantity > 0,
  ).length;
  return (
    <form onSubmit={handleSubmit} className="supply-order-workspace">
      {errorMsg && (
        <div className="so-form-error">
          <FormErrorSummary message={errorMsg} />
        </div>
      )}
      <div className="so-main">
        <section className="so-section">
          <div className="so-section-heading">
            <span className="so-section-icon">
              <Icon name="supplier" />
            </span>
            <div>
              <h2>Supplier & delivery</h2>
              <p>
                Choose who will fulfill this order and when the materials are
                expected.
              </p>
            </div>
          </div>
          <div className="so-fields-grid">
            <FormField id="supply-supplier" label="Supplier" required help={selectedSupplier ? `Standard lead time: ${selectedSupplier.leadTimeDays} days` : undefined} error={suppliersQuery.error ? 'Suppliers could not be loaded.' : undefined}>
              <Select
                id="supply-supplier"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                required
                disabled={suppliersQuery.isPending || !!suppliersQuery.error}
              >
                <option value="">
                  {suppliersQuery.isPending
                    ? "Loading suppliers…"
                    : "Select supplier"}
                </option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} ({supplier.code})
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              id="supply-expected-date"
              label="Expected delivery date"
              required
            >
              <DatePicker
                id="supply-expected-date"
                value={expectedDate}
                onChange={setExpectedDate}
                required
              />
            </FormField>
          </div>
          <details className="so-notes">
            <summary>
              <Icon name="file" />
              Notes & commercial terms<span>Optional</span>
              <Icon name="down" />
            </summary>
            <FormField id="supply-notes" label="Order notes">
              <Textarea
                id="supply-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Delivery instructions, agreed terms, or supplier references…"
              />
            </FormField>
          </details>
        </section>
        <section className="so-section">
          <div className="so-section-heading">
            <span className="so-section-icon">
              <Icon name="inventory" />
            </span>
            <div>
              <h2>Materials to purchase</h2>
              <p>
                Set the material, whole-unit quantity, and unit price for each
                line.
              </p>
            </div>
            <Button
              type="button"
              icon="plus"
              size="small"
              onClick={handleAddLine}
            >
              Add line
            </Button>
          </div>
          {itemsQuery.error && (
            <p className="ov-error" role="alert">
              Materials could not be loaded. Refresh the page to try again.
            </p>
          )}
          <div className="so-lines">
            {lines.map((line, idx) => (
              <div className="so-line" key={idx}>
                <div className="so-line-heading">
                  <strong>Line {String(idx + 1).padStart(2, "0")}</strong>
                  <span>
                    {items.find((item) => item.id === line.itemId)?.code ||
                      "Choose a material"}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    title={`Remove line ${idx + 1}`}
                    aria-label={`Remove line ${idx + 1}`}
                    onClick={() => handleRemoveLine(idx)}
                    disabled={lines.length <= 1}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                <div className="so-line-fields">
                  <FormField
                    id={`material-${idx}`}
                    label="Item / material"
                    required
                  >
                    <Select
                      id={`material-${idx}`}
                      value={line.itemId}
                      onChange={(event) =>
                        handleLineChange(idx, "itemId", event.target.value)
                      }
                      required
                      disabled={itemsQuery.isPending || !!itemsQuery.error}
                    >
                      <option value="">
                        {itemsQuery.isPending
                          ? "Loading materials…"
                          : "Select material"}
                      </option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.code})
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField id={`quantity-${idx}`} label="Quantity" required>
                    <Input
                      id={`quantity-${idx}`}
                      type="number"
                      min="1"
                      step="1"
                      value={line.quantity}
                      onChange={(event) =>
                        handleLineChange(
                          idx,
                          "quantity",
                          Number(event.target.value),
                        )
                      }
                      required
                    />
                  </FormField>
                  <FormField id={`price-${idx}`} label="Unit price (cents)">
                    <Input
                      id={`price-${idx}`}
                      type="number"
                      min="0"
                      step="1"
                      value={line.unitPrice}
                      onChange={(event) =>
                        handleLineChange(
                          idx,
                          "unitPrice",
                          Number(event.target.value),
                        )
                      }
                    />
                  </FormField>
                </div>
                <FormField id={`line-notes-${idx}`} label="Line notes">
                  <Input
                    id={`line-notes-${idx}`}
                    value={line.notes}
                    placeholder="Specifications, material grade, or special requirements…"
                    onChange={(event) =>
                      handleLineChange(idx, "notes", event.target.value)
                    }
                  />
                </FormField>
              </div>
            ))}
          </div>
        </section>
      </div>
      <aside className="so-review">
        <div className="so-review-heading">
          <Icon name="order" />
          <h2>Order review</h2>
        </div>
        <dl>
          <div>
            <dt>Supplier</dt>
            <dd>{selectedSupplier?.name || "Not selected"}</dd>
          </div>
          <div>
            <dt>Expected delivery</dt>
            <dd>
              {expectedDate
                ? new Date(`${expectedDate}T12:00:00`).toLocaleDateString([], {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "Not selected"}
            </dd>
          </div>
          <div>
            <dt>Material lines</dt>
            <dd>
              {lines.length} <small>· {configuredLines} configured</small>
            </dd>
          </div>
        </dl>
        <div className="so-review-checks">
          <h3>Required information</h3>
          {[
            { ready: !!supplierId, label: "Supplier selected" },
            { ready: !!expectedDate, label: "Delivery date specified" },
            {
              ready: configuredLines === lines.length,
              label: "All material lines configured",
            },
          ].map((check) => (
            <p key={check.label}>
              <Icon
                name={check.ready ? "check" : "info"}
                className={check.ready ? "is-complete" : ""}
              />
              {check.label}
            </p>
          ))}
        </div>
        <p className="so-review-note">
          Review the delivery date, quantities, and prices before creating the
          supply order.
        </p>
        <Button
          type="submit"
          fullWidth
          variant="primary"
          disabled={
            createOrder.isPending ||
            suppliersQuery.isPending ||
            itemsQuery.isPending ||
            !!suppliersQuery.error ||
            !!itemsQuery.error
          }
        >
          {createOrder.isPending
            ? "Creating supply order…"
            : "Create supply order"}
          <Icon name="arrow" />
        </Button>
        <Button
          type="button"
          fullWidth
          variant="ghost"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </aside>
    </form>
  );
}
