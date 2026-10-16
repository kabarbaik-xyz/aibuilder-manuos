'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceNavigation } from "@/components/workspace-navigation-context";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/resource-state";
import { useMyTasks, useScanBarcode } from "../hooks";
import { getScanOpenPath } from "../scan-routing";
import { useOnlineStatus } from "../use-online-status";

function formatMinutes(value: number) {
  return value < 60 ? `${value}m` : `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ""}`;
}

const taskStatusLabels: Record<string, string> = {
  RUNNING: "Berjalan",
  PAUSED: "Dijeda",
  WAITING_QC: "Menunggu QC",
  READY: "Siap",
  ASSIGNED: "Ditetapkan",
  BLOCKED: "Terblokir",
};

export function ShopFloorTodayView() {
  const router = useRouter();
  const { principal } = useWorkspaceNavigation();
  const isOnline = useOnlineStatus();
  const [scanCode, setScanCode] = useState("");
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const scanMutation = useScanBarcode();

  const { data: myTasks, isLoading, error, refetch } = useMyTasks();

  const handleScanSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = scanCode.trim();
    if (!code) return;
    if (!isOnline) {
      setScanMessage('Pemindaian memerlukan koneksi server. Sambungkan kembali sebelum mencoba.');
      return;
    }
    setScanMessage(null);
    try {
      const result = await scanMutation.mutateAsync(code);
      const openPath = getScanOpenPath(result, principal?.permissions.includes("order.read") ?? false);
      if (openPath) {
        setScanMessage(null);
        router.push(openPath);
        return;
      }
      setScanMessage(
        result.type === "JOB"
          ? `${result.displayCode} ditemukan, tetapi tidak ada tugas aktif yang dapat dibuka.`
          : "Kode dikenali, tetapi akun ini tidak memiliki akses untuk membuka order tersebut."
      );
    } catch (submitErr) {
      setScanMessage(submitErr instanceof Error ? submitErr.message : "Kode tidak ditemukan atau tidak dapat diakses akun ini.");
    }
  };

  const activeTask = myTasks?.find((t) => t.status === "RUNNING");
  const pausedTask = myTasks?.find((t) => t.status === "PAUSED");
  const queuedTasks = (myTasks || []).filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");

  return (
    <div className="page-stack">
      <PageHeader
        title="Antrean kerja"
        description={`Tugas produksi aktif untuk ${principal?.name || "Operator"}`}
        actions={
          <Button icon="reset" onClick={() => void refetch()}>
            Muat ulang
          </Button>
        }
      />

      {/* Subnavigation Bar */}
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <ButtonLink href="/shop-floor" size="small" variant="default">
          Semua tugas
        </ButtonLink>
        <ButtonLink href="/shop-floor/today" size="small" variant="primary">
          Antrean kerja
        </ButtonLink>
        <ButtonLink href="/shop-floor/profile" size="small" variant="default">
          Profil saya
        </ButtonLink>
      </div>

      {/* Online-only mutation state */}
      <div className="p-3 bg-surface border border-line rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Badge variant={isOnline ? "success" : "warning"}>
              {isOnline ? "Perangkat online" : "Perangkat luring"}
          </Badge>
          <span className="text-muted">
            {isOnline
              ? "Perubahan perlu koneksi server dan tidak disimpan saat luring."
              : "Pemindaian dan eksekusi tersedia setelah tersambung kembali."}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {principal?.facilityId && <Badge variant="default">Fasilitas: {principal.facilityId}</Badge>}
        </div>
      </div>

      {/* Quick Scan Entry */}
      <form
        className="p-4 bg-surface border border-line rounded-xl flex flex-wrap gap-2 items-center"
        onSubmit={handleScanSubmit}
        aria-label="Pindai barcode di workstation"
      >
        <div className="flex-1 min-w-[200px]">
          <Input
            type="text"
            placeholder="Pindai QR atau masukkan kode tugas / job…"
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
          />
        </div>
        <Button type="submit" variant="primary" disabled={!isOnline || !scanCode.trim() || scanMutation.isPending}>
          {scanMutation.isPending ? "Memeriksa…" : "Pindai & buka"}
        </Button>
        {scanMessage && (
          <p role="status" className="w-full text-xs text-amber-700 font-medium mt-1">
            {scanMessage}
          </p>
        )}
      </form>

      {/* Active Running Session Alert */}
      {activeTask && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
              <strong className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                Sesi aktif
              </strong>
            </div>
            <h3 className="text-sm font-semibold text-ink mt-1">
              {activeTask.nodeKey} — {activeTask.itemName}
            </h3>
            <p className="text-xs text-muted">
              Order {activeTask.orderNumber} ({activeTask.customerName}) •{" "}
              berjalan {formatMinutes(activeTask.currentElapsedMinutes)}
            </p>
          </div>
          <ButtonLink href={`/shop-floor/tasks/${activeTask.id}`} variant="primary" size="small">
            Lanjutkan kerja
          </ButtonLink>
        </div>
      )}

      {/* Paused Session Alert */}
      {!activeTask && pausedTask && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between flex-wrap gap-3">
          <div>
            <strong className="text-xs font-bold text-amber-800 uppercase tracking-wide">
              Sesi kerja dijeda
            </strong>
            <h3 className="text-sm font-semibold text-ink mt-1">
              {pausedTask.nodeKey} — {pausedTask.itemName}
            </h3>
            <p className="text-xs text-muted">
              Order {pausedTask.orderNumber} • Menunggu sesi dilanjutkan
            </p>
          </div>
          <ButtonLink href={`/shop-floor/tasks/${pausedTask.id}`} variant="primary" size="small">
            Tinjau jeda & lanjutkan
          </ButtonLink>
        </div>
      )}

      {/* Tasks Queue for Today */}
      <section className="space-y-3" aria-label="Antrean tugas aktif">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">
          Antrean aktif ({queuedTasks.length})
          </h2>
          <span className="text-xs text-muted">Pilih tugas untuk membuka workstation</span>
        </div>

        {isLoading ? (
          <LoadingState message="Memuat antrean kerja…" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        ) : queuedTasks.length === 0 ? (
          <EmptyState
            title="Tidak ada tugas aktif"
            description="Tugas produksi aktif akan muncul di sini setelah ditetapkan."
          />
        ) : (
          <div className="grid gap-3">
            {queuedTasks.map((t) => (
              <div
                key={t.id}
                className="p-4 bg-surface border border-line rounded-xl flex items-center justify-between flex-wrap gap-3 hover:border-primary transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-ink bg-surface-muted px-2 py-0.5 rounded border border-line">
                      {t.nodeKey}
                    </span>
                    <Badge
                      variant={
                        t.status === "RUNNING"
                          ? "success"
                          : t.status === "PAUSED" || t.status === "WAITING_QC"
                          ? "warning"
                          : "default"
                      }
                    >
                      {taskStatusLabels[t.status] || t.status}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-medium text-ink mt-1.5">
                    {t.itemName}
                  </h3>
                    <p className="text-xs text-muted">
                      Order {t.orderNumber} • {t.customerName} • Rencana {formatMinutes(t.plannedDurationMinutes)}
                  </p>
                </div>
                <ButtonLink
                  href={`/shop-floor/tasks/${t.id}`}
                  size="small"
                  variant={t.status === "RUNNING" || t.status === "PAUSED" ? "primary" : "default"}
                >
                  {t.status === "RUNNING" ? "Lanjutkan" : t.status === "PAUSED" ? "Lanjutkan" : "Buka tugas"}
                </ButtonLink>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
