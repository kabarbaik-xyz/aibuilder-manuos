'use client';

import { useWorkspaceNavigation } from "@/components/workspace-navigation-context";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/resource-state";
import { useTechnicianProfile } from "../hooks";

export function ShopFloorProfileView() {
  const { principal } = useWorkspaceNavigation();
  const { data: profile, isLoading, error, refetch } = useTechnicianProfile();

  return (
    <div className="page-stack">
      <PageHeader
        title="Operator Profile"
        description="Verified qualifications, active certifications, and facility authorizations."
        actions={
          <Button icon="reset" onClick={() => void refetch()}>
            Refresh
          </Button>
        }
      />

      {/* Subnavigation Bar */}
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <ButtonLink href="/shop-floor" size="small" variant="default">
          All Tasks
        </ButtonLink>
        <ButtonLink href="/shop-floor/today" size="small" variant="default">
          Today
        </ButtonLink>
        <ButtonLink href="/shop-floor/profile" size="small" variant="primary">
          My Profile
        </ButtonLink>
      </div>

      {isLoading ? (
        <LoadingState message="Loading operator profile & qualifications…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : !profile ? (
        <EmptyState
          title="Profile Not Found"
          description="Your user account is not linked to an active technician master record."
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
                  <Badge variant="blue">Emp Code: {profile.code}</Badge>
                )}
                <Badge variant={profile.facilityName ? "default" : "warning"}>
                  Site: {profile.facilityName || profile.facilityId || "Default Facility"}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-line text-xs">
              <div>
                <span className="text-muted block">Department:</span>
                <strong className="text-ink font-medium">
                  {profile.departmentName || "General Production"}
                </strong>
              </div>
              <div>
                <span className="text-muted block">Working Calendar:</span>
                <strong className="text-ink font-medium">
                  {profile.calendarName || "Standard Factory Hours"}
                </strong>
              </div>
              <div>
                <span className="text-muted block">System Roles:</span>
                <span className="text-ink font-medium">
                  {profile.roles.join(", ") || "TECHNICIAN"}
                </span>
              </div>
            </div>
          </section>

          {/* Verified Skills Section */}
          <section className="p-5 bg-surface border border-line rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink">Verified Skill Matrix</h3>
                <p className="text-xs text-muted">
                  Qualified manufacturing capabilities verified by supervisor assessment (scale 0–4).
                </p>
              </div>
              <Badge variant="default">{profile.skills.length} Skills</Badge>
            </div>

            {profile.skills.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center bg-surface-muted rounded-lg border border-line">
                No formal skill records assigned. Contact your shop floor supervisor for skill evaluation.
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
                        {s.assessmentStatus}
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
                <h3 className="text-sm font-bold text-ink">Active Certifications</h3>
                <p className="text-xs text-muted">
                  Non-waivable regulatory, safety, and equipment credentials with validity dates.
                </p>
              </div>
              <Badge variant="default">{profile.certifications.length} Credentials</Badge>
            </div>

            {profile.certifications.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center bg-surface-muted rounded-lg border border-line">
                No active certifications on record. Tasks requiring mandatory credentials will be gated.
              </p>
            ) : (
              <div className="divide-y divide-line border border-line rounded-lg overflow-hidden">
                {profile.certifications.map((c) => (
                  <div key={c.id} className="p-3 bg-surface flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div>
                      <strong className="text-ink font-medium">{c.name}</strong>
                      <span className="text-muted ml-2 font-mono">({c.code})</span>
                      <p className="text-muted mt-0.5">
                        Valid Until: {c.validUntil}
                        {c.scope && <span className="ml-2">• Scope: {c.scope}</span>}
                      </p>
                    </div>
                    <Badge variant={c.status === "ACTIVE" ? "success" : "danger"}>
                      {c.status}
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
