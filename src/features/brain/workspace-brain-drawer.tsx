'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api/client';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Icon, type IconName } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import type { BrainAnswerDTO, BrainQuestionContext } from '@/server/ai/brain';
import type { Explanation } from '@/server/ai/validation';

type Message = { question: string; context?: BrainQuestionContext | null; answer?: BrainAnswerDTO; status?: 'SUCCESS' | 'FALLBACK'; fallbackReason?: string; error?: string };
const prompts: Array<{ text: string; hint: string; icon: IconName }> = [
  { text: 'What is the status of active orders?', hint: 'Orders', icon: 'order' },
  { text: 'Summarize inventory balances', hint: 'Inventory', icon: 'inventory' },
  { text: 'Give me a production overview', hint: 'Production', icon: 'work' },
];

// Render text as React nodes: provider output must never become executable HTML.
function AnswerText({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).filter(Boolean).flatMap(block => {
    if (block.length < 360 || block.includes('\n')) return [block];
    const sentences = block.split(/(?<=[.!?])\s+(?=[A-Z])/);
    const paragraphs: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) paragraphs.push(sentences.slice(i, i + 2).join(' ').trim());
    return paragraphs;
  });
  function inline(value: string) {
    return value.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
  }
  return <div className="workspace-brain-answer-text">{blocks.map((block, index) => {
    const lines = block.split('\n').filter(line => line.trim());
    if (lines.some(line => /^#{1,3}\s+/.test(line))) return <section key={index} className="workspace-brain-answer-section">{lines.map((line, i) => /^#{1,3}\s+/.test(line) ? <h4 key={i}>{inline(line.replace(/^#{1,3}\s+/, ''))}</h4> : /^\s*[-*•]\s+/.test(line) ? <ul key={i}><li>{inline(line.replace(/^\s*[-*•]\s+/, ''))}</li></ul> : <p key={i}>{inline(line)}</p>)}</section>;
    if (lines.every(line => /^\s*(?:[-*•]|\d+\.)\s+/.test(line))) return <ul key={index}>{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, ''))}</li>)}</ul>;
    return <p key={index}>{inline(block)}</p>;
  })}</div>;
}

