"use client";

import { Layers3 } from "lucide-react";
import { statusNames } from "@/shared/lib/operation-utils";

export function Status({ value, label }: { value: string; label?: string }) {
  return (
    <span className={`badge badge-${value}`}>
      <span />
      {label || statusNames[value] || value}
    </span>
  );
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="empty-state">
      <div>
        <Layers3 size={24} />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
    </div>
  );
}

export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  detail,
  icon: Icon,
  accent = false,
  line = 0,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ size?: number }>;
  accent?: boolean;
  line?: number;
}) {
  return (
    <div className={`stat-card ${accent ? "stat-accent" : ""}`}>
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">
          <Icon size={18} />
        </span>
      </div>
      <strong className="stat-value">{value}</strong>
      <div className="stat-bottom">
        <span>{detail}</span>
      </div>
    </div>
  );
}
