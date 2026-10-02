"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { resolveUserRole, getDashboardRoute, type UserRole } from "@/lib/rbac";

/* ─── Types ────────────────────────────────────────── */
export type AuthMode = "signin" | "signup" | "forgot" | "reset";
type Modal = "none" | "terms" | "cancellation";
type FieldErrors = Partial<Record<"email" | "password" | "confirmPassword" | "agreements", string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordValidationMessage(value: string) {
  if (value.length < 10 || !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    return "Password must be at least 10 characters and include uppercase, lowercase, number, and special character.";
  }
  return "";
}

/* ─── Terms content ────────────────────────────────── */
const TERMS_SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    body: "By accessing and using The Klinique's services, booking platform, and patient portal, you agree to be bound by these Terms and Conditions. If you do not agree to all the terms, please do not use our services.",
  },
  {
    title: "2. Services",
    body: "The Klinique is a medical aesthetic clinic offering treatments including but not limited to Botox, dermal fillers, skin boosters, laser treatments, facial treatments, IV therapy, and other aesthetic services. All services are performed or supervised by licensed medical professionals.",
  },
  {
    title: "3. Medical Disclaimer",
    body: "All treatments at The Klinique are medical procedures performed by Dr. Kharyl Dence, Medical and Aesthetic Doctor. Results may vary between individuals. A thorough consultation is required before any treatment. We reserve the right to decline any service if deemed medically inappropriate.",
  },
  {
    title: "4. Booking & Appointments",
    body: "Appointments are by appointment only. Bookings are confirmed upon receipt of any required deposit or confirmation. The Klinique reserves the right to reschedule or cancel appointments with reasonable notice. Walk-in consultations are subject to availability.",
  },
  {
    title: "5. Payment Terms",
    body: "Payment is due at the time of service unless a deposit arrangement has been made. We accept cash, bank transfers, and GCash. Prices are in Philippine Peso (PHP) and subject to change without prior notice. Packages and promos are non-transferable and non-refundable unless stated otherwise.",
  },
  {
    title: "6. Privacy & Confidentiality",
    body: "Patient information, medical records, and treatment history are strictly confidential. We comply with applicable Philippine data privacy laws. Your information will not be shared with third parties without your consent, except as required by law.",
  },
  {
    title: "7. Patient Responsibilities",
    body: "Patients are responsible for providing accurate and complete medical history and information. Failure to disclose relevant medical information may affect treatment outcomes. Patients must follow pre- and post-treatment care instructions provided by our team.",
  },
  {
    title: "8. Intellectual Property",
    body: "All content on The Klinique's website and platforms — including images, text, logos, and design — is the property of The Klinique and is protected by Philippine copyright law. Reproduction without written permission is prohibited.",
  },
  {
    title: "9. Limitation of Liability",
    body: "The Klinique is not liable for any indirect, incidental, or consequential damages arising from the use of our services. Our liability is limited to the value of the treatment rendered.",
  },
  {
    title: "10. Governing Law",
    body: "These Terms and Conditions are governed by the laws of the Republic of the Philippines. Any disputes shall be resolved through the appropriate legal channels in Cagayan de Oro City, Misamis Oriental.",
  },
];

