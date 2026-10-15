import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { DocumentService } from '@/server/modules/documents/service';

const documentService = new DocumentService();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await requirePrincipal(req);
    const { id } = await params;

    const { document, content } = await documentService.authorizeDocumentDownload(
      principal,
      id
    );

    return new NextResponse(new Uint8Array(content), {
      status: 200,
      headers: {
        'Content-Type': document.mimeType,
        'Content-Length': document.sizeBytes.toString(),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(document.fileName)}"`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
