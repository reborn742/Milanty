// Short, varied reaction lines for game events. Previously these came from a
// live Gemini API call, but that required shipping a secret API key to the
// browser (any deployed site would leak it to anyone who opened dev tools).
// Since the lines are just short flavor text, a local, hand-written set reads
// exactly the same to a player mid-game, with no key, no network call, and
// nothing that can fail or leak.

const WIN_LINES = [
  "Nice pull, {name}!",
  "{name} takes it home!",
  "Oh, {name} was sitting on that the whole time!",
  "Clean sweep for {name}!",
  "{name} calls it — four of a kind!",
  "That's how it's done, {name}.",
  "{name} sniped that match!",
  "Smooth move, {name}.",
  "{name} wraps it up in style!",
  "Well played, {name}!",
  "{name} saw that coming a mile away.",
  "Big brain play from {name}.",
];

const PASS_LINES = [
  "{name} keeps it moving.",
  "{name} shuffles one along.",
  "Passing the buck, {name}?",
  "{name} lets that one go.",
  "Keeping us on our toes, {name}.",
  "{name} plays it cool.",
];

const PICK_LINES = [
  "{name} sizes up the new hand.",
  "{name} is thinking it over.",
  "Interesting pickup for {name}.",
  "{name} weighs the options.",
];

const LOSE_LINES = [
  "Oof, tough luck, {name}.",
  "So close, {name}!",
  "{name} just missed it.",
  "Not this round, {name}.",
  "{name} shrugs it off.",
  "That's an interesting play, {name}.",
];

const LINES_BY_EVENT: Record<'WIN' | 'PASS' | 'PICK' | 'LOSE', string[]> = {
  WIN: WIN_LINES,
  PASS: PASS_LINES,
  PICK: PICK_LINES,
  LOSE: LOSE_LINES,
};

export const getCommentary = async (
  playerName: string,
  event: 'WIN' | 'PASS' | 'PICK' | 'LOSE'
): Promise<string> => {
  // playerName can come from another player's chosen display name in
  // multiplayer, so it's untrusted input rendered into the UI: strip
  // control/newline characters and clamp length before display.
  const safeName = (playerName || 'Player')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^\p{L}\p{N}\p{Emoji_Presentation} '._-]/gu, '')
    .trim()
    .slice(0, 24) || 'Player';

  const lines = LINES_BY_EVENT[event] || WIN_LINES;
  const line = lines[Math.floor(Math.random() * lines.length)];
  return line.replace('{name}', safeName);
};
