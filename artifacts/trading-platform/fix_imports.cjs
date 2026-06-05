const fs = require('fs');

let content = fs.readFileSync('src/pages/trade-chart.tsx', 'utf8');

const imports = `import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { parseIndicatorConfig, computeIndicator } from "@/lib/indicators";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useListBacktests, getListBacktestsQueryKey, useListStrategies, useListIndicators } from "@workspace/api-client-react";
import { Activity, ArrowLeft, TrendingUp, TrendingDown, Clock, DollarSign, LineChart, AlertCircle } from "lucide-react";`;

// We just replace everything from the top of the file up to "type SimTrade = {"
const newContent = imports + "\n\n" + content.substring(content.indexOf('type SimTrade = {'));

fs.writeFileSync('src/pages/trade-chart.tsx', newContent);
