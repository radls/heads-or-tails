# Assets and provenance

Everything shipped in this app is either public domain or original work made for this project. Nothing from a foreign coin is used.

## Coin faces (`public/coins/*.webp`)

Grayscale relief maps made by `tools/build_textures.py` from the photos below (crop to the coin, grayscale, remove low-frequency toning, normalize). The app derives normal maps from them at runtime. The source photos are not committed; `assets-src/mint/sources.json` lists each URL so the script can be re-run.

| Face | Source (Wikimedia Commons) | Design | License on Commons |
|---|---|---|---|
| penny_obv | File:2005-Penny-Uncirculated-Obverse.png (U.S. Mint) | Victor D. Brenner, 1909 | Public domain (U.S. Government work) |
| penny_rev | File:2005 Penny Rev Unc D.png (U.S. Mint) | Lincoln Memorial, Frank Gasparro (Mint engraver), 1959 | Public domain (U.S. Government work) |
| nickel_obv, nickel_rev | File:NNC-US-1938-5C-Jefferson Nickel.jpg (Smithsonian National Numismatic Collection, photo by Jaclyn Nash), left and right halves | Felix Schlag, 1938 | Public domain |
| dime_obv, dime_rev | File:Dime Obverse 13.png, File:Dime Reverse 13.png (U.S. Mint press images) | John R. Sinnock (Mint chief engraver), 1946 | Public domain (U.S. Government work) |
| quarter_obv, quarter_rev | File:1932 Washington quarter obverse.jpg / reverse.jpg (Numismatic Guaranty Corporation photo) | John Flanagan, 1932 | Public domain (marked on Commons) |
| half_obv, half_rev | File:US 50 Cent Obv.png, File:US 50 Cent Rev.png (U.S. Mint press images) | Gilroy Roberts and Frank Gasparro (Mint engravers), 1964 | Public domain (U.S. Government work) |
| dollar_rev | File:2003 Sacagawea Rev.png (U.S. Mint Historical Image Library) | Thomas D. Rogers (Mint engraver), 2000 | Public domain (U.S. Government work) |
| dollar_obv | Original, rendered by `tools/build_textures.py` | Text only: LIBERTY, IN GOD WE TRUST, 2000 | Original work |
| house_obv, house_rev | Original, rendered by `tools/build_textures.py` | "Heads or Tails" house coin | Original work |

### Why the Sacagawea dollar has a text-only heads side

The Sacagawea portrait (Glenna Goodacre, 2000) was made by an outside artist under contract, and the U.S. Mint may hold its copyright (31 U.S.C. 5134). Wikimedia Commons hosts no public-domain copy of it. Until that is cleared, v1 shows only the coin's generic legends on the heads side. The tails side (Rogers' eagle) is public domain.

## Fonts

DejaVu Serif Bold (Bitstream Vera license, free to use and embed) is used only at build time to rasterize the legends on the original faces. No font files ship with the app.

## Sounds

All sounds are synthesized at runtime with WebAudio. No audio files ship.

## Icons

The favicon is an original inline SVG.

## Old iOS app assets (copied from Richard's Mac, NOT shipped)

On 2026-11-24 the coin textures (120 faces and 120 bump maps, 350x350), 4 sounds (coin_flip.wav, coin_landing.wav, heads.m4a, tails.m4a, plus coin_spinning.wav) and icons were copied from iCloud Drive `XCode/iOS9/HeadsTails` and `XCode/iOS9/TEST/HeadsTails` to the build box for review. CERT folders and key, cert, .p12, .pem and .mobileprovision files were excluded.

None of them ship in v1:
- **Coin textures:** these are photographs of real coins, mostly foreign. The photographer is unknown, so they are not clearly Richard's own work. Foreign coins are out of scope.
- **Sounds:** their origin is not recorded (8-bit WAV and M4A files with 1998 and 2003 encoder dates). They are replaced by synthesized sounds.
- **Icon:** this is a photo of a 1909 Indian Head half eagle on wood. The design is public domain, but who took the photo is unknown.

They stay on the box at `/workspace/hot-assets/` if Richard confirms any of them are his own work.
