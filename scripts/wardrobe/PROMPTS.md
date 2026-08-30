# Wardrobe Prompt Pack

Paste-ready prompts for generating Bolo clothing assets elsewhere. The
pipeline does the dressing; these produce its raw material. Full rules in
`ART-SPEC.md`.

## How to use

1. Generate at 1024x1024 with a fully transparent background.
2. Drop the file at the path given under the item.
3. `pnpm wardrobe gen <id>` — the review sheet lands in
   `docs/garment-review/<id>/`.
4. Happy? `pnpm wardrobe install <id>`. Not happy? Regenerate or tune the
   item's `recipe` in `manifest.json` and `gen` again.

New item: add a manifest entry first (copy any existing one; `id`, `name`,
`tagline`, `kind`, `shop`, `costBand`, `preview`, `art`), then steps 1-4.

## The base style block — start EVERY prompt with this

> Flat vector illustration in a children's app sticker style: rounded
> simplified shapes, soft gradients, thick soft dark-warm outline, gentle
> cel shading with a single soft top-left light. Rich Indian textile
> colours. Isolated object on a fully transparent background, nothing
> touching the canvas edge, no drop shadow, no background, no figure, no
> mannequin, no bird. Not 3D, not painterly, not photorealistic.

## Garment add-on block (append to garment prompts)

> Front-facing flat lay of the garment alone, symmetric, complete from
> collar to hem, all interior areas fully opaque.

Remember the sleeve rule: no jackets, hoodies or sleeved coats — they can
never wrap her wings. Drapes, vests, tunics, wraps, skirts.

## Accessory add-on block (append to accessory prompts)

> The object alone, upright, front view, complete — anything that should
> extend past the wearer (a plume, a tassel) drawn in full.

---

## pagdi (v2) → `scripts/mascot-accessory-art/pagdi-v2.png`

> [base style block] A festive Indian pagdi (turban): rounded silk folds in
> warm marigold orange and deep magenta crossing each other, one gold zari
> band with a small diamond pattern, a gold rosette brooch with a ruby at
> the centre front, and one stylised peacock feather rising from the brooch,
> drawn complete from base to tip. [accessory add-on block]

## station-cap (v2, optional refresh) → `scripts/mascot-accessory-art/station-cap-v2.png`

> [base style block] An Indian railways station master's peaked cap: navy
> crown with a red band, a small round brass badge with a tiny steam engine
> embossed on the front, a short black glossy peak. [accessory add-on block]

## navratri (needs NEW source art; none exists in the repo) → `scripts/mascot-garment-art/gar-navratri-v2.png`

> [base style block] A Navratri chaniya choli as one flat garment piece: a
> short fitted bodice in deep magenta with tiny round mirrors, flowing into
> a wide flared skirt in bands of teal, magenta and marigold with mirror
> work and a gold border at the hem. [garment add-on block]

## kediyu → `scripts/mascot-garment-art/gar-kediyu-v2.png`

> [base style block] A Gujarati kediyu as one flat garment piece: a
> gathered, frilled white-and-marigold tunic with tight pleats fanning from
> the chest, mirror-work dots, and a marigold hem band. Cut WIDE, wider
> than tall. [garment add-on block]

## anarkali → `scripts/mascot-garment-art/gar-anarkali-v2.png`

> [base style block] A Diwali anarkali as one flat garment piece: a fitted
> magenta bodice flaring into a wide floor-length skirt, gold embroidery at
> the neckline and a broad gold border at the hem. All areas opaque, no
> lace holes. [garment add-on block]

## kurta → `scripts/mascot-garment-art/gar-kurta-v2.png`

> [base style block] A festive saffron cotton kurta as one flat garment
> piece, sleeveless cut: a straight tunic with a gold placket of small
> buttons and a simple band collar, straight hem. [garment add-on block]

## sherwani → `scripts/mascot-garment-art/gar-sherwani-v2.png`

> [base style block] A cream wedding sherwani as one flat garment piece,
> sleeveless cut: a long fitted coat front in cream brocade with a fine
> gold jaal pattern, a band collar, a single row of gold buttons, closed
> front, gently flared below the waist. [garment add-on block]

## saree → `scripts/mascot-garment-art/gar-saree-v2.png`

> [base style block] A Banarasi saree as one flat draped garment piece:
> crimson silk with a broad gold zari border, the pallu sweeping
> diagonally across as a single drape, all areas opaque. [garment add-on block]
