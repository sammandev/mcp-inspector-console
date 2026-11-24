export interface FeaturePlaceholderProps {
  label: string;
  description: string;
  available: boolean;
}

export function FeaturePlaceholder({ label, description, available }: FeaturePlaceholderProps) {
  return (
    <section className="placeholder-card" aria-labelledby="feature-title">
      <div className="placeholder-icon" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">Selected capability</p>
      <h1 id="feature-title">{label}</h1>
      <p>{description}</p>
      <div className="placeholder-state">
        <span className={available ? "state-dot ready" : "state-dot"} />
        {available ? "Published surface registered" : "Offline scaffold"}
      </div>
      <p className="placeholder-note">
        Phase 0 exposes navigation and visual contracts only. No MCP connection is opened.
      </p>
    </section>
  );
}
