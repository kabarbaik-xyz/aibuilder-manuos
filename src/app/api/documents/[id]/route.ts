import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { DocumentService } from '@/server/modules/documents/service';

const documentService = new DocumentService();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;

    const doc = await documentService.getDocument(principal, id);
    return jsonResponse(doc, { status: 200 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
