"use client"

import { PanelHeader } from "@/components/panel/header"
import { SectionHeader } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/hooks/useAuth"
import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import {
  Fingerprint,
  Upload,
  CheckCircle,
  Shield,
  AlertTriangle,
  FileText,
  Camera,
  User,
  KeyRound,
  Loader2,
} from "lucide-react"

// Feature flags
const HACKCLUB_STUDENT_ENABLED = process.env.NEXT_PUBLIC_HACKCLUB_STUDENT_ENABLED === 'true';
const GITHUB_STUDENT_ENABLED = process.env.NEXT_PUBLIC_GITHUB_STUDENT_ENABLED === 'true';

// helper to derive step status from backend record
function computeSteps(
  record: any | null,
  passkeyCount: number,
  twoFactorEnabled: boolean,
  emailVerified: boolean,
  studentVerified: boolean,
  portalType: string | undefined,
  euIdDisabled: boolean | undefined,
  t: (key: string) => string
) {
  const base = [
    { id: 1, title: t("steps.email.title"), description: emailVerified ? t("steps.email.verified") : t("steps.email.verifyToContinue"), icon: FileText },
    { id: 2, title: t("steps.security.title"), description: t("steps.security.description"), icon: KeyRound },
    { id: 3, title: t("steps.student.title"), description: studentVerified ? t("steps.student.verified") : HACKCLUB_STUDENT_ENABLED ? t("steps.student.connectHackClub") : GITHUB_STUDENT_ENABLED ? t("steps.student.connectGithub") : t("steps.student.comingSoon"), icon: User },
    {
      id: 4,
      title: t("steps.identityDocument.title"),
      description: euIdDisabled
        ? t("steps.common.notApplicableEu")
        : t("steps.identityDocument.description"),
      icon: Upload,
    },
    {
      id: 5,
      title: t("steps.selfie.title"),
      description: euIdDisabled
        ? t("steps.common.notApplicableEu")
        : t("steps.selfie.description"),
      icon: Camera,
    },
  ] as any[];

  let stepsBase = base;
  if (portalType === 'educational') {
    stepsBase = base.filter((s) => s.id !== 3);
  }

  const completed = record?.status === "verified";
  const pending = record?.status === "pending";
  const failed = record?.status === "failed";
  const securityDone = passkeyCount > 0 || twoFactorEnabled;

  return stepsBase.map((s) => {
    if (s.id === 1) return { ...s, status: emailVerified ? "completed" : "available" };
    if (s.id === 2) {
      if (!emailVerified) return { ...s, status: "locked" };
      return { ...s, status: securityDone ? "completed" : "available" };
    }
    if (s.id === 3) {
      if (!emailVerified || !securityDone) return { ...s, status: "locked" };
      if (studentVerified) return { ...s, status: "completed" };
      return { ...s, status: "available" };
    }
    if (s.id === 4) {
      if (!emailVerified) return { ...s, status: "locked" };
      if (euIdDisabled) return { ...s, status: "notApplicable" };
      if (completed) return { ...s, status: "completed" };
      if (pending) return { ...s, status: "pending" };
      if (failed) return { ...s, status: "failed" };
      return { ...s, status: "available" };
    }
    if (s.id === 5) {
      if (!emailVerified) return { ...s, status: "locked" };
      if (euIdDisabled) return { ...s, status: "notApplicable" };
      if (completed) return { ...s, status: "completed" };
      if (pending) return { ...s, status: "pending" };
      if (failed) return { ...s, status: "failed" };
      return { ...s, status: "available" };
    }
    return { ...s, status: "locked" };
  });
}

