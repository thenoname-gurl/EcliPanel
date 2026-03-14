import fetch from 'node-fetch';
// HELL THIS ONE IS STILL KINDA MID
// DOESNT WORK WITH FUCKING CLOUDFLAREEEEEE
export class PowerdnsService {
  baseUrl: string;
  apiKey: string;

  constructor() {
    this.baseUrl = process.env.PDNS_BASE_URL || 'http://127.0.0.1:8081/api/v1/servers/localhost';
    this.apiKey = process.env.PDNS_API_KEY || '';
  }

  private async request(path: string, options: any = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      ...options,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PDNS request failed: ${res.status} ${text}`);
    }
    return res.json().catch(() => ({}));
  }

  listZones() {
    return this.request('/zones');
  }

  createZone(zone: any) {
    return this.request('/zones', { method: 'POST', body: JSON.stringify(zone) });
  }

  getZone(id: string) {
    return this.request(`/zones/${id}`);
  }

  listRecords(zone: string) {
    return this.request(`/zones/${zone}`);
  }

  addRecord(zone: string, record: any) {
    let recName: string;
    if (!record.name) {
      recName = zone; 
    } else if (record.name.endsWith('.')) {
      recName = record.name; 
    } else if (record.name.endsWith(zone.replace(/\.$/, ''))) {
      recName = record.name + '.';
    } else {
      recName = `${record.name}.${zone}`;
    }
    const rrset = {
      changetype: 'REPLACE',
      ...record,
      name: recName,
    };
    return this.request(`/zones/${zone}`, { method: 'PATCH', body: JSON.stringify({ rrsets: [rrset] }) });
  }
}
