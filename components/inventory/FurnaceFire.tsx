// Feu du four (maquette « 7 · Inventaire ») : deux flammes pixel qui alternent et des étincelles
// qui montent. Éteint : rien ne bouge et le feu est gris.

const FIRE_A =
  '<path fill="#B0281C" d="M5 0h4v1h-4zM5 1h1v1h-1zM9 1h1v1h-1zM3 2h2v1h-2zM9 2h1v1h-1zM3 3h2v1h-2zM10 4h1v1h-1zM1 5h2v1h-2zM10 5h1v1h-1zM1 6h2v1h-2zM11 6h1v1h-1zM11 7h2v1h-2zM12 8h1v1h-1zM0 10h1v1h-1zM0 11h1v1h-1zM13 11h1v1h-1zM13 12h1v1h-1z"/><path fill="#E0701C" d="M6 1h3v1h-3zM5 2h4v1h-4zM5 3h1v1h-1zM9 3h1v1h-1zM3 4h2v1h-2zM9 4h1v1h-1zM3 5h2v1h-2zM10 6h1v1h-1zM1 7h2v1h-2zM10 7h1v1h-1zM1 8h2v1h-2zM11 8h1v1h-1zM11 9h2v1h-2zM12 10h1v1h-1zM0 12h1v1h-1z"/><path fill="#F0B429" d="M6 3h3v1h-3zM5 4h4v1h-4zM5 5h5v1h-5zM3 6h7v1h-7zM3 7h7v1h-7zM3 8h8v1h-8zM1 9h4v1h-4zM9 9h2v1h-2zM1 10h4v1h-4zM9 10h3v1h-3zM1 11h4v1h-4zM9 11h4v1h-4zM1 12h4v1h-4zM9 12h4v1h-4z"/><path fill="#FFF29A" d="M5 9h4v1h-4zM5 10h4v1h-4zM5 11h4v1h-4zM5 12h4v1h-4z"/><path fill="#9A6B3A" d="M1 13h2v1h-2zM4 13h3v1h-3zM8 13h2v1h-2zM11 13h2v1h-2z"/><path fill="#5A3A1E" d="M3 13h1v1h-1zM7 13h1v1h-1zM10 13h1v1h-1zM0 14h14v1h-14z"/>';
const FIRE_B =
  '<path fill="#E0701C" d="M6 0h1v1h-1zM6 1h1v1h-1zM7 2h3v1h-3zM3 3h1v1h-1zM5 3h1v1h-1zM7 3h3v1h-3zM3 4h3v1h-3zM4 5h1v1h-1zM2 6h1v1h-1zM10 6h2v1h-2zM2 7h1v1h-1zM10 7h2v1h-2zM1 9h1v1h-1zM1 10h1v1h-1zM12 10h1v1h-1zM0 11h1v1h-1zM12 11h1v1h-1zM0 12h1v1h-1z"/><path fill="#B0281C" d="M7 0h3v1h-3zM3 1h1v1h-1zM5 1h1v1h-1zM7 1h3v1h-3zM3 2h3v1h-3zM4 3h1v1h-1zM2 4h1v1h-1zM10 4h2v1h-2zM2 5h1v1h-1zM10 5h2v1h-2zM1 7h1v1h-1zM1 8h1v1h-1zM12 8h1v1h-1zM0 9h1v1h-1zM12 9h1v1h-1zM0 10h1v1h-1zM13 11h1v1h-1zM13 12h1v1h-1z"/><path fill="#F0B429" d="M6 2h1v1h-1zM6 3h1v1h-1zM6 4h4v1h-4zM3 5h1v1h-1zM5 5h5v1h-5zM3 6h7v1h-7zM3 7h7v1h-7zM2 8h10v1h-10zM2 9h3v1h-3zM9 9h3v1h-3zM2 10h3v1h-3zM9 10h3v1h-3zM1 11h4v1h-4zM9 11h3v1h-3zM1 12h4v1h-4zM9 12h4v1h-4z"/><path fill="#FFF29A" d="M5 9h4v1h-4zM5 10h4v1h-4zM5 11h4v1h-4zM5 12h4v1h-4z"/><path fill="#9A6B3A" d="M1 13h2v1h-2zM4 13h3v1h-3zM8 13h2v1h-2zM11 13h2v1h-2z"/><path fill="#5A3A1E" d="M3 13h1v1h-1zM7 13h1v1h-1zM10 13h1v1h-1zM0 14h14v1h-14z"/>';

export function FurnaceFire({ on }: { on: boolean }) {
  return (
    <span className="inv-fire" data-on={on} aria-hidden="true">
      <svg
        className="fa"
        viewBox="0 0 14 16"
        shapeRendering="crispEdges"
        dangerouslySetInnerHTML={{ __html: FIRE_A }}
      />
      <svg
        className="fb"
        viewBox="0 0 14 16"
        shapeRendering="crispEdges"
        dangerouslySetInnerHTML={{ __html: FIRE_B }}
      />
      <i />
      <i />
      <i />
    </span>
  );
}
