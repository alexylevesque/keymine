// Petites barres des tuiles (derniers MPM), la dernière en couleur.
export function TileBars({ values, last }: { values: number[]; last: string }) {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  return (
    <span className="prof-bars" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          style={{
            height: `${Math.max(10, Math.round((v / max) * 100))}%`,
            ...(i === values.length - 1 ? { background: last } : {}),
          }}
        />
      ))}
    </span>
  );
}

/** Moyenne cumulée : chaque barre est la moyenne des courses jusqu'à elle. */
export function runningAverage(values: number[]): number[] {
  let sum = 0;
  return values.map((v, i) => (sum += v) / (i + 1));
}
