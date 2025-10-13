export function SponsorCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-200 animate-pulse">
      {/* Logo skeleton */}
      <div className="h-48 bg-gray-200" />

      {/* Content skeleton */}
      <div className="p-6">
        <div className="h-6 bg-gray-200 rounded mb-2 w-3/4" />
        <div className="h-4 bg-gray-200 rounded mb-2 w-full" />
        <div className="h-4 bg-gray-200 rounded mb-4 w-2/3" />
        <div className="h-4 bg-gray-200 rounded w-1/3" />
      </div>

      {/* Bottom accent */}
      <div className="h-1 w-full bg-gray-200" />
    </div>
  );
}

export function SponsorsPageSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-primary-50 to-gray-50">
      {/* Hero skeleton */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto animate-pulse">
            <div className="h-8 bg-gray-200 rounded-full w-32 mx-auto mb-6" />
            <div className="h-12 bg-gray-200 rounded w-3/4 mx-auto mb-4" />
            <div className="h-6 bg-gray-200 rounded w-2/3 mx-auto" />
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
