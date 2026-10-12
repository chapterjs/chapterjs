import { ranking, store } from 'chapterjs';

// One point per right answer, per server, always in order.
export const quizScores = ranking();

// How many answers were found, for the whole bot: what the presence shows.
export const answered = store<number>({ scope: 'global' });
