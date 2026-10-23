import { LandingPage } from "@/components/landing/LandingPage";

// Only hosts without a tournament reach this page (the apex, www, Vercel
// previews, localhost): middleware.ts redirects a tournament subdomain's "/"
// to /home before it gets here.
export default function RootPage() {
  return <LandingPage />;
}
