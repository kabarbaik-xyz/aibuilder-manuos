export interface Principal {
  userId: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceName?: string;
  membershipId: string;
  permissions: ReadonlySet<string>;
  roles: string[];
  customerId: string | null;
  technicianId: string | null;
  facilityId?: string | null;
  facilityIds?: string[];
}

export interface PrincipalJson {
  userId: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceName?: string;
  membershipId: string;
  permissions: string[];
  roles: string[];
  customerId: string | null;
  technicianId: string | null;
  facilityId?: string | null;
  facilityIds?: string[];
}

export function serializePrincipal(principal: Principal): PrincipalJson {
  return {
    ...principal,
    permissions: Array.from(principal.permissions),
  };
}
