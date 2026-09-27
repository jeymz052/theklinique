import { Suspense } from "react";
import { AuthView } from "@/app/auth/page";

export const metadata = {
  title: "Sign Up — The Klinique Medical Aesthetics",
  description: "Create an account to book consultations and access your patient portal at The Klinique.",
};

export default function SignUpPage() {
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
      <AuthView initialMode="signup" />
    </Suspense>
  );
}
