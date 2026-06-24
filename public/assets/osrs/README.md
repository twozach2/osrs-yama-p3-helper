# Local OSRS Asset Pack Folder

Put locally converted OSRS models, sprites, and fonts here.

Do not commit Jagex-owned models, textures, sprites, fonts, cache dumps, or the real
`manifest.json`. The app loads `public/assets/osrs/manifest.json` when it exists and
otherwise uses the built-in primitive fallback art.

Use `manifest.example.json` as the template.

Expected local layout:

```text
public/assets/osrs/
  manifest.json
  player.glb
  yama.glb
  meteor.glb
  void-flare.glb
  fonts/
    RuneScape-UF.woff2
    RuneScape-Plain-12.woff2
  sprites/
    orb-hp.png
    orb-prayer.png
    orb-run.png
    hitsplat-damage.png
    hitsplat-miss.png
    hitsplat-poison.png
    hitsplat-burn.png
```