/* ─── Cancellation content ─────────────────────────── */
const CANCELLATION_SECTIONS = [
  {
    title: "1. Appointment Confirmation",
    body: "All appointments at The Klinique are confirmed upon booking. We operate by appointment only to ensure each patient receives the time and attention they deserve. Please arrive on time for your scheduled appointment.",
  },
  {
    title: "2. Cancellation Notice",
    body: "We kindly require at least 24 hours' notice for any cancellation or rescheduling of appointments. 24+ hours notice: Full cancellation with no penalty. Deposits may be carried forward to a rescheduled appointment. Less than 24 hours notice: Cancellation fee may apply. Deposits may be forfeited. No-show (no notice): The appointment deposit is non-refundable. A new deposit will be required for future bookings.",
  },
  {
    title: "3. Rescheduling",
    body: "Appointments may be rescheduled with at least 24 hours' notice at no additional cost. Rescheduling requests made less than 24 hours before the appointment are subject to availability and may incur a rescheduling fee. Each confirmed booking may be rescheduled a maximum of two (2) times.",
  },
  {
    title: "4. Deposits",
    body: "Certain treatments or packages require a non-refundable reservation deposit to confirm your appointment. Deposit amounts vary by treatment type and will be communicated at the time of booking. Deposits are applied toward the cost of your treatment on the day of your appointment.",
  },
  {
    title: "5. Late Arrivals",
    body: "Patients who arrive more than 15 minutes late may have their appointment shortened or rescheduled to respect other patients' time. Full service fees still apply. Please contact us as soon as possible if you are running late.",
  },
  {
    title: "6. Clinic-Initiated Cancellations",
    body: "In the rare event that The Klinique must cancel an appointment, we will notify you as early as possible and offer to reschedule at no additional cost or issue a full refund of any deposit paid.",
  },
  {
    title: "7. Package & Promo Bookings",
    body: "Appointments booked using packages or promotional vouchers are subject to the same cancellation policy. Missed sessions from packages due to no-shows are considered forfeited and cannot be recovered.",
  },
  {
    title: "8. Refund Policy",
    body: "Treatments that have been started or completed are non-refundable. If you are dissatisfied with your experience, please contact us within 7 days so we can address your concerns appropriately.",
  },
  {
    title: "9. How to Cancel or Reschedule",
    body: "To cancel or reschedule your appointment, please contact us via: Instagram DM @thekliniqueph · Facebook: The Klinique by Dr. Kharyl · Or log in to your Patient Portal and manage your booking from your dashboard.",
  },
];

