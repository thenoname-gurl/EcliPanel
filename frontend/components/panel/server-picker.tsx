'use client';

import { useState, useEffect } from 'react';
import { Search, Server, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { API_ENDPOINTS } from '@/lib/panel-config';
import { Loader2 } from 'lucide-react';

interface ServerInfo {
  uuid: string;
  name: string;
  status?: string;
  userId?: number;
}

interface ServerPickerProps {
  excludeUuid?: string;
  onSelect: (server: ServerInfo) => void;
  placeholder?: string;
}

export function ServerPicker({ excludeUuid, onSelect, placeholder = 'Search servers...' }: ServerPickerProps) {
  const [search, setSearch] = useState('');
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!search || search.length < 2) { setServers([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiFetch(API_ENDPOINTS.serversList || '/api/servers/v1');
        const list = (Array.isArray(data) ? data : data?.data || [])
          .filter((s: any) => {
            const uuid = s.uuid || s.id;
            if (excludeUuid && uuid === excludeUuid) return false;
            const name = (s.name || '').toLowerCase();
            const q = search.toLowerCase();
            return name.includes(q) || uuid.includes(q);
          })
          .slice(0, 10);
        setServers(list);
      } catch {
        setServers([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, excludeUuid]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-border bg-muted/30 pl-9 pr-3 py-2 text-sm rounded-md"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {servers.length > 0 && (
        <div className="border border-border rounded-md max-h-48 overflow-y-auto">
          {servers.map(server => {
            const uuid = server.uuid || (server as any).id;
            const isSelected = selected === uuid;
            return (
              <button
                key={uuid}
                onClick={() => { setSelected(uuid); onSelect(server); }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30 transition-colors text-left ${isSelected ? 'bg-primary/10' : ''}`}
              >
                <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{server.name || uuid}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{uuid}</p>
                </div>
                {server.status && (
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${server.status === 'running' || server.status === 'online' ? 'bg-green-500' : server.status === 'installing' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                )}
                {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {search.length >= 2 && !loading && servers.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">No servers found</p>
      )}
    </div>
  );
}