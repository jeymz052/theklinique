"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ALL_ROLES, getDashboardRoute, useRoleAuth } from "@/lib/rbac";

export default function SettingsPage() {
  const router = useRouter();
  const { role, loading } = useRoleAuth(ALL_ROLES);

  useEffect(() => {
    if (!loading && role) router.replace(`${getDashboardRoute(role)}?view=settings`);
  }, [loading, role, router]);

  return <div className="dk-loading"><i className="fa-solid fa-spinner fa-spin fa-2x" /></div>;
}
