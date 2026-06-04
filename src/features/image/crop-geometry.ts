/**
 * crop-geometry.ts
 *
 * Pure math helpers for crop rectangle manipulation.
 * No DOM, no Obsidian API — easy to unit-test independently.
 */

export interface CropRect  { x: number; y: number; w: number; h: number; }
export interface CropBounds { w: number; h: number; }

export const CROP_MIN = 40;

/**
 * Compute a new crop rectangle after a handle drag.
 *
 * Handles anchor invariants correctly:
 *   - West/east handles keep the opposite vertical edge fixed.
 *   - North/south handles keep the opposite horizontal edge fixed.
 *   - Corner handles keep the diagonally opposite corner fixed.
 *   - Ratio correction re-anchors after clamping so the fixed edge doesn't drift.
 */
export function resizeCropRect(
	orig: CropRect,
	dx: number,
	dy: number,
	dir: string,
	ratio: number | null,
	bounds: CropBounds,
): CropRect {
	const { x: ox, y: oy, w: ow, h: oh } = orig;
	let nx = ox, ny = oy, nw = ow, nh = oh;

	const hasN = dir.includes('n');
	const hasS = dir.includes('s');
	const hasE = dir.includes('e');
	const hasW = dir.includes('w');

	// Step 1 — unconstrained resize per handle direction
	if (hasW) { nx = Math.max(0, Math.min(ox + dx, ox + ow - CROP_MIN)); nw = ow + ox - nx; }
	if (hasE) { nw = Math.max(CROP_MIN, Math.min(ow + dx, bounds.w - ox)); }
	if (hasN) { ny = Math.max(0, Math.min(oy + dy, oy + oh - CROP_MIN)); nh = oh + oy - ny; }
	if (hasS) { nh = Math.max(CROP_MIN, Math.min(oh + dy, bounds.h - oy)); }

	// Step 2 — ratio constraint with correct re-anchoring
	if (ratio !== null) {
		if (!hasE && !hasW) {
			// N or S: height drives width; anchor at left edge (nx unchanged)
			nw = nh * ratio;
			if (nx + nw > bounds.w) { nw = bounds.w - nx; nh = nw / ratio; }
		} else if (!hasN && !hasS) {
			// E or W: width drives height
			nh = nw / ratio;
			if (ny + nh > bounds.h) { nh = bounds.h - ny; nw = nh * ratio; }
			// West: right edge (ox+ow) is fixed — re-anchor nx after width change
			if (hasW) nx = (ox + ow) - nw;
		} else {
			// Corner: width drives height
			nh = nw / ratio;
			if (nx + nw > bounds.w) { nw = bounds.w - nx; nh = nw / ratio; }
			if (ny + nh > bounds.h) { nh = bounds.h - ny; nw = nh * ratio; }
			// Re-anchor the fixed edges after all clamping
			if (hasN) ny = (oy + oh) - nh;   // south edge is fixed
			if (hasW) nx = (ox + ow) - nw;   // east edge is fixed
		}
	}

	// Step 3 — final clamp (enforce MIN and image bounds)
	nx = Math.max(0, nx);
	ny = Math.max(0, ny);
	nw = Math.max(CROP_MIN, Math.min(nw, bounds.w - nx));
	nh = Math.max(CROP_MIN, Math.min(nh, bounds.h - ny));

	return { x: nx, y: ny, w: nw, h: nh };
}

/**
 * Adjust a crop rectangle to match a target aspect ratio, keeping it within
 * the image bounds. Width is used as the primary dimension.
 */
export function applyRatioCrop(
	w: number,
	_h: number,
	ratio: number,
	boundsW: number,
	boundsH: number,
): { w: number; h: number } {
	let nw = w;
	let nh = nw / ratio;
	if (nh > boundsH) { nh = boundsH; nw = nh * ratio; }
	if (nw > boundsW) { nw = boundsW; nh = nw / ratio; }
	return { w: Math.round(nw), h: Math.round(nh) };
}
