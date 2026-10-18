export type FormAttachmentSubjectType = 'ORDER' | 'TASK' | 'INSPECTION';

export function getFormAttachmentUploadLink(subjectType: FormAttachmentSubjectType, subjectId: string) {
  if (!subjectId) return undefined;
  if (subjectType === 'TASK' || subjectType === 'ORDER') return { parentType: subjectType, parentId: subjectId };
  return undefined;
}
