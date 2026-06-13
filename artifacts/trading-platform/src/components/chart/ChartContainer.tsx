import React, { useState } from "react";
import { TradingChart } from "@/components/chart/TradingChart";
import { BottomPanel } from "@/components/chart/BottomPanel";
import { useDerivWs, TIMEFRAME_OPTIONS } from "@/hooks/use-deriv-ws";
import { useSearchDerivSymbols, getSearchDerivSymbolsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, Search, Maximize2, Minimize2, X, GripHorizontal } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

export type ChartConfig = {
  id: string;
  symbol: string;
  granularitySec: number;
};

interface ChartContainerProps {
  config: ChartConfig;
  isActive: boolean;
  isMaximized: boolean;
  indicators: any[];
  onConfigChange: (id: string, updates: Partial<ChartConfig>) => void;
  onSelect: (id: string) => void;
  onMaximize: (id: string) => void;
  onRestore: () => void;
  onClose: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, id: string) => void;
}

export function ChartContainer({
  config,
  isActive,
  isMaximized,
  indicators,
  onConfigChange,
  onSelect,
  onMaximize,
  onRestore,
  onClose,
  onDragStart,
  onDragOver,
  onDrop
}: ChartContainerProps) {
  const { latestTick } = useDerivWs(config.symbol, config.granularitySec);
  const [openSearch, setOpenSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const { data: searchResults, isLoading: isSearching } = useSearchDerivSymbols(
    { q: debouncedSearchQuery },
    { query: { queryKey: getSearchDerivSymbolsQueryKey({ q: debouncedSearchQuery }) } }
  );

  const [isDraggable, setIsDraggable] = useState(false);

  return (
    <div 
      className={`d-flex flex-column h-100 bg-background position-relative ${isActive ? 'border border-primary' : 'border border-secondary'}`}
      style={{ minHeight: 0, transition: 'border-color 0.2s' }}
      onClick={() => onSelect(config.id)}
      draggable={isDraggable}
      onDragStart={(e) => onDragStart(e, config.id)}
      onDragOver={onDragOver}
      onDrop={(e) => {
        setIsDraggable(false);
        onDrop(e, config.id);
      }}
      onDragEnd={() => setIsDraggable(false)}
    >
      <div className="d-flex align-items-center px-2 justify-content-between bg-card flex-shrink-0 border-bottom border-secondary" style={{ height: '3rem' }}>
        <div className="d-flex align-items-center gap-2 flex-nowrap" onClick={(e) => e.stopPropagation()}>
          <div 
            className="d-flex align-items-center justify-content-center h-100 px-1 cursor-grab" 
            onMouseDown={() => setIsDraggable(true)}
            onMouseUp={() => setIsDraggable(false)}
            onMouseLeave={() => setIsDraggable(false)}
          >
            <GripHorizontal size={14} className="text-secondary hover:text-white" />
          </div>
          <div className="d-flex flex-row align-items-center border border-secondary bg-background flex-shrink-0 flex-nowrap overflow-hidden" style={{ height: '2rem', borderRadius: '0px' }}>
            <Popover open={openSearch} onOpenChange={setOpenSearch}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  role="combobox"
                  aria-expanded={openSearch}
                  className="d-flex align-items-center justify-content-between h-100 rounded-none border-0 font-mono font-bold px-2 hover:bg-muted/50 flex-shrink-0"
                  style={{ width: '140px' }}
                >
                  <div className="d-flex align-items-center gap-1.5 truncate">
                    <Search size={12} className="text-muted-foreground flex-shrink-0" />
                    <span className="truncate text-xs">{config.symbol}</span>
                  </div>
                  <ChevronsUpDown className="ml-1 h-3 w-3 flex-shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 rounded-none border-border bg-[#0f1318] shadow-2xl z-[1000]" align="start" style={{ width: '280px', backgroundColor: '#0f1318', borderRadius: 0, border: '1px solid #1a2332' }}>
                <Command shouldFilter={false} className="bg-transparent">
                  <CommandInput
                    placeholder="Search symbols..."
                    className="font-mono text-xs border-0 focus:ring-0"
                    style={{ height: '40px', fontSize: '0.75rem' }}
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList style={{ maxHeight: '300px', overflowY: 'auto', borderTop: '1px solid #1a2332', backgroundColor: '#0f1318' }}>
                    {isSearching && <div className="py-4 text-center text-xs font-mono text-muted-foreground animate-pulse">Searching...</div>}
                    {!isSearching && (!searchResults || searchResults.length === 0) && (
                      <CommandEmpty className="py-4 text-center text-xs font-mono text-muted-foreground">No symbols found.</CommandEmpty>
                    )}
                    <CommandGroup className="bg-[#0f1318]">
                      {Array.isArray(searchResults) && searchResults.map((item) => (
                        <CommandItem
                          key={item.symbol}
                          value={item.symbol}
                          onSelect={() => {
                            onConfigChange(config.id, { symbol: item.symbol });
                            setOpenSearch(false);
                            setSearchQuery("");
                          }}
                          className="symbol-search-item cursor-pointer"
                        >
                          <div className="d-flex align-items-center justify-content-between w-100">
                            <div className="d-flex flex-column">
                              <span className="font-bold symbol-search-name text-xs">{item.symbol}</span>
                              <span className="text-muted-foreground mt-0.5" style={{ fontSize: '9px' }}>{item.displayName}</span>
                            </div>
                            {config.symbol === item.symbol && <Check className="h-3 w-3 text-primary" />}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <div className="w-px h-4 bg-border flex-shrink-0"></div>

            <Select value={String(config.granularitySec)} onValueChange={(v) => onConfigChange(config.id, { granularitySec: parseInt(v, 10) })}>
              <SelectTrigger className="w-[72px] h-full py-0 px-2 rounded-none border-0 bg-transparent font-mono text-xs focus:ring-0 focus:ring-offset-0 hover:bg-muted/50 flex-shrink-0 [&>span]:flex [&>span]:items-center [&>span]:h-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border max-h-72 bg-[#0f1318] shadow-2xl z-[1000]" style={{ backgroundColor: '#0f1318' }}>
                <SelectGroup>
                  <SelectLabel className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-mono font-bold py-1 bg-[#151c24]/30">Minutes</SelectLabel>
                  {TIMEFRAME_OPTIONS.filter(tf => tf.group === "MINUTES").map((tf) => (
                    <SelectItem key={tf.seconds} value={String(tf.seconds)} className="font-mono text-xs cursor-pointer">
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator className="bg-[#1a2332] my-0.5" />
                <SelectGroup>
                  <SelectLabel className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-mono font-bold py-1 bg-[#151c24]/30">Hours</SelectLabel>
                  {TIMEFRAME_OPTIONS.filter(tf => tf.group === "HOURS").map((tf) => (
                    <SelectItem key={tf.seconds} value={String(tf.seconds)} className="font-mono text-xs cursor-pointer">
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator className="bg-[#1a2332] my-0.5" />
                <SelectGroup>
                  <SelectLabel className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-mono font-bold py-1 bg-[#151c24]/30">Days</SelectLabel>
                  {TIMEFRAME_OPTIONS.filter(tf => tf.group === "DAYS").map((tf) => (
                    <SelectItem key={tf.seconds} value={String(tf.seconds)} className="font-mono text-xs cursor-pointer">
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2 flex-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="d-flex align-items-center gap-2 d-none d-sm-flex">
            <span className="text-[9px] text-muted-foreground uppercase font-mono tracking-wider leading-none">Spot</span>
            <span className={`font-mono font-bold text-xs leading-none ${latestTick ? 'text-primary' : 'text-muted-foreground'}`}>
              {latestTick ? latestTick.quote.toFixed(4) : '---'}
            </span>
          </div>
          
          <div className="w-px h-6 bg-border mx-1"></div>
          
          {isMaximized ? (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => onRestore()} title="Restore">
              <Minimize2 size={14} />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => onMaximize(config.id)} title="Maximize">
              <Maximize2 size={14} />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6 text-danger hover:text-danger hover:bg-danger/10" onClick={() => onClose(config.id)} title="Close Chart">
            <X size={14} />
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <TradingChart
          key={`${config.symbol}-${config.granularitySec}`}
          symbol={config.symbol}
          granularitySec={config.granularitySec}
          indicators={Array.isArray(indicators) ? indicators.map(i => ({ id: i.id, name: i.name, code: i.code, parameters: i.parameters })) : []}
          isActiveChart={isActive}
        />
      </div>
      <BottomPanel symbol={config.symbol} />
    </div>
  );
}
