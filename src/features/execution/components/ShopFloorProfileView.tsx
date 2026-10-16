'use client';

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/resource-state";
import { useTechnicianProfile } from "../hooks";

const skillAssessmentLabels: Record<string, string> = {
  VERIFIED: "Terverifikasi",
  CLAIMED: "Diklaim",
  OBSERVED: "Diamati",
  REVOKED: "Dicabut",
  UNVERIFIED: "Belum diverifikasi",
};

const certificationStatusLabels: Record<string, string> = {
  ACTIVE: "Aktif",
  EXPIRED: "Kedaluwarsa",
  REVOKED: "Dicabut",
};

export function ShopFloorProfileView() {
  const { data: profile, isLoading, error, refetch } = useTechnicianProfile();

  return (
    <div className="page-stack">
      <PageHeader
        title="Profil Operator"
        description="Kualifikasi terverifikasi, sertifikasi aktif, dan otorisasi fasilitas."
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
        <ButtonLink href="/shop-floor/today" size="small" variant="default">
          Antrean kerja
        </ButtonLink>
        <ButtonLink href="/shop-floor/profile" size="small" variant="primary">
          Profil saya
        </ButtonLink>
      </div>

      {isLoading ? (
        <LoadingState message="Memuat profil operator dan kualifikasi…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : !profile ? (
        <EmptyState
          title="Profil tidak tersedia"
          description="Akun ini belum terhubung dengan data teknisi aktif."
        />
      ) : (
        <div className="space-y-6">
          {/* Identity & Facility Card */}
          <section className="p-5 bg-surface border border-line rounded-xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-bold text-ink">{profile.name}</h2>
                <p className="text-xs text-muted mt-0.5">{profile.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {profile.code && (
                  <Badge variant="blue">Kode pegawai: {profile.code}</Badge>
                )}
                <Badge variant={profile.facilityName ? "default" : "warning"}>
                  {profile.facilityName
                    ? `Fasilitas: ${profile.facilityName}`
                    : profile.facilityId
                    ? `ID fasilitas: ${profile.facilityId}`
                    : "Fasilitas belum ditetapkan"}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-line text-xs">
              <div>
                <span className="text-muted block">Departemen:</span>
                <strong className="text-ink font-medium">
                  {profile.departmentName || "Belum tersedia"}
                </strong>
              </div>
              <div>
                <span className="text-muted block">Kalender kerja:</span>
                <strong className="text-ink font-medium">
                  {profile.calendarName || "Belum tersedia"}
                </strong>
              </div>
              <div>
                <span className="text-muted block">Peran sistem:</span>
                <span className="text-ink font-medium">
                  {profile.roles.length ? profile.roles.join(", ") : "Belum tersedia"}
                </span>
              </div>
            </div>
          </section>

          {/* Verified Skills Section */}
          <section className="p-5 bg-surface border border-line rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink">Matriks keterampilan terverifikasi</h3>
                <p className="text-xs text-muted">
                  Kemampuan manufaktur yang dinilai supervisor (skala 0–4).
                </p>
              </div>
              <Badge variant="default">{profile.skills.length} keterampilan</Badge>
            </div>

            {profile.skills.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center bg-surface-muted rounded-lg border border-line">
                Belum ada data keterampilan. Hubungi supervisor untuk penilaian.
              </p>
            ) : (
              <div className="divide-y divide-line border border-line rounded-lg overflow-hidden">
                {profile.skills.map((s) => (
                  <div key={s.id} className="p-3 bg-surface flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div>
                      <strong className="text-ink font-medium">{s.skillName}</strong>
                      <span className="text-muted ml-2 font-mono">({s.skillCode})</span>
                      {s.evidence && (
                        <p className="text-muted mt-0.5 italic">Bukti: {s.evidence}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="blue">Level {s.level} / 4</Badge>
                      <Badge variant={s.assessmentStatus === "VERIFIED" ? "success" : "warning"}>
                        {skillAssessmentLabels[s.assessmentStatus] || "Belum diverifikasi"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Active Certifications Section */}
          <section className="p-5 bg-surface border border-line rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink">Sertifikasi aktif</h3>
                <p className="text-xs text-muted">
                  Kredensial regulasi, keselamatan, dan peralatan beserta masa berlakunya.
                </p>
              </div>
              <Badge variant="default">{profile.certifications.length} kredensial</Badge>
            </div>

            {profile.certifications.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center bg-surface-muted rounded-lg border border-line">
                Tidak ada sertifikasi aktif. Tugas yang mewajibkan kredensial akan tetap dibatasi.
              </p>
            ) : (
              <div className="divide-y divide-line border border-line rounded-lg overflow-hidden">
                {profile.certifications.map((c) => (
                  <div key={c.id} className="p-3 bg-surface flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div>
                      <strong className="text-ink font-medium">{c.name}</strong>
                      <span className="text-muted ml-2 font-mono">({c.code})</span>
                      <p className="text-muted mt-0.5">
                        Berlaku sampai: {c.validUntil}
                        {c.scope && <span className="ml-2">• Cakupan: {c.scope}</span>}
                      </p>
                    </div>
                    <Badge variant={c.status === "ACTIVE" ? "success" : "danger"}>
                      {certificationStatusLabels[c.status] || c.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
