import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { NotFoundError } from '@/domain/errors';
import { formatErrorResponse } from '@/server/http/errors';
import { mastersService, type EditableCatalogInput, type EditableCatalogResource } from '@/server/modules/masters/service';
import {
  updateCalendarSchema,
  updateDepartmentSchema,
  updateMachineSchema,
  updateQcChecklistSchema,
  updateSkillSchema,
  updateTechnicianSchema,
  updateUomSchema,
} from '@/server/modules/masters/contracts';
import { parseIdempotencyKey, parseJsonBody } from '@/server/http/route-handler';

const updateSchemas = {
  departments: updateDepartmentSchema,
  calendars: updateCalendarSchema,
  machines: updateMachineSchema,
  technicians: updateTechnicianSchema,
  skills: updateSkillSchema,
  certifications: updateDepartmentSchema,
  uoms: updateUomSchema,
  'qc-checklists': updateQcChecklistSchema,
};

function asEditableResource(resource: string): EditableCatalogResource {
  if (resource in updateSchemas) return resource as EditableCatalogResource;
  throw new NotFoundError(`Editable catalog '${resource}' not found`);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ resource: string; id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { resource: rawResource, id } = await params;
    const resource = asEditableResource(rawResource);
    const body = await parseJsonBody(req, updateSchemas[resource]) as EditableCatalogInput;
    const result = await mastersService.updateCatalogRecord(
      principal,
      resource,
      id,
      body,
      parseIdempotencyKey(req)
    );
    return NextResponse.json(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ resource: string; id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { resource: rawResource, id } = await params;
    const result = await mastersService.archiveCatalogRecord(
      principal,
      asEditableResource(rawResource),
      id,
      parseIdempotencyKey(req)
    );
    return NextResponse.json(result);
  } catch (err) {
    return formatErrorResponse(err);
  }
}
