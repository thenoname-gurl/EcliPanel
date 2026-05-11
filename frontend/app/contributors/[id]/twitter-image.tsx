import { ImageResponse } from "next/og";
import { formatContributorDescription, getContributorMetaById } from "./contributor-meta";

export const runtime = "edge";
export const alt = "EclipseSystems contributor stats";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

type TwitterImageProps = {
  params: Promise<{ id: string }>;
};

function compactDate(value?: string): string {
  if (!value) return "No recent commits";
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default async function TwitterImage({ params }: TwitterImageProps) {
  const { id } = await params;
  const { contributor, snapshot } = await getContributorMetaById(id);

  if (!contributor) {
    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            background: "#0a0a0a",
            color: "#ffffff",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: -1,
          }}
        >
          Contributor not found
        </div>
      ),
      size,
    );
  }

  const chartData = (contributor.commitHistory || []).slice(-40);
  const maxPoint = Math.max(...chartData.map((p) => p.count), 1);

  const chartWidth = 1100;
  const chartHeight = 120;

  const points =
    chartData.length > 1
      ? chartData
          .map((point, i) => {
            const x = (i / (chartData.length - 1)) * chartWidth;
            const y = chartHeight - Math.max(4, (point.count / maxPoint) * chartHeight);
            return `${x},${y}`;
          })
          .join(" ")
      : `0,${chartHeight} ${chartWidth},${chartHeight}`;

  const firstDate = chartData[0]?.date;
  const midDate = chartData[Math.floor(chartData.length / 2)]?.date;
  const lastDate = chartData[chartData.length - 1]?.date;

  function shortDate(value?: string): string {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" })
        .format(new Date(value))
        .toUpperCase();
    } catch {
      return value;
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0a0a0a",
          color: "#ffffff",
          fontFamily: "ui-monospace, monospace",
          padding: "40px 50px",
          gap: 0,
          overflow: "hidden",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <img
              src={contributor.avatarUrl}
              alt={contributor.login}
              width={80}
              height={80}
              style={{
                borderRadius: 8,
                objectFit: "cover",
                border: "1px solid #2a2a2a",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5, color: "#ffffff" }}>
                @{contributor.login}
              </span>
              <span style={{ fontSize: 16, color: "#888888" }}>
                Last commit at: {compactDate(contributor.lastCommitAt)}
              </span>
            </div>
          </div>

          <span style={{ fontSize: 16, color: "#aaaaaa", letterSpacing: 0.2 }}>
            EclipseSystems
          </span>
        </div>

        {/* Stats card */}
        <div
          style={{
            display: "flex",
            border: "1px solid #222222",
            borderRadius: 10,
            padding: "18px 40px",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 16,
            background: "#0f0f0f",
            flexShrink: 0,
          }}
        >
          {[
            ["Contributions", contributor.contributions],
            ["Pull Requests", contributor.pullRequests],
            ["Merged Pull Requests", contributor.mergedPullRequests],
          ].map(([label, value], i, arr) => (
            <div
              key={String(label)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                flex: 1,
                borderRight: i < arr.length - 1 ? "1px solid #222222" : "none",
                padding: "0 20px",
              }}
            >
              <span style={{ fontSize: 14, color: "#888888", letterSpacing: 0.3 }}>{label}</span>
              <span style={{ fontSize: 38, fontWeight: 800, color: "#ffffff", letterSpacing: -1 }}>
                {Number(value)}
              </span>
            </div>
          ))}
        </div>

        {/* Activity chart card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: "1px solid #222222",
            borderRadius: 10,
            padding: "16px 24px 0px 24px",
            background: "#0f0f0f",
            flexShrink: 0,
            height: 290,
            overflow: "hidden",
          }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "#cccccc",
              marginBottom: 10,
              letterSpacing: 0.5,
              flexShrink: 0,
            }}
          >
            Activity
          </span>

          {/* Grid lines */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              height: chartHeight,
              flexShrink: 0,
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  width: "100%",
                  height: 1,
                  background: "#1e1e1e",
                }}
              />
            ))}
          </div>

          {/* SVG chart — overlaps grid via negative margin */}
          <div
            style={{
              display: "flex",
              marginTop: -chartHeight,
              flexShrink: 0,
            }}
          >
            <svg
              width="100%"
              height={chartHeight}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
              style={{ display: "flex" }}
            >
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e879a8" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#e879a8" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              {chartData.length > 1 && (
                <polygon
                  points={`0,${chartHeight} ${points} ${chartWidth},${chartHeight}`}
                  fill="url(#areaGrad)"
                />
              )}
              <polyline
                points={points}
                fill="none"
                stroke="#e879a8"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Date labels */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "#555555",
              fontSize: 12,
              padding: "8px 0 8px 0",
              letterSpacing: 0.5,
              flexShrink: 0,
            }}
          >
            <span>{shortDate(firstDate)}</span>
            <span>{shortDate(midDate)}</span>
            <span>{shortDate(lastDate)}</span>
          </div>

          {/* Footer meta row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1px solid #1e1e1e",
              paddingTop: 10,
              paddingBottom: 12,
              color: "#555555",
              fontSize: 12,
              letterSpacing: 0.8,
              flexShrink: 0,
            }}
          >
            <span>COMMIT ACTIVITY</span>
            <span>Peak: {maxPoint}</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}