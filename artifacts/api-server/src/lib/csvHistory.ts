import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse } from "csv-parse/sync";
import type { HistCandle } from "./derivHistory";

const DATASETS_DIR = path.resolve(process.cwd(), "../../datasets/backtests");

export async function readCsvCandles(datasetFile: string): Promise<HistCandle[]> {
  // Prevent path traversal
  const safePath = path.resolve(DATASETS_DIR, path.basename(datasetFile));
  
  if (!safePath.startsWith(DATASETS_DIR)) {
    throw new Error("Invalid dataset file path");
  }

  let fileContent: string;
  try {
    fileContent = await fs.readFile(safePath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read dataset file ${datasetFile}: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Detect delimiter
  const firstLine = fileContent.split("\n")[0] || "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  // Parse CSV
  const records = parse(fileContent, {
    delimiter,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const candles: HistCandle[] = [];

  for (const rawRecord of records) {
    const record = rawRecord as Record<string, unknown>;
    // Normalize keys to lowercase and remove non-alphanumeric chars (e.g. <DATE> -> date)
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      row[cleanKey] = String(value).trim();
    }

    let timeSec = 0;

    // MT5 format: date (YYYY.MM.DD) and time (HH:MM:SS)
    if (row["date"] && row["time"]) {
      // Convert "2023.01.03 00:00:00" to ISO "2023-01-03T00:00:00Z"
      const dateStr = row["date"].replace(/\./g, "-");
      const timeStr = row["time"];
      const dateObj = new Date(`${dateStr}T${timeStr}Z`);
      timeSec = Math.floor(dateObj.getTime() / 1000);
    } 
    // Unix timestamp in seconds or milliseconds
    else if (row["time"] || row["timestamp"] || row["epoch"]) {
      const tStr = row["time"] || row["timestamp"] || row["epoch"];
      const tNum = Number(tStr);
      if (tStr.length > 10) {
        // Assume milliseconds
        timeSec = Math.floor(tNum / 1000);
      } else {
        timeSec = tNum;
      }
    } 
    // Generic Date/Datetime column
    else if (row["datetime"] || row["date"]) {
      const dStr = row["datetime"] || row["date"];
      const dateObj = new Date(dStr.replace(/\./g, "-"));
      timeSec = Math.floor(dateObj.getTime() / 1000);
    }

    if (!timeSec || isNaN(timeSec)) {
      continue; // Skip invalid rows
    }

    const open = Number(row["open"] || row["o"]);
    const high = Number(row["high"] || row["h"]);
    const low = Number(row["low"] || row["l"]);
    const close = Number(row["close"] || row["c"]);

    if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
      continue;
    }

    candles.push({
      time: timeSec,
      open,
      high,
      low,
      close,
    });
  }

  // Sort chronologically
  candles.sort((a, b) => a.time - b.time);

  if (candles.length === 0) {
    throw new Error(`No valid OHLC data found in ${datasetFile}`);
  }

  return candles;
}
