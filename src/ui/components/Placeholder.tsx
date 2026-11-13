export interface PlaceholderProps {
  title: string;
  milestone: string;
  summary: string;
  plans: readonly string[];
}

export function Placeholder({ title, milestone, summary, plans }: PlaceholderProps) {
  return (
    <section className="screen">
      <header className="screen-header">
        <h1>{title}</h1>
        <span className="milestone-tag">{milestone}</span>
      </header>

      <div className="panel">
        <p className="lead">{summary}</p>
        <h2>Planned for this screen</h2>
        <ul className="plan-list">
          {plans.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <p className="hint-line">
        M0 status: screen reserved. The simulation for it arrives in a later milestone.
      </p>
    </section>
  );
}
