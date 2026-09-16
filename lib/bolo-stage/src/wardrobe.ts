/**
 * STAND-IN WARDROBE: placeholder pieces built from primitives, so the socket
 * system can be seen working before any garment is commissioned.
 *
 * The brief leaves the wardrobe out on purpose ("Attachment points only; the
 * garments are a separate commission"), and real garments are regional work
 * that goes through each fork. These are deliberately generic, and they are
 * MEASURED FROM THE BIRD THEY ARE PUT ON rather than sized by hand, so they fit
 * the duck today and Bolo tomorrow without new numbers.
 *
 * A piece is authored one of two ways:
 *   - in its socket's space (the cap sits on attach_head), or
 *   - in model space, tied to a joint (the neckerchief goes AROUND the neck,
 *     which no single socket point can describe, and turns with the Neck).
 */

import * as THREE from 'three';
import type { JointSlot, Socket } from '@workspace/bolo-character';
import type { LoadedModel, SocketRig } from './model';

export type WardrobeContext = { model: LoadedModel; socket: SocketRig | undefined };
export type WardrobePiece = {
  object: THREE.Object3D;
  /** When set, `object` is in model space and rides this joint. */
  joint?: JointSlot;
};

export type WardrobeItem = {
  id: string;
  label: string;
  socket: Socket;
  build: (context: WardrobeContext) => WardrobePiece | null;
};

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function buildCap({ socket }: WardrobeContext): WardrobePiece | null {
  if (!socket) return null;
  const width = socket.regionSize.x || 0.5;
  const radius = width * 0.36;
  const height = radius * 0.95;
  const band = canvasTexture(1024, 256, (ctx) => {
    ctx.fillStyle = '#25406B';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#F0B43C';
    for (let x = 0; x < 1024; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 150);
      ctx.lineTo(x + 32, 90);
      ctx.lineTo(x + 64, 150);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#F7F1E3';
    for (let x = 32; x < 1024; x += 64) {
      ctx.beginPath();
      ctx.arc(x, 196, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(0, 40, 1024, 10);
    ctx.fillRect(0, 226, 1024, 10);
  });
  const top = new THREE.MeshStandardMaterial({ color: '#25406B', roughness: 0.85 });
  const side = new THREE.MeshStandardMaterial({ map: band, roughness: 0.85 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.92, radius, height, 48, 1, false), [side, top, top]);
  cap.name = 'standin-cap';
  // Seated, not balanced: sunk a little under a third into the crown.
  cap.position.y = height * 0.5 - height * 0.3;
  return { object: cap };
}

/** A wax-print cotton: green rings on orange. Tileable. */
function printTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#E3722C';
    ctx.fillRect(0, 0, 256, 256);
    for (const [x, y] of [
      [64, 64],
      [192, 192],
    ]) {
      ctx.fillStyle = '#1E7B4F';
      ctx.beginPath();
      ctx.arc(x, y, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1B1B1B';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.fillStyle = '#F7F1E3';
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

/**
 * A neckerchief: a rolled band that follows the measured outline of the neck,
 * a knot at the front, and the triangle hanging from the knot over the chest.
 */
function buildNeckerchief({ model }: WardrobeContext): WardrobePiece | null {
  const ring = model.neckRing;
  if (!ring) return null;
  const group = new THREE.Group();
  group.name = 'standin-neckerchief';
  const tube = ring.radius * 0.24;

  // Push each outline point out by the band's thickness, so the band rests ON
  // the neck instead of inside it.
  const path = ring.points.map((p) => {
    const out = new THREE.Vector3().subVectors(p, ring.center);
    out.addScaledVector(ring.axis, -out.dot(ring.axis));
    return p.clone().addScaledVector(out.normalize(), tube * 0.85);
  });
  const cloth = new THREE.MeshStandardMaterial({ map: printTexture(10, 1), roughness: 0.9 });
  const band = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path, true), 128, tube, 12, true), cloth);
  group.add(band);

  // The front of the neck is the outline point furthest along +z.
  const front = path.reduce((best, p) => (p.z > best.z ? p : best), path[0]);
  const forward = new THREE.Vector3(0, 0, 1);

  const knot = new THREE.Mesh(new THREE.SphereGeometry(tube * 1.7, 20, 14), new THREE.MeshStandardMaterial({ map: printTexture(2, 2), roughness: 0.9 }));
  knot.scale.set(1.25, 0.85, 0.8);
  knot.position.copy(front).addScaledVector(forward, tube * 0.9);
  group.add(knot);

  // The triangle, hanging from the knot and lying ON the chest. At the base of
  // a neck the chest bulges further forward than the knot, so a triangle that
  // hangs straight down goes inside the body (it did, on the first try). Tilt
  // it forward exactly enough for its plane to clear the front of the chest,
  // which the body socket has already measured.
  const width = ring.radius * 2.7;
  const drop = width * 0.85;
  const top = knot.position.clone();
  const chest = model.sockets.get('attach_body')?.anchor;
  let tilt = 0.32;
  if (chest && top.y > chest.y) {
    const clearance = tube * 1.6;
    tilt = Math.atan2(chest.z + clearance - top.z, top.y - chest.y);
  }
  tilt = Math.min(1.2, Math.max(0.15, tilt));
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.quadraticCurveTo(0, -drop * 0.08, width / 2, 0);
  shape.lineTo(0, -drop);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 12);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    uv.setXY(i, (x + width / 2) / width, (y + drop) / drop);
    // A gentle curve across the chest, so it drapes rather than sits flat.
    position.setZ(i, -Math.pow(x / (width / 2), 2) * width * 0.12);
  }
  geometry.computeVertexNormals();
  const kerchief = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: printTexture(2, 2), roughness: 0.9, side: THREE.DoubleSide }));
  kerchief.position.copy(top);
  kerchief.rotation.x = -tilt;
  group.add(kerchief);

  return { object: group, joint: 'Neck' };
}

