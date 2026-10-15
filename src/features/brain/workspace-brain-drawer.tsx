'use client';

import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api/client';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Icon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import type { BrainAnswerDTO } from '@/server/ai/brain';
import type { Explanation } from '@/server/ai/validation';

type Message = { question: string; answer?: BrainAnswerDTO; status?: 'SUCCESS' | 'FALLBACK'; fallbackReason?: string; error?: string };
const prompts = ['What is the status of active orders?', 'Summarize inventory balances', 'Give me a production overview'];

export function WorkspaceBrainDrawer() {
  const { principal } = useWorkspaceNavigation();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    request.current?.abort();
    setMessages([]);
    setPending(false);
    setQuestion('');
  }, [principal?.membershipId]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [messages, pending]);

  async function ask(value: string) {
    const text = value.trim();
    if (!text || pending) return;
    const controller = new AbortController();
    request.current = controller;
    setQuestion('');
    setPending(true);
    setMessages(previous => [...previous, { question: text }]);
    try {
      const result = await apiRequest<{ data?: BrainAnswerDTO; explanation: Explanation<BrainAnswerDTO> }>('/api/ai/brain-qa', {
        method: 'POST', body: JSON.stringify({ question: text }), signal: controller.signal,
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
    <div className="workspace-brain-context"><span className="workspace-brain-workspace"><Icon name="inventory" />{principal?.workspaceName || 'Current workspace'}</span><span className="workspace-brain-readonly"><Icon name="lock" />Read only</span></div>
    <div className="workspace-brain-history" role="log" aria-label="Production questions and answers" aria-live="polite">
      {!messages.length && <div className="workspace-brain-welcome"><span className="workspace-brain-avatar"><Icon name="spark" /></span><h3>Your workspace, in focus.</h3><p className="muted">Explore orders, inventory and production resources using your workspace records.</p><div className="workspace-brain-prompts">{prompts.map(prompt => <Button key={prompt} disabled={!principal || pending} onClick={() => void ask(prompt)}>{prompt}</Button>)}</div></div>}
      {messages.map((message, index) => <section className="workspace-brain-exchange" key={index}>
        <div className="workspace-brain-user"><span className="workspace-brain-speaker">You</span><p className="workspace-brain-question">{message.question}</p></div>
        {message.answer && <div className="workspace-brain-answer"><div className="workspace-brain-answer-heading"><span className="workspace-brain-avatar"><Icon name="spark" /></span><strong>ManuOS</strong><span className="workspace-brain-answer-kind">{message.status === 'SUCCESS' ? 'AI answer' : 'Record summary'}</span></div><p>{message.answer.answer}</p>{message.status === 'FALLBACK' && <p className="small muted">{message.fallbackReason === 'TIMEOUT' ? 'AI took too long to respond.' : message.fallbackReason === 'SCHEMA_ERROR' || message.fallbackReason === 'UNGROUNDED_CLAIM' ? 'The AI response could not be verified.' : 'The AI service could not return an answer.'} Showing a summary from your workspace records.</p>}{message.answer.evidenceRefs.length > 0 && <div className="workspace-brain-evidence" aria-label="Referenced records">{message.answer.evidenceRefs.map((reference, i) => <Badge key={i} variant="default">{reference}</Badge>)}</div>}</div>}
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
