import fetch from 'node-fetch';

export class CloudflareService {
  private baseUrl: string;
  private token: string;
  private accountId?: string;

  constructor() {
    this.baseUrl = process.env.CLOUDFLARE_API_BASE || 'https://api.cloudflare.com/client/v4';
    this.token = process.env.CLOUDFLARE_API_TOKEN || '';
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!this.token) {
      throw new Error('CLOUDFLARE_API_TOKEN is required');
    }
  }

  private async request(path: string, options: any = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      ...options,
    });

    const bodyText = await res.text();
    let body: any = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = bodyText;
    }

    if (!res.ok) {
      const msg = body && body.errors ? JSON.stringify(body.errors) : bodyText;
      throw new Error(`Cloudflare request failed: ${res.status} ${msg}`);
    }

    return body;
  }

  private async paginate(path: string): Promise<any[]> {
    const per_page = 50;
    let page = 1;
    let results: any[] = [];

    while (true) {
      const resp = await this.request(`${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=${per_page}`);
      if (!resp || !resp.result) break;
      results = results.concat(resp.result);
      const total_pages = resp.result_info?.total_pages ?? 1;
      if (page >= total_pages) break;
      page += 1;
    }

    return results;
  }

  async listZones() {
    const zones = await this.paginate('/zones');
    return zones.map((z: any) => ({
      id: z.id,
      name: String(z.name || '').replace(/\.$/, ''),
      kind: 'cloudflare',
      status: z.status,
      paused: z.paused,
      created_on: z.created_on,
      modified_on: z.modified_on,
      name_servers: z.name_servers,
    }));
  }

  private async getZoneIdByName(name: string): Promise<string | null> {
    const resp = await this.request(`/zones?name=${encodeURIComponent(name)}`);
    const result = resp?.result;
    if (Array.isArray(result) && result.length > 0) return result[0].id;
    return null;
  }

  private async getBaseZoneId(): Promise<string | null> {
    const base = process.env.CLOUDFLARE_BASE_ZONE?.replace(/\.$/, '');
    if (!base) return null;
    return this.getZoneIdByName(base);
  }

  async createZone(zone: any) {
    const baseZone = await this.getBaseZoneId();
    if (baseZone) {
      const name = String(zone.name || '').replace(/\.$/, '');
      const recordName = `${name}.${process.env.CLOUDFLARE_BASE_ZONE?.replace(/\.$/, '')}`;
      return this.addRecord(baseZone, {
        name: recordName,
        type: 'TXT',
        ttl: 3600,
        content: `"abuse_contact=abuse@ecli.app organisation=${name}"`,
      });
    }

    const body: any = {
      name: zone.name,
      jump_start: true,
    };
    if (this.accountId) {
      body.account = { id: this.accountId };
    }
    return this.request('/zones', { method: 'POST', body: JSON.stringify(body) });
  }

  async getZone(zoneId: string) {
    let resolvedId = zoneId;
    if (!zoneId.match(/^[0-9a-fA-F]+$/)) {
      const maybeId = await this.getZoneIdByName(zoneId.replace(/\.$/, ''));
      if (maybeId) resolvedId = maybeId;
    }

    const zone = await this.request(`/zones/${resolvedId}`);
    const recordsResp = await this.request(`/zones/${resolvedId}/dns_records?per_page=1000`);
    const records = Array.isArray(recordsResp?.result) ? recordsResp.result : [];
    const rrsets = records.map((r: any) => ({
      id: r.id,
      name: String(r.name || '').replace(/\.$/, ''),
      type: r.type,
      ttl: r.ttl,
      proxied: !!r.proxied,
      records: [{ id: r.id, content: r.content }],
    }));
    const recordsList = records.map((r: any) => ({ id: r.id, name: String(r.name || '').replace(/\.$/, ''), type: r.type, ttl: r.ttl, content: r.content, proxied: !!r.proxied }));
    const resultZone = { ...zone.result, rrsets, recordsList } as any;
    if (resultZone.name) resultZone.name = String(resultZone.name).replace(/\.$/, '');
    return resultZone;
  }

  async addRecord(zoneId: string, record: any) {
    const body: any = {
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl ?? 3600,
    };
    if (record.proxied !== undefined) {
      body.proxied = record.proxied;
    }
    const resp = await this.request(`/zones/${zoneId}/dns_records`, { method: 'POST', body: JSON.stringify(body) });
    const res = resp.result;
    if (res && res.name) res.name = String(res.name).replace(/\.$/, '');
    return res;
  }

  async updateRecord(zoneId: string, recordId: string, record: any) {
    const body: any = {
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl ?? 3600,
    };
    if (record.proxied !== undefined) body.proxied = record.proxied;
    const resp = await this.request(`/zones/${zoneId}/dns_records/${recordId}`, { method: 'PUT', body: JSON.stringify(body) });
    const res = resp.result;
    if (res && res.name) res.name = String(res.name).replace(/\.$/, '');
    return res;
  }

  async deleteRecord(zoneId: string, recordId: string) {
    const resp = await this.request(`/zones/${zoneId}/dns_records/${recordId}`, { method: 'DELETE' });
    return resp.result;
  }

  async deleteZone(zoneId: string) {
    let resolvedId = zoneId;
    if (!zoneId.match(/^[0-9a-fA-F]+$/)) {
      const maybeId = await this.getZoneIdByName(zoneId.replace(/\.$/, ''));
      if (!maybeId) return { deleted: false };
      resolvedId = maybeId;
    }

    try {
      const resp = await this.request(`/zones/${resolvedId}`, { method: 'DELETE' });
      return { deleted: true, result: resp.result };
    } catch (e: any) {
      const msg = String(e.message || '');
      if (msg.includes('404')) return { deleted: false };
      throw e;
    }
  }
}
