import { loginUrlWithNext } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/server";
import { LandingCta } from "@/components/marketing/landing-cta";
import { LandingFeatures } from "@/components/marketing/landing-features";
import { LandingHero } from "@/components/marketing/landing-hero";
import { LandingHowItWorks } from "@/components/marketing/landing-how-it-works";
import { SiteHeader } from "@/components/marketing/site-header";

export default async function LandingPage() {
  const user = await getCurrentUser();
  const isAuthenticated = user !== null;
  const createPostHref = isAuthenticated
    ? "/create-post"
    : loginUrlWithNext("/create-post");

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        isAuthenticated={isAuthenticated}
        createPostHref={createPostHref}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <LandingHero createPostHref={createPostHref} />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingCta createPostHref={createPostHref} />
      </main>
    </div>
  );
}
