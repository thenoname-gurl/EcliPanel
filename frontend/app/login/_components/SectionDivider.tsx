export function SectionDivider({
  label,
  icon: Icon,
}: {
  label: string;
  icon?: any;
}) {
  return (
    <div className="flex items-center gap-3 pt-2 pb-1">
      <div className="h-px flex-1 bg-border/50" />

      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>

      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}
