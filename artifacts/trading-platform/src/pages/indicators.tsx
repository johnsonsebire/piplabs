import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListIndicators, useCreateIndicator } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function IndicatorsPage() {
  const { data: indicators, isLoading } = useListIndicators({});
  const createIndicator = useCreateIndicator();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [maType, setMaType] = useState("EMA");
  const [maPeriod, setMaPeriod] = useState("14");
  const [maColor, setMaColor] = useState("#00ff88");
  const [maThickness, setMaThickness] = useState("1");
  const [description, setDescription] = useState("");

  // Auto-update standard EMA(21) for pre-load example logic if opened first time, but we set states explicitly
  useEffect(() => {
    if (showForm && !description && maType === "EMA" && maPeriod === "14") {
      setMaType("EMA");
      setMaPeriod("21");
      setMaThickness("2");
    }
  }, [showForm]);

  const generatedName = `${maType}(${maPeriod})`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createIndicator.mutate({
      data: {
        name: generatedName,
        description: description,
        code: maType,
        parameters: JSON.stringify({
          period: parseInt(maPeriod),
          color: maColor,
          thickness: parseInt(maThickness)
        }),
        isPublic: true
      }
    }, {
      onSuccess: () => {
        toast({ title: "Indicator added to library" });
        setShowForm(false);
        queryClient.invalidateQueries({ queryKey: ["/api/indicators"] });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err?.message });
      }
    });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden p-6 gap-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center shrink-0">
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight text-foreground">Indicator Library</h1>
          <Button 
            className="rounded-none font-bold uppercase tracking-wider font-mono"
            onClick={() => setShowForm(!showForm)}
            data-testid="button-new-indicator"
          >
            {showForm ? "Cancel" : "Add Indicator"}
          </Button>
        </div>

        <div className="flex flex-1 min-h-0 gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-y-auto content-start">
            {isLoading ? (
              <div className="col-span-full p-8 text-center text-muted-foreground font-mono uppercase">Loading Library...</div>
            ) : indicators?.length === 0 ? (
              <div className="col-span-full p-8 text-center text-muted-foreground font-mono uppercase">No indicators found.</div>
            ) : (
              indicators?.map(ind => (
                <div key={ind.id} className="border border-border bg-card p-5 flex flex-col h-48 hover:border-primary/50 transition-colors relative overflow-hidden">
                  <div 
                    className="absolute top-0 right-0 w-2 h-full opacity-50" 
                    style={{ backgroundColor: JSON.parse(ind.parameters || '{}')?.color || 'transparent' }} 
                  />
                  <h3 className="font-bold font-mono uppercase text-primary mb-2 text-lg truncate">{ind.name}</h3>
                  <p className="text-xs font-mono text-muted-foreground mb-4 line-clamp-2 flex-1">{ind.description || "No description provided."}</p>
                  <div className="mt-auto">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">Configuration</p>
                    <code className="text-[10px] text-foreground bg-muted/30 px-2 py-1 block truncate border border-border">
                      {ind.parameters || "{}"}
                    </code>
                  </div>
                </div>
              ))
            )}
          </div>

          {showForm && (
            <div className="w-full md:w-[350px] border border-border bg-card shrink-0 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20 shrink-0">
                <h2 className="text-sm font-bold font-mono uppercase text-foreground">Moving Average Builder</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
                
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Preview Name</Label>
                  <Input 
                    disabled 
                    value={generatedName} 
                    className="rounded-none font-mono border-border bg-muted/30 text-primary font-bold"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Type</Label>
                  <Select value={maType} onValueChange={setMaType}>
                    <SelectTrigger className="w-full rounded-none border-border font-mono text-sm h-10 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border">
                      <SelectItem value="SMA" className="font-mono text-xs uppercase">Simple (SMA)</SelectItem>
                      <SelectItem value="EMA" className="font-mono text-xs uppercase">Exponential (EMA)</SelectItem>
                      <SelectItem value="WMA" className="font-mono text-xs uppercase">Weighted (WMA)</SelectItem>
                      <SelectItem value="TMA" className="font-mono text-xs uppercase">Triangular (TMA)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Period</Label>
                  <Input 
                    type="number"
                    required 
                    value={maPeriod} 
                    onChange={e => setMaPeriod(e.target.value)}
                    className="rounded-none font-mono border-border bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Thickness</Label>
                  <Select value={maThickness} onValueChange={setMaThickness}>
                    <SelectTrigger className="w-full rounded-none border-border font-mono text-sm h-10 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border">
                      <SelectItem value="1" className="font-mono text-xs uppercase">1px (Thin)</SelectItem>
                      <SelectItem value="2" className="font-mono text-xs uppercase">2px (Medium)</SelectItem>
                      <SelectItem value="3" className="font-mono text-xs uppercase">3px (Thick)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Color Hex</Label>
                  <div className="flex gap-2">
                    <Input 
                      type="color"
                      value={maColor}
                      onChange={e => setMaColor(e.target.value)}
                      className="rounded-none h-10 w-16 p-1 border-border bg-background cursor-pointer"
                    />
                    <Input 
                      value={maColor}
                      onChange={e => setMaColor(e.target.value)}
                      className="rounded-none font-mono border-border bg-background flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Description (Optional)</Label>
                  <Input 
                    value={description} 
                    onChange={e => setDescription(e.target.value)}
                    className="rounded-none font-mono border-border bg-background"
                  />
                </div>

                <div className="pt-4 border-t border-border flex justify-end">
                  <Button type="submit" disabled={createIndicator.isPending} className="w-full rounded-none font-bold uppercase font-mono tracking-wider h-10">
                    {createIndicator.isPending ? "Saving..." : "Save Indicator"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
