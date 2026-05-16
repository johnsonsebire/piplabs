import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetMarketNews, GetMarketNewsCategory } from "@workspace/api-client-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";

export default function NewsPage() {
  const [category, setCategory] = useState<GetMarketNewsCategory | "all">("all");
  
  const { data: newsItems, isLoading } = useGetMarketNews({
    category: category === "all" ? undefined : category,
    limit: 30
  });

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden max-w-5xl mx-auto p-6 gap-6">
        <div className="shrink-0 space-y-4">
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight text-foreground">Market Feed</h1>
          
          <Tabs value={category} onValueChange={(v) => setCategory(v as any)} className="w-full">
            <TabsList className="rounded-none bg-transparent border-b border-border w-full justify-start h-10 p-0">
              <TabsTrigger value="all" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/5 text-xs font-mono uppercase h-full shadow-none">ALL</TabsTrigger>
              <TabsTrigger value={GetMarketNewsCategory.forex} className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/5 text-xs font-mono uppercase h-full shadow-none">FOREX</TabsTrigger>
              <TabsTrigger value={GetMarketNewsCategory.crypto} className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/5 text-xs font-mono uppercase h-full shadow-none">CRYPTO</TabsTrigger>
              <TabsTrigger value={GetMarketNewsCategory.stocks} className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/5 text-xs font-mono uppercase h-full shadow-none">STOCKS</TabsTrigger>
              <TabsTrigger value={GetMarketNewsCategory.general} className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/5 text-xs font-mono uppercase h-full shadow-none">GENERAL</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          {isLoading ? (
            <div className="text-center text-muted-foreground font-mono uppercase mt-10">Fetching feeds...</div>
          ) : newsItems?.length === 0 ? (
            <div className="text-center text-muted-foreground font-mono uppercase mt-10">No feed data available</div>
          ) : (
            <div className="space-y-4">
              {newsItems?.map((item) => (
                <a 
                  key={item.id} 
                  href={item.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block border border-border bg-card p-5 hover:border-primary/50 transition-colors group"
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] font-mono uppercase text-muted-foreground bg-muted px-2 py-0.5">{item.source}</span>
                    <div className="flex items-center gap-3 text-[10px] font-mono uppercase">
                      {item.sentiment && (
                        <span className={`px-2 py-0.5 ${item.sentiment === 'positive' ? 'text-primary bg-primary/10' : item.sentiment === 'negative' ? 'text-destructive bg-destructive/10' : 'text-foreground bg-muted'}`}>
                          {item.sentiment}
                        </span>
                      )}
                      <span className="text-muted-foreground">{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}</span>
                    </div>
                  </div>
                  
                  <h3 className="text-lg font-bold text-foreground mb-2 group-hover:text-primary transition-colors">{item.title}</h3>
                  <p className="text-sm text-muted-foreground font-mono line-clamp-2">{item.summary}</p>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}