// ---- stand-ins for the catalogue's own headwear -----------------------------
//
// Africa's shop sells three pieces, all headwear (the manifest retired flat
// garments until the 3D bird exists): the Marigold pagdi, the Harbour master's
// cap and the Pink Knit Beanie. Each gets a placeholder shape here so the 3D
// try-on works with the real catalogue today. They are the right KIND of hat,
// not the delivered art, and they go the day real 3D pieces are made.

const standard = (color: string, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });

function buildPagdi({ socket }: WardrobeContext): WardrobePiece | null {
  if (!socket) return null;
  const radius = (socket.regionSize.x || 0.5) * 0.4;
  const tube = radius * 0.24;
  const group = new THREE.Group();
  group.name = 'standin-pagdi';
  // Four wraps, each a little narrower, stacked up the crown.
  const wraps = ['#F2A007', '#E88A00', '#F2A007', '#E88A00'];
  wraps.forEach((color, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * (1 - i * 0.12), tube, 12, 40), standard(color));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = tube * 0.2 + i * tube * 1.3;
    // A pagdi is tied higher at the front.
    ring.rotation.y = 0;
    ring.rotation.z = 0;
    ring.position.z = -i * tube * 0.25;
    group.add(ring);
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.72, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), standard('#E88A00'));
  dome.position.y = tube * 3.4;
  group.add(dome);
  // The plume and its jewel, at the front.
  const jewel = new THREE.Mesh(new THREE.SphereGeometry(tube * 0.7, 16, 12), standard('#C0392B', 0.35));
  jewel.position.set(0, tube * 2.4, radius * 0.95);
  group.add(jewel);
  const plume = new THREE.Mesh(new THREE.ConeGeometry(tube * 0.55, radius * 1.1, 10), standard('#1BB7B1'));
  plume.position.set(0, tube * 2.4 + radius * 0.6, radius * 0.85);
  plume.rotation.x = -0.35;
  group.add(plume);
  return { object: group };
}

function buildHarbourCap({ socket }: WardrobeContext): WardrobePiece | null {
  if (!socket) return null;
  const radius = (socket.regionSize.x || 0.5) * 0.4;
  const height = radius * 0.62;
  const group = new THREE.Group();
  group.name = 'standin-harbour-cap';
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.12, radius * 0.96, height, 40), [
    standard('#1F2A44'),
    standard('#F4F1EA'),
    standard('#1F2A44'),
  ]);
  crown.position.y = height * 0.5 - height * 0.25;
  group.add(crown);
  const band = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.98, radius * 0.05, 8, 40), standard('#D4A017', 0.4));
  band.rotation.x = Math.PI / 2;
  band.position.y = height * 0.02;
  group.add(band);
  // The peak: half a flat disc, out over the beak and tipped down.
  const peak = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.95, radius * 0.95, radius * 0.06, 32, 1, false, -Math.PI / 2, Math.PI), standard('#111111', 0.35));
  peak.position.set(0, -height * 0.18, radius * 0.25);
  peak.rotation.x = 0.28;
  group.add(peak);
  const badge = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.11, 12, 8), standard('#D4A017', 0.3));
  badge.scale.set(1, 1, 0.4);
  badge.position.set(0, height * 0.28, radius * 1.03);
  group.add(badge);
  return { object: group };
}

function buildBeanie({ socket }: WardrobeContext): WardrobePiece | null {
  if (!socket) return null;
  const radius = (socket.regionSize.x || 0.5) * 0.42;
  const knit = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#F06AA6';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < 256; x += 16) ctx.fillRect(x, 0, 6, 256);
  });
  knit.wrapS = THREE.RepeatWrapping;
  knit.repeat.set(4, 1);
  const group = new THREE.Group();
  group.name = 'standin-beanie';
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: knit, roughness: 0.95 }));
  dome.scale.set(1, 1.15, 1);
  dome.position.y = -radius * 0.2;
  group.add(dome);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.98, radius * 0.14, 10, 40), standard('#E0508F', 0.95));
  cuff.rotation.x = Math.PI / 2;
  cuff.position.y = -radius * 0.18;
  group.add(cuff);
  const pompom = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.28, 16, 12), standard('#F7C1D9', 1));
  pompom.position.y = radius * 1.0;
  group.add(pompom);
  return { object: group };
}

export const STANDIN_WARDROBE: readonly WardrobeItem[] = [
  { id: 'standin-cap', label: 'Stand-in cap', socket: 'attach_head', build: buildCap },
  { id: 'standin-bandana', label: 'Stand-in neckerchief', socket: 'attach_body', build: buildNeckerchief },
  { id: 'standin-pagdi', label: 'Stand-in pagdi', socket: 'attach_head', build: buildPagdi },
  { id: 'standin-harbour-cap', label: "Stand-in harbour master's cap", socket: 'attach_head', build: buildHarbourCap },
  { id: 'standin-beanie', label: 'Stand-in beanie', socket: 'attach_head', build: buildBeanie },
];

export const wardrobeItem = (id: string) => STANDIN_WARDROBE.find((item) => item.id === id);
