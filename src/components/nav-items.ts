import {
  CalendarClock,
  CalendarDays,
  ChartNoAxesCombined,
  Building2,
  Bell,
  FileText,
  History,
  Images,
  LayoutDashboard,
  Link2,
  LayoutTemplate,
  Settings,
  SquarePen,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Analytics", href: "/analytics", icon: ChartNoAxesCombined },
  { label: "Create Post", href: "/create-post", icon: SquarePen },
  { label: "Drafts", href: "/drafts", icon: FileText },
  { label: "Templates", href: "/templates", icon: LayoutTemplate },
  { label: "Scheduled", href: "/scheduled", icon: CalendarClock },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "History", href: "/history", icon: History },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Media Library", href: "/media", icon: Images },
  { label: "Connected Accounts", href: "/connected-accounts", icon: Link2 },
  { label: "Webhooks", href: "/integrations", icon: Webhook },
  { label: "Team", href: "/team", icon: Users },
  { label: "Workspace", href: "/workspace/settings", icon: Building2 },
  { label: "Settings", href: "/settings", icon: Settings },
];

/** Items matched on the exact path only, never on a prefix. */
const EXACT_MATCH_HREFS = ["/create-post"];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (EXACT_MATCH_HREFS.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
