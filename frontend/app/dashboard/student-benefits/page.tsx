"use client"

import { PanelHeader } from "@/components/panel/header"
import { SectionHeader } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import {
  GraduationCap,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Upload,
  ExternalLink,
  Clock,
} from "lucide-react"

const HACKCLUB_ENABLED = process.env.NEXT_PUBLIC_HACKCLUB_STUDENT_ENABLED === 'true'
const GITHUB_ENABLED = process.env.NEXT_PUBLIC_GITHUB_STUDENT_ENABLED === 'true'

export default function StudentBenefitsPage() {
  const t = useTranslations("studentBenefits")
  const tCommon = useTranslations("identityPage")
  const { user } = useAuth()
  const [studentVerifStatus, setStudentVerifStatus] = useState<any>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofType, setProofType] = useState("enrollment_doc")
  const [submitting, setSubmitting] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)
  const [eduPlan, setEduPlan] = useState<any>(null)
  const [showPlanInfo, setShowPlanInfo] = useState(false)
  const [emailCode] = useState(() =>
    'STU-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()
  )

  useEffect(() => {
    apiFetch(API_ENDPOINTS.plans)
      .then((plans: any[]) => {
        const edu = plans?.find((p: any) => p.type === 'educational')
        if (edu) setEduPlan(edu)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (user) {
      apiFetch(API_ENDPOINTS.studentVerificationStatus.replace(':id', user.id.toString()))
        .then(setStudentVerifStatus)
        .catch(() => setStudentVerifStatus(null))
    }
  }, [user])

  const isVerified = user?.studentVerified
  const isPending = studentVerifStatus?.status === 'pending'
  const portalType = (user as any)?.portalType as string | undefined
  const isEducational = portalType === 'educational'

  const verifiedAt = (user as any)?.studentVerifiedAt ? new Date((user as any).studentVerifiedAt) : null
  const reverifyDaysLeft = verifiedAt
    ? Math.max(0, Math.ceil((verifiedAt.getTime() + 365 * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000)))
    : null
  async function startOAuth(provider: 'hackclub' | 'github') {
    setOauthLoading(provider)
    try {
      const endpoint = provider === 'hackclub'
        ? API_ENDPOINTS.hackclubStudentStart
        : API_ENDPOINTS.githubStudentStart
      const res: any = await apiFetch(endpoint, { method: 'GET' })
      if (res?.redirect) window.location.href = res.redirect
    } catch (e: any) {
      alert(e?.message || t("errors.oauthFailed"))
    } finally {
      setOauthLoading(null)
    }
  }

  async function submitEmailCode() {
    setSubmitting(true)
    try {
      await apiFetch(API_ENDPOINTS.studentVerification, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofType: 'school_email', emailCode }),
      })
      alert(t("manual.emailSubmitted"))
      if (user) {
        apiFetch(API_ENDPOINTS.studentVerificationStatus.replace(':id', user.id.toString()))
          .then(setStudentVerifStatus)
      }
    } catch (e: any) {
      alert(t("errors.submitFailed") + ': ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function submitProof() {
    if (!proofFile) { alert(t("manual.selectFile")); return }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('proof', proofFile)
      fd.append('proofType', proofType)
      await apiFetch(API_ENDPOINTS.studentVerification, { method: 'POST', body: fd })
      alert(t("manual.submitted"))
      setProofFile(null)
      if (user) {
        apiFetch(API_ENDPOINTS.studentVerificationStatus.replace(':id', user.id.toString()))
          .then(setStudentVerifStatus)
      }
    } catch (e: any) {
      alert(t("errors.submitFailed") + ': ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PanelHeader title={t("title")} description={t("description")} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">

          {/* Status banner */}
          <div className={`flex items-center gap-4 border p-5 ${
            isVerified ? 'border-success/30 bg-success/5' :
            isPending ? 'border-primary/30 bg-primary/5' :
            'border-warning/30 bg-warning/5'
          }`}>
            <div className={`flex h-12 w-12 items-center justify-center ${
              isVerified ? 'bg-success/10' : isPending ? 'bg-primary/10' : 'bg-warning/10'
            }`}>
              {isVerified ? <CheckCircle className="h-6 w-6 text-success" /> :
               isPending ? <Clock className="h-6 w-6 text-primary" /> :
               <GraduationCap className="h-6 w-6 text-warning" />}
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground">
                {isVerified ? t("status.verified") :
                 isPending ? t("status.pending") :
                 t("status.unverified")}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {isVerified ? t("status.verifiedDesc") :
                 isPending ? t("status.pendingDesc") :
                 t("status.unverifiedDesc")}
              </p>
            </div>
            {isVerified && (
              <a
                href="#student-perks"
                className="border border-border px-3 py-1.5 text-xs text-foreground hover:bg-secondary/20 transition-colors"
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById('student-perks')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                {t("status.viewBenefits")}
              </a>
            )}
          </div>

          {/* OAuth verification methods */}
          {!isVerified && !isPending && (
            <div className="border border-border bg-card p-6">
              <SectionHeader title={t("oauth.title")} description={t("oauth.description")} />
              <div className="mt-4 flex flex-col gap-3">
                {HACKCLUB_ENABLED && (
                  <button
                    disabled={oauthLoading !== null}
                    onClick={() => startOAuth('hackclub')}
                    className="flex items-center justify-between border border-border bg-secondary/30 px-4 py-3 text-sm text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all disabled:opacity-50"
                  >
                    <span>{t("oauth.hackclub")}</span>
                    {oauthLoading === 'hackclub' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                )}
                {GITHUB_ENABLED && (
                  <button
                    disabled={oauthLoading !== null}
                    onClick={() => startOAuth('github')}
                    className="flex items-center justify-between border border-border bg-secondary/30 px-4 py-3 text-sm text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all disabled:opacity-50"
                  >
                    <span>{t("oauth.github")}</span>
                    {oauthLoading === 'github' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                )}
                {!HACKCLUB_ENABLED && !GITHUB_ENABLED && (
                  <p className="text-sm text-muted-foreground">{t("oauth.noneAvailable")}</p>
                )}
              </div>
            </div>
          )}

          {/* Manual verification */}
          {!isVerified && !isPending && (
            <div className="border border-border bg-card p-6">
              <SectionHeader title={t("manual.title")} description={t("manual.description")} />
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">{t("manual.proofTypeLabel")}</label>
                  <select
                    value={proofType}
                    onChange={(e) => setProofType(e.target.value)}
                    className="border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                  >
                    <option value="enrollment_doc">{t("manual.enrollmentDoc")}</option>
                    <option value="school_email">{t("manual.schoolEmail")}</option>
                    <option value="github_screenshot">{t("manual.githubScreenshot")}</option>
                    <option value="other">{t("manual.other")}</option>
                  </select>
                </div>
                {proofType === 'school_email' ? (
                  <div className="flex flex-col items-center gap-3 border border-primary/20 bg-primary/5 p-6 text-center">
                    <p className="text-sm text-foreground">{t("manual.emailInstruction")}</p>
                    <a
                      href={`mailto:hi@ecli.app?subject=Student Verification ${emailCode}`}
                      className="text-lg font-semibold text-primary hover:underline"
                    >
                      hi@ecli.app
                    </a>
                    <div className="mt-1 rounded border border-border bg-secondary/30 px-4 py-2">
                      <p className="text-xs text-muted-foreground">{t("manual.emailCodeLabel")}</p>
                      <p className="font-mono text-lg font-bold tracking-wider text-foreground select-all">{emailCode}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("manual.emailNote")}</p>
                    <button
                      disabled={submitting}
                      onClick={submitEmailCode}
                      className="mt-2 bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all"
                    >
                      {submitting ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {tCommon("actions.uploading")}
                        </span>
                      ) : t("manual.emailSent")}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-foreground">{t("manual.proofLabel")}</label>
                      <p className="text-xs text-muted-foreground">{t("manual.proofHint")}</p>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                        className="border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-all file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:text-primary file:cursor-pointer"
                      />
                      {proofFile && <p className="text-xs text-success">{tCommon("start.selected")}: {proofFile.name}</p>}
                    </div>
                    <button
                      disabled={submitting || !proofFile}
                      onClick={submitProof}
                      className="mt-1 bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {submitting ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {tCommon("actions.uploading")}
                        </span>
                      ) : t("manual.submit")}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Pending state */}
          {isPending && (
            <div className="border border-border bg-card p-6">
              <SectionHeader title={t("pending.title")} description={t("pending.description")} />
              <div className="mt-4 flex items-center gap-3 border border-primary/30 bg-primary/5 p-4">
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
                <div>
                  <p className="text-sm font-medium text-foreground">{t("pending.underReview")}</p>
                  <p className="text-xs text-muted-foreground">{t("pending.timeframe")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Verified perks */}
          {isVerified && (
            <div id="student-perks" className="border border-border bg-card p-6">
              <SectionHeader title={t("perks.title")} description={t("perks.description")} />
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { label: t("perks.plan"), value: t("perks.educationalPlan"), info: !!eduPlan },
                  { label: t("perks.eloBonus"), value: "+20%" },
                  { label: t("perks.voteWeight"), value: "1.1×" },
                  { label: t("perks.reverify"), value: reverifyDaysLeft != null
                    ? t("perks.daysLeft", { days: reverifyDaysLeft })
                    : t("perks.annual") },
                ].map(p => (
                  <div key={p.label} className="flex items-center justify-between border border-border bg-secondary/20 px-4 py-3">
                    <span className="text-sm text-foreground">{p.label}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-success">{p.value}</span>
                      {p.info && (
                        <span
                          className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-muted-foreground/30 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                          onClick={() => setShowPlanInfo(!showPlanInfo)}
                        >
                          ?
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              {showPlanInfo && eduPlan && (
                <div className="mt-3 border border-primary/20 bg-primary/5 px-4 py-3">
                  <p className="text-xs font-medium text-foreground">{eduPlan.name || t("perks.educationalPlan")}</p>
                  {eduPlan.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{eduPlan.description}</p>
                  )}
                  {eduPlan.features?.list && Array.isArray(eduPlan.features.list) && eduPlan.features.list.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {eduPlan.features.list.map((f: string, i: number) => (
                        <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-1 w-1 rounded-full bg-primary/50 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {showPlanInfo && !eduPlan && (
                <div className="mt-3 border border-primary/20 bg-primary/5 px-4 py-3">
                  <p className="text-xs text-muted-foreground">{t("perks.planInfo")}</p>
                </div>
              )}
              {isEducational && (
                <div className="mt-1 flex items-center gap-2 border border-success/20 bg-success/5 px-4 py-3">
                  <CheckCircle className="h-4 w-4 text-success shrink-0" />
                  <p className="text-sm text-foreground">{t("perks.activePlan")}</p>
                </div>
              )}
            </div>
          )}

        </div>
      </ScrollArea>
    </>
  )
}