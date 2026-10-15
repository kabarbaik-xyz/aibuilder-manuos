import { NextRequest } from 'next/server';
import { requirePrincipal } from '@/server/auth/auth';
import { formatErrorResponse } from '@/server/http/errors';
import { jsonResponse } from '@/server/http/route-handler';
import { DocumentService } from '@/server/modules/documents/service';
import { BadRequestError } from '@/domain/errors';

const documentService = new DocumentService();

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);

    const contentType = req.headers.get('content-type') || '';

    let fileName = '';
    let mimeType = '';
    let content: Buffer;
    let description: string | undefined;
    let link: { parentType: any; parentId: string; customerVisible?: boolean } | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        throw new BadRequestError('No file provided in form-data');
      }
      fileName = file.name;
      mimeType = file.type || 'application/octet-stream';
      const arrayBuffer = await file.arrayBuffer();
      content = Buffer.from(arrayBuffer);

      description = (formData.get('description') as string) || undefined;
      const parentType = formData.get('parentType') as any;
      const parentId = formData.get('parentId') as string;
      const customerVisible = formData.get('customerVisible') === 'true';

      if (parentType && parentId) {
        link = { parentType, parentId, customerVisible };
      }
    } else {
      const body = await req.json();
      fileName = body.fileName;
      mimeType = body.mimeType;
      description = body.description;
      link = body.link;

      if (!body.contentBase64 && !body.content) {
        throw new BadRequestError('Missing file content (contentBase64 or content)');
      }

      if (body.contentBase64) {
        content = Buffer.from(body.contentBase64, 'base64');
      } else {
        content = Buffer.from(body.content, 'utf8');
      }
    }

    if (!fileName || !mimeType || !content) {
      throw new BadRequestError('Invalid file upload parameters: fileName, mimeType and content are required');
    }

    const doc = await documentService.uploadDocument(principal, {
      fileName,
      mimeType,
      content,
      description,
      link,
    });

    return jsonResponse(doc, { status: 201 });
  } catch (err) {
    return formatErrorResponse(err);
  }
}
