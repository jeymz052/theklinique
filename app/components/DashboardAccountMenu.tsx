"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface DashboardAccountMenuProps {
  name: string;
  role: string;
  email?: string;
  onSignOut: () => void;
  signingOut?: boolean;
  profileHref?: string;
  settingsHref?: string;
  onProfileClick?: () => void;
  onSettingsClick?: () => void;
}

export default function DashboardAccountMenu({
  name,
  role,
  email,
  onSignOut,
  signingOut = false,
  profileHref = "/dashboard/profile",
  settingsHref = "/dashboard/settings",
  onProfileClick,
  onSettingsClick,
}: DashboardAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initials = name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, []);

  return (
    <div className="dk-account-menu" ref={menuRef}>
      <button type="button" className="dk-account-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="dk-account-avatar">{initials}</span>
        <span className="dk-account-copy">
          <span className="dk-account-name">{name}</span>
          <span className="dk-account-role">{role}</span>
        </span>
        <i className={`fa-solid fa-chevron-${open ? "up" : "down"}`} />
      </button>
      {open && (
        <div className="dk-account-popover">
          <div className="dk-account-popover-head">
            <strong>{name}</strong>
            {email && <span>{email}</span>}
            <small>{role}</small>
          </div>
          {onProfileClick ? <button type="button" className="dk-account-item" onClick={() => { setOpen(false); onProfileClick(); }}><i className="fa-regular fa-user" /> Profile</button> : <Link className="dk-account-item" href={profileHref} onClick={() => setOpen(false)}><i className="fa-regular fa-user" /> Profile</Link>}
          {onSettingsClick ? <button type="button" className="dk-account-item" onClick={() => { setOpen(false); onSettingsClick(); }}><i className="fa-solid fa-gear" /> Settings</button> : <Link className="dk-account-item" href={settingsHref} onClick={() => setOpen(false)}><i className="fa-solid fa-gear" /> Settings</Link>}
          <button type="button" className="dk-account-item dk-account-logout" onClick={onSignOut} disabled={signingOut}>
            <i className="fa-solid fa-arrow-right-from-bracket" /> {signingOut ? "Signing out..." : "Log out"}
          </button>
        </div>
      )}
    </div>
  );
}
