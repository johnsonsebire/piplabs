import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Bot, User, Code2, Save, Play, Loader2, MessageSquare, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@clerk/react";
import ReactMarkdown from "react-markdown";
import { useSearch, useLocation } from "wouter";
import { swalSuccess, swalError } from "@/lib/swal";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export default function AIBuilderPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(search);
  const activeChatId = searchParams.get("chat");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [finalStrategy, setFinalStrategy] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch conversations
  const { data: conversations = [], refetch: refetchConvos } = useQuery({
    queryKey: ["ai-conversations"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/conversations", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json();
    }
  });

  // Fetch messages for active chat
  useEffect(() => {
    async function loadMessages() {
      if (!activeChatId) {
        setMessages([]);
        setFinalStrategy(null);
        return;
      }
      const token = await getToken();
      const res = await fetch(`/api/conversations/${activeChatId}/messages`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.map((m: any) => ({ role: m.role, content: m.content })));
      }
    }
    loadMessages();
  }, [activeChatId, getToken]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const startNewChat = () => {
    setLocation(location);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const userMsg = input.trim();
    setInput("");
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setIsGenerating(true);
    setFinalStrategy(null);

    try {
      const token = await getToken();
      const response = await fetch("/api/ai/strategy/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: newMessages, conversationId: activeChatId || undefined }),
      });

      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = "";
      
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        
        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.substring(6);
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (currentEvent === "conversation_id") {
                if (!activeChatId && data.id) {
                  setLocation(`${location}?chat=${data.id}`);
                  refetchConvos();
                }
              } else if (currentEvent === "message") {
                assistantMsg += data.delta;
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1].content = assistantMsg;
                  return copy;
                });
              } else if (currentEvent === "final_strategy") {
                setFinalStrategy(data);
              } else if (currentEvent === "error") {
                assistantMsg += `\n\n❌ Error: ${data.message}`;
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1].content = assistantMsg;
                  return copy;
                });
              }
            } catch (e) {
              console.error("Failed to parse SSE data", dataStr);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error connecting to the server." }]);
    } finally {
      setIsGenerating(false);
      refetchConvos();
    }
  };

  const saveStrategy = async () => {
    if (!finalStrategy) return;
    try {
      const token = await getToken();
      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: finalStrategy.name,
          description: finalStrategy.description,
          type: finalStrategy.type,
          code: finalStrategy.code,
          isPublic: false
        }),
      });
      if (res.ok) {
        swalSuccess("Strategy saved successfully!", "You can find it in the Strategies page.");
        queryClient.invalidateQueries({ queryKey: ["strategies"] });
      } else {
        const err = await res.json();
        swalError("Failed to save", err.error);
      }
    } catch (e) {
      console.error(e);
      swalError("Error", "Error saving strategy.");
    }
  };

  return (
    <AppLayout>
      {/*
        Root wrapper: explicit height = viewport minus the 3rem fixed header.
        This bypasses Bootstrap's min-vh-100 / flex:1 ambiguity so every
        child panel stretches to the full remaining viewport height.
      */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          height: 'calc(100vh - 3rem)',
          overflow: 'hidden',
        }}
      >
        {/* ── Sidebar ─────────────────────────────────────────── */}
        <div
          style={{
            width: isSidebarOpen ? '280px' : '0px',
            minWidth: isSidebarOpen ? '280px' : '0px',
            maxWidth: isSidebarOpen ? '280px' : '0px',
            height: '100%',
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--bs-border-color)',
            transition: 'width 0.2s ease, min-width 0.2s ease, max-width 0.2s ease',
            backgroundColor: 'var(--bs-card-bg)',
          }}
        >
          {/* Sidebar header */}
          <div
            style={{
              padding: '0.75rem 1rem',
              borderBottom: '1px solid var(--bs-border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <h2 className="font-mono text-uppercase fw-bold mb-0" style={{ fontSize: '0.6875rem', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
              Conversations
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setIsSidebarOpen(false)} className="rounded-none px-2 text-secondary" style={{ flexShrink: 0 }}>
              <ChevronLeft size={16} />
            </Button>
          </div>

          {/* New chat button */}
          <div style={{ padding: '0.75rem', flexShrink: 0, borderBottom: '1px solid var(--bs-border-color)' }}>
            <Button
              onClick={startNewChat}
              variant="outline"
              className="w-100 rounded-none font-mono small d-flex align-items-center gap-2"
            >
              <Plus size={14} /> New Chat
            </Button>
          </div>

          {/* Conversation list — scrollable */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {conversations.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setLocation(`${location}?chat=${c.id}`)}
                title={c.title}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: 'calc(100% - 1.5rem)',
                  margin: '0.75rem',
                  minWidth: 0,
                  padding: '0.625rem 0.75rem',
                  border: '1px solid var(--bs-border-color)',
                  borderRadius: '0.25rem',
                  borderLeft: activeChatId === String(c.id) ? '3px solid #10b981' : '1px solid var(--bs-border-color)',
                  backgroundColor: activeChatId === String(c.id) ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                  color: activeChatId === String(c.id) ? '#10b981' : '#94a3b8',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontFamily: "'Space Mono', monospace",
                  fontSize: '0.6875rem',
                  textAlign: 'left',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => {
                  if (activeChatId !== String(c.id)) {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = '#e2e8f0';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeChatId !== String(c.id)) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#94a3b8';
                  }
                }}
              >
                <MessageSquare size={14} style={{ flexShrink: 0 }} />
                <span
                  style={{
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  {c.title}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Main Content ─────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: '1rem 1rem 1rem 1rem',
            gap: '1rem',
          }}
        >
          {/* Page title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            {!isSidebarOpen && (
              <Button
                variant="outline"
                size="icon"
                className="rounded-none"
                style={{ flexShrink: 0 }}
                onClick={() => setIsSidebarOpen(true)}
              >
                <ChevronRight size={16} />
              </Button>
            )}
            <h1 className="fw-bold font-mono text-uppercase mb-0 d-flex align-items-center gap-2" style={{ fontSize: '1rem', letterSpacing: '0.05em' }}>
              <Bot className="text-primary" size={20} /> AI Strategy Builder
            </h1>
          </div>

          {/* ── Two-column panel row ────────────────────────────── */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'row',
              gap: '1rem',
              overflow: 'hidden',
            }}
          >
            {/* Chat Panel — fixed width via calc, internal scroll only */}
            <div
              style={{
                width: 'calc(100% - 350px - 1rem)',
                height: '100%',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: '1px solid var(--bs-border-color)',
                backgroundColor: 'var(--bs-card-bg)',
              }}
            >
              {/* Chat header */}
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid var(--bs-border-color)',
                  flexShrink: 0,
                }}
              >
                <span className="font-mono text-uppercase fw-bold" style={{ fontSize: '0.6875rem', letterSpacing: '0.08em' }}>
                  Chat with Agent
                </span>
              </div>

              {/* Chat messages — this is the ONLY scroll zone */}
              <div
                ref={scrollRef}
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'scroll',
                  overflowX: 'hidden',
                  padding: '1rem',
                }}
              >
                {messages.length === 0 ? (
                  <div
                    style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      opacity: 0.5,
                      gap: '0.75rem',
                    }}
                  >
                    <Bot size={48} />
                    <p className="font-mono small text-uppercase text-secondary mb-0">
                      Describe your trading strategy.<br />
                      You can ask me to build, backtest, and optimize it.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem', textAlign: 'left' }}>
                      <p className="font-mono mb-0" style={{ fontSize: '11px' }}>💡 "Create an RSI mean reversion strategy on Volatility 100."</p>
                      <p className="font-mono mb-0" style={{ fontSize: '11px' }}>💡 "Build a MACD crossover strategy, backtest it on R_50 for 3 days, and optimize it."</p>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          gap: '0.75rem',
                          flexDirection: msg.role === "user" ? "row-reverse" : "row",
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            backgroundColor: msg.role === "user" ? '#10b981' : '#1e293b',
                            color: '#fff',
                          }}
                        >
                          {msg.role === "user" ? <User size={18} /> : <Bot size={18} />}
                        </div>
                        <div
                          className="font-mono small"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            maxWidth: '80%',
                            padding: '0.75rem',
                            border: msg.role === "user" ? '1px solid rgba(16,185,129,0.4)' : '1px solid var(--bs-border-color)',
                            backgroundColor: msg.role === "user" ? 'rgba(16,185,129,0.05)' : 'var(--bs-body-bg)',
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word',
                          }}
                        >
                          <ReactMarkdown
                            components={{
                              p: ({node, ...props}) => <p className="mb-2 last:mb-0" style={{ margin: 0, marginBottom: '0.5rem' }} {...props} />,
                              h1: ({node, ...props}) => <h1 className="h5 fw-bold mt-3 mb-2" {...props} />,
                              h2: ({node, ...props}) => <h2 className="h6 fw-bold mt-3 mb-2" {...props} />,
                              h3: ({node, ...props}) => <h3 className="fw-bold mt-2 mb-1 text-uppercase" style={{fontSize: '11px'}} {...props} />,
                              ul: ({node, ...props}) => <ul className="ps-4 mb-2" {...props} />,
                              li: ({node, ...props}) => <li className="mb-1" {...props} />,
                              strong: ({node, ...props}) => <strong className="fw-bold text-primary" {...props} />,
                              pre: ({node, ...props}) => <pre className="mb-2 p-2 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.3)', overflowX: 'auto', maxWidth: '100%', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} {...props} />,
                              code: ({node, inline, ...props}: any) => inline ? <code style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', backgroundColor: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '4px' }} {...props} /> : <code {...props} />
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ))}
                    {isGenerating && (
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', color: '#94a3b8' }}>
                        <Loader2 className="animate-spin" size={18} />
                        <span className="font-mono small text-uppercase">Agent is thinking...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Chat input — pinned to bottom of chat panel */}
              <div
                style={{
                  padding: '0.75rem',
                  borderTop: '1px solid var(--bs-border-color)',
                  flexShrink: 0,
                  backgroundColor: 'var(--bs-card-bg)',
                }}
              >
                <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
                  <Input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Describe your strategy or optimization goals..."
                    className="font-mono rounded-none border-secondary"
                    disabled={isGenerating}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <Button type="submit" disabled={isGenerating || !input.trim()} className="rounded-none px-4" style={{ flexShrink: 0 }}>
                    <Send size={18} />
                  </Button>
                </form>
              </div>
            </div>

            {/* Strategy Panel — fixed width, flex column, internal scroll only */}
            <div
              style={{
                width: '350px',
                height: '100%',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: '1px solid var(--bs-border-color)',
                backgroundColor: 'var(--bs-card-bg)',
              }}
            >
              {/* Strategy header */}
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid var(--bs-border-color)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span className="font-mono text-uppercase fw-bold d-flex align-items-center gap-2" style={{ fontSize: '0.6875rem', letterSpacing: '0.08em' }}>
                  <Code2 size={16} /> Final Strategy
                </span>
                {finalStrategy && (
                  <Button onClick={saveStrategy} size="sm" className="rounded-none font-mono text-uppercase" style={{ fontSize: '10px', height: '2rem', flexShrink: 0 }}>
                    <Save size={14} className="me-1" /> Save
                  </Button>
                )}
              </div>

              {/* Strategy body — scrollable */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                }}
              >
                {finalStrategy ? (
                  <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <h3 className="font-mono fw-bold text-success mb-0" style={{ fontSize: '0.875rem' }}>{finalStrategy.name}</h3>
                      <p className="font-mono small text-secondary text-uppercase mt-1 mb-0">{finalStrategy.type}</p>
                    </div>
                    <div style={{ padding: '0.75rem', border: '1px solid var(--bs-border-color)', backgroundColor: 'rgba(30,41,59,0.3)' }}>
                      <p className="font-mono small mb-0">{finalStrategy.description}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span className="font-mono text-secondary text-uppercase" style={{ fontSize: '11px' }}>Raw Configuration (JSON)</span>
                      <pre
                        className="font-mono text-success mb-0"
                        style={{
                          fontSize: '11px',
                          padding: '0.75rem',
                          backgroundColor: '#000',
                          border: '1px solid var(--bs-border-color)',
                          overflowX: 'auto',
                          margin: 0,
                        }}
                      >
                        {JSON.stringify(JSON.parse(finalStrategy.code), null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      opacity: 0.5,
                      padding: '1rem',
                    }}
                  >
                    <Play size={48} className="mb-3" />
                    <p className="font-mono small text-uppercase mb-0">No strategy generated yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
