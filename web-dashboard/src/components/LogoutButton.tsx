"use client";

import { useRouter } from "next/navigation";

export function LogoutButton({ tenantId }: { tenantId: string }) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(`/${tenantId}/login`);
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, padding: 0 }}
    >
      Выйти
    </button>
  );
}
