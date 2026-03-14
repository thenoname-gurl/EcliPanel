"use client"

import { PanelHeader } from "@/components/panel/header"
import { StatusBadge, UsageBar, StatCard, SectionHeader } from "@/components/panel/shared"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import {
  Plus,
  Cpu,
  DollarSign,
  Server,
  Globe,
  Power,
  Trash2,
  Terminal,
  Clock,
} from "lucide-react"

export default function ComputePage() {
  const [instances, setInstances] = useState<any[]>([])
  const running = instances.filter((i) => i.status === "running")
  const totalCostPerHour = running.reduce((sum, i) => sum + (i.costPerHour || 0), 0)

  useEffect(() => {
    apiFetch(API_ENDPOINTS.instances)
      .then((data) => setInstances(data || []))
      .catch(() => setInstances([]))
  }, [])

  return (
    <>
      <PanelHeader
        title="Compute Instances"
        description="Billed hourly - deploy and manage cloud instances"
      />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-6">
          {/* Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Active Instances"
              value={running.length}
              subtitle={`${instances.length} total`}
              icon={Server}
            />
            <StatCard
              title="Hourly Cost"
              value={`$${totalCostPerHour.toFixed(2)}`}
              subtitle="Current running cost"
              icon={DollarSign}
            />
            <StatCard
              title="Total vCPUs"
              value="8"
              subtitle="Across all instances"
              icon={Cpu}
            />
            <StatCard
              title="Est. Monthly"
              value={`$${(totalCostPerHour * 720).toFixed(2)}`}
              subtitle="Based on current usage"
              icon={Clock}
            />
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <SectionHeader title="Instances" description="Deploy and manage your compute resources" />
            <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              <Plus className="h-4 w-4" />
              Deploy Instance
            </button>
          </div>

          {/* Instance Cards */}
          <div className="flex flex-col gap-4">
            {instances.map((instance) => (
              <div
                key={instance.id}
                className="group rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_15px_var(--glow)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  {/* Info */}
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Cpu className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground">
                          {instance.name}
                        </h3>
                        <StatusBadge status={instance.status} />
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Server className="h-3 w-3" />
                          {instance.type}
                        </span>
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {instance.region}
                        </span>
                        <Badge
                          variant="outline"
                          className="border-border bg-secondary/50 text-muted-foreground font-mono text-[10px]"
                        >
                          {instance.ip}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Resources */}
                  <div className="flex flex-1 items-center gap-6 lg:max-w-md">
                    <div className="flex-1">
                      <UsageBar label="CPU" value={instance.cpu} />
                    </div>
                    <div className="flex-1">
                      <UsageBar label="RAM" value={instance.ram} />
                    </div>
                  </div>

                  {/* Cost & Actions */}
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-mono text-sm font-medium text-foreground">
                        ${instance.costPerHour.toFixed(2)}/hr
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ~${(instance.costPerHour * 720).toFixed(2)}/mo
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                        <Terminal className="h-4 w-4" />
                      </button>
                      <button className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                        <Power className="h-4 w-4" />
                      </button>
                      <button className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </>
  )
}