export function WorkspaceBrainDrawer({ initialContext }: { initialContext?: BrainQuestionContext | null }) {
  const { principal } = useWorkspaceNavigation();
  const [selectedContext, setSelectedContext] = useState<BrainQuestionContext | null>(initialContext ?? null);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const previousMembershipId = useRef<string | null | undefined>(principal?.membershipId);
  const initializedMembership = useRef(false);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!initializedMembership.current) {
      initializedMembership.current = true;
      previousMembershipId.current = principal?.membershipId;
      return;
    }
    if (previousMembershipId.current === principal?.membershipId) return;
    previousMembershipId.current = principal?.membershipId;
    request.current?.abort();
    setMessages([]);
    setPending(false);
    setQuestion('');
    setSelectedContext(null);
  }, [principal?.membershipId]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [messages, pending]);

  async function ask(value: string) {
    const text = value.trim();
    if (!text || pending) return;
    const controller = new AbortController();
    request.current = controller;
    setQuestion('');
    setPending(true);
    setMessages(previous => [...previous, { question: text, context: selectedContext }]);
    try {
      const result = await apiRequest<{ data?: BrainAnswerDTO; explanation: Explanation<BrainAnswerDTO> }>('/api/ai/brain-qa', {
        method: 'POST', body: JSON.stringify({ question: text, context: selectedContext ?? undefined }), signal: controller.signal,
      });
      const answer = result.data;
      if (!answer?.answer) throw new Error('No answer was returned. Please try again.');
      if (!controller.signal.aborted) setMessages(previous => [...previous.slice(0, -1), { question: text, answer: { ...answer, evidenceRefs: result.explanation.status === 'SUCCESS' ? result.explanation.evidenceRefs : answer.evidenceRefs }, status: result.explanation.status, fallbackReason: result.explanation.status === 'FALLBACK' ? result.explanation.reason : undefined }]);
    } catch (error) {
      if (!controller.signal.aborted) setMessages(previous => [...previous.slice(0, -1), { question: text, error: error instanceof Error ? error.message : 'Unable to load an answer. Please try again.' }]);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return <div className="workspace-brain">
    <div className="workspace-brain-context"><span className="workspace-brain-workspace"><Icon name="inventory" />{principal?.workspaceName || 'Current workspace'}</span>{selectedContext && <span className="text-xs text-primary">Selected {selectedContext.type.toLowerCase()} · {selectedContext.id}<Button size="small" variant="soft" className="ml-2" onClick={() => setSelectedContext(null)}>Clear</Button></span>}<span className="workspace-brain-readonly"><Icon name="lock" />Read only</span></div>
    <div className={`workspace-brain-history${messages.length ? '' : ' is-empty'}`} role="log" aria-label="Production questions and answers" aria-live="polite">
      {!messages.length && <div className="workspace-brain-welcome"><span className="workspace-brain-avatar workspace-brain-avatar-lg"><Icon name="spark" /></span><h3>Your workspace, in focus.</h3><p className="muted">Explore orders, inventory and production resources using your workspace records.</p><div className="workspace-brain-prompts">{prompts.map(prompt => <button type="button" key={prompt.text} className="workspace-brain-prompt" disabled={!principal || pending} onClick={() => void ask(prompt.text)}><span className="workspace-brain-prompt-icon"><Icon name={prompt.icon} /></span><span className="workspace-brain-prompt-hint">{prompt.hint}</span><span className="workspace-brain-prompt-text">{prompt.text}</span></button>)}</div></div>}
      {messages.map((message, index) => <section className="workspace-brain-exchange" key={index}>
        <div className="workspace-brain-user"><span className="workspace-brain-speaker">You</span><p className="workspace-brain-question">{message.question}</p></div>
        {message.context && <p className="small muted">Context used: {message.context.type.toLowerCase()} {message.context.id}</p>}
        {message.answer && <div className="workspace-brain-answer"><div className="workspace-brain-answer-heading"><span className="workspace-brain-avatar"><Icon name="spark" /></span><strong>ManuOS</strong><span className="workspace-brain-answer-kind">{message.status === 'SUCCESS' ? 'AI answer' : 'Record summary'}</span></div><AnswerText text={message.answer.answer} />{message.status === 'FALLBACK' && <p className="small muted">{message.fallbackReason === 'TIMEOUT' ? 'AI took too long to respond.' : message.fallbackReason === 'SCHEMA_ERROR' || message.fallbackReason === 'UNGROUNDED_CLAIM' ? 'The AI response could not be verified.' : 'The AI service could not return an answer.'} Showing a summary from your workspace records.</p>}{message.answer.evidenceRefs.length > 0 && <div className="workspace-brain-sources"><h4>Sources</h4><ul className="workspace-brain-evidence" aria-label="Referenced records">{message.answer.evidenceRefs.map((reference, i) => { const evidence = message.answer?.evidence?.find(item => item.reference === reference); return <li key={`${reference}:${i}`}>{evidence ? <Link key={`${evidence.recordType}:${evidence.recordId}:${i}`} className="workspace-brain-source-link" href={evidence.href}><span>{evidence.label}</span><Icon name="arrow" /></Link> : <Badge key={`${reference}:${i}`} variant="default">{reference}</Badge>}</li>; })}</ul></div>}</div>}
        {message.error && <div role="alert"><p>{message.error}</p><Button size="small" disabled={pending} onClick={() => void ask(message.question)}>Try again</Button></div>}
      </section>)}
      {pending && <div role="status" className="workspace-brain-loading"><Icon name="spark" /><span>Checking workspace records…</span></div>}<div ref={end} />
    </div>
    <form className="workspace-brain-composer" onSubmit={event => { event.preventDefault(); void ask(question); }}>
      <div className="workspace-brain-input-wrap">
        <label className="sr-only" htmlFor="workspace-brain-question">Ask a production question</label>
        <Textarea id="workspace-brain-question" value={question} maxLength={2000} rows={2} placeholder="Ask a follow-up or explore your workspace…" onChange={event => setQuestion(event.target.value)} />
        <div className="workspace-brain-actions"><span className="small muted">Orders, inventory & production</span><Button type="submit" variant="primary" icon="arrow" aria-label="Send question" disabled={!principal || pending || !question.trim()}>{pending ? 'Checking…' : 'Send'}</Button></div>
      </div>
      <p className="workspace-brain-disclaimer">Answers use accessible records. Review details before making decisions.</p>
    </form>
  </div>;
}
