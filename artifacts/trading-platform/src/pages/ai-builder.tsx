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
      <div className="d-flex flex-grow-1 w-100 overflow-hidden" style={{ maxWidth: '1600px', margin: '0 auto' }}>
        
        {/* Sidebar */}
        <div 
          className={`d-flex flex-column border-end border-secondary transition-all overflow-hidden ${isSidebarOpen ? "w-25 min-w-250px" : "w-0"}`}
          style={{ width: isSidebarOpen ? '300px' : '0px', flexShrink: 0 }}
        >
          <div className="p-3 border-bottom border-secondary d-flex align-items-center justify-content-between">
            <h2 className="h6 mb-0 font-mono text-uppercase fw-bold text-nowrap">Conversations</h2>
            <Button variant="ghost" size="sm" onClick={() => setIsSidebarOpen(false)} className="rounded-none px-2 text-secondary">
              <ChevronLeft size={16} />
            </Button>
          </div>
          <div className="p-3">
            <Button onClick={startNewChat} variant="outline" className="w-100 rounded-none font-mono small d-flex align-items-center gap-2">
              <Plus size={14} /> New Chat
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="d-flex flex-column">
              {conversations.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setLocation(`${location}?chat=${c.id}`)}
                  className={`w-100 text-start p-3 border-bottom border-secondary/50 font-mono small text-truncate transition-colors ${activeChatId === String(c.id) ? "bg-primary/10 text-primary" : "hover:bg-secondary/10 text-secondary"}`}
                  title={c.title}
                >
                  <div className="d-flex align-items-center gap-2 text-truncate">
                    <MessageSquare size={14} className="flex-shrink-0" />
                    <span className="text-truncate">{c.title}</span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content Area */}
        <div className="d-flex flex-column flex-grow-1 w-100 overflow-hidden p-4 gap-4 position-relative">
          {!isSidebarOpen && (
            <Button 
              variant="outline" 
              size="icon" 
              className="position-absolute rounded-none z-10 bg-background" 
              style={{ top: '1rem', left: '1rem' }}
              onClick={() => setIsSidebarOpen(true)}
            >
              <ChevronRight size={16} />
            </Button>
          )}

          <div className={`d-flex align-items-center flex-shrink-0 mt-2 ${!isSidebarOpen ? 'ms-5' : ''}`}>
            <h1 className="h4 fw-bold font-mono text-uppercase tracking-tight d-flex align-items-center gap-2">
              <Bot className="text-primary" /> AI Strategy Generator
            </h1>
          </div>

          <div className="d-flex flex-1 gap-4 overflow-hidden">
          {/* Chat Panel */}
          <Card className="flex-1 d-flex flex-column rounded-none border-secondary" style={{ minWidth: 0 }}>
            <CardHeader className="border-bottom border-secondary p-3 flex-shrink-0">
              <CardTitle className="text-uppercase font-mono small">Chat with Agent</CardTitle>
            </CardHeader>
            <CardContent className="p-0 d-flex flex-column h-100 overflow-hidden">
              <ScrollArea className="flex-1 p-4 overflow-y-auto" ref={scrollRef}>
                {messages.length === 0 ? (
                  <div className="h-100 d-flex flex-column align-items-center justify-content-center text-center text-secondary gap-3 opacity-50 p-4">
                    <Bot size={48} />
                    <p className="font-mono small text-uppercase">
                      Describe your trading strategy.<br/>
                      You can ask me to build, backtest, and optimize it.
                    </p>
                    <div className="d-flex flex-column gap-2 mt-4 text-start">
                      <p className="font-mono" style={{fontSize: '11px'}}>💡 "Create an RSI mean reversion strategy on Volatility 100."</p>
                      <p className="font-mono" style={{fontSize: '11px'}}>💡 "Build a MACD crossover strategy, backtest it on R_50 for 3 days, and optimize it."</p>
                    </div>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-4">
                    {messages.map((msg, i) => (
                      <div key={i} className={`d-flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                        <div className={`rounded-circle p-2 d-flex align-items-center justify-content-center flex-shrink-0 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`} style={{width: 36, height: 36}}>
                          {msg.role === "user" ? <User size={18} /> : <Bot size={18} />}
                        </div>
                        <div className={`p-3 border font-mono small flex-1 ${msg.role === "user" ? "border-primary/50 bg-primary/5 text-end" : "border-secondary bg-background markdown-body"}`} style={{ maxWidth: '80%', minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                          <ReactMarkdown
                            components={{
                              p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                              h1: ({node, ...props}) => <h1 className="h5 fw-bold mt-3 mb-2" {...props} />,
                              h2: ({node, ...props}) => <h2 className="h6 fw-bold mt-3 mb-2" {...props} />,
                              h3: ({node, ...props}) => <h3 className="fw-bold mt-2 mb-1 text-uppercase" style={{fontSize: '11px'}} {...props} />,
                              ul: ({node, ...props}) => <ul className="ps-4 mb-2" {...props} />,
                              li: ({node, ...props}) => <li className="mb-1" {...props} />,
                              strong: ({node, ...props}) => <strong className="fw-bold text-primary" {...props} />
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ))}
                    {isGenerating && (
                      <div className="d-flex gap-3 flex-row text-secondary align-items-center">
                        <Loader2 className="animate-spin" size={18} />
                        <span className="font-mono small text-uppercase">Agent is thinking...</span>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
              
              <div className="p-3 border-top border-secondary flex-shrink-0">
                <form onSubmit={handleSubmit} className="d-flex gap-2">
                  <Input 
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Describe your strategy or optimization goals..."
                    className="font-mono rounded-none border-secondary"
                    disabled={isGenerating}
                  />
                  <Button type="submit" disabled={isGenerating || !input.trim()} className="rounded-none px-4">
                    <Send size={18} />
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>

          {/* Result Panel */}
          <Card className="flex-1 d-flex flex-column rounded-none border-secondary" style={{ minWidth: 0 }}>
            <CardHeader className="border-bottom border-secondary p-3 flex-shrink-0 d-flex flex-row justify-content-between align-items-center">
              <CardTitle className="text-uppercase font-mono small d-flex align-items-center gap-2">
                <Code2 size={18} /> Final Strategy
              </CardTitle>
              {finalStrategy && (
                <Button onClick={saveStrategy} size="sm" className="rounded-none h-8 font-mono text-uppercase" style={{fontSize: '10px'}}>
                  <Save size={14} className="me-2" /> Save
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0 h-100 overflow-hidden d-flex flex-column">
              {finalStrategy ? (
                <div className="p-4 d-flex flex-column gap-4 overflow-y-auto h-100">
                  <div>
                    <h3 className="h5 fw-bold text-success font-mono m-0">{finalStrategy.name}</h3>
                    <p className="text-secondary font-mono small mt-1 text-uppercase">{finalStrategy.type}</p>
                  </div>
                  
                  <div className="p-3 border border-secondary/50 bg-secondary/5">
                    <p className="font-mono small m-0">{finalStrategy.description}</p>
                  </div>

                  <div className="d-flex flex-column gap-2 mt-2">
                    <span className="text-uppercase font-mono text-secondary" style={{fontSize: '11px'}}>Raw Configuration (JSON)</span>
                    <pre className="p-3 border border-secondary bg-black text-success font-mono w-100 overflow-auto" style={{fontSize: '11px', maxHeight: '400px'}}>
                      {JSON.stringify(JSON.parse(finalStrategy.code), null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="h-100 d-flex flex-column align-items-center justify-content-center text-center text-secondary opacity-50 p-4">
                  <Play size={48} className="mb-3" />
                  <p className="font-mono small text-uppercase">No strategy generated yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
    </AppLayout>
  );
}
