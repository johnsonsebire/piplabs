import { useMemo } from "react";
import { JournalEntry } from "@workspace/api-client-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";

interface EquityCurveProps {
  journals: JournalEntry[];
  startingBalance: number;
}

export function EquityCurve({ journals, startingBalance }: EquityCurveProps) {
  const data = useMemo(() => {
    const sorted = [...journals].sort((a, b) => new Date(a.openTime).getTime() - new Date(b.openTime).getTime());
    let currentEquity = startingBalance;
    const points = [{ time: "Start", equity: startingBalance }];

    sorted.forEach(j => {
      currentEquity += (j.profitLossRaw || 0);
      points.push({
        time: format(new Date(j.openTime), "MMM dd, HH:mm"),
        equity: Number(currentEquity.toFixed(2))
      });
    });

    return points;
  }, [journals, startingBalance]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0f172a] border border-secondary p-3 rounded-lg shadow-lg">
          <p className="text-light text-xs mb-1 text-slate-400">{label}</p>
          <p className="mb-0 text-[#10b981] fw-bold text-lg">
            ${payload[0].value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      );
    }
    return null;
  };

  if (journals.length === 0) {
    return (
      <div className="card bg-dark border-secondary p-5 text-center">
        <p className="text-secondary mb-0">No trading data available for equity curve.</p>
      </div>
    );
  }

  return (
    <div className="card bg-dark border-secondary">
      <div className="card-header border-secondary bg-transparent py-3">
        <h6 className="mb-0 text-white fw-bold">Equity Curve</h6>
      </div>
      <div className="card-body" style={{ height: "350px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis 
              dataKey="time" 
              stroke="#64748b" 
              tick={{ fill: '#64748b', fontSize: 12 }} 
              tickMargin={10} 
              minTickGap={30}
            />
            <YAxis 
              domain={['auto', 'auto']} 
              stroke="#64748b" 
              tick={{ fill: '#64748b', fontSize: 12 }} 
              tickFormatter={(val) => `$${val}`} 
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '3 3' }} />
            <Area 
              type="stepAfter" 
              dataKey="equity" 
              stroke="#10b981" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorEquity)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
