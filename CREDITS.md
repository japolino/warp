# Credits

## Dungeon art

The dungeon tiles, monsters, items and party figures (`src/frontend/sprites.gen.ts`) come from the
**Dungeon Crawl 32x32 tiles** collection, released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain).

- Source: https://opengameart.org/content/dungeon-crawl-32x32-tiles
- Maintained by Chris Hamons, drawn by many artists of the *Dungeon Crawl Stone Soup* and
  RLTiles projects (http://rltiles.sourceforge.net).

No attribution is required by the license; it's given here with thanks.
To rebuild the embedded set: `bun scripts/build-sprites.ts "<path to 'Dungeon Crawl Stone Soup Full'>"`.


## Minigame music

The rhythm games' songs are compositions in the public domain, arranged for Warp and played by its own
synthesizer from note data (`src/frontend/arcade/songs.ts`). No recordings are shipped:

- *Twinkle, Twinkle, Little Star* and *Greensleeves* (traditional)
- *Ode to Joy* and *Für Elise* (Ludwig van Beethoven)
- *Canon in D* (Johann Pachelbel)
- *In the Hall of the Mountain King* (Edvard Grieg)
- *The Entertainer* (Scott Joplin)
- *Galop Infernal* (Jacques Offenbach)
- *Rondo alla Turca* (Wolfgang Amadeus Mozart)
- *William Tell Overture* (Gioachino Rossini)
- *Flight of the Bumblebee* (Nikolai Rimsky-Korsakov)
- *Korobeiniki* (Russian folk song), which plays under Stack

Songs you import from osu! beatmaps stay in your own browser; Warp never uploads or redistributes them.
