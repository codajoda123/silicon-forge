interface DataErrorScreenProps {
  readonly message: string;
  readonly issues: readonly string[];
}

export function DataErrorScreen({ message, issues }: DataErrorScreenProps) {
  return (
    <main className="data-error">
      <div className="panel data-error-panel">
        <p className="data-error-kicker">Data layer</p>
        <h1>Silicon Forge cannot start</h1>
        <p className="lead">
          One or more bundled data files failed validation. The game refuses to run with
          incomplete or contradictory data, so nothing has been changed on disk.
        </p>
        {issues.length > 0 ? (
          <ol className="data-error-list">
            {issues.map((issue, index) => (
              <li key={`${String(index)}:${issue}`}>{issue}</li>
            ))}
          </ol>
        ) : (
          <pre className="data-error-message">{message}</pre>
        )}
        <p className="muted">
          Fix the named file and path, then reload the page. Formula errors show the exact
          expression that failed.
        </p>
      </div>
    </main>
  );
}
