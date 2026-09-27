import { Suspense } from "react";
import { AuthView } from "@/app/auth/page";

export const metadata = {
  title: "Sign In — The Klinique Medical Aesthetics",
  description: "Sign in to access your aesthetic appointments, treatment records, and patient portal.",
};

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            background: "#fbf8f8",
          }}
        >
          <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ color: "#c57171" }} />
        </div>
      }
    >
      <AuthView initialMode="signin" />
    </Suspense>
  );
}
