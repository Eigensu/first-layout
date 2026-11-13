import type { ReactNode } from "react";
import type {
  BattingRow,
  BowlingRow,
  MvpRow,
  PointTableRow,
} from "@/lib/api/public/cricheroes";

// -- a table that scrolls sideways inside its card, never the page ----------

interface Column<Row> {
  key: string;
  header: string;
  /** The full name, for an abbreviated header ("SR"). */
  title?: string;
  cell: (row: Row, index: number) => ReactNode;
  align?: "left" | "right";
  /** The column a table is ranked by. */
  emphasis?: boolean;
  /** Stays in view while the rest scrolls on a narrow screen. */
  sticky?: boolean;
}

function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
}: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
}) {
  const cellClass = (column: Column<Row>, header: boolean) =>
    [
      "px-3 py-2.5 whitespace-nowrap",
      column.align === "left" ? "text-left" : "text-right tabular-nums",
      column.sticky
        ? `sticky left-0 z-10 ${header ? "bg-bg-elevated" : "bg-bg-card group-hover:bg-bg-card-soft"}`
        : "",
      !header && column.emphasis ? "font-semibold text-accent-pink-500" : "",
    ].join(" ");

  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-bg-card">
      <table className="w-full text-sm text-text-main">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-bg-elevated text-xs uppercase tracking-wide text-text-muted">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                title={column.title}
                className={`${cellClass(column, true)} font-medium`}
              >
                {column.title ? (
                  <abbr title={column.title} className="no-underline">
                    {column.header}
                  </abbr>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className="group border-t border-border-subtle transition-colors hover:bg-bg-card-soft"
            >
              {columns.map((column) => (
                <td key={column.key} className={cellClass(column, false)}>
                  {column.cell(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A figure as CricHeroes sent it, or a dash where they sent none. */
function figure(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "–" : String(value);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/**
 * Initials, not the photo or logo CricHeroes send (`profile_photo`,
 * `team_logo`): those live on CricHeroes' image host, and whether we may
 * hotlink them is still a question for CricHeroes
 * (docs/CRICHEROES_INTEGRATION_TECH_SPEC.md §9.1, §9.2).
 */
function Monogram({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-chip text-xs font-semibold text-text-main"
    >
      {initials(name)}
    </span>
  );
}

function NameCell({ name, detail }: { name: string; detail?: string | null }) {
  return (
    <div className="flex min-w-[10rem] items-center gap-3">
      <Monogram name={name} />
      <div className="min-w-0">
        <div className="font-medium text-text-main">{name}</div>
        {detail && <div className="text-xs text-text-muted">{detail}</div>}
      </div>
    </div>
  );
}

const rankColumn = <Row,>(rank?: (row: Row) => number | null | undefined): Column<Row> => ({
  key: "rank",
  header: "#",
  cell: (row, index) => <span className="text-text-muted">{rank?.(row) ?? index + 1}</span>,
});

// -- points table -----------------------------------------------------------

/** "W-W-L-NR" as one chip per result, latest last. */
function Form({ results }: { results?: string | null }) {
  const all = (results || "").split("-").filter(Boolean);
  if (all.length === 0) return <span className="text-text-muted">–</span>;
  return (
    <span className="inline-flex gap-1" aria-label={`Results so far: ${all.join(", ")}`}>
      {all.slice(-5).map((result, index) => {
        const tone =
          result === "W"
            ? "bg-success-tonal text-success"
            : result === "L"
              ? "bg-danger-tonal text-danger"
              : "bg-bg-chip text-text-main";
        return (
          <span
            key={index}
            aria-hidden
            className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 text-[10px] font-bold ${tone}`}
          >
            {result}
          </span>
        );
      })}
    </span>
  );
}

function groupLabel(row: PointTableRow): string {
  const group = row.group ? `Group ${row.group}` : "";
  return [row.round_name, group].filter(Boolean).join(" · ");
}

export function PointsTable({ rows }: { rows: PointTableRow[] }) {
  // One table per round and group, in the order CricHeroes list them.
  const groups = new Map<string, PointTableRow[]>();
  for (const row of rows) {
    const key = `${row.round_id ?? ""}|${row.group_id ?? row.group ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const showDrawn = rows.some((row) => (row.drawn ?? 0) > 0);
  const showTied = rows.some((row) => (row.tied ?? 0) > 0);

  const columns: Column<PointTableRow>[] = [
    rankColumn(),
    {
      key: "team",
      header: "Team",
      align: "left",
      sticky: true,
      cell: (row) => <NameCell name={row.team_name} />,
    },
    { key: "m", header: "M", title: "Matches", cell: (row) => figure(row.matches) },
    { key: "w", header: "W", title: "Won", cell: (row) => figure(row.won) },
    { key: "l", header: "L", title: "Lost", cell: (row) => figure(row.lost) },
    ...(showDrawn
      ? [{ key: "d", header: "D", title: "Drawn", cell: (row: PointTableRow) => figure(row.drawn) }]
      : []),
    ...(showTied
      ? [{ key: "t", header: "T", title: "Tied", cell: (row: PointTableRow) => figure(row.tied) }]
      : []),
    { key: "nr", header: "NR", title: "No result", cell: (row) => figure(row.no_result) },
    { key: "pts", header: "Pts", title: "Points", emphasis: true, cell: (row) => figure(row.points) },
    { key: "nrr", header: "NRR", title: "Net run rate", cell: (row) => figure(row.net_rr) },
    { key: "form", header: "Form", align: "left", cell: (row) => <Form results={row.last_5} /> },
  ];

  return (
    <div className="space-y-6">
      {Array.from(groups.values()).map((group, index) => {
        const label = groups.size > 1 ? groupLabel(group[0]) : "";
        return (
          <section key={index} className="space-y-2">
            {label && (
              <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                {label}
              </h3>
            )}
            <DataTable
              caption={label ? `Points table, ${label}` : "Points table"}
              columns={columns}
              rows={group}
              rowKey={(row, i) => `${row.team_id ?? row.team_name}-${i}`}
            />
          </section>
        );
      })}
    </div>
  );
}

// -- MVP --------------------------------------------------------------------

export function MvpTable({ rows }: { rows: MvpRow[] }) {
  return (
    <DataTable
      caption="Most valuable players"
      rows={rows}
      rowKey={(row) => String(row.player_id)}
      columns={[
        rankColumn<MvpRow>((row) => row.rank),
        {
          key: "player",
          header: "Player",
          align: "left",
          sticky: true,
          cell: (row) => (
            <NameCell name={row.name} detail={row.team_name} />
          ),
        },
        { key: "m", header: "M", title: "Matches", cell: (row) => figure(row.matches) },
        { key: "bat", header: "Bat", title: "Batting points", cell: (row) => figure(row.batting) },
        { key: "bowl", header: "Bowl", title: "Bowling points", cell: (row) => figure(row.bowling) },
        { key: "field", header: "Field", title: "Fielding points", cell: (row) => figure(row.fielding) },
        { key: "total", header: "Total", title: "Total points", emphasis: true, cell: (row) => figure(row.total) },
      ]}
    />
  );
}

// -- leaderboards -----------------------------------------------------------

function highestScore(row: BattingRow): string {
  if (row.highest_run === null || row.highest_run === undefined) return "–";
  return `${row.highest_run}${row.highest_run_with_not_out || ""}`;
}

export function BattingTable({ rows }: { rows: BattingRow[] }) {
  return (
    <DataTable
      caption="Batting leaderboard"
      rows={rows}
      rowKey={(row) => String(row.player_id)}
      columns={[
        rankColumn(),
        {
          key: "player",
          header: "Player",
          align: "left",
          sticky: true,
          cell: (row) => (
            <NameCell name={row.name} detail={row.team_name} />
          ),
        },
        { key: "m", header: "M", title: "Matches", cell: (row) => figure(row.total_match) },
        { key: "inns", header: "Inns", title: "Innings", cell: (row) => figure(row.innings) },
        { key: "runs", header: "Runs", emphasis: true, cell: (row) => figure(row.total_runs) },
        { key: "hs", header: "HS", title: "Highest score (* not out)", cell: highestScore },
        { key: "avg", header: "Avg", title: "Average", cell: (row) => figure(row.average) },
        { key: "sr", header: "SR", title: "Strike rate", cell: (row) => figure(row.strike_rate) },
        { key: "4s", header: "4s", title: "Fours", cell: (row) => figure(row.fours) },
        { key: "6s", header: "6s", title: "Sixes", cell: (row) => figure(row.sixes) },
        { key: "50s", header: "50s", title: "Fifties", cell: (row) => figure(row.fifties) },
        { key: "100s", header: "100s", title: "Hundreds", cell: (row) => figure(row.hundreds) },
      ]}
    />
  );
}

export function BowlingTable({ rows }: { rows: BowlingRow[] }) {
  return (
    <DataTable
      caption="Bowling leaderboard"
      rows={rows}
      rowKey={(row) => String(row.player_id)}
      columns={[
        rankColumn(),
        {
          key: "player",
          header: "Player",
          align: "left",
          sticky: true,
          cell: (row) => (
            <NameCell name={row.name} detail={row.team_name} />
          ),
        },
        { key: "m", header: "M", title: "Matches", cell: (row) => figure(row.total_match) },
        { key: "inns", header: "Inns", title: "Innings", cell: (row) => figure(row.innings) },
        { key: "wkts", header: "Wkts", title: "Wickets", emphasis: true, cell: (row) => figure(row.total_wickets) },
        { key: "overs", header: "Overs", cell: (row) => figure(row.overs) },
        { key: "runs", header: "Runs", title: "Runs conceded", cell: (row) => figure(row.runs) },
        { key: "econ", header: "Econ", title: "Economy", cell: (row) => figure(row.economy) },
        { key: "avg", header: "Avg", title: "Average", cell: (row) => figure(row.average) },
        { key: "sr", header: "SR", title: "Strike rate", cell: (row) => figure(row.strike_rate) },
        { key: "best", header: "Best", title: "Most wickets in an innings", cell: (row) => figure(row.highest_wicket) },
        { key: "mdns", header: "Mdns", title: "Maidens", cell: (row) => figure(row.maidens) },
        { key: "5w", header: "5W", title: "Five-wicket hauls", cell: (row) => figure(row.five_wickets) },
      ]}
    />
  );
}
