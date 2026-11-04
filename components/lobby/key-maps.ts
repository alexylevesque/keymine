// Disposition des cartes de touches du formulaire de création (CONF-06, CONF-07).
// `indent` : décalage de la rangée, en nombre de touches, comme sur un vrai clavier.
export type KeyRow = { indent: number; keys: string[] };

export const LETTER_ROWS: KeyRow[] = [
  { indent: 0, keys: [..."qwertyuiop"] },
  { indent: 0.5, keys: [..."asdfghjkl"] },
  { indent: 1, keys: [..."zxcvbnm"] },
];

// Tous les symboles du clavier, y compris ceux « de code » : `. , / ; ' [ ] \ ` ! @ # $ % ^ & * ( ) _ + - = < > ? { } | ~ " :`.
// Symboles : deux rangées de 16, comme la maquette.
export const SYMBOL_ROWS: KeyRow[] = [
  { indent: 0, keys: [..."!@#$%^&*()_+-={}"] },
  { indent: 0, keys: [..."[]|\\/`~:\";'<>,.?"] },
];

// Chiffres : deux rangées de cinq, pour tenir à côté de la carte des lettres.
export const DIGIT_ROWS: KeyRow[] = [
  { indent: 0, keys: [..."12345"] },
  { indent: 0, keys: [..."67890"] },
];

export const LETTERS = LETTER_ROWS.flatMap((row) => row.keys);
export const DIGITS = DIGIT_ROWS.flatMap((row) => row.keys);
export const SYMBOLS = SYMBOL_ROWS.flatMap((row) => row.keys);
