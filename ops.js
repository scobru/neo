// ── Operation prompts ──────────────────────
// ── Text operations ─────────────────────────
// Prompts are IDENTICAL to the fine-tune notebook (neo_finetune_v4): training and inference must match.
export const SYSTEM = "Sei un assistente di scrittura che lavora in locale. Rispondi SOLO con il risultato richiesto, senza premesse, commenti o virgolette di contorno. Usa la stessa lingua del testo dell'utente, salvo diversa richiesta. Non inventare fatti che non sono nel testo.";
const TONES = {
  professional: 'professionale e curato', casual: 'informale e colloquiale', enthusiastic: 'entusiasta e positivo',
  informative: 'informativo e neutro', creative: 'creativo e vivace',
};
const PLATFORMS = {
  linkedin: 'un post LinkedIn (tono professionale, 3-5 frasi, massimo 3 hashtag)',
  x: 'un post per X/Twitter (massimo 280 caratteri, massimo 2 hashtag)',
  instagram: 'una didascalia Instagram (tono coinvolgente, qualche emoji, 5-8 hashtag in fondo)',
  facebook: 'un post Facebook (tono amichevole, 2-4 frasi)',
};
export function buildPrompt(action, param, text) {
  const ins = {
    summary:    () => 'Riassumi il testo seguente in modo chiaro e conciso (un paragrafo breve oppure al massimo 5 punti elenco).',
    explain:    () => "Spiega il testo seguente in parole semplici, come a chi non conosce l'argomento. Chiarisci i termini difficili.",
    paraphrase: () => 'Parafrasa il testo seguente con parole diverse, mantenendo lo stesso significato e la stessa lunghezza circa.',
    improve:    () => 'Migliora il testo seguente: correggi errori e refusi e rendi lo stile più chiaro e scorrevole, senza cambiare il significato.',
    tone:       () => `Riscrivi il testo seguente con un tono ${TONES[param]}, mantenendo il significato.`,
    length:     () => param === 'shorter'
      ? 'Riscrivi il testo seguente in forma molto più breve, tenendo solo le informazioni essenziali.'
      : 'Riscrivi il testo seguente in forma più lunga e sviluppata, aggiungendo chiarezza e fluidità ma nessun fatto nuovo.',
    quote:      () => "Dal testo seguente ricava una citazione breve e memorabile (una o due frasi) che ne catturi l'idea centrale.",
    social:     () => `Crea ${PLATFORMS[param]} basato sul testo seguente.`,
    translate:  () => 'Traduci il testo seguente in inglese, mantenendo lo stile originale.', // not in the training set
  }[action]();
  return `${ins}\n\nTESTO:\n"""\n${text}\n"""`;
}
// key: [label, action, param, icon, description, max_new_tokens (same caps as the notebook)]
export const OPS = {
  riepilogo:        ['Riepilogo', 'summary', '', '✎', 'Riassumi il testo nella textarea', 220],
  spiegazione:      ['Spiegazione', 'explain', '', '○', 'Spiega in modo semplice', 320],
  parafrasi:        ['Parafrasi', 'paraphrase', '', '↻', 'Riscrivi con parole diverse', 350],
  migliora:         ['Migliora', 'improve', '', '↑', 'Correggi errori, rendi efficace', 380],
  tono_formale:     ['Tono professionale', 'tone', 'professional', '◆', 'Rendi professionale', 380],
  tono_casual:      ['Tono casual', 'tone', 'casual', '◇', 'Informale e amichevole', 380],
  tono_entusiasta:  ['Tono entusiasta', 'tone', 'enthusiastic', '★', 'Positivo ed energico', 380],
  tono_informativo: ['Tono informativo', 'tone', 'informative', 'ℹ', 'Neutro e chiaro', 380],
  tono_creativo:    ['Tono creativo', 'tone', 'creative', '✦', 'Vivace e originale', 380],
  accorcia:         ['Accorcia', 'length', 'shorter', '–', "Solo l'essenziale", 420],
  allunga:          ['Allunga', 'length', 'longer', '+', 'Più sviluppato, senza fatti nuovi', 420],
  citazione:        ['Citazione', 'quote', '', '❝', 'Ricava una citazione memorabile', 90],
  social_linkedin:  ['Post LinkedIn', 'social', 'linkedin', '💼', 'Professionale, max 3 hashtag', 200],
  social_x:         ['Post X', 'social', 'x', '𝕏', 'Max 280 caratteri', 200],
  social_instagram: ['Didascalia Instagram', 'social', 'instagram', '📷', 'Emoji e 5-8 hashtag', 200],
  social_facebook:  ['Post Facebook', 'social', 'facebook', 'f', 'Amichevole, 2-4 frasi', 200],
  traduci_en:       ['Traduzione EN', 'translate', '', '⇆', 'Traduci in inglese', 400],
};
