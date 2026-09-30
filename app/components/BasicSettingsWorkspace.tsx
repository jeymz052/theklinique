"use client";

import { useState } from "react";
import AccountProfileWorkspace from "@/app/components/AccountProfileWorkspace";
import AccountSecurityWorkspace from "@/app/components/AccountSecurityWorkspace";

type Tab = "general" | "profile";

export default function BasicSettingsWorkspace({ email, initialTab = "general" }: { email?: string; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return <div className="staff-settings">
    <nav className="staff-settings__tabs staff-settings__tabs--two" aria-label="Settings sections">
      <button type="button" className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}><i className="fa-solid fa-gear" />General Settings</button>
      <button type="button" className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}><i className="fa-regular fa-user" />Profile</button>
    </nav>
    {tab === "general" ? <AccountSecurityWorkspace email={email} /> : <AccountProfileWorkspace />}
  </div>;
}
