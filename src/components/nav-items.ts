import {
  CalendarClock,
  History,
  LayoutDashboard,
  Link2,
  Settings,
  SquarePen,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Create Post", href: "/create-post", icon: SquarePen },
  { label: "Scheduled", href: "/scheduled", icon: CalendarClock },
  { label: "History", href: "/history", icon: History },
  { label: "Connected Accounts", href: "/connected-accounts", icon: Link2 },
  { label: "Settings", href: "/settings", icon: Settings },
];

/** Items matched on the exact path only, never on a prefix. */
const EXACT_MATCH_HREFS = ["/create-post"];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (EXACT_MATCH_HREFS.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
