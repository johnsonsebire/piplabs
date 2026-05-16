import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { TradingChart } from "@/components/chart/TradingChart";
import { useDerivWs } from "@/hooks/use-deriv-ws";
import { useCreateTrade, TradeInputDirection, TradeInputType, useSearchDerivSymbols, getSearchDerivSymbolsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";

export default function ChartPage() {
  const [symbol, setSymbol] = useState("R_100");
  const { latestTick, isConnected } = useDerivWs(symbol);
  const { toast } = useToast();
  
  const [contractType, setContractType] = useState<TradeInputType>(TradeInputType.vanilla_options);
  const [direction, setDirection] = useState<TradeInputDirection>(TradeInputDirection.call);
  const [stake, setStake] = useState("10");
  const [duration, setDuration] = useState("5");
  const [durationUnit, setDurationUnit] = useState("ticks");
  const [takeProfit, setTakeProfit] = useState("");
  const [aiConfirmed, setAiConfirmed] = useState(false);
  const [tradeMode, setTradeMode] = useState<"demo" | "live">("demo");

  // Search
  const [openSearch, setOpenSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  
  const { data: searchResults } = useSearchDerivSymbols(
    { q: debouncedSearchQuery },
    { query: { enabled: !!debouncedSearchQuery, queryKey: getSearchDerivSymbolsQueryKey({ q: debouncedSearchQuery }) } }
  );

  const createTrade = useCreateTrade();

  const handleExecute = () => {
    createTrade.mutate({
      data: {
        symbol,
        type: contractType,
        direction,
        stake: parseFloat(stake),
        duration: parseInt(duration),
        durationUnit,
        targetProfit: takeProfit ? parseFloat(takeProfit) : null,
        aiConfirmed,
        mode: tradeMode
      }
    }, {
      onSuccess: () => {
        toast({
          title: "TRADE EXECUTED",
          description: `Successfully opened ${direction} on ${symbol}`,
        });
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "EXECUTION FAILED",
          description: err?.message || "Failed to execute trade",
        });
      }
    });
  };

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row h-[calc(100vh-3.5rem)] w-full">
        {/* Main Chart Area */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          <div className="h-12 border-b border-border flex items-center px-4 justify-between bg-card shrink-0">
            <div className="flex items-center gap-4">
              <Popover open={openSearch} onOpenChange={setOpenSearch}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openSearch}
                    className="w-[250px] h-8 rounded-none border-border bg-background font-mono font-bold justify-between"
                  >
                    {symbol}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[250px] p-0 rounded-none border-border">
                  <Command>
                    <CommandInput 
                      placeholder="Search active symbols..." 
                      className="font-mono text-xs" 
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <CommandList>
                      <CommandEmpty className="py-2 text-center text-xs font-mono text-muted-foreground">No symbols found.</CommandEmpty>
                      <CommandGroup>
                        {searchResults?.map((item) => (
                          <CommandItem
                            key={item.symbol}
                            value={item.symbol}
                            onSelect={(currentValue) => {
                              setSymbol(currentValue === symbol ? "" : currentValue);
                              setOpenSearch(false);
                            }}
                            className="font-mono text-xs cursor-pointer"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                symbol === item.symbol ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {item.displayName} ({item.symbol})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-primary animate-pulse' : 'bg-destructive'}`}></div>
                <span className="font-mono text-xs text-muted-foreground uppercase">{isConnected ? 'Live' : 'Disconnected'}</span>
              </div>
            </div>
            
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Current Price</span>
              <span className={`font-mono font-bold text-lg ${latestTick ? 'text-primary' : 'text-muted-foreground'}`}>
                {latestTick ? latestTick.quote.toFixed(4) : '---'}
              </span>
            </div>
          </div>
          
          <div className="flex-1 relative">
            <TradingChart symbol={symbol} height={typeof window !== 'undefined' ? window.innerHeight - 104 : 400} />
          </div>
        </div>

        {/* Order Entry Panel */}
        <div className="w-full md:w-80 bg-card shrink-0 flex flex-col h-full overflow-y-auto">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-foreground">Order Entry</h2>
            <div className="flex items-center gap-2">
              <Label className="text-xs font-mono text-muted-foreground uppercase">Mode:</Label>
              <Tabs value={tradeMode} onValueChange={(v) => setTradeMode(v as "demo" | "live")} className="w-[100px]">
                <TabsList className="grid w-full grid-cols-2 rounded-none h-6 p-0 bg-background border border-border">
                  <TabsTrigger value="demo" className="rounded-none text-[9px] uppercase font-mono data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">DEMO</TabsTrigger>
                  <TabsTrigger value="live" className="rounded-none text-[9px] uppercase font-mono data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground">LIVE</TabsTrigger>
                </TabsList>
              </Tabs>
              {tradeMode === "live" && <span className="flex h-2 w-2 rounded-full bg-destructive animate-pulse ml-1" title="Live Trading Active" />}
            </div>
          </div>
          
          <div className="p-4 space-y-6">
            <div className="space-y-3">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Contract Type</Label>
              <Tabs value={contractType} onValueChange={(v) => setContractType(v as TradeInputType)} className="w-full">
                <TabsList className="grid w-full grid-cols-3 rounded-none h-8 p-0 bg-background border border-border">
                  <TabsTrigger value={TradeInputType.vanilla_options} className="rounded-none text-[10px] uppercase font-mono data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Options</TabsTrigger>
                  <TabsTrigger value={TradeInputType.multiplier} className="rounded-none text-[10px] uppercase font-mono data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Multiplier</TabsTrigger>
                  <TabsTrigger value={TradeInputType.forex} className="rounded-none text-[10px] uppercase font-mono data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Forex</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Direction</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  type="button"
                  variant={direction === TradeInputDirection.call || direction === TradeInputDirection.buy ? "default" : "outline"}
                  className={`rounded-none uppercase font-bold tracking-wider ${direction === TradeInputDirection.call || direction === TradeInputDirection.buy ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'hover:bg-primary/20 hover:text-primary'}`}
                  onClick={() => setDirection(contractType === TradeInputType.multiplier ? TradeInputDirection.buy : TradeInputDirection.call)}
                  data-testid="button-direction-up"
                >
                  {contractType === TradeInputType.multiplier ? 'Buy' : 'Call'}
                </Button>
                <Button 
                  type="button"
                  variant={direction === TradeInputDirection.put || direction === TradeInputDirection.sell ? "destructive" : "outline"}
                  className={`rounded-none uppercase font-bold tracking-wider ${direction === TradeInputDirection.put || direction === TradeInputDirection.sell ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : 'hover:bg-destructive/20 hover:text-destructive'}`}
                  onClick={() => setDirection(contractType === TradeInputType.multiplier ? TradeInputDirection.sell : TradeInputDirection.put)}
                  data-testid="button-direction-down"
                >
                  {contractType === TradeInputType.multiplier ? 'Sell' : 'Put'}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Stake (USD)</Label>
              <Input 
                type="number" 
                value={stake} 
                onChange={(e) => setStake(e.target.value)}
                className="rounded-none font-mono text-lg h-10 border-border bg-background"
                data-testid="input-stake"
              />
            </div>

            {contractType !== TradeInputType.multiplier && (
              <div className="space-y-3">
                <Label className="text-xs uppercase font-mono text-muted-foreground">Duration</Label>
                <div className="flex gap-2">
                  <Input 
                    type="number" 
                    value={duration} 
                    onChange={(e) => setDuration(e.target.value)}
                    className="rounded-none font-mono flex-1 h-10 border-border bg-background"
                    data-testid="input-duration"
                  />
                  <Select value={durationUnit} onValueChange={setDurationUnit}>
                    <SelectTrigger className="w-[100px] h-10 rounded-none border-border bg-background font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border">
                      <SelectItem value="ticks" className="font-mono">Ticks</SelectItem>
                      <SelectItem value="minutes" className="font-mono">Minutes</SelectItem>
                      <SelectItem value="hours" className="font-mono">Hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label className="text-xs uppercase font-mono text-muted-foreground">Take Profit (Optional)</Label>
              <Input 
                type="number" 
                value={takeProfit} 
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="0.00"
                className="rounded-none font-mono h-10 border-border bg-background"
                data-testid="input-takeprofit"
              />
            </div>

            <div className="flex items-center justify-between p-3 border border-border bg-background">
              <Label className="text-xs uppercase font-mono text-muted-foreground cursor-pointer" htmlFor="ai-confirm">
                Request AI Confirmation
              </Label>
              <Switch 
                id="ai-confirm" 
                checked={aiConfirmed} 
                onCheckedChange={setAiConfirmed}
                data-testid="switch-ai-confirm"
              />
            </div>
          </div>

          <div className="p-4 mt-auto border-t border-border">
            <Button 
              className={`w-full rounded-none h-12 text-sm uppercase font-bold tracking-widest ${direction === TradeInputDirection.call || direction === TradeInputDirection.buy ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'}`}
              onClick={handleExecute}
              disabled={createTrade.isPending || !isConnected}
              data-testid="button-execute"
            >
              {createTrade.isPending ? 'Executing...' : 'Execute Trade'}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
