import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import {
  CreateDocumentInput,
  LinkDocumentInput,
  DocumentDTO,
  DocumentLinkDTO,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from './contracts';
import { BadRequestError, NotFoundError } from '@/domain/errors';

export class DocumentRepository {
  private readonly storageRoot: string;

  constructor(private readonly prisma: PrismaClient = defaultDb) {
    this.storageRoot = path.resolve(
      process.env.STORAGE_ROOT || path.join(process.cwd(), 'storage', 'documents')
    );
    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
  }

  getStorageRoot(): string {
    return this.storageRoot;
  }

  private resolveSafePath(storageKey: string): string {
    // Prevent path traversal attacks
    const normalizedKey = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.resolve(this.storageRoot, normalizedKey);
    if (!fullPath.startsWith(this.storageRoot)) {
      throw new BadRequestError('Invalid file storage path: outside storage root');
    }
    return fullPath;
  }

  async saveFile(
    workspaceId: string,
    fileName: string,
    mimeType: string,
    content: Buffer,
    uploadedById: string,
    description?: string,
    link?: CreateDocumentInput['link']
  ): Promise<DocumentDTO> {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestError(
        `File type '${mimeType}' is not permitted. Allowed types: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`
      );
    }

    if (content.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestError(
        `File size exceeds maximum permitted limit of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`
      );
    }

    // Compute cryptographic SHA-256
    const checksumSha256 = crypto.createHash('sha256').update(content).digest('hex');

    // Generate safe storage key
    const ext = path.extname(fileName) || '';
    const safeBase = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const randomKey = crypto.randomUUID();
    const relativeKey = path.join(workspaceId, `${safeBase}-${randomKey}${ext}`);
    const absolutePath = this.resolveSafePath(relativeKey);

    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file to disk
    await fs.promises.writeFile(absolutePath, content);

    // Save metadata to database in transaction
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          workspaceId,
          storageKey: relativeKey,
          fileName,
          mimeType,
          sizeBytes: content.length,
          checksumSha256,
          uploadedById,
          description: description || null,
        },
      });

      let createdLink: DocumentLinkDTO | undefined;
      if (link) {
        const lnk = await tx.documentLink.create({
          data: {
            workspaceId,
            documentId: doc.id,
            parentType: link.parentType,
            parentId: link.parentId,
            customerVisible: link.customerVisible ?? false,
          },
        });
        createdLink = {
          id: lnk.id,
          workspaceId: lnk.workspaceId,
          documentId: lnk.documentId,
          parentType: lnk.parentType,
          parentId: lnk.parentId,
          customerVisible: lnk.customerVisible,
          createdAt: lnk.createdAt,
        };
      }

      return {
        id: doc.id,
        workspaceId: doc.workspaceId,
        storageKey: doc.storageKey,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        checksumSha256: doc.checksumSha256,
        uploadedById: doc.uploadedById,
        description: doc.description,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        links: createdLink ? [createdLink] : [],
      };
    });
  }

  async readFile(storageKey: string): Promise<Buffer> {
    const fullPath = this.resolveSafePath(storageKey);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundError(`Physical file not found on storage: ${storageKey}`);
    }
    return fs.promises.readFile(fullPath);
  }

  async findById(workspaceId: string, id: string): Promise<DocumentDTO | null> {
    const doc = await this.prisma.document.findFirst({
      where: { id, workspaceId },
      include: { links: true },
    });
    if (!doc) return null;

    return {
      id: doc.id,
      workspaceId: doc.workspaceId,
      storageKey: doc.storageKey,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      checksumSha256: doc.checksumSha256,
      uploadedById: doc.uploadedById,
      description: doc.description,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      links: doc.links.map((lnk) => ({
        id: lnk.id,
        workspaceId: lnk.workspaceId,
        documentId: lnk.documentId,
        parentType: lnk.parentType,
        parentId: lnk.parentId,
        customerVisible: lnk.customerVisible,
        createdAt: lnk.createdAt,
      })),
    };
  }

  async linkDocument(workspaceId: string, input: LinkDocumentInput): Promise<DocumentLinkDTO> {
    const lnk = await this.prisma.documentLink.create({
      data: {
        workspaceId,
        documentId: input.documentId,
        parentType: input.parentType,
        parentId: input.parentId,
        customerVisible: input.customerVisible ?? false,
      },
    });

    return {
      id: lnk.id,
      workspaceId: lnk.workspaceId,
      documentId: lnk.documentId,
      parentType: lnk.parentType,
      parentId: lnk.parentId,
      customerVisible: lnk.customerVisible,
      createdAt: lnk.createdAt,
    };
  }

  async findLinksByParent(
    workspaceId: string,
    parentType: string,
    parentId: string,
    customerOnly = false
  ): Promise<(DocumentLinkDTO & { document: DocumentDTO })[]> {
    const links = await this.prisma.documentLink.findMany({
      where: {
        workspaceId,
        parentType,
        parentId,
        ...(customerOnly ? { customerVisible: true } : {}),
      },
      include: {
        document: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return links.map((lnk) => ({
      id: lnk.id,
      workspaceId: lnk.workspaceId,
      documentId: lnk.documentId,
      parentType: lnk.parentType,
      parentId: lnk.parentId,
      customerVisible: lnk.customerVisible,
      createdAt: lnk.createdAt,
      document: {
        id: lnk.document.id,
        workspaceId: lnk.document.workspaceId,
        storageKey: lnk.document.storageKey,
        fileName: lnk.document.fileName,
        mimeType: lnk.document.mimeType,
        sizeBytes: lnk.document.sizeBytes,
        checksumSha256: lnk.document.checksumSha256,
        uploadedById: lnk.document.uploadedById,
        description: lnk.document.description,
        createdAt: lnk.document.createdAt,
        updatedAt: lnk.document.updatedAt,
      },
    }));
  }
}
