// The free edition's asset set: everything the engine needs, generated from code in this folder.
// Same interface as OriginalAssets, so the engine cannot tell the difference.

import { Bitmap, Palette, cp437, pack } from "./raster.js";
import { buildFont } from "./font.js";
import { IDX, basePalette, carTexture, startLights } from "./sprites.js";
import { buildTrack, TRACKS } from "./tracks.js";
import { buildTitle } from "./title.js";

// Fictional drivers for the default hiscore tables (time = (laps div 3) * multiplier seconds)
const DRIVERS = [
  ["TURBO-TORE", 21.0],
  ["DRIFT-DAGNY", 21.5],
  ["KOBOLT-KALLE", 22.0],
  ["SLIRA SVENSSON", 22.5],
  ["GRUS-GUNILLA", 23.0],
  ["BROMS-BERTIL", 23.5],
  ["LAKRITS-LASSE", 24.0],
  ["ÅSA ÅKARE", 25.0],
  ["ÖRJAN ÖVERSTYR", 26.0],
  ["PELLE PANIK", 27.5],
];

const SCROLLER = [
  '%"255"240 %"246"RACING %"255"FREE EDITION    %"248"PRESS SPACE TO RACE!    %"250"F1 FOR HELP    ' +
    '%"251"F2 FOR OPTIONS    %"242"H FOR HISCORES    %"249"+/- TOGGLES SOUND    ',
  '%"255"NEW TRACKS, CARS, FONT AND PICTURES    %"252"AN UNOFFICIAL TRIBUTE TO 240 RACING (1998) ' +
    'BY ALEXANDER SANDSTRÖM, MIKAEL SJÖBERG AND LARS ANDERSSON    ' +
    '%"246"LOAD YOUR OWN COPY OF THE ORIGINAL TO PLAY IT AS IT WAS    ',
];

const TRACK_NAMES = ["SJÖKANTEN RACEWAY", "VINTERRINGEN", "HAMNBANAN"];

export class FreeAssets {
  constructor() {
    this.id = "free";
    this.storageKey = "240racing.free.fs.";
    this.hiscoreSeed = {};
    const gfx = new Bitmap(320, 200, 0);
    startLights(gfx);
    this.files = {
      "240BURN.BIN": buildTitle(),
      "GFX.BIN": pack(gfx, new Palette()),
    };
    this.tracks = TRACKS.map(buildTrack);
    this.tracks.forEach((t, i) => (this.files[`BANA${i + 1}.LEV`] = t.data));
    this.fontData = buildFont();
    this.textures = [null, carTexture(IDX.RED), carTexture(IDX.YELLOW)];
  }

  file(name) {
    return this.files[name];
  }

  get font() {
    return { data: this.fontData.data.slice(), table: this.fontData.table.slice() };
  }

  carTexture(car) {
    return this.textures[car];
  }

  get scrollerTexts() {
    return SCROLLER.map(cp437);
  }

  get hiscoreDefaults() {
    return DRIVERS.map(([name, mult]) => ({ name: cp437(name), mult }));
  }

  get trackLines() {
    return TRACK_NAMES.map((n) => cp437("TRACK      : " + n));
  }
}

export { basePalette };
