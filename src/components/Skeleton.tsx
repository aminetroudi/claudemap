export function SkeletonFullPage() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: "20px 18px" }}>
            <div className="skeleton" style={{ height: 14, width: "50%", marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 28, width: "35%" }} />
          </div>
        ))}
      </div>
      {/* content rows */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ height: 16, width: "35%", marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 12, width: "65%", marginBottom: 6 }} />
              <div className="skeleton" style={{ height: 11, width: "45%" }} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <div className="skeleton" style={{ height: 34, width: 70 }} />
              <div className="skeleton" style={{ height: 34, width: 70 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card" style={{ padding: "16px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 16, width: "40%", marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 12, width: "70%", marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 11, width: "55%" }} />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <div className="skeleton" style={{ height: 32, width: 60 }} />
          <div className="skeleton" style={{ height: 32, width: 60 }} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </>
  );
}
