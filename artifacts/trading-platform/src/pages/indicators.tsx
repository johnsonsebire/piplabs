import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListIndicators, useCreateIndicator } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function IndicatorsPage() {
  const { data: indicators, isLoading } = useListIndicators({});
  const createIndicator = useCreateIndicator();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    code: "def calculate(data, params):\n    pass",
    parameters: '{"period": 14}',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createIndicator.mutate({
      data: {
        name: formData.name,
        description: formData.description,
        code: formData.code,
        parameters: formData.parameters,
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
                <div key={ind.id} className="border border-border bg-card p-5 flex flex-col h-48 hover:border-primary/50 transition-colors">
                  <h3 className="font-bold font-mono uppercase text-primary mb-2 text-lg truncate">{ind.name}</h3>
                  <p className="text-xs font-mono text-muted-foreground mb-4 line-clamp-2 flex-1">{ind.description || "No description provided."}</p>
                  <div className="mt-auto">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase mb-1">Default Params</p>
                    <code className="text-xs text-foreground bg-muted/30 px-2 py-1 block truncate border border-border">
                      {ind.parameters || "{}"}
                    </code>
                  </div>
                </div>
              ))
            )}
          </div>

          {showForm && (
            <div className="w-full md:w-[400px] border border-border bg-card shrink-0 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20 shrink-0">
                <h2 className="text-sm font-bold font-mono uppercase text-foreground">New Indicator</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Name</Label>
                  <Input 
                    required 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="rounded-none font-mono border-border bg-background"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Description</Label>
                  <Input 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    className="rounded-none font-mono border-border bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Parameters (JSON)</Label>
                  <Input 
                    value={formData.parameters} 
                    onChange={e => setFormData({...formData, parameters: e.target.value})}
                    className="rounded-none font-mono border-border bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono text-muted-foreground">Formula Math/Logic</Label>
                  <Textarea 
                    required
                    value={formData.code} 
                    onChange={e => setFormData({...formData, code: e.target.value})}
                    className="rounded-none font-mono border-border bg-background h-40 font-mono text-xs text-primary"
                  />
                </div>

                <div className="pt-4 border-t border-border flex justify-end">
                  <Button type="submit" disabled={createIndicator.isPending} className="w-full rounded-none font-bold uppercase font-mono tracking-wider h-10">
                    {createIndicator.isPending ? "Saving..." : "Save to Library"}
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