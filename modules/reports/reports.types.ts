// reports module — types.
export type ColumnType = "text" | "number" | "money" | "date" | "datetime" | "percent" | "status";

export interface ReportColumn {
  key: string;
  label: string;
  type?: ColumnType;
}

export interface ReportParams {
  from: Date | null;
  toExclusive: Date | null; // day after the "to" date
  department: string | null;
}
