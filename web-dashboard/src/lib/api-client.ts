export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function fetchRunDetails(runId: string, tenantId: string) {
  const res = await fetch(`/api/runs/${runId}?tenantId=${encodeURIComponent(tenantId)}`);
  if (!res.ok) throw new Error("Failed to fetch run details");
  return res.json();
}

export async function approveRun(runId: string, tenantId: string) {
  const res = await fetch(`/api/runs/${runId}/approve?tenantId=${encodeURIComponent(tenantId)}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to approve run");
  return res.json();
}

export async function rejectRun(runId: string, tenantId: string) {
  const res = await fetch(`/api/runs/${runId}/reject?tenantId=${encodeURIComponent(tenantId)}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to reject run");
  return res.json();
}

export async function saveRunEdits(runId: string, tenantId: string, payload: any) {
  const res = await fetch(`/api/runs/${runId}/edit?tenantId=${encodeURIComponent(tenantId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to save run edits");
  return res.json();
}

export async function triggerRedesign(
  runId: string,
  tenantId: string,
  notes: string,
  template_name?: string
) {
  const res = await fetch(`/api/runs/${runId}/redesign?tenantId=${encodeURIComponent(tenantId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes, template_name }),
  });
  if (!res.ok) throw new Error("Failed to trigger redesign");
  return res.json();
}

export async function triggerReprocess(runId: string, tenantId: string, notes: string) {
  const res = await fetch(`/api/runs/${runId}/reprocess?tenantId=${encodeURIComponent(tenantId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error("Failed to trigger reprocess");
  return res.json();
}

export async function triggerAdaptation(runId: string, tenantId: string, platforms: string[]) {
  const res = await fetch(`/api/runs/${runId}/adapt?tenantId=${encodeURIComponent(tenantId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platforms }),
  });
  if (!res.ok) throw new Error("Failed to adapt post");
  return res.json();
}
