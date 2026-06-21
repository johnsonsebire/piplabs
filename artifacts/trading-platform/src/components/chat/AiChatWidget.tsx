import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send, Bot, Paperclip, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAiContext } from "@/hooks/useAiContext";
import { useAuth } from "@clerk/react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";

class MarkdownErrorBoundary extends React.Component<{ children: React.ReactNode, fallback: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("Markdown rendering error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function AiChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [includeContext, setIncludeContext] = useState(true);
  
  const { globalContext } = useAiContext();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Queries & Mutations using basic fetch
  const { data: convos } = useQuery({
    queryKey: ["/api/openai/conversations"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/openai/conversations", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (!res.ok) throw new Error("Failed to load conversations");
      return res.json() as Promise<Array<{ id: number; title: string; createdAt: string }>>;
    }
  });

  const { data: messages } = useQuery({
    queryKey: ["/api/openai/conversations", activeConvId, "messages"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`/api/openai/conversations/${activeConvId}/messages`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json() as Promise<Array<{ id: number; role: string; content: string; createdAt: string }>>;
    },
    enabled: !!activeConvId,
    staleTime: 1000 * 60, // 1 minute to prevent background fetch from overwriting optimistic update
  });

  const createConvo = useMutation({
    mutationFn: async (data: { title: string }) => {
      const token = await getToken();
      const res = await fetch("/api/openai/conversations", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create conversation");
      return res.json() as Promise<{ id: number; title: string }>;
    }
  });

  const sendMsg = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { content: string; contextPayload?: string } }) => {
      const token = await getToken();
      const res = await fetch(`/api/openai/conversations/${id}/messages`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    }
  });

  const hasAutoSelected = useRef(false);
  // Auto-select most recent convo or clear if none
  useEffect(() => {
    if (convos?.length && !activeConvId && !hasAutoSelected.current) {
      // Sort by descending id or createdAt if available
      const latest = [...convos].sort((a, b) => b.id - a.id)[0];
      setActiveConvId(latest.id);
      hasAutoSelected.current = true;
    }
  }, [convos, activeConvId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sendMsg.isPending]);

  const handleSend = async () => {
    if (!input.trim() || sendMsg.isPending) return;

    const messageText = input;
    setInput("");

    let targetConvId = activeConvId;

    // Create new convo if none exists
    if (!targetConvId) {
      try {
        const res = await createConvo.mutateAsync({ title: "New Chat" });
        targetConvId = res.id;
        setActiveConvId(res.id);
        queryClient.invalidateQueries({ queryKey: ["/api/openai/conversations"], exact: true });
      } catch (err) {
        console.error("Failed to create conversation", err);
        return;
      }
    }

    const payloadContext = includeContext && globalContext ? globalContext : undefined;
    const queryKey = ["/api/openai/conversations", targetConvId, "messages"];

    // Optimistically add the user's message to the UI
    queryClient.setQueryData(queryKey, (old: any) => {
      const newMsg = {
        id: Date.now(), // temporary id
        role: "user",
        content: messageText,
        createdAt: new Date().toISOString()
      };
      return old ? [...old, newMsg] : [newMsg];
    });

    try {
      await sendMsg.mutateAsync({
        id: targetConvId,
        data: {
          content: messageText,
          contextPayload: payloadContext,
        }
      });
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      queryClient.invalidateQueries({ queryKey });
    }
  };

  const handleNewChat = () => {
    setActiveConvId(null);
    setInput("");
  };

  return (
    <>
      {/* Floating Button */}
      <Button
        size="icon"
        className="position-fixed rounded-circle shadow-lg p-0 d-flex align-items-center justify-content-center"
        style={{ bottom: "24px", right: "24px", width: "56px", height: "56px", zIndex: 9999 }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bot size={28} />
      </Button>

      {/* Chat Panel */}
      {isOpen && (
        <div 
          className="position-fixed shadow-2xl border border-secondary rounded-lg d-flex flex-column bg-background overflow-hidden"
          style={{ 
            bottom: "90px", 
            right: "24px", 
            width: "380px", 
            height: "600px",
            maxHeight: "calc(100vh - 120px)",
            zIndex: 9999
          }}
        >
          {/* Header */}
          <div className="d-flex align-items-center justify-content-between p-3 border-bottom border-secondary bg-muted/30">
            <div className="d-flex align-items-center gap-2">
              <Bot className="text-primary" size={20} />
              <h3 className="m-0 font-weight-semibold text-sm">PipLabs AI Assistant</h3>
            </div>
            <div className="d-flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNewChat} title="New Chat">
                <Plus size={16} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsOpen(false)}>
                <X size={16} />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-grow-1 overflow-auto p-3 d-flex flex-column gap-3" ref={scrollRef}>
            {messages?.length === 0 && !sendMsg.isPending && (
              <div className="text-center text-muted-foreground text-sm mt-4">
                Send a message to start chatting!
              </div>
            )}
            
            {messages?.map((msg) => (
              <div 
                key={msg.id} 
                className={cn(
                  "d-flex flex-column max-w-[85%] rounded-lg p-3 text-sm",
                  msg.role === "user" 
                    ? "bg-primary text-primary-foreground align-self-end rounded-tr-none" 
                    : "bg-muted text-foreground align-self-start rounded-tl-none border border-secondary"
                )}
              >
                <div style={{ wordBreak: "break-word" }}>
                  {msg.role === "user" ? (
                    <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                  ) : (
                    <MarkdownErrorBoundary fallback={<div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>}>
                      <ReactMarkdown
                        components={{
                          p: ({node, ...props}) => <p className="mb-2 last:mb-0" style={{ margin: 0, marginBottom: '0.5rem' }} {...props} />,
                          h1: ({node, ...props}) => <h1 className="h5 fw-bold mt-3 mb-2 text-primary" {...props} />,
                          h2: ({node, ...props}) => <h2 className="h6 fw-bold mt-2 mb-2 text-primary" {...props} />,
                          h3: ({node, ...props}) => <h3 className="fw-bold mt-2 mb-1 text-uppercase text-xs text-primary" {...props} />,
                          ul: ({node, ...props}) => <ul className="ps-4 mb-2 list-disc" {...props} />,
                          ol: ({node, ...props}) => <ol className="ps-4 mb-2 list-decimal" {...props} />,
                          li: ({node, ...props}) => <li className="mb-1" {...props} />,
                          strong: ({node, ...props}) => <strong className="fw-bold text-primary" {...props} />,
                          pre: ({node, ...props}) => <pre className="mb-2 p-2 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.3)', overflowX: 'auto', maxWidth: '100%', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} {...props} />,
                          code: ({node, inline, ...props}: any) => inline ? <code style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', backgroundColor: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '4px' }} {...props} /> : <code {...props} />
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </MarkdownErrorBoundary>
                  )}
                  {msg.createdAt && (
                    <div 
                      className={msg.role === "user" ? "text-right mt-1" : "text-left mt-1"}
                      style={{ fontSize: "9px", opacity: 0.6 }}
                    >
                      {new Date(msg.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sendMsg.isPending && (
              <div className="bg-muted text-foreground align-self-start rounded-lg rounded-tl-none p-3 text-sm border border-secondary">
                <div className="d-flex gap-1 align-items-center">
                  <span className="spinner-grow spinner-grow-sm text-primary" style={{ width: '0.5rem', height: '0.5rem' }} />
                  <span className="spinner-grow spinner-grow-sm text-primary animation-delay-100" style={{ width: '0.5rem', height: '0.5rem' }} />
                  <span className="spinner-grow spinner-grow-sm text-primary animation-delay-200" style={{ width: '0.5rem', height: '0.5rem' }} />
                </div>
              </div>
            )}
          </div>

          {/* Context Banner */}
          {globalContext && (
            <div className="px-3 py-2 bg-muted/50 border-top border-secondary d-flex align-items-center justify-content-between cursor-pointer" onClick={() => setIncludeContext(!includeContext)}>
              <div className="d-flex align-items-center gap-2 text-xs text-muted-foreground">
                <Paperclip size={12} className={includeContext ? "text-primary" : ""} />
                <span>{includeContext ? "Including chart context" : "Context excluded"}</span>
              </div>
              <div className={cn("w-3 h-3 rounded-sm border d-flex align-items-center justify-content-center", includeContext ? "bg-primary border-primary" : "border-secondary")}>
                {includeContext && <Check size={8} className="text-primary-foreground" />}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="p-3 border-top border-secondary bg-card">
            <form 
              className="d-flex gap-2"
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            >
              <Input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the AI..."
                className="flex-grow-1"
                disabled={sendMsg.isPending}
              />
              <Button type="submit" size="icon" disabled={!input.trim() || sendMsg.isPending}>
                <Send size={16} />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
