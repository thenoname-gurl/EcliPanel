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
} from "lucide-react"

// Feature flags
const HACKCLUB_STUDENT_ENABLED = process.env.NEXT_PUBLIC_HACKCLUB_STUDENT_ENABLED === 'true';
const GITHUB_STUDENT_ENABLED = process.env.NEXT_PUBLIC_GITHUB_STUDENT_ENABLED === 'true';

// helper to derive step status from backend record
function computeSteps(record: any | null, passkeyCount: number, emailVerified: boolean, studentVerified: boolean, portalType?: string, euIdDisabled?: boolean) {
  const base = [
    { id: 1, title: "Email Verification", description: emailVerified ? "Your email has been verified" : "Verify your email address to continue", icon: FileText },
    { id: 2, title: "Security Verification", description: "Register a passkey and enable two-factor authentication", icon: KeyRound },
    {
      id: 3,
      title: "Identity Document",
      description: euIdDisabled
        ? "Not applicable for EU residents"
        : "Upload a government-issued ID",
      icon: Upload,
    },
    {
      id: 4,
      title: "Selfie Verification",
      description: euIdDisabled
        ? "Not applicable for EU residents"
        : "Take a photo to match your ID",
      icon: Camera,
    },
    { id: 5, title: "Student Verification", description: studentVerified ? "Student status confirmed" : HACKCLUB_STUDENT_ENABLED ? "Connect Hack Club to verify educational status" : GITHUB_STUDENT_ENABLED ? "Connect GitHub to verify educational status" : "Student verification is coming soon", icon: User },
  ] as any[];

  let stepsBase = base;
  if (portalType === 'educational') {
    stepsBase = base.filter((s) => s.id !== 5);
  }

  const completed = record?.status === "verified";
  const pending = record?.status === "pending";
  const failed = record?.status === "failed";
  const securityDone = passkeyCount > 0;
  return stepsBase.map((s, idx) => {
    if (idx === 0) return { ...s, status: emailVerified ? "completed" : "available" };
    if (idx === 1) {
      if (!emailVerified) return { ...s, status: "locked" };
      return { ...s, status: securityDone ? "completed" : "available" };
    }
    if (idx === 2) {
      if (!emailVerified) return { ...s, status: "locked" };
      if (euIdDisabled) return { ...s, status: "notApplicable" };
      if (completed) return { ...s, status: "completed" };
      if (pending) return { ...s, status: "pending" };
      if (failed) return { ...s, status: "failed" };
      return { ...s, status: "available" };
    }
    if (idx === 3) {
      if (!emailVerified) return { ...s, status: "locked" };
      if (euIdDisabled) return { ...s, status: "notApplicable" };
      if (completed) return { ...s, status: "completed" };
      if (pending) return { ...s, status: "pending" };
      if (failed) return { ...s, status: "failed" };
      return { ...s, status: "available" };
    }
    if (idx === 4) {
      if (!emailVerified || !securityDone) return { ...s, status: "locked" };
      if (studentVerified) return { ...s, status: "completed" };
      return { ...s, status: "available" };
    }
    return { ...s, status: "locked" };
  });
}

