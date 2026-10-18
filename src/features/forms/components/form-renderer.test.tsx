import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormRenderer } from './form-renderer';

describe('form renderer', () => {
  it('connects an attachment field label to its file input', () => {
    Object.assign(globalThis, { React });
    const html = renderToStaticMarkup(<FormRenderer
      definition={{ schemaVersion: 1, purpose: 'TASK_EVIDENCE', fields: [{ key: 'safety_document', label: 'Safety document', kind: 'attachment', required: true }] }}
      value={{}}
    />);
    const labelId = html.match(/<label for="([^"]+)">Safety document/)?.[1];
    expect(labelId).toBeTruthy();
    expect(html).toMatch(new RegExp(`<input[^>]*id="${labelId}"`));
  });
});
