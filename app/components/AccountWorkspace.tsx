"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRoleAuth, ALL_ROLES, getDashboardRoute } from "@/lib/rbac";
import { supabase } from "@/lib/supabase";
import StaffSettingsWorkspace from "@/app/components/StaffSettingsWorkspace";

type Mode = "profile" | "settings";
type PatientDetails = {
  phone: string; dateOfBirth: string; address: string; emergencyContactName: string;
  emergencyContactPhone: string; allergies: string; currentMedications: string; medicalHistory: string;
};

const blankPatient: PatientDetails = { phone: "", dateOfBirth: "", address: "", emergencyContactName: "", emergencyContactPhone: "", allergies: "", currentMedications: "", medicalHistory: "" };

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Your session expired. Please sign in again.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` };
}

export default function AccountWorkspace({ mode }: { mode: Mode }) {
  const { user, role, loading } = useRoleAuth(ALL_ROLES);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [patient, setPatient] = useState<PatientDetails>(blankPatient);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    queueMicrotask(() => {
      setFullName((user.user_metadata?.full_name as string) || user.email?.split("@")[0] || "");
      setEmail(user.email || "");
    });
  }, [user]);

  useEffect(() => {
    if (role !== "patient" || mode !== "profile") return;
    let active = true;
    void authHeaders().then((headers) => fetch("/api/patient-profile", { headers })).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load your patient profile.");
      if (!active || !result.profile) return;
      const p = result.profile;
      setFullName(p.full_name || (user?.user_metadata?.full_name as string) || "");
      setPatient({ phone: p.phone || "", dateOfBirth: p.date_of_birth || "", address: p.address || "", emergencyContactName: p.emergency_contact_name || "", emergencyContactPhone: p.emergency_contact_phone || "", allergies: p.allergies || "", currentMedications: p.current_medications || "", medicalHistory: p.medical_history || "" });
    }).catch((value) => active && setError(value instanceof Error ? value.message : "Unable to load your profile."));
    return () => { active = false; };
  }, [mode, role, user]);

  const updatePatient = (key: keyof PatientDetails, value: string) => setPatient((current) => ({ ...current, [key]: value }));

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const changes: { data: { full_name: string }; email?: string } = { data: { full_name: fullName.trim() } };
      if (email.trim().toLowerCase() !== (user?.email || "").toLowerCase()) changes.email = email.trim().toLowerCase();
      const { error: authError } = await supabase.auth.updateUser(changes);
      if (authError) throw authError;
      if (role === "patient") {
        const response = await fetch("/api/patient-profile", { method: "PATCH", headers: await authHeaders(), body: JSON.stringify({ fullName: fullName.trim(), ...patient }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to save patient details.");
      }
      setMessage(changes.email ? "Profile saved. Please confirm the email change from your inbox." : "Your profile was saved successfully.");
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to save your profile."); }
    finally { setSaving(false); }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (password.length < 8) return setError("Use at least 8 characters for your new password.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setSaving(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      setPassword(""); setConfirmPassword(""); setMessage("Your password was changed successfully.");
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to change your password."); }
    finally { setSaving(false); }
  }

  if (loading || !role) return <div className="dk-loading"><i className="fa-solid fa-spinner fa-spin fa-2x" /></div>;
  const backHref = getDashboardRoute(role);

  return <main className="account-page">
    <header className="account-page__top"><Link href={backHref}><i className="fa-solid fa-arrow-left" /> Back to workspace</Link><Link href="/"><Image src="/images/the_klinique_logo-removebg-preview.png" alt="The Klinique" width={110} height={58} /></Link></header>
    <section className="account-page__hero"><div><p>MY ACCOUNT</p><h1>{mode === "profile" ? "Profile" : "Settings"}</h1><span>{mode === "profile" ? "Keep your identity and clinic information accurate." : "Manage your password and account security."}</span></div><div className="account-page__tabs"><Link className={mode === "profile" ? "active" : ""} href="/dashboard/profile"><i className="fa-regular fa-user" /> Profile</Link><Link className={mode === "settings" ? "active" : ""} href="/dashboard/settings"><i className="fa-solid fa-gear" /> Settings</Link></div></section>
    <section className="account-page__body">
      {error && <p className="account-alert error">{error}</p>}{message && <p className="account-alert success">{message}</p>}
      {mode === "profile" ? <form className="account-card" onSubmit={saveProfile}>
        <header><span><i className="fa-regular fa-id-card" /></span><div><h2>Personal information</h2><p>This information identifies your account across The Klinique.</p></div><em>{role}</em></header>
        <div className="account-fields"><label>Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label><label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /><small>Email changes require inbox confirmation.</small></label></div>
        {role === "patient" && <><div className="account-divider"><span>Booking details</span><p>Saved here and automatically reused on your next appointment.</p></div><div className="account-fields"><label>Phone number<input type="tel" value={patient.phone} onChange={(e) => updatePatient("phone", e.target.value)} required /></label><label>Date of birth<input type="date" value={patient.dateOfBirth} onChange={(e) => updatePatient("dateOfBirth", e.target.value)} required /></label><label className="wide">Address<input value={patient.address} onChange={(e) => updatePatient("address", e.target.value)} /></label><label>Emergency contact<input value={patient.emergencyContactName} onChange={(e) => updatePatient("emergencyContactName", e.target.value)} /></label><label>Emergency phone<input type="tel" value={patient.emergencyContactPhone} onChange={(e) => updatePatient("emergencyContactPhone", e.target.value)} /></label><label className="wide">Known allergies<textarea value={patient.allergies} onChange={(e) => updatePatient("allergies", e.target.value)} placeholder="Enter None if none known" /></label><label className="wide">Current medications<textarea value={patient.currentMedications} onChange={(e) => updatePatient("currentMedications", e.target.value)} placeholder="Enter None if none" /></label><label className="wide">Medical history<textarea value={patient.medicalHistory} onChange={(e) => updatePatient("medicalHistory", e.target.value)} /></label></div></>}
        <footer><span><i className="fa-solid fa-lock" /> Your details are private.</span><button disabled={saving}>{saving ? "Saving..." : "Save changes"}</button></footer>
      </form> : (role === "doctor" || role === "superadmin") ? <StaffSettingsWorkspace email={user?.email || ""} /> : <div className="account-settings-grid"><form className="account-card" onSubmit={changePassword}><header><span><i className="fa-solid fa-key" /></span><div><h2>Change password</h2><p>Use a unique password you do not use elsewhere.</p></div></header><div className="account-fields one"><label>New password<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /><small>Minimum of 8 characters.</small></label><label>Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required /></label></div><footer><span><i className="fa-solid fa-shield-halved" /> Secure account update</span><button disabled={saving}>{saving ? "Updating..." : "Change password"}</button></footer></form><aside className="account-security"><i className="fa-solid fa-shield-heart" /><h2>Account security</h2><p>You are signed in as <strong>{user?.email}</strong>. Never share your password or one-time sign-in codes.</p><Link href="mailto:thekliniqueinfo@gmail.com">Report an account concern <i className="fa-solid fa-arrow-right" /></Link></aside></div>}
    </section>
  </main>;
}
