'use client';

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/resource-state";
import { useTechnicianProfile } from "../hooks";

const skillAssessmentLabels: Record<string, string> = {
  VERIFIED: "Verified",
  CLAIMED: "Claimed",
  OBSERVED: "Observed",
  REVOKED: "Revoked",
  UNVERIFIED: "Not verified",
};

const certificationStatusLabels: Record<string, string> = {
  ACTIVE: "Active",
  EXPIRED: "Expired",
  REVOKED: "Revoked",
};

export function ShopFloorProfileView() {
  const { data: profile, isLoading, error, refetch } = useTechnicianProfile();

  return (
    <div className="page-stack">
      <PageHeader
        title="Operator profile"
        description="Verified qualifications, active certifications, and facility authorizations."
        actions={
          <Button icon="reset" onClick={() => void refetch()}>
            Refresh
          </Button>
        }
      />

      {/* Subnavigation Bar */}
      <Tabs
        ariaLabel="Shop floor navigation"
        activeId="profile"
        items={[
          { id: "all", label: "All tasks", href: "/shop-floor", icon: "work" },
          { id: "today", label: "Work queue", href: "/shop-floor/today", icon: "clock" },
          { id: "profile", label: "My profile", href: "/shop-floor/profile", icon: "technician" },
        ]}
      />

      {isLoading ? (
        <LoadingState message="Loading operator profile and qualifications…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : !profile ? (
        <EmptyState
          title="Profile unavailable"
          description="This account is not linked to active technician data yet."
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
                  <Badge variant="blue">Employee ID: {profile.code}</Badge>
                )}
                <Badge variant={profile.facilityName ? "default" : "warning"}>
                  {profile.facilityName
                    ? `Facility: ${profile.facilityName}`
                    : profile.facilityId
                    ? `Facility ID: ${profile.facilityId}`
                    : "Facility not assigned"}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-line text-xs">
              <div>
                <span className="text-muted block">Department:</span>
                <strong className="text-ink font-medium">
                  {profile.departmentName || "Not available"}
                </strong>
              </div>
              <div>
                <span className="text-muted block">Work calendar:</span>
                <strong className="text-ink font-medium">
                  {profile.calendarName || "Not available"}
                </strong>
              </div>
              <div>
                <span className="text-muted block">System roles:</span>
                <span className="text-ink font-medium">
                  {profile.roles.length ? profile.roles.join(", ") : "Not available"}
                </span>
              </div>
            </div>
          </section>

          {/* Verified Skills Section */}
          <section className="p-5 bg-surface border border-line rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink">Verified skills matrix</h3>
                <p className="text-xs text-muted">
                  Manufacturing capabilities assessed by a supervisor (scale 0–4).
                </p>
              </div>
              <Badge variant="default">{profile.skills.length} skills</Badge>
            </div>

            {profile.skills.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center bg-surface-muted rounded-lg border border-line">
                No skill data yet. Contact your supervisor for an assessment.
              </p>
            ) : (
              <div className="divide-y divide-line border border-line rounded-lg overflow-hidden">
                {profile.skills.map((s) => (
                  <div key={s.id} className="p-3 bg-surface flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div>
                      <strong className="text-ink font-medium">{s.skillName}</strong>
                      <span className="text-muted ml-2 font-mono">({s.skillCode})</span>
                      {s.evidence && (
                        <p className="text-muted mt-0.5 italic">Evidence: {s.evidence}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="blue">Level {s.level} / 4</Badge>
                      <Badge variant={s.assessmentStatus === "VERIFIED" ? "success" : "warning"}>
                        {skillAssessmentLabels[s.assessmentStatus] || "Not verified"}
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
                <h3 className="text-sm font-bold text-ink">Active certifications</h3>
                <p className="text-xs text-muted">
                  Regulatory, safety, and equipment credentials with their validity periods.
                </p>
              </div>
              <Badge variant="default">{profile.certifications.length} credentials</Badge>
            </div>

            {profile.certifications.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center bg-surface-muted rounded-lg border border-line">
                No active certifications. Tasks that require credentials will remain restricted.
              </p>
            ) : (
              <div className="divide-y divide-line border border-line rounded-lg overflow-hidden">
                {profile.certifications.map((c) => (
                  <div key={c.id} className="p-3 bg-surface flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div>
                      <strong className="text-ink font-medium">{c.name}</strong>
                      <span className="text-muted ml-2 font-mono">({c.code})</span>
                      <p className="text-muted mt-0.5">
                        Valid until: {c.validUntil}
                        {c.scope && <span className="ml-2">• Scope: {c.scope}</span>}
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
