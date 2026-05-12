import { motion } from "framer-motion";
import { useMemo, useId } from "react";
import { ContributorCommitHistoryPoint } from "../ContributorsClient";

export function ActivityChart({
  history,
}: {
  history: ContributorCommitHistoryPoint[];
}) {
  const DAYS = 350;
  const WIDTH = 1000;
  const HEIGHT = 260;
  const PADDING_X = 18;
  const PADDING_Y = 24;

  const gradientId = useId().replace(/:/g, "");
  const lineGradientId = `activity-line-${gradientId}`;
  const areaGradientId = `activity-area-${gradientId}`;

  const countMap = useMemo(() => {
    const m: Record<string, number> = {};

    for (const point of history) {
      m[point.date.slice(0, 10)] = point.count;
    }

    return m;
  }, [history]);

  const points = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - DAYS + 1);

    const days = Array.from({ length: DAYS }, (_, index) => {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + index);

      const date = d.toISOString().slice(0, 10);

      return {
        date,
        count: countMap[date] ?? 0,
      };
    });

    const maxCount = Math.max(...days.map((d) => d.count), 1);

    return days.map((day, index) => {
      const x =
        PADDING_X + (index / Math.max(DAYS - 1, 1)) * (WIDTH - PADDING_X * 2);

      const y =
        HEIGHT - PADDING_Y - (day.count / maxCount) * (HEIGHT - PADDING_Y * 2);

      return {
        ...day,
        x,
        y,
      };
    });
  }, [countMap]);

  const maxCount = useMemo(
    () => Math.max(...points.map((point) => point.count), 1),
    [points],
  );

  const linePath = useMemo(() => {
    if (points.length === 0) return "";

    return points
      .map((point, index) =>
        index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`,
      )
      .join(" ");
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return "";

    const first = points[0];
    const last = points[points.length - 1];

    return `
      M ${first.x} ${HEIGHT - PADDING_Y}
      L ${points.map((point) => `${point.x} ${point.y}`).join(" L ")}
      L ${last.x} ${HEIGHT - PADDING_Y}
      Z
    `;
  }, [points]);

  const labels = useMemo(() => {
    const first = points[0];
    const middle = points[Math.floor(points.length / 2)];
    const last = points[points.length - 1];

    return [first, middle, last].filter(Boolean);
  }, [points]);

  return (
    <div className="w-full">
      <div className="relative w-full overflow-hidden border border-white/10 bg-white/2 p-4">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto overflow-visible"
          role="img"
          aria-label="Contributor commit activity line chart"
        >
          <defs>
            <linearGradient id={lineGradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#e594c7" stopOpacity="0.65" />
              <stop offset="50%" stopColor="#B85A96" stopOpacity="1" />
              <stop offset="100%" stopColor="#e594c7" stopOpacity="0.65" />
            </linearGradient>

            <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#B85A96" stopOpacity="0.35" />
              <stop offset="65%" stopColor="#B85A96" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#B85A96" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = PADDING_Y + ratio * (HEIGHT - PADDING_Y * 2);

            return (
              <line
                key={ratio}
                x1={PADDING_X}
                x2={WIDTH - PADDING_X}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            );
          })}

          <motion.path
            d={areaPath}
            fill={`url(#${areaGradientId})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />

          <motion.path
            d={linePath}
            fill="none"
            stroke={`url(#${lineGradientId})`}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />

          {points.map((point, index) => (
            <circle
              key={`${point.date}-${index}`}
              cx={point.x}
              cy={point.y}
              r="7"
              fill="transparent"
              className="cursor-default"
            >
              <title>
                {point.date}: {point.count} commit
                {point.count !== 1 ? "s" : ""}
              </title>
            </circle>
          ))}
        </svg>

        <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/30">
          {labels.map((label) => (
            <span key={label.date}>
              {new Date(label.date).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
          <span className="text-[10px] uppercase tracking-widest text-white/30">
            Commit activity
          </span>

          <span className="font-mono text-xs text-white/50">
            Peak: {maxCount}
          </span>
        </div>
      </div>
    </div>
  );
}
