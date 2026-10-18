 'use client';
import { useState, useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useGraphStore } from '@/store/graph-store';
import { useUiStore } from '@/store/ui-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/icons';
import { answerDemoQuestion, type DemoAnswer } from './demo-intelligence';

type Message = DemoAnswer & { id: number; question: string };
const useDemoChat = create<{ messages: Message[]; add: (message: Omit<Message, 'id'>) => void; clear: () => void }>(set => ({ messages: [], add: message => set(state => ({ messages: [...state.messages, { ...message, id: state.messages.length }] })), clear: () => set({ messages: [] }) }));
const prompts = ['Which orders need attention?', 'What materials are in stock?', 'What work can keep running?', 'Which technicians are certified?'];

export function DemoAskAI() {
  const [question, setQuestion] = useState<string>(useUiStore.getState().modalData?.question ?? '');
  const { messages, add, clear } = useDemoChat();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages]);
  const close = useUiStore(s => s.closeModal);
  const ask = (text: string) => {
    if (!text.trim()) return;
    // Read at send time so disruption/reset changes appear in the next answer.
    const result = answerDemoQuestion(text, useGraphStore.getState());
    add({ ...result, question: text.trim() });
    setQuestion('');
  };
  return <div className="demo-chat">
    <div className="demo-chat-status"><span><Icon name="shield" /> Demo records · read only</span><Button variant="text" size="small" onClick={clear}>Clear chat</Button></div>
    <div className="demo-chat-messages" role="log" aria-label="Demo conversation" aria-live="polite">
      {!messages.length && <div className="demo-chat-welcome"><Icon name="spark" /><h3>What would you like to understand?</h3><p>Ask about the sample factory. Answers use the current demo state and link to their sources.</p></div>}
      {messages.map(message => <article className="demo-chat-turn" key={message.id}>
        <h3>{message.question}</h3><div className="demo-chat-answer"><strong><Icon name="spark" /> CoreAI</strong><p>{message.answer}</p>
          {message.sources.length > 0 && <details className="demo-chat-sources"><summary>View {message.sources.length} sources</summary><div>{message.sources.map(source => <button key={source.screen + source.id} type="button" onClick={() => { useGraphStore.getState().setScreen(source.screen); close(); useUiStore.getState().openModal('demo-source', source); }}><Icon name="arrow" />{source.label}</button>)}</div></details>}
        </div>
      </article>)}
      <div ref={endRef} />
    </div>
    <div className="demo-chat-footer">
      <details className="demo-chat-suggestions" open={messages.length === 0}>
        <summary>Suggested questions</summary>
        <div className="demo-chat-prompts">{prompts.map(prompt => <button key={prompt} type="button" onClick={() => ask(prompt)}>{prompt}</button>)}</div>
      </details>
      <form className="demo-chat-compose" onSubmit={event => { event.preventDefault(); ask(question); }}><label className="sr-only" htmlFor="demo-question">Ask about demo records</label><Input id="demo-question" autoFocus value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about your demo workspace…" /><Button type="submit" variant="primary" disabled={!question.trim()} icon="arrow" aria-label="Send question" /></form>
      <p className="demo-chat-disclaimer">Sample data · deterministic answers · no operational changes</p>
    </div>
  </div>;
}
