export type ModerationAuditExportRow = {
  createdAt: string;
  adminWallet: string;
  action: string;
  commentId: string | null;
  details: Record<string, unknown>;
};

function csvCell(value: string) {
  const formulaSafe = /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

export function buildModerationAuditCsv(rows: ModerationAuditExportRow[]) {
  const header = [
    "created_at",
    "admin_wallet",
    "action",
    "comment_id",
    "details",
  ];
  const lines = rows.map((row) =>
    [
      row.createdAt,
      row.adminWallet,
      row.action,
      row.commentId ?? "",
      JSON.stringify(row.details),
    ]
      .map(csvCell)
      .join(","),
  );
  return `${header.map(csvCell).join(",")}\r\n${lines.join("\r\n")}${
    lines.length > 0 ? "\r\n" : ""
  }`;
}
