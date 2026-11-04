// Trophée et couronne de la page Résultats (maquette du 4 nov., dessins pixel originaux).

const TROPHY =
  '<path fill="#0B2E2C" d="M0 0h16v1h-16zM0 1h1v1h-1zM15 1h1v1h-1zM0 2h1v1h-1zM15 2h1v1h-1zM0 3h1v1h-1zM15 3h1v1h-1zM0 4h1v1h-1zM15 4h1v1h-1zM0 5h1v1h-1zM15 5h1v1h-1zM0 6h1v1h-1zM15 6h1v1h-1zM0 7h1v1h-1zM15 7h1v1h-1zM0 8h1v1h-1zM15 8h1v1h-1zM0 9h1v1h-1zM15 9h1v1h-1zM0 10h1v1h-1zM15 10h1v1h-1zM0 11h1v1h-1zM15 11h1v1h-1zM0 12h1v1h-1zM15 12h1v1h-1zM0 13h1v1h-1zM15 13h1v1h-1zM0 14h1v1h-1zM15 14h1v1h-1zM0 15h16v1h-16z"/><path fill="#E6FFFC" d="M1 1h14v1h-14zM1 2h1v1h-1zM1 3h1v1h-1zM1 4h1v1h-1zM1 5h1v1h-1zM1 6h1v1h-1zM7 6h1v1h-1zM1 7h1v1h-1zM6 7h2v1h-2zM1 8h1v1h-1zM1 9h1v1h-1zM1 10h1v1h-1zM1 11h1v1h-1zM1 12h1v1h-1zM1 13h1v1h-1zM1 14h1v1h-1z"/><path fill="#8FEDE6" d="M2 2h12v1h-12zM2 3h1v1h-1zM2 4h1v1h-1zM12 4h1v1h-1zM2 5h1v1h-1zM8 5h1v1h-1zM12 5h1v1h-1zM2 6h1v1h-1zM8 6h2v1h-2zM12 6h1v1h-1zM2 7h1v1h-1zM8 7h3v1h-3zM12 7h1v1h-1zM2 8h1v1h-1zM12 8h1v1h-1zM2 9h1v1h-1zM12 9h1v1h-1zM2 10h1v1h-1zM12 10h1v1h-1zM2 11h1v1h-1zM12 11h1v1h-1zM2 12h1v1h-1zM4 12h9v1h-9zM2 13h1v1h-1z"/><path fill="#137A75" d="M14 2h1v1h-1zM14 3h1v1h-1zM7 4h2v1h-2zM14 4h1v1h-1zM9 5h1v1h-1zM14 5h1v1h-1zM5 6h1v1h-1zM10 6h1v1h-1zM14 6h1v1h-1zM4 7h1v1h-1zM11 7h1v1h-1zM14 7h1v1h-1zM4 8h1v1h-1zM11 8h1v1h-1zM14 8h1v1h-1zM5 9h1v1h-1zM10 9h1v1h-1zM14 9h1v1h-1zM6 10h1v1h-1zM9 10h1v1h-1zM14 10h1v1h-1zM7 11h2v1h-2zM14 11h1v1h-1zM14 12h1v1h-1zM14 13h1v1h-1zM2 14h13v1h-13z"/><path fill="#1F9C95" d="M3 3h11v1h-11zM3 4h1v1h-1zM13 4h1v1h-1zM3 5h1v1h-1zM13 5h1v1h-1zM3 6h1v1h-1zM13 6h1v1h-1zM3 7h1v1h-1zM13 7h1v1h-1zM3 8h1v1h-1zM8 8h3v1h-3zM13 8h1v1h-1zM3 9h1v1h-1zM8 9h2v1h-2zM13 9h1v1h-1zM3 10h1v1h-1zM8 10h1v1h-1zM13 10h1v1h-1zM3 11h1v1h-1zM13 11h1v1h-1zM3 12h1v1h-1zM13 12h1v1h-1zM3 13h11v1h-11z"/><path fill="#45CFC8" d="M4 4h3v1h-3zM9 4h3v1h-3zM4 5h2v1h-2zM10 5h2v1h-2zM4 6h1v1h-1zM11 6h1v1h-1zM5 8h3v1h-3zM4 9h1v1h-1zM6 9h2v1h-2zM11 9h1v1h-1zM4 10h2v1h-2zM7 10h1v1h-1zM10 10h2v1h-2zM4 11h3v1h-3zM9 11h3v1h-3z"/><path fill="#FFFFFF" d="M6 5h2v1h-2zM6 6h1v1h-1zM5 7h1v1h-1z"/>';
const CROWN =
  '<path fill="#F0B429" d="M0 0h1v5h-1zM3 0h1v5h-1zM6 0h1v5h-1zM0 2h7v3h-7z"/><path fill="#9A6B0A" d="M0 4h7v1h-7z"/><path fill="#45CFC8" d="M3 2h1v1h-1z"/>';

export function Trophy() {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      dangerouslySetInnerHTML={{ __html: TROPHY }}
    />
  );
}

export function PodiumCrown() {
  return (
    <svg
      className="res-crown"
      viewBox="0 0 7 5"
      shapeRendering="crispEdges"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: CROWN }}
    />
  );
}
