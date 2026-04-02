"use client"

export default function DatabasesTab({ ctx }: { ctx: any }) {
  const { DatabaseHostsPanel, privateMode } = ctx

  return <DatabaseHostsPanel privateMode={privateMode} />
}
