export type Ingredient = {
  id: string;
  name: string;
  category: "Protein & dairy" | "Produce" | "Carbs" | "Pantry";
  amount: number;
  unit: "g" | "ml" | "item";
  basis: "raw" | "dry" | "ready";
  optional?: boolean;
  cookedAmount?: number;
};

export type PrepRecipe = {
  id: string;
  title: string;
  shortTitle: string;
  kind: "main" | "breakfast" | "snack";
  photo: string;
  minutes: number;
  description: string;
  ingredients: Ingredient[];
  steps: string[];
  storage: string;
};

const catalog: Record<
  string,
  Omit<Ingredient, "amount" | "cookedAmount" | "optional">
> = {
  "chicken-breast": {
    id: "chicken-breast",
    name: "Boneless skinless chicken breast",
    category: "Protein & dairy",
    unit: "g",
    basis: "raw",
  },
  "chicken-thigh": {
    id: "chicken-thigh",
    name: "Boneless skinless chicken thighs",
    category: "Protein & dairy",
    unit: "g",
    basis: "raw",
  },
  "extra-lean-beef": {
    id: "extra-lean-beef",
    name: "Extra-lean ground beef",
    category: "Protein & dairy",
    unit: "g",
    basis: "raw",
  },
  rice: {
    id: "rice",
    name: "Rice",
    category: "Carbs",
    unit: "g",
    basis: "dry",
  },
  potatoes: {
    id: "potatoes",
    name: "Potatoes",
    category: "Carbs",
    unit: "g",
    basis: "raw",
  },
  "mixed-veg": {
    id: "mixed-veg",
    name: "Frozen mixed vegetables",
    category: "Produce",
    unit: "g",
    basis: "raw",
  },
  "olive-oil": {
    id: "olive-oil",
    name: "Olive oil",
    category: "Pantry",
    unit: "g",
    basis: "ready",
  },
  oats: {
    id: "oats",
    name: "Rolled oats",
    category: "Carbs",
    unit: "g",
    basis: "dry",
  },
  "greek-yogurt": {
    id: "greek-yogurt",
    name: "Plain Greek yogurt",
    category: "Protein & dairy",
    unit: "g",
    basis: "ready",
  },
  berries: {
    id: "berries",
    name: "Frozen berries",
    category: "Produce",
    unit: "g",
    basis: "ready",
  },
  banana: {
    id: "banana",
    name: "Medium banana",
    category: "Produce",
    unit: "item",
    basis: "ready",
  },
  toast: {
    id: "toast",
    name: "Whole-grain bread slices",
    category: "Carbs",
    unit: "item",
    basis: "ready",
  },
  paprika: {
    id: "paprika",
    name: "Paprika",
    category: "Pantry",
    unit: "g",
    basis: "dry",
  },
};

const ingredient = (
  id: string,
  amount: number,
  cookedAmount?: number,
): Ingredient => ({
  ...catalog[id],
  amount,
  ...(cookedAmount === undefined ? {} : { cookedAmount }),
});
const paprika = (): Ingredient => ({
  ...ingredient("paprika", 1),
  optional: true,
});
const photo = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;
const hotStorage =
  "Cool promptly in shallow containers; refrigerate within 2 hours at 4 C or colder. Eat refrigerated leftovers within 2-3 days. For a 3-day batch, freeze the third day's cooked portions on prep day after prompt cooling; thaw in the fridge and reheat to 74 C. This is a conservative planning rule, not an expiry guarantee.";

// These are editable food-label planning assumptions, not measured nutrition or
// personalized energy targets. Values are per 100 g, except banana/bread per item.
export const prepNutritionEstimates: Readonly<
  Record<string, { per: number; calories: number; protein: number }>
> = Object.freeze({
  "chicken-breast": { per: 100, calories: 120, protein: 22.5 },
  "chicken-thigh": { per: 100, calories: 144, protein: 19 },
  "extra-lean-beef": { per: 100, calories: 137, protein: 21 },
  rice: { per: 100, calories: 365, protein: 7 },
  potatoes: { per: 100, calories: 77, protein: 2 },
  "mixed-veg": { per: 100, calories: 50, protein: 3 },
  "olive-oil": { per: 100, calories: 900, protein: 0 },
  oats: { per: 100, calories: 389, protein: 16.9 },
  "greek-yogurt": { per: 100, calories: 59, protein: 10 },
  berries: { per: 100, calories: 50, protein: 1 },
  banana: { per: 1, calories: 105, protein: 1.3 },
  toast: { per: 1, calories: 80, protein: 4 },
  paprika: { per: 100, calories: 282, protein: 14 },
});

