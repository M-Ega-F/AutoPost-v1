"use client";

import { useState } from "react";

import { AppSidebar, SidebarNav } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string | null;
  children: React.ReactNode;
}) {
  const [isMobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <AppSidebar />
      </aside>

      <div className="lg:pl-64">
        <AppHeader
          userEmail={userEmail}
          onOpenNavigation={() => setMobileNavOpen(true)}
        />
        <main
          id="content"
          className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-6 md:px-6 md:py-8 lg:px-8"
        >
          {children}
        </main>
      </div>

      <Sheet open={isMobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-64 gap-0 p-0"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav
            className="py-4"
            onNavigate={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
