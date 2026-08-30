# The Bolo Wardrobe Art Spec

Every generated garment or accessory starts from this recipe. The first
batch was generated without one, which is why it reads as eight styles
rather than one wardrobe; hold every new piece against this page before it
goes near the compositor.

## The laws (non-negotiable, enforced by the pipeline)

1. **The canonical mascot rule.** Bolo is never redrawn, retraced or
   restyled. A garment is a flat piece of cloth; an accessory is an isolated
   object. The compositor does the dressing.
2. **The sleeve rule.** Her wings redraw in FRONT of the cloth, so a sleeve
   has nothing to wrap. Drapes, tunics, wraps, vests, skirts: yes. Sleeved
   outerwear (jackets, hoodies, coats with arms): never, no matter the art.
   A Western set was generated once and rejected; do not regenerate it.
3. **Eye clearance.** Nothing on her head may clip an eye. The generator
   lifts hats until clear, so art that only works pulled low will drift high.

## The look

- **Style:** modern FLAT VECTOR with soft gradients, rounded shapes, a
  thick soft outline and gentle shadows, matching the mascot reference
  sheet (`artifacts/bolo-mobile/assets/images/mascot/README.md`). NOT
  painterly, NOT 3D-rendered, NOT photoreal. If it would look wrong pasted
  into a children's picture book alongside her, it is wrong here.
- **Light:** a single soft top-left key, at her cel-shading depth. No
  specular highlights, no drop shadows baked into the art.
- **Palette:** rich Indian textile colour is welcome (that is the point),
  but grounded by the app's warmth: golds, marigolds, crimsons, magentas,
  teals. One or two accent metallics at most per piece.
- **Line:** the same weight and softness as her own outline, so the piece
  and the bird share an author.

## The mechanics

- **Format:** PNG, fully transparent background, the object alone, nothing
  cropped by the canvas edge (the compositor trims and scales; a plume cut
  by the source frame stays cut forever).
- **Size:** at least 900px on the long side; 1024-square canvas preferred.
- **Garments:** front-facing flat lay, symmetric, no figure inside it, hem
  to collar complete, interior fully opaque (transparent embroidery holes
  read as holes in the cloth; the recut pass closes small ones but not
  design-sized ones).
- **Accessories:** the object upright and front-facing; anything that
  should extend past her head (a plume, a tassel) drawn COMPLETE, since the
  generator may lift the piece and whatever the source lacks becomes a
  sawn-off stump.

## Worked prompt: the pagdi, take two

> Flat vector illustration of a festive Indian pagdi (turban), front view,
> children's app sticker style: rounded simplified folds, soft gradients,
> thick soft outline, gentle cel shading, single soft top-left light. Warm
> marigold orange and deep magenta silk with one gold zari band and a small
> ruby brooch at the centre, one stylised peacock feather rising from the
> brooch, drawn complete from base to tip. Isolated object on a fully
> transparent background, nothing touching the canvas edge, 1024x1024.

Drop the result at `scripts/mascot-accessory-art/pagdi-v2.png`, add a
manifest entry (or point the pagdi's `art` at it), then:

    pnpm wardrobe gen pagdi        # review sheet into docs/garment-review/pagdi/
    pnpm wardrobe install pagdi    # poses to both clients + registries regenerated
