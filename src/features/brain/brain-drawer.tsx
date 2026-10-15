"use client";

import React, { useState, useRef, useEffect } from "react";
import { useGraphStore } from "../../store/graph-store";
import { Icon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { SCREENS, ScreenType } from "../../lib/navigation";

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  evidenceRefs?: string[];
  linkToScreen?: string;
  timestamp: string;
}

const STARTER_PROMPTS = [
  "Which orders need attention and why?",
  "What work can keep running despite the disruption?",
  "What changed in the approved recovery plan?",
  "What is the current 5-axis CNC utilization?",
  "What raw materials are available in stock?",
  "Who is certified to operate on Shift A?",
];

export function BrainDrawer() {
  const store = useGraphStore();
  const { disruption, activeRecovery, setScreen, closeModal, orders } = store;

  const isDelayed = disruption.isDelayed;
  const isApproved = activeRecovery?.status === "APPLIED";

  const [inputQuery, setInputQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-welcome",
      sender: "assistant",
      text: "Hello Alex. I am ManuOS Operational Brain, grounded in real-time shop-floor state, machine telemetry, and order routing for Precision Works. How can I assist your operations today?",
      timestamp: "Just now",
    },
  ]);

  const messagesListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [isWrapView, setIsWrapView] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      if (messagesListRef.current) {
        messagesListRef.current.scrollTo({
          top: messagesListRef.current.scrollHeight,
          behavior,
        });
      }
    });
  };

  const updateScrollState = () => {
    const el = suggestionsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  };

  useEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState);
    return () => window.removeEventListener('resize', updateScrollState);
  }, []);

  const handleScrollCarousel = (direction: 'left' | 'right') => {
    const el = suggestionsRef.current;
    if (!el) return;
    const distance = 260;
    el.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    // Focus input on mount
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 120);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const isInitial = messages.length <= 1;
    scrollToBottom(isInitial ? 'auto' : 'smooth');
  }, [messages, loading]);

  const handleSend = async (queryText?: string) => {
    const q = (queryText || inputQuery).trim();
    if (!q || loading) return;

    const userMsgId = `user-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: q,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/brain-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          snapshot: {
            delayed: isDelayed,
            approved: isApproved,
            delayedMaterial: "TB-24",
            blockedTasks: disruption.blockedTaskIds,
            affectedOrders: disruption.affectedOrderIds,
            activeOrdersCount: orders.length,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.aiResult?.answer) {
          const aiMessage: ChatMessage = {
            id: `ai-${Date.now()}`,
            sender: "assistant",
            text: data.aiResult.answer,
            evidenceRefs: data.aiResult.evidenceRefs || [],
            linkToScreen: data.aiResult.linkToScreen,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          };
          setMessages((prev) => [...prev, aiMessage]);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fallback
    }

    // Default resilient response if fetch errors
    const fallbackMessage: ChatMessage = {
      id: `ai-err-${Date.now()}`,
      sender: "assistant",
      text: isDelayed
        ? "Factory telemetry indicates Order #CO-2026-1042 is delayed by 3 days due to Terminal Block TB-24 supplier postponement. 5-Axis CNC machining continues normally while electrical assembly tasks are held."
        : "All 6 manufacturing orders are tracking normally across Shift A. Machine capacity on 5-Axis CNC CNC-02 is at 91%.",
      evidenceRefs: ["#CO-2026-1042", "TB-24", "CNC-02"],
      linkToScreen: "orchestrator",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, fallbackMessage]);
    setLoading(false);
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: "msg-welcome",
        sender: "assistant",
        text: "Chat history cleared. I am ready for your operational questions.",
        timestamp: "Just now",
      },
    ]);
  };

  const getScreenTitle = (screenId?: string) => {
    const s = SCREENS.find((sc) => sc.id === screenId);
    return s ? s.title : "Workspace";
  };

  return (
    <div className="brain-chat-container">
      {/* Context Bar */}
      <div className="brain-status-bar">
        <div className="flex items-center gap-2">
          <span className="live-indicator">
            <span className={`dot ${isDelayed ? "warning" : ""}`} />
            <span>Precision Works</span>
          </span>
          <span className="topbar-rule" style={{ height: 14 }} />
          <span className="small muted">
            {isDelayed ? "1 Delay Disruption Active" : "All 6 Orders Normal"}
          </span>
        </div>

        <button
          type="button"
          className="text-btn small"
          onClick={handleResetChat}
          title="Clear conversation"
        >
          Reset chat
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="brain-messages-list" ref={messagesListRef}>
        {messages.map((m) => (
          <div
            key={m.id}
            className={`brain-message-row ${m.sender === "user" ? "user-row" : "ai-row"}`}
          >
            {m.sender === "assistant" && (
              <div className="brain-avatar ai-avatar">
                <Icon name="spark" />
              </div>
            )}

            <div
              className={`brain-message-bubble ${m.sender === "user" ? "user-bubble" : "ai-bubble"}`}
            >
              <div className="between mb-1">
                <strong className="text-xs">
                  {m.sender === "user" ? "You (Alex Rahman)" : "ManuOS Copilot"}
                </strong>
                <span className="small muted">{m.timestamp}</span>
              </div>

              <p className="brain-message-text">{m.text}</p>

              {/* Grounded Evidence Chips */}
              {m.evidenceRefs && m.evidenceRefs.length > 0 && (
                <div className="brain-evidence-section mt-2 pt-2 border-t border-(--line) border-line">
                  <span className="small muted block mb-1">
                    Grounded Evidence:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {m.evidenceRefs.map((ref, idx) => (
                      <span key={idx} className="brain-evidence-chip">
                        <Icon
                          name="shield"
                          className="w-3 h-3 text-(--primary)"
                        />
                        <span>{ref}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Button Link to Screen */}
              {m.linkToScreen && (
                <div className="mt-3 pt-2">
                  <Button
                    variant="soft"
                    size="small"
                    iconRight="arrow"
                    onClick={() => {
                      closeModal();
                      setScreen(m.linkToScreen as ScreenType);
                    }}
                  >
                    Open {getScreenTitle(m.linkToScreen)}
                  </Button>
                </div>
              )}
            </div>

            {m.sender === "user" && (
              <div className="brain-avatar user-avatar">
                <span>AR</span>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="brain-message-row ai-row">
            <div className="brain-avatar ai-avatar">
              <Icon name="spark" />
            </div>
            <div className="brain-message-bubble ai-bubble loading-bubble">
              <div className="flex items-center gap-2">
                <span className="dot blue animate-pulse" />
                <span className="text-xs muted">
                  Consulting manufacturing graph & live telemetry…
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Suggested Starter Prompts */}
      <div className="brain-suggestions-wrap">
        <div className="between mb-1.5">
          <span className="small muted font-semibold">
            Suggested Questions
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="carousel-nav-btn"
              onClick={() => handleScrollCarousel('left')}
              disabled={!canScrollLeft || isWrapView}
              aria-label="Scroll left"
              title="Previous questions"
            >
              <Icon name="arrow" className="w-3 h-3 rotate-180" />
            </button>
            <button
              type="button"
              className="carousel-nav-btn"
              onClick={() => handleScrollCarousel('right')}
              disabled={!canScrollRight || isWrapView}
              aria-label="Scroll right"
              title="More questions"
            >
              <Icon name="arrow" className="w-3 h-3" />
            </button>
            <span className="topbar-rule" style={{ height: 12, margin: '0 4px' }} />
            <button
              type="button"
              className="text-btn small"
              onClick={() => setIsWrapView((v) => !v)}
              title={isWrapView ? 'Switch to carousel view' : 'Wrap all questions'}
            >
              {isWrapView ? 'Carousel' : 'Wrap all'}
            </button>
          </div>
        </div>

        <div className="brain-suggestions-track-container">
          {canScrollLeft && !isWrapView && <div className="brain-fade-edge left" />}

          <div
            ref={suggestionsRef}
            className={`brain-suggestions-scroll ${isWrapView ? 'wrap-mode' : ''}`}
            onScroll={updateScrollState}
          >
            {STARTER_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                type="button"
                className="brain-prompt-pill"
                onClick={() => handleSend(prompt)}
                disabled={loading}
              >
                <Icon name="spark" className="w-3 h-3 text-(--primary)" />
                <span>{prompt}</span>
              </button>
            ))}
          </div>

          {canScrollRight && !isWrapView && <div className="brain-fade-edge right" />}
        </div>
      </div>

      {/* Message Input Box */}
      <div className="brain-input-box">
        <div className="brain-input-field">
          <input
            ref={inputRef}
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                handleSend();
              }
            }}
            placeholder="Ask about disruptions, machines, capacity, or dispatch…"
            disabled={loading}
          />
          <button
            type="button"
            className="brain-send-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSend();
            }}
            disabled={!inputQuery.trim() || loading}
            aria-label="Send query"
          >
            <Icon name="arrow" className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="approval-note" style={{ marginTop: 8, paddingTop: 8 }}>
          ManuOS Operational Copilot · Grounded in active Precision Works state.
          Press Enter to send.
        </p>
      </div>
    </div>
  );
}
