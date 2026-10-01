// Every minigame, by id.

import type { GameId } from "../../../engine/game-ids.js";
import type { GameDef } from "../kit.js";
import { AIM } from "./aim.js";
import { BLACKJACK } from "./blackjack.js";
import { MINES } from "./mines.js";
import { PINBALL } from "./pinball.js";
import { RACE } from "./race.js";
import { ROULETTE } from "./roulette.js";
import { SLOTS } from "./slots.js";
import { SNAKE } from "./snake.js";
import { STACK } from "./stack.js";
import { TILES } from "./tiles.js";

export const GAME_DEFS: Record<GameId, GameDef> = {
  aim: AIM, tiles: TILES, mines: MINES, stack: STACK, snake: SNAKE, race: RACE, pinball: PINBALL,
  blackjack: BLACKJACK, roulette: ROULETTE, slots: SLOTS,
};
