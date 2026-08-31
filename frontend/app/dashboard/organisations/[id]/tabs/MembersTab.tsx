"use client"
import { toast } from "sonner"

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/panel/shared";
import { Trash2, UserPlus } from "lucide-react";
import type { OrgPermissions } from "@/hooks/useOrgPermissions";

interface MembersTabProps {
  orgId: string;
  members: any[];
  invites: any[];
  perms: OrgPermissions;
  currentUserEmail?: string;
  onInvite: (email: string) => Promise<void>;
  onRemoveMember: (userId: number) => Promise<void>;
  onChangeRole: (userId: number, newRole: string) => Promise<void>;
  onAddUser: (email: string, userId: string, role: string) => Promise<any>;
  onResendInvite: (inviteId: number) => Promise<void>;
  onRevokeInvite: (inviteId: number) => Promise<void>;
}

function getMemberAvatarUrl(member: any): string | null {
  const avatarUrl = member.avatarUrl || member.settings?.avatarUrl || member.settings?.avatar?.url;
  if (!avatarUrl) return null;
  return avatarUrl;
}

function getMemberDisplayName(member: any, t: any): string {
  const display = (member.displayName || "").trim();
  const legal = [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
  if (display && legal && display !== legal) return `${display} (${legal})`;
  if (display) return display;
  if (legal) return legal;
  if (member.email) return member.email;
  if (member.id != null) return `User #${member.id}`;
  return t("members.unknownUser");
}

export function MembersTab(props: MembersTabProps) {
  const { orgId, members, invites, perms, currentUserEmail, onInvite, onRemoveMember, onChangeRole, onAddUser, onResendInvite, onRevokeInvite } = props;
  const t = useTranslations("organisationsDetailPage");
  const [inviteEmail, setInviteEmail] = useState("");
  const [addUserEmail, setAddUserEmail] = useState("");
  const [addUserId, setAddUserId] = useState("");
  const [addUserRole, setAddUserRole] = useState("member");

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    if (currentUserEmail && email.toLowerCase() === currentUserEmail.toLowerCase()) {
      toast(t("alerts.cannotInviteYourself"));
      return;
    }
    await onInvite(email);
  };

  const handleAddUser = async () => {
    if (!addUserEmail.trim() && !addUserId.trim()) return;
    await onAddUser(addUserEmail.trim(), addUserId.trim(), addUserRole);
  };

  return (
    <div className="border border-border bg-card min-w-0 box-border overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-4">
        <p className="text-sm font-medium text-foreground">{t("members.count", { count: members.length })}</p>
      </div>

      {members.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">{t("members.none")}</div>
      ) : (
        <div className="divide-y divide-border">
          {members.map((m) => {
            const memberName = getMemberDisplayName(m, t);
            const memberAvatar = getMemberAvatarUrl(m);
            return (
              <div key={m.id} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0 overflow-hidden">
                    {memberAvatar ? (
                      <img src={memberAvatar} alt="avatar" className="h-full w-full object-cover" />
                    ) : (
                      (memberName?.[0] || "?").toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{memberName}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email || `User #${m.id}`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {perms.canManage ? (
                    <select
                      value={m.orgRole}
                      onChange={async (e) => {
                        try {
                          await onChangeRole(m.id, e.target.value);
                        } catch {
                          toast.error(t("alerts.failedChangeRole"));
                        }
                      }}
                      className="border border-border bg-input px-2 py-1 text-xs text-foreground"
                    >
                      <option value="member">{t("roles.member")}</option>
                      <option value="admin">{t("roles.admin")}</option>
                      <option value="owner">{t("roles.owner")}</option>
                    </select>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">{m.orgRole}</Badge>
                  )}
                  {perms.canManage && (
                    <button
                      onClick={() => onRemoveMember(m.id)}
                      className="p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pending invites */}
      {invites && invites.length > 0 && (
        <div className="border-t border-border p-4">
          <p className="text-xs font-medium text-foreground mb-2">{t("members.pendingInvitations")}</p>
          <div className="space-y-2">
            {invites.map((iv: any) => (
              <div key={iv.id} className="flex items-center justify-between text-sm text-muted-foreground">
                <div>{iv.email}</div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={iv.accepted ? "secondary" : "outline"}
                    className={iv.accepted ? "text-xs" : "text-xs border-warning/30 bg-warning/10 text-warning"}
                  >
                    {iv.accepted ? t("members.accepted") : t("members.pending")}
                  </Badge>
                  {(perms.canManage || perms.isStaff) && !iv.accepted && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onResendInvite(iv.id)}>{t("actions.resend")}</Button>
                      <Button size="sm" variant="destructive" onClick={() => onRevokeInvite(iv.id)}>{t("actions.revoke")}</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin: add existing user directly */}
      {perms.isStaff && (
        <div className="border-t border-border p-4">
          <p className="text-xs font-medium text-foreground mb-2">{t("members.addExistingUser")}</p>
          <div className="flex gap-2 mb-2">
            <Input placeholder={t("members.userIdOptional")} value={addUserId} onChange={(e: any) => setAddUserId(e.target.value)} className="w-28" />
            <Input placeholder={t("members.orEmail")} value={addUserEmail} onChange={(e: any) => setAddUserEmail(e.target.value)} className="flex-1" />
            <select value={addUserRole} onChange={(e: any) => setAddUserRole(e.target.value)} className="border border-border bg-input px-2 py-1 text-xs">
              <option value="member">{t("roles.member")}</option>
              <option value="admin">{t("roles.admin")}</option>
              <option value="owner">{t("roles.owner")}</option>
            </select>
          </div>
          <div>
            <Button size="sm" onClick={handleAddUser} data-telemetry="organisations:adduserdirect">{t("actions.addUser")}</Button>
          </div>
        </div>
      )}

      {/* Invite */}
      {(perms.canManage || perms.isStaff) && (
        <div className="border-t border-border p-4">
          <p className="text-xs font-medium text-foreground mb-2">{t("members.inviteUser")}</p>
          <div className="flex gap-2">
            <Input
              placeholder={t("members.userEmail")}
              value={inviteEmail}
              onChange={(e: any) => setInviteEmail(e.target.value)}
              className="flex-1"
            />
            <Button size="sm" onClick={handleInvite} data-telemetry="organisations:sendinvite">
              <UserPlus className="h-3.5 w-3.5 mr-1.5" /> {t("actions.invite")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}