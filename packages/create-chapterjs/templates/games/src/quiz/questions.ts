// The questions of the quiz: what is asked (a key of the language files),
// what counts as the answer, and the answer shown when nobody found it.
export const QUESTIONS = [
  { text: 'questionCapital', answer: /^paris$/i, shown: 'Paris' },
  { text: 'questionPlanets', answer: /^(8|eight|huit)$/i, shown: '8' },
  { text: 'questionLargest', answer: /^jupiter$/i, shown: 'Jupiter' },
  { text: 'questionMoon', answer: /^1969$/, shown: '1969' },
  { text: 'questionWater', answer: /^h2o$/i, shown: 'H2O' },
] as const;
