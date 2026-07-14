export const SYNC_MAIN_THEMES = [
  "Astuce",
  "Cuisine",
  "Divers",
  "Restaurant",
  "Salé",
  "Sport",
  "Sucré",
  "Voyages",
] as const;

type MainTheme = (typeof SYNC_MAIN_THEMES)[number];

type ThemeRule = {
  theme: MainTheme;
  terms: Array<[term: string, weight: number]>;
};

const THEME_RULES: ThemeRule[] = [
  { theme: "Restaurant", terms: [["restaurant", 5], ["bonne adresse", 5], ["bonnes adresses", 5], ["where to eat", 5], ["brunch", 3], ["menu", 2], ["cafe", 2], ["coffee shop", 3], ["chef", 2]] },
  { theme: "Voyages", terms: [["voyage", 5], ["travel", 5], ["itineraire", 4], ["destination", 4], ["hotel", 3], ["tokyo", 3], ["japon", 3], ["japan", 3], ["londres", 3], ["london", 3], ["paris", 2], ["plage", 2], ["beach", 2]] },
  { theme: "Sport", terms: [["workout", 5], ["entrainement", 5], ["musculation", 5], ["fitness", 4], ["exercise", 4], ["training", 4], ["running", 4], ["gym", 4], ["cardio", 3], ["mobility", 3]] },
  { theme: "Astuce", terms: [["astuce", 5], ["conseil", 4], ["tips", 4], ["tutorial", 4], ["tutoriel", 4], ["how to", 3], ["hack", 3], ["guide pratique", 3], ["diy", 3]] },
  { theme: "Sucré", terms: [["dessert", 5], ["gateau", 5], ["cake", 5], ["chocolat", 4], ["chocolate", 4], ["brownie", 4], ["cookie", 4], ["cheesecake", 4], ["tiramisu", 4], ["glace", 4], ["ice cream", 4], ["patisserie", 4], ["caramel", 3], ["vanille", 3], ["pistache", 3], ["sucre", 2], ["sweet", 3]] },
  { theme: "Salé", terms: [["recette salee", 5], ["poulet", 4], ["chicken", 4], ["pates", 4], ["pasta", 4], ["pizza", 4], ["burger", 4], ["saumon", 4], ["salmon", 4], ["boeuf", 4], ["beef", 4], ["riz", 3], ["rice", 3], ["sauce", 2], ["sandwich", 3], ["salade", 3]] },
  { theme: "Cuisine", terms: [["recette", 3], ["recipe", 3], ["ingredients", 3], ["cuisson", 3], ["cooking", 3], ["air fryer", 3], ["meal prep", 3], ["fait maison", 2], ["homemade", 2]] },
];

const TAG_TERMS: Array<[label: string, terms: string[]]> = [
  ["Dessert", ["dessert"]], ["Chocolat", ["chocolat", "chocolate"]], ["Brownie", ["brownie"]],
  ["Cookie", ["cookie"]], ["Cheesecake", ["cheesecake"]], ["Tiramisu", ["tiramisu"]],
  ["Pistache", ["pistache", "pistachio"]], ["Vanille", ["vanille", "vanilla"]],
  ["Caramel", ["caramel"]], ["Citron", ["citron", "lemon"]], ["Fraise", ["fraise", "strawberry"]],
  ["Framboise", ["framboise", "raspberry"]], ["Banane", ["banane", "banana"]],
  ["Amande", ["amande", "almond"]], ["Noisette", ["noisette", "hazelnut"]],
  ["Cacahuète", ["cacahuete", "peanut"]], ["Glace", ["glace", "ice cream"]],
  ["Ninja Creami", ["ninja creami", "ninjacreami"]], ["Dessert protéiné", ["protein dessert", "dessert proteine"]],
  ["Recette protéinée", ["high protein", "proteine", "protein"]], ["Recette healthy", ["healthy", "sain", "saine"]],
  ["Faible en calories", ["low calorie", "faible en calories"]], ["Vegan", ["vegan"]],
  ["Sans gluten", ["sans gluten", "gluten free"]], ["Air Fryer", ["air fryer", "airfryer"]],
  ["Meal prep", ["meal prep", "mealprep"]], ["Poulet", ["poulet", "chicken"]],
  ["Pâtes", ["pates", "pasta"]], ["Pizza", ["pizza"]], ["Burger", ["burger"]],
  ["Saumon", ["saumon", "salmon"]], ["Sauce maison", ["sauce"]], ["Salade", ["salade", "salad"]],
  ["Bonne adresse", ["bonne adresse", "bonnes adresses", "where to eat"]], ["Brunch", ["brunch"]],
  ["Café", ["cafe", "coffee shop"]], ["Destination", ["destination", "travel", "voyage"]],
  ["Japon", ["japon", "japan"]], ["Tokyo", ["tokyo"]], ["Paris", ["paris"]], ["Londres", ["londres", "london"]],
  ["Hôtel", ["hotel"]], ["Plage", ["plage", "beach"]], ["Fitness", ["fitness", "gym"]],
  ["Entraînement", ["entrainement", "workout", "training"]], ["Musculation", ["musculation", "strength training"]],
  ["Running", ["running", "course a pied"]], ["Tutoriel", ["tutorial", "tutoriel", "how to"]],
  ["Conseil pratique", ["astuce", "conseil", "tips", "hack"]], ["DIY", ["diy"]],
];

