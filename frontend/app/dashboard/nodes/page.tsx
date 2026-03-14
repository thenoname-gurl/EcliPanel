"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function NodesRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/dashboard/infrastructure/nodes")
  }, [router])
  return null
}