// Each recipe describes ONE base serving, not a pot. Batch arithmetic lives in plan.ts.
export const prepRecipes: PrepRecipe[] = [
  {
    id: "prep-chicken-breast-rice",
    title: "Chicken Breast, Rice and Vegetables",
    shortTitle: "Chicken + rice",
    kind: "main",
    photo: photo("photo-1532550907401-a500c9a57435"),
    minutes: 35,
    description:
      "One pan of chicken and vegetables with a pot of rice for lunch and dinner.",
    ingredients: [
      ingredient("chicken-breast", 200, 150),
      ingredient("rice", 60, 180),
      ingredient("mixed-veg", 200),
      ingredient("olive-oil", 10),
      paprika(),
    ],
    steps: [
      "Weigh the batch's dry rice, rinse in a sieve and cook with the water and timing on its package. Let it stand covered for 5 minutes, then fluff.",
      "Heat the oven to 220 C. Put the weighed chicken breasts on one lined tray. Put the frozen vegetables on a second tray and divide the measured oil between the chicken and vegetables. Season with the optional paprika if using.",
      "Roast the chicken for about 18-25 minutes and the vegetables for 20-25 minutes, turning the vegetables once. Check the thickest part of each breast with a thermometer: it must reach 74 C; timing alone is not a safety check.",
      "Rest the chicken for 5 minutes and slice it with clean utensils. Weigh the actual cooked chicken and rice separately, then divide each in proportion to the dated serving amounts; 75% meat yield and 3x rice weight are estimates.",
      "Add the vegetables and measured oil to the lunch and dinner containers, label their dates and cool promptly. Freeze the third day's hot-food portions on prep day rather than leaving them in the fridge for the whole block.",
    ],
    storage: hotStorage,
  },
  {
    id: "prep-chicken-thigh-potato",
    title: "Skinless Chicken Thighs and Roast Potatoes",
    shortTitle: "Thighs + potatoes",
    kind: "main",
    photo: photo("photo-1532550907401-a500c9a57435"),
    minutes: 45,
    description:
      "Boneless skinless thighs, potato wedges and the same frozen vegetables.",
    ingredients: [
      ingredient("chicken-thigh", 200, 150),
      ingredient("potatoes", 300),
      ingredient("mixed-veg", 200),
      ingredient("olive-oil", 10),
      paprika(),
    ],
    steps: [
      "Heat the oven to 220 C. Scrub the weighed potatoes and cut them into similar 2 cm wedges. Toss with half the measured oil on a lined tray; roast for 15 minutes.",
      "Place the weighed boneless skinless thighs on a separate tray. Spread the frozen vegetables alongside the potatoes and use the remaining measured oil on the thighs and vegetables. Add optional paprika if using.",
      "Roast for another 20-25 minutes, turning the potatoes and vegetables halfway through, until the potatoes are tender. Check each thigh's thickest part reaches 74 C with a food thermometer; give it longer if needed.",
      "Rest the thighs for 5 minutes. Weigh their actual cooked output before slicing; the listed cooked meat amount assumes 75% yield, which varies with trimming and cooking.",
      "Divide the cooked meat and potatoes using each dated serving's share of the batch's raw amounts, then add vegetables. Cool in shallow dated containers; freeze the third day's portions on prep day.",
    ],
    storage: hotStorage,
  },
  {
    id: "prep-chicken-breast-potato",
    title: "Chicken Breast and Potato Tray Bake",
    shortTitle: "Chicken + potatoes",
    kind: "main",
    photo: photo("photo-1532550907401-a500c9a57435"),
    minutes: 45,
    description:
      "A potato-based chicken batch using the same vegetables and measured oil.",
    ingredients: [
      ingredient("chicken-breast", 200, 150),
      ingredient("potatoes", 300),
      ingredient("mixed-veg", 200),
      ingredient("olive-oil", 10),
      paprika(),
    ],
    steps: [
      "Heat the oven to 220 C. Scrub and dice the weighed potatoes into 2 cm pieces. Coat with half the measured oil, spread on a lined tray and roast for 15 minutes.",
      "Coat the weighed chicken breasts with the remaining oil and optional paprika on a separate lined tray. Add the frozen vegetables to the potato tray and turn the potatoes.",
      "Roast both trays for another 18-25 minutes. Check every breast reaches 74 C in its thickest part with a food thermometer; remove cooked chicken while finishing any firm potatoes.",
      "Rest the chicken for 5 minutes and weigh it cooked before slicing. Portion by the dated chicken shares, using the measured cooked output instead of treating the 75% yield estimate as exact.",
      "Divide the cooked potato batch by the dated raw-potato shares, add vegetables and cool in shallow containers. Label lunches and dinners separately and freeze the third day's portions on prep day.",
    ],
    storage: hotStorage,
  },
  {
    id: "prep-beef-rice",
    title: "Extra-Lean Beef and Rice Bowls",
    shortTitle: "Beef + rice",
    kind: "main",
    photo: photo("photo-1783375175952-705a0600e05c"),
    minutes: 30,
    description:
      "A smaller beef serving with rice, vegetables and measured oil; the fourth default block.",
    ingredients: [
      ingredient("extra-lean-beef", 160, 120),
      ingredient("rice", 60, 180),
      ingredient("mixed-veg", 200),
      ingredient("olive-oil", 10),
      paprika(),
    ],
    steps: [
      "Weigh and rinse the dry rice, then cook it using the water ratio and timing on the package. Rest covered for 5 minutes and fluff.",
      "Heat half the measured oil in a wide pan over medium-high heat. Add the weighed extra-lean ground beef, break it into small crumbles and stir for about 8-10 minutes.",
      "Check several parts of the beef reach 71 C with a digital thermometer. Transfer cooked beef to a clean bowl; do not rely on brown colour alone.",
      "Add the frozen mixed vegetables and remaining measured oil to the pan. Cook according to the vegetable package, stirring until hot throughout; stir in optional paprika and combine with the beef.",
      "Weigh the actual cooked beef and rice separately and divide according to each dated serving's share. The meat's 75% yield and rice's 3x water gain are estimates. Cool promptly in shallow containers and freeze the third day's portions on prep day.",
    ],
    storage: hotStorage,
  },
  {
    id: "prep-beef-potato",
    title: "Extra-Lean Beef and Potato Skillet",
    shortTitle: "Beef + potatoes",
    kind: "main",
    photo: photo("photo-1783375175952-705a0600e05c"),
    minutes: 35,
    description:
      "An optional potato swap for the beef rice bowl, not an additional default beef block.",
    ingredients: [
      ingredient("extra-lean-beef", 160, 120),
      ingredient("potatoes", 300),
      ingredient("mixed-veg", 200),
      ingredient("olive-oil", 10),
      paprika(),
    ],
    steps: [
      "Scrub and cut the weighed potatoes into 1-2 cm cubes. Simmer in a pot of water for 8-12 minutes until tender, then drain; larger batches may take longer to return to a simmer.",
      "Heat half the measured oil in a wide pan. Add the weighed extra-lean ground beef and break it into crumbles as it cooks for about 8-10 minutes.",
      "Use a digital thermometer to check the beef reaches 71 C in several places, then move it to a clean bowl. Keep raw-meat utensils separate from cooked food.",
      "Add the remaining oil and drained potatoes to the pan. Turn for 5-8 minutes to brown the edges, then add frozen vegetables and cook for the time on their package until hot throughout. Stir in optional paprika if using.",
      "Return the beef to the pan to combine. Weigh actual cooked output and divide by the dated raw-ingredient shares, rather than assuming potatoes keep their raw weight. Cool in shallow dated containers and freeze the third day's portions on prep day.",
    ],
    storage: hotStorage,
  },
  {
    id: "prep-overnight-oats",
    title: "Greek Yogurt, Oats and Berries",
    shortTitle: "Overnight oats",
    kind: "breakfast",
    photo: photo("photo-1517673400267-0251440c45dc"),
    minutes: 5,
    description:
      "A filling yogurt and oat breakfast without required whey or extra supplements.",
    ingredients: [
      ingredient("greek-yogurt", 250),
      ingredient("oats", 60),
      ingredient("berries", 100),
    ],
    steps: [
      "Weigh rolled oats into each breakfast jar using that date's serving amounts. Divide the measured plain Greek yogurt between the jars.",
      "Stir each jar, adding a small splash of drinking water if the oats need loosening. Do not add whey unless you independently choose and account for it.",
      "Thaw the measured frozen berries in the fridge following the package instructions, including any heating direction. Add to the first two breakfasts and refrigerate at 4 C or colder.",
      "For a third breakfast, keep oats dry and berries frozen, with yogurt refrigerated separately. Assemble that serving the evening before or on its day; follow the yogurt's storage label.",
    ],
    storage:
      "Keep yogurt and assembled jars at 4 C or colder and follow package dates. Assemble the first 2 days only; keep the third day's oats dry and berries frozen until needed. Follow frozen-berry preparation directions.",
  },
  {
    id: "prep-warm-oats",
    title: "Warm Berry Oats with Greek Yogurt",
    shortTitle: "Warm berry oats",
    kind: "breakfast",
    photo: photo("photo-1517673400267-0251440c45dc"),
    minutes: 10,
    description:
      "The same groceries as overnight oats, cooked fresh from pre-weighed dry portions.",
    ingredients: [
      ingredient("greek-yogurt", 250),
      ingredient("oats", 60),
      ingredient("berries", 100),
    ],
    steps: [
      "On prep day, weigh the oats into separate dry containers for each breakfast. Keep yogurt refrigerated and the measured berries frozen, separately from the oats.",
      "On the breakfast's day, put its oats in a saucepan with the drinking water suggested on the oat package. Bring to a gentle simmer and stir for the package's cooking time.",
      "Heat the measured frozen berries in a separate small pan following their package's heating directions, then stir into the oats.",
      "Spoon into a bowl, let the oats stop steaming strongly, and add the measured Greek yogurt. Eat this freshly assembled breakfast rather than leaving the dairy at room temperature.",
    ],
    storage:
      "Keep pre-weighed oats dry, berries frozen and yogurt at 4 C or colder. Cook oats and assemble the yogurt topping on the serving day; follow dairy and frozen-berry package directions.",
  },
  {
    id: "prep-yogurt-banana-toast",
    title: "Greek Yogurt and Banana, with Training-Day Toast",
    shortTitle: "Yogurt + banana",
    kind: "snack",
    photo: photo("photo-1763576178054-ff0152753fd8"),
    minutes: 5,
    description:
      "Yogurt and a banana every day; one slice of whole-grain toast on training days only.",
    ingredients: [
      ingredient("greek-yogurt", 200),
      ingredient("banana", 1),
      ingredient("toast", 1),
    ],
    steps: [
      "Weigh the plain Greek yogurt into one covered snack container per date and refrigerate at 4 C or colder. Keep the bananas whole until their serving day.",
      "Keep bread dry in its package or frozen. Count one slice only for a date marked as training; rest-day servings contain yogurt and banana without toast.",
      "On the snack's day, peel and slice the banana over the yogurt. Toast the training-day bread just before eating; do not pack toasted bread against wet yogurt during batch preparation.",
    ],
    storage:
      "Keep yogurt at 4 C or colder and follow its package date. Store bread dry or frozen; peel the banana and toast any training-day slice on the day. This snack is not a cooked leftover to reheat.",
  },
];

export const prepRecipeMap: Readonly<Record<string, PrepRecipe>> =
  Object.freeze(
    Object.fromEntries(prepRecipes.map((recipe) => [recipe.id, recipe])),
  );

for (const recipe of prepRecipes) {
  recipe.ingredients.forEach(Object.freeze);
  Object.freeze(recipe.ingredients);
  Object.freeze(recipe.steps);
  Object.freeze(recipe);
}
Object.values(prepNutritionEstimates).forEach(Object.freeze);
Object.freeze(prepRecipes);
