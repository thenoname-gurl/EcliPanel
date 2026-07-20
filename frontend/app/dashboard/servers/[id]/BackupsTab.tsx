'use client';

import { useState, useEffect, useCallback } from 'react';
import { HardDrive, Plus, RotateCcw, Lock, Unlock, Trash2, Loader2, Layers, ChevronDown, ChevronRight, X, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { API_ENDPOINTS } from '@/lib/panel-config';
import { Button } from '@/components/ui/button';
import { TableLoading, TableEmpty, TableError } from '@/components/ui/table-states';
import { useTranslations } from 'next-intl';
import { formatBytes } from './serverTabHelpers';

interface BackupGroup {
  uuid: string;
  name: string;
  description?: string;
  serverUuid: string;
  backupUuids: string[];
  compressionType?: string;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export function BackupsTab({ serverId }: { serverId: string }) {
  const t = useTranslations('serverDetailPage');
  const [backups, setBackups] = useState<any[]>([]);
  const [groups, setGroups] = useState<BackupGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<BackupGroup | null>(null);
  const [groupForm, setGroupForm] = useState({ name: '', description: '', compressionType: '' });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [backupData, groupData] = await Promise.all([
        apiFetch(API_ENDPOINTS.serverBackups.replace(':id', serverId)).catch(() => []),
        apiFetch(`/api/servers/v1/${serverId}/backup-groups`).catch(() => ({ groups: [] })),
      ]);
      setBackups(Array.isArray(backupData) ? backupData : []);
      setGroups(groupData?.groups || []);
    } catch {
      setError('Failed to load backups');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  const createBackup = async () => {
    setCreating(true);
    try {
      await apiFetch(API_ENDPOINTS.serverBackups.replace(':id', serverId), {
        method: 'POST',
        body: JSON.stringify({}),
      });
      load();
    } catch (e: any) {
      alert(t('backups.failed', { reason: e.message }));
    } finally {
      setCreating(false);
    }
  };

  const restoreBackup = async (bid: string) => {
    if (!confirm(t('backups.confirmRestore'))) return;
    try {
      await apiFetch(API_ENDPOINTS.serverBackupRestore.replace(':id', serverId).replace(':bid', bid), { method: 'POST' });
      alert(t('backups.restoreInitiated'));
    } catch (e: any) {
      alert(t('backups.failed', { reason: e.message }));
    }
  };

  const deleteBackup = async (bid: string) => {
    if (!confirm(t('backups.confirmDelete'))) return;
    try {
      await apiFetch(API_ENDPOINTS.serverBackupDelete.replace(':id', serverId).replace(':bid', bid), { method: 'DELETE' });
      load();
    } catch (e: any) {
      alert(t('backups.failed', { reason: e.message }));
    }
  };

  const lockBackup = async (bid: string, lock: boolean) => {
    try {
      await apiFetch(`/api/servers/v1/${serverId}/backups/${bid}/lock`, {
        method: 'POST',
        body: JSON.stringify({ lock }),
      });
      load();
    } catch (e: any) {
      alert(t('backups.failed', { reason: e.message }));
    }
  };

  const saveGroup = async () => {
    if (!groupForm.name.trim()) return;
    try {
      if (editingGroup) {
        await apiFetch(`/api/servers/v1/${serverId}/backup-groups/${editingGroup.uuid}`, {
          method: 'PUT',
          body: JSON.stringify(groupForm),
        });
      } else {
        await apiFetch(`/api/servers/v1/${serverId}/backup-groups`, {
          method: 'POST',
          body: JSON.stringify(groupForm),
        });
      }
      setShowGroupModal(false);
      setEditingGroup(null);
      setGroupForm({ name: '', description: '', compressionType: '' });
      load();
    } catch (e: any) {
      alert(e?.message || 'Failed to save group');
    }
  };

  const deleteGroup = async (groupUuid: string) => {
    if (!confirm('Delete this backup group? Backups will not be deleted.')) return;
    try {
      await apiFetch(`/api/servers/v1/${serverId}/backup-groups/${groupUuid}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      alert(e?.message || 'Failed to delete group');
    }
  };

  const addToGroup = async (groupUuid: string, backupUuid: string) => {
    try {
      await apiFetch(`/api/servers/v1/${serverId}/backup-groups/${groupUuid}/backups/${backupUuid}`, { method: 'POST' });
      load();
    } catch (e: any) {
      alert(e?.message || 'Failed to add backup');
    }
  };

  const removeFromGroup = async (groupUuid: string, backupUuid: string) => {
    try {
      await apiFetch(`/api/servers/v1/${serverId}/backup-groups/${groupUuid}/backups/${backupUuid}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      alert(e?.message || 'Failed to remove backup');
    }
  };

  const toggleExpand = (uuid: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(uuid) ? next.delete(uuid) : next.add(uuid);
      return next;
    });
  };

  const groupedBackupUuids = new Set(groups.flatMap(g => g.backupUuids));
  const ungroupedBackups = backups.filter(b => !groupedBackupUuids.has(b.uuid || b.id));

  const BackupRow = ({ backup, groupUuid }: { backup: any; groupUuid?: string }) => {
    const isLocked = backup.locked || backup.is_locked;
    const inProgress = (backup.progress != null && Number(backup.progress) > 0 && Number(backup.progress) < 100) ||
      (backup.status && ['running', 'in-progress', 'processing'].includes(String(backup.status).toLowerCase()));

    return (
      <div className="border border-border bg-secondary/20 p-3 sm:p-4 space-y-3 min-w-0 overflow-hidden">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <p className="text-sm font-medium text-foreground truncate min-w-0">
                {backup.displayName || backup.display_name || backup.name || t('backups.backupFallback')}
              </p>
              {isLocked && <Lock className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {formatBytes(backup.bytes || 0)} • <span suppressHydrationWarning>{backup.created_at ? new Date(backup.created_at).toLocaleString() : '—'}</span>
            </p>
          </div>
        </div>
        {inProgress && (
          <div className="space-y-1">
            <div className="h-2 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, Number(backup.progress) || 0))}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground">{t('backups.progress', { value: Math.round(Number(backup.progress) || 0) })}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <Button size="sm" variant="outline" onClick={() => restoreBackup(String(backup.uuid || backup.id))} className="h-9 px-3 text-xs">
            <RotateCcw className="h-4 w-4 mr-1.5" /> {t('backups.restore')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => lockBackup(String(backup.uuid || backup.id), !isLocked)} className="h-9 w-9 p-0">
            {isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </Button>
          {groupUuid ? (
            <Button size="sm" variant="outline" className="h-9 px-3 text-xs"
              onClick={() => removeFromGroup(groupUuid, String(backup.uuid || backup.id))}>
              <X className="h-4 w-4 mr-1.5" /> {t('backups.removeFromGroup')}
            </Button>
          ) : groups.length > 0 && (
            <select
              className="h-9 px-3 text-xs border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors"
              defaultValue=""
              onChange={e => {
                if (e.target.value) addToGroup(e.target.value, String(backup.uuid || backup.id));
                e.target.value = '';
              }}
            >
              <option value="" disabled>{t('backups.moveToGroup')}</option>
              {groups.map(g => (
                <option key={g.uuid} value={g.uuid}>{g.name}</option>
              ))}
            </select>
          )}
          <Button size="sm" variant="destructive" onClick={() => deleteBackup(String(backup.uuid || backup.id))} disabled={isLocked} className="h-9 w-9 p-0">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  if (loading) return <TableLoading message="Loading backups..." />;
  if (error) return <TableError message={error} onRetry={load} />;

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t('backups.title')}</h3>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setEditingGroup(null); setGroupForm({ name: '', description: '', compressionType: '' }); setShowGroupModal(true); }}>
            <Layers className="h-3.5 w-3.5 mr-1.5" /> {t('backups.newGroup')}
          </Button>
          <Button size="sm" onClick={createBackup} disabled={creating}>
            {creating ? <Loader2 className="h-3.5 w-3.5 rounded-full animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            {t('backups.createBackup')}
          </Button>
        </div>
      </div>

      {/* Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">{editingGroup ? t('backups.editGroup') : t('backups.createGroup')}</h4>
              <button onClick={() => setShowGroupModal(false)}><X className="h-4 w-4" /></button>
            </div>
            <input
              type="text"
              placeholder={t('backups.groupName')}
              value={groupForm.name}
              onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
              className="w-full border border-border bg-muted/30 px-3 py-2 text-sm rounded-md"
              autoFocus
            />
            <input
              type="text"
              placeholder={t('backups.groupDescription')}
              value={groupForm.description}
              onChange={e => setGroupForm({ ...groupForm, description: e.target.value })}
              className="w-full border border-border bg-muted/30 px-3 py-2 text-sm rounded-md"
            />
            <select
              value={groupForm.compressionType}
              onChange={e => setGroupForm({ ...groupForm, compressionType: e.target.value })}
              className="w-full border border-border bg-muted/30 px-3 py-2 text-sm rounded-md"
            >
              <option value="">{t('backups.defaultCompression')}</option>
              <option value="tar.gz">tar.gz</option>
              <option value="tar.zst">tar.zst (zstd)</option>
              <option value="tar.lz4">tar.lz4</option>
              <option value="tar.xz">tar.xz</option>
              <option value="zip">zip</option>
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowGroupModal(false)}>Cancel</Button>
              <Button size="sm" onClick={saveGroup}><Check className="h-4 w-4 mr-1.5" /> Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Groups */}
      {groups.map(group => {
        const isExpanded = expandedGroups.has(group.uuid);
        const groupBackups = backups.filter(b => group.backupUuids.includes(b.uuid || b.id));

        return (
          <div key={group.uuid} className="border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleExpand(group.uuid)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
              <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-medium text-sm flex-1 truncate">{group.name}</span>
              <span className="text-xs text-muted-foreground">{groupBackups.length} backups</span>
              {group.compressionType && (
                <span className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded">{group.compressionType}</span>
              )}
              <button
                onClick={e => { e.stopPropagation(); setEditingGroup(group); setGroupForm({ name: group.name, description: group.description || '', compressionType: group.compressionType || '' }); setShowGroupModal(true); }}
                className="text-xs text-muted-foreground hover:text-foreground ml-1"
              >
                Edit
              </button>
              <button
                onClick={e => { e.stopPropagation(); deleteGroup(group.uuid); }}
                className="text-xs text-destructive hover:text-destructive/80 ml-1"
              >
                Delete
              </button>
            </button>
            {isExpanded && (
              <div className="border-t border-border p-3 space-y-2">
                {groupBackups.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">{t('backups.noBackupsInGroup')}</p>
                ) : (
                  groupBackups.map(b => <BackupRow key={b.uuid || b.id} backup={b} groupUuid={group.uuid} />)
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Ungrouped Backups */}
      {ungroupedBackups.length > 0 && groups.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">{t('backups.ungrouped')}</span>
            <span className="text-xs text-muted-foreground">{ungroupedBackups.length}</span>
          </div>
          <div className="border-t border-border p-3 space-y-2">
            {ungroupedBackups.map(b => <BackupRow key={b.uuid || b.id} backup={b} />)}
          </div>
        </div>
      )}

      {groups.length === 0 && (
        backups.length === 0 ? (
          <TableEmpty message={t('backups.empty')} />
        ) : (
          <div className="space-y-3 min-w-0">
            {backups.map(b => <BackupRow key={b.uuid || b.id} backup={b} />)}
          </div>
        )
      )}
    </div>
  );
}