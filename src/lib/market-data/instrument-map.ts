export interface InstrumentMapping {
  symbol: string;
  exchange: 'NSE';
  instrumentToken: string;
}

const mappings = new Map<string, InstrumentMapping>();

export function registerInstrument(mapping: InstrumentMapping): void {
  mappings.set(mapping.symbol.toUpperCase(), mapping);
}

export function resolveInstrument(symbol: string): InstrumentMapping | null {
  return mappings.get(symbol.trim().toUpperCase()) ?? null;
}

export function registerInstruments(items: InstrumentMapping[]): void {
  for (const item of items) registerInstrument(item);
}
