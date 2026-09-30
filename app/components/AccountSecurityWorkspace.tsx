"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AccountSecurityWorkspace({ email = "" }: { email?: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 8) return setError("Use at least 8 characters for your new password.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setSaving(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      setPassword("");
      setConfirmPassword("");
      setMessage("Your password was changed successfully.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to change your password.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="ps-workspace">
    <section className="ps-hero"><div><p className="dk-welcome-label">Account settings</p><h1>Login &amp; security</h1><p>Manage your password and keep your account secure.</p></div><i className="fa-solid fa-shield-halved" /></section>
    {error && <p className="account-alert error" role="alert">{error}</p>}
    {message && <p className="account-alert success" role="status">{message}</p>}
    <div className="account-settings-grid">
      <form className="account-card" onSubmit={changePassword}>
        <header><span><i className="fa-solid fa-key" /></span><div><h2>Change password</h2><p>Use a unique password you do not use elsewhere.</p></div></header>
        <div className="account-fields one">
          <label>New password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /><small>Minimum of 8 characters.</small></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>
        </div>
        <footer><span><i className="fa-solid fa-shield-halved" /> Secure account update</span><button disabled={saving}>{saving ? "Updating..." : "Change password"}</button></footer>
      </form>
      <aside className="account-security"><i className="fa-solid fa-shield-heart" /><h2>Account security</h2><p>You are signed in as <strong>{email}</strong>. Never share your password or one-time sign-in codes.</p><Link href="mailto:thekliniqueinfo@gmail.com">Report an account concern <i className="fa-solid fa-arrow-right" /></Link></aside>
    </div>
  </div>;
}
