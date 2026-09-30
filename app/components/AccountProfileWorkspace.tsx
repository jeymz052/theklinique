"use client";

import { useEffect, useState } from "react";
import { ALL_ROLES, useRoleAuth } from "@/lib/rbac";
import { supabase } from "@/lib/supabase";

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

export default function AccountProfileWorkspace() {
  const { user, role, loading } = useRoleAuth(ALL_ROLES);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [patient, setPatient] = useState<PatientDetails>(blankPatient);
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
    if (role !== "patient") return;
    let active = true;
    void authHeaders().then((headers) => fetch("/api/patient-profile", { headers })).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load your patient profile.");
      if (!active || !result.profile) return;
      const profile = result.profile;
      setFullName(profile.full_name || (user?.user_metadata?.full_name as string) || "");
      setPatient({ phone: profile.phone || "", dateOfBirth: profile.date_of_birth || "", address: profile.address || "", emergencyContactName: profile.emergency_contact_name || "", emergencyContactPhone: profile.emergency_contact_phone || "", allergies: profile.allergies || "", currentMedications: profile.current_medications || "", medicalHistory: profile.medical_history || "" });
    }).catch((value) => active && setError(value instanceof Error ? value.message : "Unable to load your profile."));
    return () => { active = false; };
  }, [role, user]);

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

  if (loading || !role) return <div className="dk-loading"><i className="fa-solid fa-spinner fa-spin fa-2x" /></div>;

  return <div className="ps-workspace">
    <section className="ps-hero"><div><p className="dk-welcome-label">My account</p><h1>Profile</h1><p>Keep your identity and clinic information accurate.</p></div><i className="fa-regular fa-user" /></section>
    {error && <p className="account-alert error" role="alert">{error}</p>}{message && <p className="account-alert success" role="status">{message}</p>}
    <form className="account-card" onSubmit={saveProfile}>
      <header><span><i className="fa-regular fa-id-card" /></span><div><h2>Personal information</h2><p>This information identifies your account across The Klinique.</p></div><em>{role}</em></header>
      <div className="account-fields"><label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><small>Email changes require inbox confirmation.</small></label></div>
      {role === "patient" && <><div className="account-divider"><span>Booking details</span><p>Saved here and automatically reused on your next appointment.</p></div><div className="account-fields"><label>Phone number<input type="tel" value={patient.phone} onChange={(event) => updatePatient("phone", event.target.value)} required /></label><label>Date of birth<input type="date" value={patient.dateOfBirth} onChange={(event) => updatePatient("dateOfBirth", event.target.value)} required /></label><label className="wide">Address<input value={patient.address} onChange={(event) => updatePatient("address", event.target.value)} /></label><label>Emergency contact<input value={patient.emergencyContactName} onChange={(event) => updatePatient("emergencyContactName", event.target.value)} /></label><label>Emergency phone<input type="tel" value={patient.emergencyContactPhone} onChange={(event) => updatePatient("emergencyContactPhone", event.target.value)} /></label><label className="wide">Known allergies<textarea value={patient.allergies} onChange={(event) => updatePatient("allergies", event.target.value)} placeholder="Enter None if none known" /></label><label className="wide">Current medications<textarea value={patient.currentMedications} onChange={(event) => updatePatient("currentMedications", event.target.value)} placeholder="Enter None if none" /></label><label className="wide">Medical history<textarea value={patient.medicalHistory} onChange={(event) => updatePatient("medicalHistory", event.target.value)} /></label></div></>}
      <footer><span><i className="fa-solid fa-lock" /> Your details are private.</span><button disabled={saving}>{saving ? "Saving..." : "Save changes"}</button></footer>
    </form>
  </div>;
}
