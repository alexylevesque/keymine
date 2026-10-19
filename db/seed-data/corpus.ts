// Passages du domaine public pour le texte cohérent (CONF-03). Chaque auteur
// est mort depuis plus de 70 ans. Les passages sont des extraits courts ; la
// source (œuvre, auteur) est conservée en base.
//
// Vérifiés mot à mot contre Project Gutenberg (voir docs/IA-JOURNAL.md n° 4 : ils avaient été
// transcrits de mémoire, quatre coquilles ont été corrigées). Adaptations
// volontaires pour un jeu de frappe : les vers sont fondus en prose, les tirets
// longs sont remplacés par des virgules (introuvables au clavier), la graphie de
// 1759 de « Vestphalie » est modernisée, et certains extraits s'arrêtent à la fin
// d'une proposition. Wikisource n'était pas accessible depuis l'environnement de travail.

export type SeedPassage = { language: "fr" | "en"; title: string; source: string; content: string };

export const PASSAGES: SeedPassage[] = [
  {
    language: "fr",
    title: "La Cigale et la Fourmi",
    source: "Jean de La Fontaine, Fables (domaine public)",
    content:
      "La Cigale, ayant chanté tout l'été, se trouva fort dépourvue quand la bise fut venue. Pas un seul petit morceau de mouche ou de vermisseau. Elle alla crier famine chez la Fourmi sa voisine, la priant de lui prêter quelque grain pour subsister jusqu'à la saison nouvelle.",
  },
  {
    language: "fr",
    title: "Le Corbeau et le Renard",
    source: "Jean de La Fontaine, Fables (domaine public)",
    content:
      "Maître Corbeau, sur un arbre perché, tenait en son bec un fromage. Maître Renard, par l'odeur alléché, lui tint à peu près ce langage : Hé ! bonjour, Monsieur du Corbeau. Que vous êtes joli ! que vous me semblez beau !",
  },
  {
    language: "fr",
    title: "Demain, dès l'aube",
    source: "Victor Hugo, Les Contemplations (domaine public)",
    content:
      "Demain, dès l'aube, à l'heure où blanchit la campagne, je partirai. Vois-tu, je sais que tu m'attends. J'irai par la forêt, j'irai par la montagne. Je ne puis demeurer loin de toi plus longtemps.",
  },
  {
    language: "fr",
    title: "Chanson d'automne",
    source: "Paul Verlaine, Poèmes saturniens (domaine public)",
    content:
      "Les sanglots longs des violons de l'automne blessent mon cœur d'une langueur monotone. Tout suffocant et blême, quand sonne l'heure, je me souviens des jours anciens et je pleure.",
  },
  {
    language: "fr",
    title: "Le Petit Poucet",
    source: "Charles Perrault, Histoires ou contes du temps passé (domaine public)",
    content:
      "Il était une fois un bûcheron et une bûcheronne qui avaient sept enfants, tous garçons ; l'aîné n'avait que dix ans, et le plus jeune n'en avait que sept.",
  },
  {
    language: "fr",
    title: "Vingt mille lieues sous les mers",
    source: "Jules Verne (domaine public)",
    content:
      "L'année 1866 fut marquée par un événement bizarre, un phénomène inexpliqué et inexplicable que personne n'a sans doute oublié.",
  },
  {
    language: "fr",
    title: "Madame Bovary",
    source: "Gustave Flaubert (domaine public)",
    content:
      "Nous étions à l'Étude, quand le Proviseur entra, suivi d'un nouveau habillé en bourgeois et d'un garçon de classe qui portait un grand pupitre.",
  },
  {
    language: "fr",
    title: "Candide",
    source: "Voltaire (domaine public)",
    content:
      "Il y avait en Westphalie, dans le château de M. le baron de Thunder-ten-tronckh, un jeune garçon à qui la nature avait donné les mœurs les plus douces.",
  },
  {
    language: "fr",
    title: "L'Albatros",
    source: "Charles Baudelaire, Les Fleurs du mal (domaine public)",
    content:
      "Souvent, pour s'amuser, les hommes d'équipage prennent des albatros, vastes oiseaux des mers, qui suivent, indolents compagnons de voyage, le navire glissant sur les gouffres amers.",
  },
  {
    language: "fr",
    title: "Les Trois Mousquetaires",
    source: "Alexandre Dumas (domaine public)",
    content:
      "Le premier lundi du mois d'avril 1625, le bourg de Meung, où naquit l'auteur du Roman de la Rose, semblait être dans une révolution aussi entière que si les huguenots fussent venus pour en faire une seconde Rochelle.",
  },
  {
    language: "fr",
    title: "Germinal",
    source: "Émile Zola (domaine public)",
    content:
      "Dans la plaine rase, sous la nuit sans étoiles, d'une obscurité et d'une épaisseur d'encre, un homme suivait seul la grande route de Marchiennes à Montsou, dix kilomètres de pavé coupant tout droit, à travers les champs de betteraves.",
  },
  {
    language: "en",
    title: "Pride and Prejudice",
    source: "Jane Austen (public domain)",
    content:
      "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
  },
  {
    language: "en",
    title: "A Tale of Two Cities",
    source: "Charles Dickens (public domain)",
    content:
      "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity.",
  },
  {
    language: "en",
    title: "Moby-Dick",
    source: "Herman Melville (public domain)",
    content:
      "Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.",
  },
  {
    language: "en",
    title: "Alice's Adventures in Wonderland",
    source: "Lewis Carroll (public domain)",
    content:
      "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it.",
  },
  {
    language: "en",
    title: "A Scandal in Bohemia",
    source: "Arthur Conan Doyle (public domain)",
    content:
      "To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name.",
  },
  {
    language: "en",
    title: "Treasure Island",
    source: "Robert Louis Stevenson (public domain)",
    content:
      "Squire Trelawney, Dr. Livesey, and the rest of these gentlemen having asked me to write down the whole particulars about Treasure Island, from the beginning to the end, keeping nothing back but the bearings of the island.",
  },
  {
    language: "en",
    title: "The War of the Worlds",
    source: "H. G. Wells (public domain)",
    content:
      "No one would have believed in the last years of the nineteenth century that this world was being watched keenly and closely by intelligences greater than man's and yet as mortal as his own.",
  },
  {
    language: "en",
    title: "The Raven",
    source: "Edgar Allan Poe (public domain)",
    content:
      "Once upon a midnight dreary, while I pondered, weak and weary, over many a quaint and curious volume of forgotten lore, while I nodded, nearly napping, suddenly there came a tapping, as of some one gently rapping, rapping at my chamber door.",
  },
  {
    language: "en",
    title: "Adventures of Huckleberry Finn",
    source: "Mark Twain (public domain)",
    content:
      "You don't know about me without you have read a book by the name of The Adventures of Tom Sawyer; but that ain't no matter.",
  },
  {
    language: "en",
    title: "Frankenstein",
    source: "Mary Shelley (public domain)",
    content: "It was on a dreary night of November that I beheld the accomplishment of my toils.",
  },
  {
    language: "en",
    title: "The Picture of Dorian Gray",
    source: "Oscar Wilde (public domain)",
    content:
      "The studio was filled with the rich odour of roses, and when the light summer wind stirred amidst the trees of the garden, there came through the open door the heavy scent of the lilac, or the more delicate perfume of the pink-flowering thorn.",
  },
  {
    language: "en",
    title: "Robinson Crusoe",
    source: "Daniel Defoe (public domain)",
    content:
      "I was born in the year 1632, in the city of York, of a good family, though not of that country, my father being a foreigner of Bremen, who settled first at Hull.",
  },
];