/* ─── PolicyModal ───────────────────────────────────── */
function PolicyModal({
  type,
  onClose,
  onAgree,
}: {
  type: "terms" | "cancellation";
  onClose: () => void;
  onAgree: () => void;
}) {
  const isTerms = type === "terms";
  const sections = isTerms ? TERMS_SECTIONS : CANCELLATION_SECTIONS;
  const title = isTerms ? "Terms & Conditions" : "Cancellation Policy";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      className="policy-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`policy-modal-${type}-title`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="policy-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="policy-modal-header">
          <div className="policy-modal-header-left">
            <i
              className={`fa-solid ${isTerms ? "fa-file-contract" : "fa-ban"}`}
              style={{ color: "#c57171" }}
            />
            <div>
              <h2 id={`policy-modal-${type}-title`} className="policy-modal-title">{title}</h2>
              <p className="policy-modal-updated">Last updated: September 2026 · The Klinique CDO</p>
            </div>
          </div>
          <button
            type="button"
            className="policy-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="policy-modal-body">
          {sections.map((s) => (
            <div key={s.title} className="policy-modal-section">
              <h3 className="policy-modal-section-title">{s.title}</h3>
              <p className="policy-modal-section-body">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="policy-modal-footer">
          <button type="button" className="policy-modal-decline" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="policy-modal-agree"
            onClick={() => {
              onAgree();
              onClose();
            }}
          >
            <i className="fa-solid fa-circle-check" />
            I Agree
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Inner Auth Component (Previous Centered Card Look) ─── */
export function AuthView({ initialMode = "signin" }: { initialMode?: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingDestination = searchParams.get("next");
  const isEmailConfirmation = searchParams.get("verified") === "1";
  const postAuthDestination = bookingDestination?.startsWith("/") && !bookingDestination.startsWith("//")
    ? bookingDestination
    : null;

  /* ── Form state ── */
  const queryMode = searchParams.get("mode") as AuthMode | null;
  const [mode, setMode] = useState<AuthMode>(
    queryMode && ["signin", "signup", "forgot", "reset"].includes(queryMode)
      ? queryMode
      : initialMode
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPolicy, setAgreedPolicy] = useState(false);

  /* ── UI state ── */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [modal, setModal] = useState<Modal>("none");

  const clearMessages = () => {
    setError("");
    setSuccessMsg("");
    setFieldErrors({});
  };

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const switchMode = (next: AuthMode) => {
    clearMessages();
    setMode(next);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        clearMessages();
        setMode("reset");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;

    async function handleExistingSession() {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;

      if (isEmailConfirmation) {
        if (session) await supabase.auth.signOut();
        if (active) {
          setMode("signin");
          setPassword("");
          setConfirmPassword("");
          setError(sessionError || !session ? "We could not verify this confirmation link. It may be invalid or expired." : "");
          setSuccessMsg(session ? "Your account is verified. Please sign in to continue." : "");
          router.replace("/signin");
        }
        return;
      }

      if (mode === "reset") {
        if (sessionError || !session) {
          setError("This password reset link is invalid or has expired. Request a new link.");
        }
        return;
      }

      if (session?.user && (mode === "signin" || mode === "signup")) {
        const role = await resolveUserRole(session.user);
        if (active) router.replace(postAuthDestination || getDashboardRoute(role));
      }
    }

    void handleExistingSession();
    return () => {
      active = false;
    };
  }, [isEmailConfirmation, mode, postAuthDestination, router]);

  /* ── Sign In ── */
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    const cleanEmail = email.trim().toLowerCase();
    const errors: FieldErrors = {};
    if (!EMAIL_PATTERN.test(cleanEmail)) errors.email = "Enter a valid email address.";
    if (!password) errors.password = "Enter your password.";
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError("Please fix the highlighted fields.");
      return;
    }
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError) {
        setError(signInError.message.toLowerCase().includes("email not confirmed")
          ? "Please confirm your email before signing in."
          : "The email or password is incorrect.");
        return;
      }

      if (!data.user) {
        setError("Sign in failed. Please try again.");
        return;
      }

      const role: UserRole = await resolveUserRole(data.user);
      const destination = postAuthDestination || getDashboardRoute(role);
      router.push(destination);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Sign Up ── */
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    const cleanEmail = email.trim().toLowerCase();
    const errors: FieldErrors = {};
    if (!EMAIL_PATTERN.test(cleanEmail)) errors.email = "Enter a valid email address.";
    const passwordError = passwordValidationMessage(password);
    if (passwordError) errors.password = passwordError;
    if (!confirmPassword) errors.confirmPassword = "Confirm your password.";
    else if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match.";
    if (!agreedTerms || !agreedPolicy) errors.agreements = "Accept both policies to create an account.";
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError("Please fix the highlighted fields.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            role: "patient",
            full_name: cleanEmail.split("@")[0],
          },
          emailRedirectTo: `${window.location.origin}/auth?verified=1${postAuthDestination ? `&next=${encodeURIComponent(postAuthDestination)}` : ""}`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data?.session) {
        router.push(postAuthDestination || "/dashboard/patient");
        return;
      }

      setSuccessMsg(
        "Account created! Please check your email and confirm your address before signing in."
      );
      setMode("signin");
      setPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred during sign up.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Forgot Password ── */
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setFieldErrors({ email: "Enter a valid email address." });
      setError("Please fix the highlighted field.");
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        cleanEmail,
        { redirectTo: `${window.location.origin}/auth?mode=reset` }
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSuccessMsg(`If an account exists for ${cleanEmail}, a password reset link has been sent.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to send the password reset email.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    const errors: FieldErrors = {};
    const passwordError = passwordValidationMessage(password);
    if (passwordError) errors.password = passwordError;
    if (!confirmPassword) errors.confirmPassword = "Confirm your new password.";
    else if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match.";
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError("Please fix the highlighted fields.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      await supabase.auth.signOut();
      setPassword("");
      setConfirmPassword("");
      setMode("signin");
      setSuccessMsg("Password updated. You can now sign in with your new password.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to update your password.");
    } finally {
      setLoading(false);
    }
  };

  /* ─────────────────────────────────────────────────── */
  return (
    <div className="auth-root">
      <div className="auth-hero-overlay" />

      {/* ── Policy Modals ── */}
      {modal === "terms" && (
        <PolicyModal
          type="terms"
          onClose={() => setModal("none")}
          onAgree={() => setAgreedTerms(true)}
        />
      )}
      {modal === "cancellation" && (
        <PolicyModal
          type="cancellation"
          onClose={() => setModal("none")}
          onAgree={() => setAgreedPolicy(true)}
        />
      )}

      <div className="auth-container-wrap">
        <div className="auth-card-kulot" id="auth-card">
          {/* Clinic Logo centered inside the form */}
          <Link href="/" className="auth-brand-center" title="The Klinique — Cagayan de Oro City">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/the_klinique_logo-removebg-preview.png"
              alt="The Klinique"
              className="auth-brand-logo"
            />
          </Link>

          {/* Feedback messages */}
          {successMsg && (
            <div className="auth-alert-kulot success" role="status" style={{ marginBottom: "0.5rem" }}>
              <i className="fa-solid fa-circle-check" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ═══════════════════════════════════════ */}
          {/* SIGN IN FORM (EXACT PREVIOUS LOOK)      */}
          {/* ═══════════════════════════════════════ */}
          {mode === "signin" && (
            <form className="auth-form-kulot" id="signin-form" onSubmit={handleSignIn}>
              <div>
                <h1 className="auth-title-bold">Welcome Back!</h1>
                <p className="auth-subtitle-soft">Sign in to continue your journey</p>
              </div>

              <div className="auth-field-kulot">
                <label className="auth-label-kulot" htmlFor="signin-email">
                  Email
                </label>
                <div className="auth-input-kulot-wrap">
                  <input
                    id="signin-email"
                    type="email"
                    className="auth-input-kulot"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
                    required
                    autoComplete="email"
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "signin-email-error" : undefined}
                  />
                </div>
                {fieldErrors.email && <p id="signin-email-error" className="auth-field-error"><i className="fa-solid fa-circle-exclamation" />{fieldErrors.email}</p>}
              </div>

              <div className="auth-field-kulot">
                <label className="auth-label-kulot" htmlFor="signin-password">
                  Password
                </label>
                <div className="auth-input-kulot-wrap">
                  <input
                    id="signin-password"
                    type={showPw ? "text" : "password"}
                    className="auth-input-kulot has-icon-right"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); }}
                    required
                    autoComplete="current-password"
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? "signin-password-error" : undefined}
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    <i className={showPw ? "fa-regular fa-eye-slash" : "fa-regular fa-eye"} />
                  </button>
                </div>
                {fieldErrors.password && <p id="signin-password-error" className="auth-field-error"><i className="fa-solid fa-circle-exclamation" />{fieldErrors.password}</p>}
              </div>

              <div className="auth-actions-row">
                <label className="auth-checkbox-kulot">
                  <input
                    type="checkbox"
                    id="remember-me"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Remember Me</span>
                </label>
                <button
                  type="button"
                  className="auth-forgot-link"
                  id="forgot-password-link"
                  onClick={() => switchMode("forgot")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Forgot password?
                </button>
              </div>

              {error && <div className="auth-alert-kulot error" role="alert"><i className="fa-solid fa-circle-exclamation" /><span>{error}</span></div>}

              <button
                type="submit"
                className="auth-btn-solid-darkpink"
                id="signin-btn"
                disabled={loading}
              >
                {loading ? (
                  <i className="fa-solid fa-spinner fa-spin" />
                ) : (
                  <i className="fa-solid fa-arrow-right" />
                )}
                <span>{loading ? "Signing in…" : "SIGN IN"}</span>
              </button>

              <p className="auth-switch-text">
                Don&apos;t have an account?
                <button
                  type="button"
                  className="auth-switch-btn"
                  id="switch-to-signup"
                  onClick={() => switchMode("signup")}
                >
                  Sign Up
                </button>
              </p>

              <div className="auth-footer-kulot">
                <p>&copy; 2026 The Klinique | All rights reserved | Powered by The Klinique</p>
                <p>Having trouble?</p>
                <div className="auth-footer-links">
                  <a href="mailto:support@theklinique.ph">Contact Support</a>
                  <button
                    type="button"
                    onClick={() => setModal("cancellation")}
                    style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "inherit", padding: 0 }}
                  >
                    Help Center
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ═══════════════════════════════════════ */}
          {/* SIGN UP FORM (EXACT PREVIOUS LOOK)      */}
          {/* ═══════════════════════════════════════ */}
          {mode === "signup" && (
            <form className="auth-form-kulot" id="signup-form" onSubmit={handleSignUp}>
              <div>
                <h1 className="auth-title-bold">Create Account</h1>
              </div>

              <div className="auth-field-kulot">
                <label className="auth-label-kulot" htmlFor="signup-email">
                  Email
                </label>
                <div className="auth-input-kulot-wrap">
                  <input
                    id="signup-email"
                    type="email"
                    className="auth-input-kulot"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
                    required
                    autoComplete="email"
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "signup-email-error" : undefined}
                  />
                </div>
                {fieldErrors.email && <p id="signup-email-error" className="auth-field-error"><i className="fa-solid fa-circle-exclamation" />{fieldErrors.email}</p>}
              </div>

              <div className="auth-field-kulot">
                <label className="auth-label-kulot" htmlFor="signup-password">
                  Password
                </label>
                <div className="auth-input-kulot-wrap">
                  <input
                    id="signup-password"
                    type={showPw ? "text" : "password"}
                    className="auth-input-kulot has-icon-right"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); clearFieldError("confirmPassword"); }}
                    required
                    autoComplete="new-password"
                    minLength={10}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? "signup-password-error" : undefined}
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    <i className={showPw ? "fa-regular fa-eye-slash" : "fa-regular fa-eye"} />
                  </button>
                </div>
                {fieldErrors.password && <p id="signup-password-error" className="auth-field-error"><i className="fa-solid fa-circle-exclamation" />{fieldErrors.password}</p>}
              </div>

              <div className="auth-field-kulot">
                <label className="auth-label-kulot" htmlFor="signup-confirm-password">
                  Confirm Password
                </label>
                <div className="auth-input-kulot-wrap">
                  <input
                    id="signup-confirm-password"
                    type={showConfirm ? "text" : "password"}
                    className="auth-input-kulot has-icon-right"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); clearFieldError("confirmPassword"); }}
                    required
                    autoComplete="new-password"
                    minLength={10}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={fieldErrors.confirmPassword ? "signup-confirm-error" : undefined}
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                  >
                    <i className={showConfirm ? "fa-regular fa-eye-slash" : "fa-regular fa-eye"} />
                  </button>
                </div>
                {fieldErrors.confirmPassword && <p id="signup-confirm-error" className="auth-field-error"><i className="fa-solid fa-circle-exclamation" />{fieldErrors.confirmPassword}</p>}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", marginTop: "0.1rem" }}>
                <label className="auth-checkbox-kulot">
                  <input
                    type="checkbox"
                    id="agree-terms"
                    checked={agreedTerms}
                    onChange={(e) => { setAgreedTerms(e.target.checked); clearFieldError("agreements"); }}
                  />
                  <span>
                    I agree with The Klinique{" "}
                    <button
                      type="button"
                      className="auth-policy-link"
                      id="open-terms-modal"
                      onClick={() => setModal("terms")}
                      style={{ background: "none", border: "none", textDecoration: "underline", color: "inherit", fontWeight: 500, cursor: "pointer", padding: 0, font: "inherit" }}
                    >
                      terms and conditions
                    </button>
                  </span>
                </label>

                <label className="auth-checkbox-kulot">
                  <input
                    type="checkbox"
                    id="agree-cancellation"
                    checked={agreedPolicy}
                    onChange={(e) => { setAgreedPolicy(e.target.checked); clearFieldError("agreements"); }}
                  />
                  <span>
                    I agree with{" "}
                    <button
                      type="button"
                      className="auth-policy-link"
                      id="open-cancellation-modal"
                      onClick={() => setModal("cancellation")}
                      style={{ background: "none", border: "none", textDecoration: "underline", color: "inherit", fontWeight: 500, cursor: "pointer", padding: 0, font: "inherit" }}
                    >
                      cancellation policy
                    </button>
                  </span>
                </label>
              </div>
              {fieldErrors.agreements && <p className="auth-field-error"><i className="fa-solid fa-circle-exclamation" />{fieldErrors.agreements}</p>}

              {error && <div className="auth-alert-kulot error" role="alert"><i className="fa-solid fa-circle-exclamation" /><span>{error}</span></div>}

              <button
                type="submit"
                className="auth-btn-solid-darkpink"
                id="signup-btn"
                disabled={!agreedTerms || !agreedPolicy || loading}
              >
                {loading ? (
                  <i className="fa-solid fa-spinner fa-spin" />
                ) : (
                  <i className="fa-solid fa-user-plus" />
                )}
                <span>{loading ? "Creating account…" : "CREATE ACCOUNT"}</span>
              </button>

              <p className="auth-switch-text">
                Already have an account?
                <button
                  type="button"
                  className="auth-switch-btn"
                  id="switch-to-signin"
                  onClick={() => switchMode("signin")}
                >
                  Sign In
                </button>
              </p>
            </form>
          )}

          {/* ═══════════════════════════════════════ */}
          {/* FORGOT PASSWORD FORM                   */}
          {/* ═══════════════════════════════════════ */}
          {mode === "forgot" && (
            <form className="auth-form-kulot" id="forgot-form" onSubmit={handleForgotPassword}>
              <div>
                <h1 className="auth-title-bold">Reset Password</h1>
                <p className="auth-subtitle-soft">Enter your registered email and we&apos;ll send you a reset link.</p>
              </div>

              <div className="auth-field-kulot">
                <label className="auth-label-kulot" htmlFor="forgot-email">
                  Email Address
                </label>
                <div className="auth-input-kulot-wrap">
                  <input
                    id="forgot-email"
                    type="email"
                    className="auth-input-kulot"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
                    required
                    autoComplete="email"
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "forgot-email-error" : undefined}
                  />
                </div>
                {fieldErrors.email && <p id="forgot-email-error" className="auth-field-error"><i className="fa-solid fa-circle-exclamation" />{fieldErrors.email}</p>}
              </div>

              {error && <div className="auth-alert-kulot error" role="alert"><i className="fa-solid fa-circle-exclamation" /><span>{error}</span></div>}

              <button
                type="submit"
                className="auth-btn-solid-darkpink"
                id="forgot-submit-btn"
                disabled={loading}
              >
                {loading ? (
                  <i className="fa-solid fa-spinner fa-spin" />
                ) : (
                  <i className="fa-solid fa-paper-plane" />
                )}
                <span>{loading ? "Sending…" : "SEND RESET LINK"}</span>
              </button>

              <p className="auth-switch-text">
                Remember your password?
                <button
                  type="button"
                  className="auth-switch-btn"
                  id="back-to-signin"
                  onClick={() => switchMode("signin")}
                >
                  Sign In
                </button>
              </p>

              <div className="auth-footer-kulot">
                <p>&copy; 2026 The Klinique | All rights reserved</p>
                <div className="auth-footer-links">
                  <a href="mailto:support@theklinique.ph">Contact Support</a>
                </div>
              </div>
            </form>
          )}

          {mode === "reset" && (
            <form className="auth-form-kulot" id="reset-password-form" onSubmit={handleResetPassword}>
              <div>
                <h1 className="auth-title-bold">Choose a New Password</h1>
                <p className="auth-subtitle-soft">Use at least 10 characters with uppercase, lowercase, a number, and a special character.</p>
              </div>

              <div className="auth-field-kulot">
                <label className="auth-label-kulot" htmlFor="reset-password">New Password</label>
                <div className="auth-input-kulot-wrap">
                  <input
                    id="reset-password"
                    type={showPw ? "text" : "password"}
                    className="auth-input-kulot has-icon-right"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); clearFieldError("confirmPassword"); }}
                    required
                    minLength={10}
                    autoComplete="new-password"
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? "reset-password-error" : undefined}
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    <i className={showPw ? "fa-regular fa-eye-slash" : "fa-regular fa-eye"} />
                  </button>
                </div>
                {fieldErrors.password && <p id="reset-password-error" className="auth-field-error"><i className="fa-solid fa-circle-exclamation" />{fieldErrors.password}</p>}
              </div>

              <div className="auth-field-kulot">
                <label className="auth-label-kulot" htmlFor="reset-confirm-password">Confirm New Password</label>
                <div className="auth-input-kulot-wrap">
                  <input
                    id="reset-confirm-password"
                    type={showConfirm ? "text" : "password"}
                    className="auth-input-kulot has-icon-right"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); clearFieldError("confirmPassword"); }}
                    required
                    minLength={10}
                    autoComplete="new-password"
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={fieldErrors.confirmPassword ? "reset-confirm-error" : undefined}
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                  >
                    <i className={showConfirm ? "fa-regular fa-eye-slash" : "fa-regular fa-eye"} />
                  </button>
                </div>
                {fieldErrors.confirmPassword && <p id="reset-confirm-error" className="auth-field-error"><i className="fa-solid fa-circle-exclamation" />{fieldErrors.confirmPassword}</p>}
              </div>

              {error && <div className="auth-alert-kulot error" role="alert"><i className="fa-solid fa-circle-exclamation" /><span>{error}</span></div>}

              <button
                type="submit"
                className="auth-btn-solid-darkpink"
                id="reset-password-btn"
                disabled={loading}
              >
                {loading ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-lock" />}
                <span>{loading ? "Updating…" : "UPDATE PASSWORD"}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthView />
    </Suspense>
  );
}
