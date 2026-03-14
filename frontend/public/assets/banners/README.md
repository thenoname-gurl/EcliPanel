This folder holds server banner images that are displayed on the Server cards in the dashboard.

Naming convention:
- Use lower-case slugs, e.g. `minecraft.png`, `hytale.png`, `rust.png`, `csgo.png`, `valheim.png`, `ark.png`, `terraria.png`, `lavalink.png`, `unturned.png`.
- File format: PNG or WebP is preferred. We include a `default.svg` placeholder used as fallback when an explicit banner is missing.

Notes:
- The UI will request `/assets/banners/<slug>.png`. If you wish to use WebP files, you can convert and replace the `.png` versions and set up caching/brotli on the server.
- I did not download banners from the web automatically. If you want, provide a list of image URLs or permission to fetch them and I'll add them to this folder and convert to WebP.
