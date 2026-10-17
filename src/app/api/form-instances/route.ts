import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { FormSubmissionService } from '@/server/modules/forms/submissions';
import { db } from '@/server/db/client';
import { BadRequestError } from '@/domain/errors';

const service = new FormSubmissionService(db);

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal(request);
    const subjectType = request.nextUrl.searchParams.get('subjectType');
    const subjectId = request.nextUrl.searchParams.get('subjectId')?.trim();
    if (!subjectId || !['ORDER', 'TASK', 'INSPECTION'].includes(subjectType ?? '')) {
      throw new BadRequestError('subjectType and subjectId are required');
    }
    const data = await service.listInstancesForSubject(
      principal,
      subjectType as 'ORDER' | 'TASK' | 'INSPECTION',
      subjectId
    );
    return jsonResponse({ data });
  } catch (error) {
    return formatErrorResponse(error);
  }
}