export default function IdentityPage() {
  const t = useTranslations("identityPage")
  const { user } = useAuth()
  const [status, setStatus] = useState<any>(null)
  const [passkeyCount, setPasskeyCount] = useState(0)
  const [idDocFile, setIdDocFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [euIdDialogOpen, setEuIdDialogOpen] = useState(false)
  const euIdDisabled = !!user?.euIdVerificationDisabled
  const portalType = (user as any)?.portalType as string | undefined

  useEffect(() => {
    if (user) {
      apiFetch(API_ENDPOINTS.identityStatus.replace(':id', user.id.toString()))
        .then((data) => setStatus(data))
        .catch(() => setStatus(null));
      apiFetch(API_ENDPOINTS.passkeys)
        .then((keys: any[]) => setPasskeyCount(Array.isArray(keys) ? keys.length : 0))
        .catch(() => setPasskeyCount(0));
    }
  }, [user])

  useEffect(() => {
    if (euIdDisabled) {
      setEuIdDialogOpen(true);
    }
  }, [euIdDisabled]);

  return (
    <>
      <PanelHeader title={t("header.title")} description={t("header.description")} />
      <Dialog open={euIdDialogOpen} onOpenChange={setEuIdDialogOpen}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle>{t("dialog.unavailableTitle")}</DialogTitle>
            <DialogDescription>
              {t("dialog.unavailableDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setEuIdDialogOpen(false)}>{t("actions.gotIt")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">
          {/* Status Banner */}
          {(() => {
            const s = computeSteps(status, passkeyCount, !!user?.twoFactorEnabled, !!user?.emailVerified, !!user?.studentVerified, portalType, euIdDisabled, t);
            const requiredSteps = s.filter((x: any) => x.id === 1 || x.id === 2);
            const doneRequired = requiredSteps.filter((x: any) => x.status === 'completed' || x.status === 'notApplicable').length;
            const allRequired = doneRequired === requiredSteps.length;
            const borderColor = allRequired ? 'border-success/30' : 'border-warning/30';
            const bgColor = allRequired ? 'bg-success/5' : 'bg-warning/5';
            const iconBg = allRequired ? 'bg-success/10' : 'bg-warning/10';
            const iconText = allRequired ? 'text-success' : 'text-warning';
            const badgeBorder = allRequired ? 'border-success/30' : 'border-warning/30';
            const badgeBg = allRequired ? 'bg-success/10' : 'bg-warning/10';
            const badgeText = allRequired ? 'text-success' : 'text-warning';
            return (
              <div data-guide-id="identity-student" className={`flex items-center gap-4 rounded-xl border ${borderColor} ${bgColor} p-5`}>
                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${iconBg}`}>
                  {allRequired ? <CheckCircle className={`h-6 w-6 ${iconText}`} /> : <Fingerprint className={`h-6 w-6 ${iconText}`} />}
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">{allRequired ? t("banner.completeTitle") : t("banner.partialTitle")}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {allRequired
                      ? t("banner.completeDescription")
                      : t("banner.partialDescription")}
                  </p>
                </div>
                <Badge variant="outline" className={`${badgeBorder} ${badgeBg} ${badgeText}`}>
                  {`${doneRequired}/${requiredSteps.length} ${t("banner.required")}`}
                </Badge>
              </div>
            );
          })()}

          {/* Verification Steps */}
          {(status?.status === 'failed' || !status) && (
            <div className="rounded-xl border border-border bg-card p-6">
              <SectionHeader title={t("start.title")} description={t("start.description")} />
              <div className="mt-4 grid grid-cols-1 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">{t("start.idDocumentLabel")}</label>
                  <p className="text-xs text-muted-foreground">{t("start.idDocumentHint")}</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    disabled={euIdDisabled}
                    onChange={(e) => setIdDocFile(e.target.files?.[0] ?? null)}
                    className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-all file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:text-primary file:cursor-pointer"
                  />
                  {idDocFile && <p className="text-xs text-success">{t("start.selected")}: {idDocFile.name}</p>}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">{t("start.selfieLabel")}</label>
                  <p className="text-xs text-muted-foreground">{t("start.selfieHint")}</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={euIdDisabled}
                    onChange={(e) => setSelfieFile(e.target.files?.[0] ?? null)}
                    className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-all file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:text-primary file:cursor-pointer"
                  />
                  {selfieFile && <p className="text-xs text-success">{t("start.selected")}: {selfieFile.name}</p>}
                </div>
                <button
                  disabled={euIdDisabled || submitting || !idDocFile || !selfieFile}
                  onClick={async () => {
                    if (!idDocFile || !selfieFile) { alert(t('errors.selectBothFiles')); return; }
                    setSubmitting(true);
                    try {
                      const formData = new FormData();
                      formData.append('idDocument', idDocFile);
                      formData.append('selfie', selfieFile);
                      await apiFetch(API_ENDPOINTS.identity, { method: 'POST', body: formData });
                      alert(t('messages.submittedForReview'));
                      setIdDocFile(null);
                      setSelfieFile(null);
                      if (user) apiFetch(API_ENDPOINTS.identityStatus.replace(':id', user.id.toString())).then((d) => setStatus(d));
                    } catch (e: any) {
                      alert(t('errors.failed') + ': ' + e.message);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="mt-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {submitting ? t('actions.uploading') : t('actions.submitForVerification')}
                </button>
                {submitting && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-primary" aria-live="polite">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('actions.uploading')}
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card p-6">
            <SectionHeader title={t("stepsSection.title")} description={t("stepsSection.description")} />
            <div className="mt-6 flex flex-col gap-4">
          {computeSteps(status, passkeyCount, !!user?.twoFactorEnabled, !!user?.emailVerified, !!user?.studentVerified, portalType, euIdDisabled, t).map((step, idx) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-4 rounded-lg border p-4 transition-all ${
                    step.status === "completed"
                      ? "border-success/30 bg-success/5"
                      : step.status === "pending"
                        ? "border-primary/30 bg-primary/5"
                        : step.status === "available"
                          ? "border-border bg-card"
                          : step.status === "notApplicable"
                            ? "border-muted/30 bg-muted/10"
                            : step.status === "failed"
                              ? "border-destructive/30 bg-destructive/5"
                              : "border-border bg-secondary/20 opacity-60"
                  }`}
                >
                  {/* Step Number */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      step.status === "completed"
                        ? "bg-success/20 text-success"
                        : step.status === "pending"
                          ? "bg-primary/20 text-primary"
                          : step.status === "notApplicable"
                            ? "bg-muted/20 text-muted-foreground"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.status === "completed" ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <step.icon className="h-5 w-5" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-foreground">{step.title}</h4>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>

                  {/* Action */}
                  {step.status === "completed" && (
                    <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                      {t("status.verified")}
                    </Badge>
                  )}
                  {step.status === "pending" && (
                    <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                      {t("status.pending")}
                    </Badge>
                  )}
                  {step.status === "notApplicable" && (
                    <Badge variant="outline" className="border-muted/30 bg-muted/10 text-muted-foreground">
                      {t("status.notApplicable")}
                    </Badge>
                  )}
                  {/* student verification button */}
                  {step.id === 3 && step.status === "available" && HACKCLUB_STUDENT_ENABLED && portalType !== 'educational' && (
                    <button
                      onClick={async () => {
                        try {
                          const res: any = await apiFetch(API_ENDPOINTS.hackclubStudentStart, { method: 'GET' });
                          if (res.redirect) {
                            window.location.href = res.redirect;
                          }
                        } catch (e: any) {
                          alert(e.message || t('errors.failedHackClubFlow'));
                        }
                      }}
                      className="rounded-lg border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary/20"
                    >
                      {t("actions.connectHackClub")}
                    </button>
                  )}
                  {step.id === 3 && step.status === "available" && !HACKCLUB_STUDENT_ENABLED && GITHUB_STUDENT_ENABLED && portalType !== 'educational' && (
                    <button
                      onClick={async () => {
                        try {
                          const res: any = await apiFetch(API_ENDPOINTS.githubStudentStart, { method: 'GET' });
                          if (res.redirect) {
                            window.location.href = res.redirect;
                          }
                        } catch (e: any) {
                          alert(e.message || t('errors.failedGithubFlow'));
                        }
                      }}
                      className="rounded-lg border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary/20"
                    >
                      {t("actions.connectGithub")}
                    </button>
                  )}
                  {step.status === "failed" && (
                    <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                      {t("status.failedResubmit")}
                    </Badge>
                  )}
                  {step.status === "available" && step.id !== 3 && (
                    <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground">
                      {t("status.uploadAbove")}
                    </Badge>
                  )}
                  {step.status === "available" && step.id === 3 && !HACKCLUB_STUDENT_ENABLED && !GITHUB_STUDENT_ENABLED && (
                    <Badge variant="outline" className="border-muted/30 bg-muted/10 text-muted-foreground">
                      {t("status.comingSoon")}
                    </Badge>
                  )}
                  {step.status === "locked" && (
                    <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground" title={t("status.lockedTitle")}>
                      {t("status.locked")}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Verified Info */}
          <div className="rounded-xl border border-border bg-card p-6">
            <SectionHeader title={t("verified.title")} description={t("verified.description")} />
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("verified.fullName")}</p>
                  <p className="text-sm font-medium text-foreground">{user?.firstName} {user?.lastName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("verified.email")}</p>
                  <p className="text-sm font-medium text-foreground">{user?.email}</p>
                </div>
                {user?.emailVerified ? (
                  <CheckCircle className="ml-auto h-4 w-4 text-success" />
                ) : (
                  <AlertTriangle className="ml-auto h-4 w-4 text-warning" />
                )}
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("verified.accountId")}</p>
                  <p className="font-mono text-sm text-foreground">{user?.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                {status?.status === 'verified' ? (
                  <CheckCircle className="h-5 w-5 text-success" />
                ) : status?.status === 'pending' ? (
                  <Shield className="h-5 w-5 text-primary" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-xs text-muted-foreground">{t("verified.idDocument")}</p>
                  <p className="text-sm text-muted-foreground">
                    {euIdDisabled
                      ? status?.status === 'verified'
                        ? t('verified.idStatus.verifiedNotApplicableEu')
                        : t('verified.idStatus.notApplicableEu')
                      : status?.status === 'verified'
                        ? t('verified.idStatus.verified')
                        : status?.status === 'pending'
                          ? t('verified.idStatus.underReview')
                          : status?.status === 'failed'
                            ? t('verified.idStatus.failedResubmit')
                            : t('verified.idStatus.notUploaded')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </>
  )
}
