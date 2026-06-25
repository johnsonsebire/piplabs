import { useMemo } from "react";
import { JournalEntry, AccountTransaction } from "@workspace/api-client-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";

interface GrowthGraphProps {
  journals: JournalEntry[];
  transactions: AccountTransaction[];
  startingBalance: number;
}

export function GrowthGraph({ journals, transactions, startingBalance }: GrowthGraphProps) {
  const data = useMemo(() => {
    // Combine trades and transactions, sort by time
    const combined: any[] = [];
    journals.forEach(j => {
      combined.push({
        time: new Date(j.closeTime || j.openTime).getTime(),
        type: 'trade',
        amount: Number((j.profitLossRaw || 0) + (j.commission || 0) + (j.swap || 0))
      });
    });
    transactions.forEach(t => {
      combined.push({
        time: new Date(t.timestamp).getTime(),
        type: t.type,
        amount: Number(t.amount)
      });
    });

    combined.sort((a, b) => a.time - b.time);

    let currentBalance = startingBalance;
    
    // Find initial capital to base the growth percentage on
    let initialCapital = startingBalance > 0 ? startingBalance : 0;
    if (initialCapital === 0) {
      const firstDep = combined.find(i => i.type === 'deposit' || i.type === 'credit' || i.type === 'bonus');
      if (firstDep) initialCapital = firstDep.amount;
    }
    // Fallback if absolutely no deposits exist
    if (initialCapital <= 0) initialCapital = 1;

    let cumulativePnL = 0;
    const points = [{ time: "Start", growth: 0 }];

    combined.forEach(item => {
      if (item.type === 'trade') {
        cumulativePnL += item.amount;
      } 
      
      const growth = (cumulativePnL / initialCapital) * 100;

      points.push({
        time: format(new Date(item.time), "MMM dd, HH:mm"),
        growth: Number(growth.toFixed(2))
      });
    });

    return points;
  }, [journals, transactions, startingBalance]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const isPositive = payload[0].value >= 0;
      return (
        <div className="bg-[#0f172a] border border-secondary p-3 rounded-lg shadow-lg">
          <p className="text-light text-xs mb-1 text-slate-400">{label}</p>
          <p className={`mb-0 fw-bold text-lg ${isPositive ? 'text-[#10b981]' : 'text-danger'}`}>
            {isPositive ? '+' : ''}{payload[0].value.toFixed(2)}%
          </p>
        </div>
      );
    }
    return null;
  };

  if (journals.length === 0 && transactions.length === 0) {
    return (
      <div className="card bg-dark border-secondary p-5 text-center h-100">
        <p className="text-secondary mb-0">No data available for growth graph.</p>
      </div>
    );
  }

  return (
    <div className="card bg-dark border-secondary h-100">
      <div className="card-header border-secondary bg-transparent py-3">
        <h6 className="mb-0 text-white fw-bold">Account Growth</h6>
      </div>
      <div className="card-body" style={{ height: "350px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
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
              tickFormatter={(val) => `${val}%`} 
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '3 3' }} />
            <Area 
              type="monotone" 
              dataKey="growth" 
              stroke="#3b82f6" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorGrowth)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