export default function IdentityPage() {
  const { user } = useAuth()
  const [status, setStatus] = useState<any>(null)
  const [passkeyCount, setPasskeyCount] = useState(0)
  const [idDocFile, setIdDocFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [euIdDialogOpen, setEuIdDialogOpen] = useState(false)
  const euIdDisabled = !!user?.euIdVerificationDisabled

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

  const steps = computeSteps(status, passkeyCount, !!user?.emailVerified, !!user?.studentVerified, user?.portalType, euIdDisabled)

  return (
    <>
      <PanelHeader title="Identity Verification" description="Verify your identity for enhanced account features" />
      <Dialog open={euIdDialogOpen} onOpenChange={setEuIdDialogOpen}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle>ID Verification Unavailable</DialogTitle>
            <DialogDescription>
              ID verification is currently disabled for residents of the European Union due to local regulations.
              If you believe you should still have access, please contact support.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setEuIdDialogOpen(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">
          {/* Status Banner */}
          {(() => {
            const s = computeSteps(status, passkeyCount, !!user?.emailVerified, !!user?.studentVerified, user?.portalType);
            const requiredSteps = s.slice(0, 4);
            const doneRequired = requiredSteps.filter((x: any) => x.status === 'completed' || x.status === 'notApplicable').length;
            const allRequired = doneRequired === 4;
            const borderColor = allRequired ? 'border-success/30' : 'border-warning/30';
            const bgColor = allRequired ? 'bg-success/5' : 'bg-warning/5';
            const iconBg = allRequired ? 'bg-success/10' : 'bg-warning/10';
            const iconText = allRequired ? 'text-success' : 'text-warning';
            const badgeBorder = allRequired ? 'border-success/30' : 'border-warning/30';
            const badgeBg = allRequired ? 'bg-success/10' : 'bg-warning/10';
            const badgeText = allRequired ? 'text-success' : 'text-warning';
            return (
              <div className={`flex items-center gap-4 rounded-xl border ${borderColor} ${bgColor} p-5`}>
                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${iconBg}`}>
                  {allRequired ? <CheckCircle className={`h-6 w-6 ${iconText}`} /> : <Fingerprint className={`h-6 w-6 ${iconText}`} />}
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">{allRequired ? 'Verification Complete' : 'Verification Partially Complete'}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {allRequired
                      ? 'All required steps are verified. Enterprise features and higher resource limits are unlocked.'
                      : 'Complete the four required steps to unlock enterprise features and higher resource limits.'}
                  </p>
                </div>
                <Badge variant="outline" className={`${badgeBorder} ${badgeBg} ${badgeText}`}>
                  {`${doneRequired}/4 Required`}
                </Badge>
              </div>
            );
          })()}

          {/* Verification Steps */}
          {(status?.status === 'failed' || !status) && (
            <div className="rounded-xl border border-border bg-card p-6">
              <SectionHeader title="Start Verification" description="Submit your ID information" />
              <div className="mt-4 grid grid-cols-1 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">Government-Issued ID Document</label>
                  <p className="text-xs text-muted-foreground">Accepted: JPEG, PNG, PDF (max 10MB)</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    disabled={euIdDisabled}
                    onChange={(e) => setIdDocFile(e.target.files?.[0] ?? null)}
                    className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-all file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:text-primary file:cursor-pointer"
                  />
                  {idDocFile && <p className="text-xs text-success">Selected: {idDocFile.name}</p>}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">Selfie Photo</label>
                  <p className="text-xs text-muted-foreground">Take or upload a clear photo of your face (JPEG, PNG)</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={euIdDisabled}
                    onChange={(e) => setSelfieFile(e.target.files?.[0] ?? null)}
                    className="rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-all file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:text-primary file:cursor-pointer"
                  />
                  {selfieFile && <p className="text-xs text-success">Selected: {selfieFile.name}</p>}
                </div>
                <button
                  disabled={euIdDisabled || submitting || !idDocFile || !selfieFile}
                  onClick={async () => {
                    if (!idDocFile || !selfieFile) { alert('Please select both files'); return; }
                    setSubmitting(true);
                    try {
                      const formData = new FormData();
                      formData.append('idDocument', idDocFile);
                      formData.append('selfie', selfieFile);
                      await apiFetch(API_ENDPOINTS.identity, { method: 'POST', body: formData });
                      alert('Verification submitted - your documents are under review.');
                      setIdDocFile(null);
                      setSelfieFile(null);
                      if (user) apiFetch(API_ENDPOINTS.identityStatus.replace(':id', user.id.toString())).then((d) => setStatus(d));
                    } catch (e: any) {
                      alert('Failed: ' + e.message);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="mt-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {submitting ? 'Uploading...' : 'Submit for Verification'}
                </button>
              </div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card p-6">
            <SectionHeader title="Verification Steps" description="Complete each step to verify your identity" />
            <div className="mt-6 flex flex-col gap-4">
          {computeSteps(status, passkeyCount, !!user?.emailVerified, !!user?.studentVerified, user?.portalType, euIdDisabled).map((step, idx) => (
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
                      Verified
                    </Badge>
                  )}
                  {step.status === "pending" && (
                    <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                      Pending
                    </Badge>
                  )}
                  {step.status === "notApplicable" && (
                    <Badge variant="outline" className="border-muted/30 bg-muted/10 text-muted-foreground">
                      Not Applicable
                    </Badge>
                  )}
                  {/* student verification button */}
                  {step.id === 5 && step.status === "available" && HACKCLUB_STUDENT_ENABLED && (
                    <button
                      onClick={async () => {
                        try {
                          const res: any = await apiFetch(API_ENDPOINTS.hackclubStudentStart, { method: 'GET' });
                          if (res.redirect) {
                            window.location.href = res.redirect;
                          }
                        } catch (e: any) {
                          alert(e.message || 'Failed to start Hack Club flow');
                        }
                      }}
                      className="rounded-lg border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary/20"
                    >
                      Connect Hack Club
                    </button>
                  )}
                  {step.id === 5 && step.status === "available" && !HACKCLUB_STUDENT_ENABLED && GITHUB_STUDENT_ENABLED && (
                    <button
                      onClick={async () => {
                        try {
                          const res: any = await apiFetch(API_ENDPOINTS.githubStudentStart, { method: 'GET' });
                          if (res.redirect) {
                            window.location.href = res.redirect;
                          }
                        } catch (e: any) {
                          alert(e.message || 'Failed to start GitHub flow');
                        }
                      }}
                      className="rounded-lg border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary/20"
                    >
                      Connect GitHub
                    </button>
                  )}
                  {step.status === "failed" && (
                    <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                      Failed - Resubmit
                    </Badge>
                  )}
                  {step.status === "available" && step.id !== 5 && (
                    <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground">
                      Upload above
                    </Badge>
                  )}
                  {step.status === "available" && step.id === 5 && !HACKCLUB_STUDENT_ENABLED && !GITHUB_STUDENT_ENABLED && (
                    <Badge variant="outline" className="border-muted/30 bg-muted/10 text-muted-foreground">
                      Coming soon
                    </Badge>
                  )}
                  {step.status === "locked" && (
                    <Badge variant="outline" className="border-border bg-secondary/50 text-muted-foreground" title="Complete the previous step first">
                      Locked
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Verified Info */}
          <div className="rounded-xl border border-border bg-card p-6">
            <SectionHeader title="Verified Information" description="Your verified account details" />
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Full Name</p>
                  <p className="text-sm font-medium text-foreground">{user?.firstName} {user?.lastName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium text-foreground">{user?.email}</p>
                </div>
                <CheckCircle className="ml-auto h-4 w-4 text-success" />
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Account ID</p>
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
                  <p className="text-xs text-muted-foreground">ID Document</p>
                  <p className="text-sm text-muted-foreground">
                    {euIdDisabled
                      ? status?.status === 'verified'
                        ? 'Verified | Not Applicable for EU residents'
                        : 'Not Applicable for EU residents'
                      : status?.status === 'verified'
                        ? 'Verified'
                        : status?.status === 'pending'
                          ? 'Under Review'
                          : status?.status === 'failed'
                            ? 'Failed — please resubmit'
                            : 'Not yet uploaded'}
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
