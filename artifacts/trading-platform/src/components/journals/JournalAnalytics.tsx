import { useMemo } from "react";
import { JournalEntry } from "@workspace/api-client-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from "recharts";

interface JournalAnalyticsProps {
  journals: JournalEntry[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

export function JournalAnalytics({ journals }: JournalAnalyticsProps) {
  
  // 1. P&L by Symbol
  const pnlBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    journals.forEach(j => {
      const pnl = j.profitLossRaw || 0;
      map.set(j.symbol, (map.get(j.symbol) || 0) + pnl);
    });
    return Array.from(map.entries())
      .map(([name, pnl]) => ({ name, pnl }))
      .sort((a, b) => b.pnl - a.pnl); // Sort descending
  }, [journals]);

  // 2. Volume by Symbol
  const volumeBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    let totalVol = 0;
    journals.forEach(j => {
      const vol = Number(j.volume) || 0;
      map.set(j.symbol, (map.get(j.symbol) || 0) + vol);
      totalVol += vol;
    });
    
    const threshold = totalVol * 0.02; // Group <2% into Other
    let otherVol = 0;
    const finalData: {name: string, value: number}[] = [];
    
    Array.from(map.entries()).forEach(([name, value]) => {
      if (value < threshold) {
        otherVol += value;
      } else {
        finalData.push({ name, value });
      }
    });

    if (otherVol > 0) {
      finalData.push({ name: 'Other', value: otherVol });
    }

    return finalData.sort((a, b) => b.value - a.value);
  }, [journals]);

  // 3. P&L by Duration Bucket
  const pnlByDuration = useMemo(() => {
    const buckets = [
      { name: "< 5m", min: 0, max: 5, pnl: 0, count: 0 },
      { name: "5-30m", min: 5, max: 30, pnl: 0, count: 0 },
      { name: "30m-1h", min: 30, max: 60, pnl: 0, count: 0 },
      { name: "1h-4h", min: 60, max: 240, pnl: 0, count: 0 },
      { name: "> 4h", min: 240, max: Infinity, pnl: 0, count: 0 },
    ];

    journals.forEach(j => {
      if (j.durationMinutes === null || j.durationMinutes === undefined) return;
      const pnl = j.profitLossRaw || 0;
      const bucket = buckets.find(b => j.durationMinutes! >= b.min && j.durationMinutes! < b.max);
      if (bucket) {
        bucket.pnl += pnl;
        bucket.count += 1;
      }
    });

    return buckets.filter(b => b.count > 0);
  }, [journals]);

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-darker border border-secondary p-3 rounded-lg shadow-lg">
          <p className="text-light fw-bold mb-1">{label || payload[0].name}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="mb-0" style={{ color: entry.color || entry.fill }}>
              {entry.name}: {entry.name === 'value' ? entry.value : formatMoney(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (journals.length === 0) {
    return (
      <div className="card bg-dark border-secondary p-5 text-center">
        <p className="text-secondary mb-0">No trading data available for analytics.</p>
      </div>
    );
  }

  return (
    <div className="row g-4 mb-4">
      {/* P&L By Symbol */}
      <div className="col-12 col-lg-6">
        <div className="card bg-dark border-secondary h-100">
          <div className="card-header border-secondary bg-transparent py-3">
            <h6 className="mb-0 text-white fw-bold">Net P&L by Asset</h6>
          </div>
          <div className="card-body" style={{ height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlBySymbol} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="name" stroke="#888" tick={{ fill: '#888' }} />
                <YAxis stroke="#888" tick={{ fill: '#888' }} tickFormatter={(val) => `$${val}`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Bar dataKey="pnl" name="Net P&L" radius={[4, 4, 0, 0]}>
                  {pnlBySymbol.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Volume By Symbol */}
      <div className="col-12 col-lg-6">
        <div className="card bg-dark border-secondary h-100">
          <div className="card-header border-secondary bg-transparent py-3">
            <h6 className="mb-0 text-white fw-bold">Volume Breakdown</h6>
          </div>
          <div className="card-body d-flex align-items-center justify-content-center" style={{ height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={volumeBySymbol}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }}
                  stroke="none"
                >
                  {volumeBySymbol.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* P&L by Duration */}
      <div className="col-12">
        <div className="card bg-dark border-secondary h-100">
          <div className="card-header border-secondary bg-transparent py-3">
            <h6 className="mb-0 text-white fw-bold">P&L by Trade Duration</h6>
          </div>
          <div className="card-body" style={{ height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlByDuration} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="name" stroke="#888" tick={{ fill: '#888' }} />
                <YAxis stroke="#888" tick={{ fill: '#888' }} tickFormatter={(val) => `$${val}`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Bar dataKey="pnl" name="Net P&L" radius={[4, 4, 0, 0]}>
                  {pnlByDuration.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
