export function DbErrorBanner({ label }: { label: string }) {
  return (
    <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
      {label}
    </div>
  );
}
