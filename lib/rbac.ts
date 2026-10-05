"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export type UserRole = "superadmin" | "doctor" | "secretary" | "patient";

export const ALL_ROLES: UserRole[] = ["superadmin", "doctor", "secretary", "patient"];

export const ROLE_PERMISSIONS = {
  superadmin: ["appointments:read", "appointments:write", "patients:read", "clinical:read", "clinical:write", "reports:read", "settings:write", "users:manage"],
  doctor: ["appointments:read", "appointments:write", "patients:read", "clinical:read", "clinical:write", "reports:read", "settings:write", "users:manage"],
  secretary: ["appointments:read", "appointments:write", "patients:read"],
  patient: ["appointments:read:own", "appointments:create:own", "clinical:read:own"],
} as const satisfies Record<UserRole, readonly string[]>;

/**
 * Known administrative emails for fail-safe RBAC resolution
 */
export const KNOWN_ADMIN_EMAILS: Record<string, UserRole> = {
  "estebanjames67@gmail.com": "superadmin",
  "thekliniqueph@gmail.com": "doctor",
};

/**
 * Returns the destination dashboard route for a given role
 */
export function getDashboardRoute(role: UserRole): string {
  switch (role) {
    case "superadmin":
      return "/dashboard/doctor";
    case "doctor":
      return "/dashboard/doctor";
    case "secretary":
      return "/dashboard/secretary";
    case "patient":
    default:
      return "/dashboard/patient";
  }
}

/**
 * Resolves the role of a user from:
 * 1. Hardcoded administrative email whitelist (bulletproof fallback)
 * 2. Supabase Auth app_metadata.role (set by admin)
 * 3. Supabase profiles table role
 * 4. Defaults to "patient"
 */
export async function resolveUserRole(user: User | null): Promise<UserRole> {
  if (!user) return "patient";

  const emailLower = (user.email || "").toLowerCase().trim();

  // 1. Known admin check
  if (KNOWN_ADMIN_EMAILS[emailLower]) {
    return KNOWN_ADMIN_EMAILS[emailLower];
  }

  // 2. app_metadata (secure claim set by service role)
  if (user.app_metadata && user.app_metadata.role) {
    const appRole = user.app_metadata.role as UserRole;
    if (ALL_ROLES.includes(appRole)) {
      return appRole;
    }
  }

  // 3. Supabase public.profiles table (if table exists). Never trust
  // user_metadata for staff roles because users can edit that metadata.
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!error && data && data.role) {
      const profileRole = data.role as UserRole;
      if (ALL_ROLES.includes(profileRole)) return profileRole;
    }
  } catch {
    // If table doesn't exist yet, proceed gracefully
  }

  return "patient";
}

/**
 * Synchronous best-effort role extractor from user object in session
 */
export function getFastUserRole(user: User | null): UserRole {
  if (!user) return "patient";

  const emailLower = (user.email || "").toLowerCase().trim();
  if (KNOWN_ADMIN_EMAILS[emailLower]) {
    return KNOWN_ADMIN_EMAILS[emailLower];
  }

  if (user.app_metadata?.role && ALL_ROLES.includes(user.app_metadata.role as UserRole)) {
    return user.app_metadata.role as UserRole;
  }

  return "patient";
}

/**
 * Hook for RBAC protection on client dashboard pages
 */
export function useRoleAuth(allowedRoles: UserRole[]) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  // Callers commonly pass inline role arrays. Depend on a stable value so an
  // auth check does not restart after every render.
  const allowedRolesKey = allowedRoles.join("|");

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          if (mounted) {
            setUser(null);
            setRole(null);
            setLoading(false);
            router.replace("/signin");
          }
          return;
        }

        if (!session.user.email_confirmed_at) {
          const unverifiedEmail = session.user.email || "";
          await supabase.auth.signOut();
          if (mounted) {
            setUser(null);
            setRole(null);
            setLoading(false);
            router.replace(`/signin?verification=required&email=${encodeURIComponent(unverifiedEmail)}`);
          }
          return;
        }

        const resolvedRole = await resolveUserRole(session.user);

        if (!mounted) return;

        setUser(session.user);
        setRole(resolvedRole);
        setLoading(false);

        // RBAC access check
        if (!allowedRolesKey.split("|").includes(resolvedRole)) {
          // Redirect unauthorized users to their assigned workspace.
          router.replace(getDashboardRoute(resolvedRole));
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        if (mounted) {
          setLoading(false);
          router.replace("/signin");
        }
      }
    }

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        if (mounted) {
          setUser(null);
          setRole(null);
          router.replace("/signin");
        }
      } else if (session?.user && session.user.email_confirmed_at) {
        const r = await resolveUserRole(session.user);
        if (mounted) {
          setUser(session.user);
          setRole(r);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [allowedRolesKey, router]);

  return { user, role, loading };
}