const FALLBACK_TAGS: Record<MainTheme, string[]> = {
  Astuce: ["Conseil pratique", "Tutoriel", "Guide pratique", "Inspiration", "Astuce du quotidien"],
  Cuisine: ["Cuisine maison", "Recette", "Fait maison", "Idée repas", "Inspiration"],
  Divers: ["Inspiration", "Lifestyle", "Tendance", "Découverte", "À explorer"],
  Restaurant: ["Bonne adresse", "Sortie gourmande", "Découverte culinaire", "Adresse gourmande", "Inspiration"],
  "Salé": ["Recette salée", "Cuisine maison", "Fait maison", "Idée repas", "Inspiration"],
  Sport: ["Fitness", "Entraînement", "Nutrition sportive", "Objectif forme", "Conseil pratique"],
  "Sucré": ["Dessert", "Recette sucrée", "Gourmandise", "Fait maison", "Inspiration"],
  Voyages: ["Destination", "Guide de voyage", "Découverte", "Itinéraire", "Inspiration"],
};

const IGNORED_HASHTAGS = new Set(["fyp", "foryou", "viral", "reels", "reel", "instagram", "instagood", "explore", "explorepage"]);

export function enrichSyncedPost(caption: string): { mainTheme: MainTheme; tags: string[] } {
  const foldedCaption = fold(caption);
  const scores = new Map<MainTheme, number>();
  for (const rule of THEME_RULES) {
    const score = rule.terms.reduce((total, [term, weight]) => total + (containsTerm(foldedCaption, term) ? weight : 0), 0);
    scores.set(rule.theme, score);
  }
  const mainTheme = [...THEME_RULES]
    .sort((left, right) => (scores.get(right.theme) ?? 0) - (scores.get(left.theme) ?? 0))[0];
  const selectedTheme = mainTheme && (scores.get(mainTheme.theme) ?? 0) > 0 ? mainTheme.theme : "Divers";

  const tags: string[] = [];
  for (const [label, terms] of TAG_TERMS) {
    if (terms.some((term) => containsTerm(foldedCaption, term))) addTag(tags, label, selectedTheme);
  }
  for (const hashtag of caption.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    const tag = humanizeHashtag(hashtag[1]);
    if (tag && !IGNORED_HASHTAGS.has(fold(tag))) addTag(tags, tag, selectedTheme);
  }
  for (const fallback of FALLBACK_TAGS[selectedTheme]) addTag(tags, fallback, selectedTheme);

  return { mainTheme: selectedTheme, tags: tags.slice(0, 10) };
}

function addTag(tags: string[], tag: string, mainTheme: MainTheme) {
  const normalized = tag.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!normalized || fold(normalized) === fold(mainTheme)) return;
  if (!tags.some((current) => fold(current) === fold(normalized))) tags.push(normalized);
}

function containsTerm(text: string, rawTerm: string): boolean {
  const term = fold(rawTerm);
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(term)}(?:$|[^a-z0-9])`).test(text);
}

function humanizeHashtag(value: string): string | null {
  const spaced = value
    .replace(/_/g, " ")
    .replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (spaced.length < 2 || spaced.length > 40) return null;
  return spaced.charAt(0).toLocaleUpperCase("fr") + spaced.slice(1);
}

function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
