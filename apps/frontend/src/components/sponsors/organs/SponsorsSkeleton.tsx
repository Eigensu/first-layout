export function SponsorCardSkeleton() {
  return (
    <div className="bg-bg-card rounded-2xl overflow-hidden shadow-lg border border-border-subtle animate-pulse">
      {/* Logo skeleton */}
      <div className="h-48 bg-bg-elevated" />

      {/* Content skeleton */}
      <div className="p-6">
        <div className="h-6 bg-bg-elevated rounded mb-2 w-3/4" />
        <div className="h-4 bg-bg-elevated rounded mb-2 w-full" />
        <div className="h-4 bg-bg-elevated rounded mb-4 w-2/3" />
        <div className="h-4 bg-bg-elevated rounded w-1/3" />
      </div>

      {/* Bottom accent */}
      <div className="h-1 w-full bg-gradient-brand" />
    </div>
  );
}

export function SponsorsPageSkeleton() {
  return (
    <div className="min-h-screen bg-bg-body">
      {/* Hero skeleton */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto animate-pulse">
            <div className="h-8 bg-bg-card rounded-full w-32 mx-auto mb-6" />
            <div className="h-12 bg-bg-card rounded w-3/4 mx-auto mb-4" />
            <div className="h-6 bg-bg-card rounded w-2/3 mx-auto" />
          </div>
        </div>
      </section>

      {/* Grid skeleton */}
      <section className="py-12">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <SponsorCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
