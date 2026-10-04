// Thai text normalization + similarity + fingerprint (shared server-side)

export function normalizeThai(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200b-\u200f\u2028\u2029\uFEFF]/g, "")
    .replace(/[.,!?;:"'`~@#$%^&*+=|\\/<>()[\]{}_-]|ๆ/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  return s.split(" ").filter(Boolean);
}

function bigrams(s) {
  const res = [];
  for (let i = 0; i < s.length - 1; i++) res.push(s.slice(i, i + 2));
  return res;
}

// score 0-1: max of token-jaccard and bigram-dice (works well for Thai without word segmentation)
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  const jac = union > 0 ? inter / union : 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (!ga.length || !gb.length) return jac;
  const counts = {};
  for (const g of gb) counts[g] = (counts[g] || 0) + 1;
  let hits = 0;
  for (const g of ga) {
    if (counts[g] > 0) {
      hits++;
      counts[g]--;
    }
  }
  const dice = (2 * hits) / (ga.length + gb.length);
  return Math.max(jac, dice);
}

// fnv-1a hash -> hex fingerprint of question + choices
export function fingerprintQuestion(question, choices) {
  const normalizedChoices = (Array.isArray(choices) ? choices : [])
    .map((c) => normalizeThai(c))
    .filter(Boolean);
  const base = normalizeThai(question) + "||" + normalizedChoices.join("|");
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}