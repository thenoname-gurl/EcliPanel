export type SlowQueryRecord = {
  timestamp: string;
  durationMs: number;
  query: string;
  parameters?: any[];
};

const MAX_RECORDS = 200;
const records: SlowQueryRecord[] = [];

export function addSlowQuery(record: SlowQueryRecord) {
  records.unshift(record);
  if (records.length > MAX_RECORDS) {
    records.pop();
  }
}

export function getSlowQueries(limit = 50): SlowQueryRecord[] {
  return records.slice(0, limit);
}

export function clearSlowQueries() {
  records.length = 0;
}
