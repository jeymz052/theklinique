"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AccountProfileWorkspace from "@/app/components/AccountProfileWorkspace";

type Tab = "general" | "pricing" | "security" | "profile";
type General = { clinic_name: string; doctor_name: string; contact_email: string; contact_phone: string; address: string; city: string; province: string; postal_code: string; accepts_walk_ins: boolean };
type Category = { id: string; name: string; slug: string };
type Service = { id: string; category_id: string; name: string; slug: string; description: string | null; price: number; price_note: string | null; duration_mins: number; is_active: boolean };
type Product = { id: string; category: string; name: string; description: string | null; price: number; is_active: boolean };
const blank: General = { clinic_name: "", doctor_name: "", contact_email: "", contact_phone: "", address: "", city: "", province: "", postal_code: "", accepts_walk_ins: false };

async function api(path: string, options?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Your session expired. Please sign in again.");
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, ...options?.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

export default function StaffSettingsWorkspace({ email, initialTab = "general" }: { email: string; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [general, setGeneral] = useState<General>(blank);
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let active = true;
    void api("/api/clinic-settings").then((result) => { if (!active) return; setGeneral(result.settings); setCategories(result.categories); setServices(result.services.map((item: Service) => ({ ...item, price: Number(item.price) }))); setProducts(result.products.map((item: Product) => ({ ...item, price: Number(item.price) }))); }).catch((value) => active && setError(value instanceof Error ? value.message : "Unable to load settings.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const grouped = useMemo(() => categories.map((category) => ({ category, rows: services.filter((service) => service.category_id === category.id) })).filter((group) => group.rows.length), [categories, services]);
  const updateGeneral = (key: keyof General, value: string | boolean) => setGeneral((current) => ({ ...current, [key]: value }));
  const updateService = (id: string, key: "name" | "price", value: string) => setServices((current) => current.map((item) => item.id === id ? { ...item, [key]: key === "price" ? Number(value) : value } : item));
  const updateProduct = (id: string, key: "name" | "price", value: string) => setProducts((current) => current.map((item) => item.id === id ? { ...item, [key]: key === "price" ? Number(value) : value } : item));

  async function saveGeneral(event: React.FormEvent) {
    event.preventDefault(); setSaving("general"); setError(""); setMessage("");
    try { const result = await api("/api/clinic-settings", { method: "PATCH", body: JSON.stringify({ type: "general", settings: general }) }); setGeneral(result.settings); setMessage("General clinic settings saved."); }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to save settings."); } finally { setSaving(""); }
  }
  async function saveService(service: Service) {
    setSaving(service.id); setError(""); setMessage("");
    try { await api("/api/clinic-settings", { method: "PATCH", body: JSON.stringify({ type: "service", id: service.id, name: service.name, price: service.price }) }); setMessage(`${service.name} was updated. New bookings will use this price.`); }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to update the service."); } finally { setSaving(""); }
  }
  async function saveProduct(product: Product) {
    setSaving(product.id); setError(""); setMessage("");
    try { await api("/api/clinic-settings", { method: "PATCH", body: JSON.stringify({ type: "product", id: product.id, name: product.name, price: product.price }) }); setMessage(`${product.name} package was updated. The booking catalog now uses this price.`); }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to update the package."); } finally { setSaving(""); }
  }
  async function changePassword(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (password.length < 8) return setError("Use at least 8 characters for your new password.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setSaving("password");
    try { const { error: authError } = await supabase.auth.updateUser({ password }); if (authError) throw authError; setPassword(""); setConfirmPassword(""); setMessage("Your password was changed successfully."); }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to change your password."); } finally { setSaving(""); }
  }

  return <div className="staff-settings">
    <header className="staff-settings__heading"><div><p>CLINIC ADMINISTRATION</p><h1>Settings</h1><span>Manage clinic information, service pricing, account security, and your profile.</span></div><i className="fa-solid fa-sliders" /></header>
    <nav className="staff-settings__tabs staff-settings__tabs--four" aria-label="Settings sections">{([{ key: "general", icon: "fa-gear", label: "General" }, { key: "pricing", icon: "fa-tags", label: "Pricing" }, { key: "security", icon: "fa-shield-halved", label: "Security" }, { key: "profile", icon: "fa-user", label: "Profile" }] as const).map((item) => <button type="button" className={tab === item.key ? "active" : ""} key={item.key} onClick={() => { setTab(item.key); setError(""); setMessage(""); }}><i className={`fa-solid ${item.icon}`} />{item.label}</button>)}</nav>
    {error && <p className="account-alert error">{error}</p>}{message && <p className="account-alert success">{message}</p>}
    {loading ? <div className="staff-settings__loading"><i className="fa-solid fa-spinner fa-spin" /> Loading clinic settings...</div> : tab === "general" ? <form className="account-card" onSubmit={saveGeneral}><header><span><i className="fa-solid fa-hospital" /></span><div><h2>Clinic information</h2><p>Public contact details and operating policy.</p></div></header><div className="account-fields"><label>Clinic name<input value={general.clinic_name} onChange={(e) => updateGeneral("clinic_name", e.target.value)} required /></label><label>Attending physician<input value={general.doctor_name} onChange={(e) => updateGeneral("doctor_name", e.target.value)} required /></label><label>Clinic email<input type="email" value={general.contact_email} onChange={(e) => updateGeneral("contact_email", e.target.value)} required /></label><label>Clinic phone<input value={general.contact_phone} onChange={(e) => updateGeneral("contact_phone", e.target.value)} required /></label><label className="wide">Street address<input value={general.address} onChange={(e) => updateGeneral("address", e.target.value)} /></label><label>City<input value={general.city} onChange={(e) => updateGeneral("city", e.target.value)} /></label><label>Province<input value={general.province} onChange={(e) => updateGeneral("province", e.target.value)} /></label><label>Postal code<input value={general.postal_code} onChange={(e) => updateGeneral("postal_code", e.target.value)} /></label><label className="staff-toggle"><input type="checkbox" checked={general.accepts_walk_ins} onChange={(e) => updateGeneral("accepts_walk_ins", e.target.checked)} /><span><strong>Accept walk-ins</strong><small>Turn off when every visit requires an appointment.</small></span></label></div><div className="staff-schedule-link"><i className="fa-regular fa-calendar" /><span><strong>Doctor hours and blocked dates</strong><small>Availability is managed separately because it controls patient booking slots.</small></span><Link href="/dashboard/doctor?view=availability">Manage schedule <i className="fa-solid fa-arrow-right" /></Link></div><footer><span><i className="fa-solid fa-database" /> Saved as clinic-wide settings</span><button disabled={saving === "general"}>{saving === "general" ? "Saving..." : "Save general settings"}</button></footer></form>
    : tab === "pricing" ? <div className="staff-pricing"><header><div><p>PRICING SOURCE OF TRUTH</p><h2>Services &amp; package prices</h2><span>Changes here are reflected in the patient booking catalog.</span></div><aside><strong>{services.filter((item) => item.is_active).length + products.filter((item) => item.is_active).length}</strong><small>ACTIVE ITEMS</small></aside></header>{grouped.map(({ category, rows }) => <section key={category.id}><div><p>{category.name.toUpperCase()}</p><h3>{category.name} prices</h3></div><div className="staff-price-table"><div className="staff-price-head"><span>Service</span><span>Duration</span><span>Price</span><span>Action</span></div>{rows.map((service) => <article key={service.id} className={!service.is_active ? "inactive" : ""}><div><small>{service.slug}</small><input value={service.name} onChange={(e) => updateService(service.id, "name", e.target.value)} /><p>{service.description || service.price_note || "Booking service"}</p></div><strong>{service.duration_mins} min</strong><label><span>PHP</span><input type="number" min="0" step="0.01" value={service.price} onChange={(e) => updateService(service.id, "price", e.target.value)} /></label><button type="button" onClick={() => void saveService(service)} disabled={saving === service.id}><i className="fa-solid fa-floppy-disk" /> {saving === service.id ? "Saving..." : "Save"}</button></article>)}</div></section>)}{products.length > 0 && <section><div><p>CLINIC PACKAGES</p><h3>Package prices</h3></div><div className="staff-price-table"><div className="staff-price-head"><span>Package</span><span>Type</span><span>Price</span><span>Action</span></div>{products.map((product) => <article key={product.id} className={!product.is_active ? "inactive" : ""}><div><small>package</small><input value={product.name} onChange={(e) => updateProduct(product.id, "name", e.target.value)} /><p>{product.description || "Clinic package"}</p></div><strong>{product.category}</strong><label><span>PHP</span><input type="number" min="0" step="0.01" value={product.price} onChange={(e) => updateProduct(product.id, "price", e.target.value)} /></label><button type="button" onClick={() => void saveProduct(product)} disabled={saving === product.id}><i className="fa-solid fa-floppy-disk" /> {saving === product.id ? "Saving..." : "Save"}</button></article>)}</div></section>}</div>
    : tab === "security" ? <div className="account-settings-grid"><form className="account-card" onSubmit={changePassword}><header><span><i className="fa-solid fa-key" /></span><div><h2>Change password</h2><p>Use a unique password you do not use elsewhere.</p></div></header><div className="account-fields one"><label>New password<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /><small>Minimum of 8 characters.</small></label><label>Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required /></label></div><footer><span><i className="fa-solid fa-shield-halved" /> Signed in as {email}</span><button disabled={saving === "password"}>{saving === "password" ? "Updating..." : "Change password"}</button></footer></form><aside className="account-security"><i className="fa-solid fa-user-shield" /><h2>Account access</h2><p>Clinic settings and pricing are restricted to doctor and superadmin accounts.</p><Link href="mailto:thekliniqueinfo@gmail.com">Report a security concern <i className="fa-solid fa-arrow-right" /></Link></aside></div>
    : <AccountProfileWorkspace />}
  </div>;
}
