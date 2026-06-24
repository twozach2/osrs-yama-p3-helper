# Bundled fonts

## 04B_03.ttf

A 5-pixel-tall bitmap font designed by **Yuji Oshimoto** (04.jp.org). Distributed
as freeware; the author's published terms permit use in any project, commercial
or non-commercial, without attribution or royalty. The font was retrieved from
the publicly mirrored ZIP at `dl.dafont.com/dl/?f=04b_03` (the same archive
linked from dafont and across the indie game / pixel-art community).

The bundled file is the unmodified TTF from that distribution (originally named
`04B_03__.TTF`, renamed here to `04B_03.ttf` for a cleaner asset path).

This font is the **default** UI typeface for the practice tool. It is the
closest open-license font to OSRS's proprietary Quill / Plain bitmap fonts that
this repo can ship without redistributing Jagex IP.

## Overriding with a closer-to-OSRS font (optional)

The asset-pack pipeline (`src/assetPack.js` + `public/assets/osrs/manifest.json`)
already supports a `fonts.ui` entry. To swap 04B_03 out for a font you hold a
local copy of (e.g. a fan-made `runescape_uf.ttf`), drop the file into your
gitignored `public/assets/osrs/fonts/` directory and add it to your local
manifest:

```jsonc
{
  "fonts": {
    "ui": {
      "path": "/assets/osrs/fonts/runescape_uf.ttf",
      "family": "OSRS UI",
      "role": "ui"
    }
  }
}
```

At runtime the loader will prepend `"OSRS UI"` to the `--ui-font` chain, so
your override is used first and 04B_03 stays as the fallback. The bundled
04B_03 in this repo always remains as the public-distribution default.

Do **not** commit Jagex-owned font binaries or community fan-fonts whose
license is unclear; `public/assets/osrs/` is gitignored for exactly that
reason.
