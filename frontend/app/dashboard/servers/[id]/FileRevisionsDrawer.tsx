'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Eye, ArrowLeftRight, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import { API_ENDPOINTS } from '@/lib/panel-config';
import { formatBytes } from './serverTabHelpers';

interface Revision {
  id: number;
  user?: { username?: string; avatar?: string } | null;
  size: number;
  is_snapshot?: boolean;
  isSnapshot?: boolean;
  created: string;
}

interface FileRevisionsDrawerProps {
  serverId: string;
  filePath: string;
  open: boolean;
  onClose: () => void;
  onRestore: (content: string) => void;
  onDiff: (revisionId: number, previousRevisionId?: number) => void;
}

export function FileRevisionsDrawer({ serverId, filePath, open, onClose, onRestore, onDiff }: FileRevisionsDrawerProps) {
  const t = useTranslations('serverDetailPage');
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!filePath) return;
    setLoading(true);
    try {
      const data = await apiFetch(
        API_ENDPOINTS.serverFileRevisions.replace(':id', serverId) +
        `?file=${encodeURIComponent(filePath)}`
      );
      const list = data?.revisions ?? (Array.isArray(data) ? data : []);
      setRevisions(Array.isArray(list) ? list : []);
    } catch {
      setRevisions([]);
    } finally {
      setLoading(false);
    }
  }, [serverId, filePath]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleRestore = async (rev: Revision) => {
    setRestoringId(rev.id);
    try {
      const content = await apiFetch(
        API_ENDPOINTS.serverFileRevisionContent
          .replace(':id', serverId)
          .replace(':revisionId', String(rev.id))
      );
      onRestore(typeof content === 'string' ? content : JSON.stringify(content));
    } catch (e: any) {
      // ignore
    } finally {
      setRestoringId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Drawer */}
      <div className="relative w-80 sm:w-96 bg-card border-l border-border h-full overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{t('backups.fileHistory')}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : revisions.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              {t('backups.noRevisions')}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {revisions.map((rev, i) => {
                const previousId = revisions[i + 1]?.id ?? null;
                return (
                  <div key={rev.id} className="px-4 py-2.5 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-medium">#{rev.id}</span>
                          {(rev.is_snapshot || rev.isSnapshot) && (
                            <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-px font-medium">
                              {t('backups.snapshot')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                          <span suppressHydrationWarning>{new Date(rev.created).toLocaleString()}</span>
                          <span>•</span>
                          <span>{formatBytes(rev.size)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => onDiff(rev.id)}
                          className="text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary px-2 py-1 transition-colors"
                          title={t('backups.view')}
                        >
                          <Eye className="h-3 w-3 inline mr-1" />{t('backups.view')}
                        </button>
                        {previousId !== null && (
                          <button
                            onClick={() => onDiff(rev.id, previousId)}
                            className="text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary px-2 py-1 transition-colors"
                            title="Compare with previous revision"
                          >
                            <ArrowLeftRight className="h-3 w-3 inline mr-1" />{t('backups.diff')}
                          </button>
                        )}
                        <button
                          onClick={() => handleRestore(rev)}
                          disabled={restoringId === rev.id}
                          className="text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary px-2 py-1 transition-colors"
                          title={t('backups.restoreRevision')}
                        >
                          {restoringId === rev.id ? (
                            <Loader2 className="h-3 w-3 inline mr-1 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3 inline mr-1" />
                          )}
                          {t('backups.restore')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}