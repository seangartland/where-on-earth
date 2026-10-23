# N3 island-visibility fade

The island-visibility shader terms now receive `uIslandFade`, driven each frame by the continuous Web Mercator detail zoom calculated from camera distance, viewport height, field of view, and the latitude at the centre of the globe view. This uses the same metres-per-pixel basis as detail-inset zoom selection, without the inset loader's integer rounding or network fallback.

`uIslandFade` is exactly 1 through z7, follows the existing cubic `smoothstep` easing from z7 to z8, and is 0 at z8 and above. In the fragment shader it multiplies `legFade`, the shared factor applied to the island shelf fringe, coastal glow, coastline rim, and minimum-land-tint mix, so the complete island-visibility treatment fades together while its z6-and-below rendering remains unchanged.
