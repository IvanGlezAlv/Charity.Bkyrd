"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  group: string;
}

export function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const groups = Array.from(new Set(items.map((i) => i.group)));
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Administración">
      {groups.map((g) => (
        <div key={g} className="mb-5">
          <p className="eyebrow mb-1 px-3 text-paper/50">{g}</p>
          <ul>
            {items.filter((i) => i.group === g).map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={active(i.href) ? "page" : undefined}
                  className={`block px-3 py-2 text-sm ${active(i.href) ? "bg-paper text-ink" : "text-paper hover:bg-paper/10"}`}
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
