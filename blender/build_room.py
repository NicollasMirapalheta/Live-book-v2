"""npm run blender:build (1/4) — builds the room shell and fixed furniture into blender/out/room.blend.

Everything is measured from config/room.json. Object names are stable (the app and the bake use them).
Collections:
  room      static geometry (baked)
  dynamic   objects that stay out of the bake (glass, flames)
  lights    Cycles lights (not exported)
  cameras   cam_N* reference cameras (not exported)
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bmesh  # type: ignore  # noqa: E402
import bpy  # type: ignore  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # type: ignore  # noqa: E402

from common import (  # noqa: E402
    Paths, collection, hex_to_linear, kelvin_to_rgb, load_room, log, log_environment,
    reset_scene, save_room, script_args, sun_rotation_blender, sun_travel_three,
)
from geo import (  # noqa: E402
    MeshBuilder, b, bevel, flat_material, join, lathe, pbr_material, place, rng,
    set_texture_dir, weighted_normals,
)

args = script_args()
paths = Paths(args.root)
cfg = load_room(paths)
set_texture_dir(paths.out / "textures")

reset_scene()
log_environment()
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"

R = cfg["room"]
W, D, H, T = R["width"], R["depth"], R["height"], R["wallThickness"]
XL, XR = cfg["walls"]["left"]["x"], cfg["walls"]["right"]["x"]
ZB, ZF = cfg["walls"]["back"]["z"], cfg["walls"]["front"]["z"]
WS = cfg["wainscot"]

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

M = {
    "floor": pbr_material("floor", "floor", normal_strength=0.6, vertex_color=True),
    "stone": pbr_material("stone", "stone", normal_strength=1.2, metallic=0.0),
    "wainscot": pbr_material("wainscot", "wainscot", normal_strength=0.5, metallic=0.0),
    "door": pbr_material("door", "wainscot", normal_strength=0.5, metallic=0.0),
    "desk": pbr_material("desk", "desk", normal_strength=0.5, metallic=0.0),
    "beam": pbr_material("beam", "beam", normal_strength=1.0, metallic=0.0),
    "plaster": pbr_material("plaster", "plaster", normal_strength=0.8, metallic=0.0),
    "rug": pbr_material("rug", "rug", normal_strength=0.8, metallic=0.0),
    "fringe": pbr_material("fringe", "linen", normal_strength=0.6, metallic=0.0),
    "window_paint": flat_material("window_paint", "#D3C6AA", roughness=0.42, normal_prefix="wainscot", normal_strength=0.15),
    "brass": pbr_material("brass", "brass", normal_strength=0.4),
    "subfloor": flat_material("subfloor", "#2A1A12", roughness=0.9),
    "glass": flat_material("glass", "#F2EEE6", roughness=0.04, transmission=1.0, normal_prefix="plaster", normal_strength=0.05),
}

# ---------------------------------------------------------------------------
# Shell: wall bodies (stone), with openings for windows and the door
# ---------------------------------------------------------------------------

def wall_segments(u0, u1, openings):
    """Splits [u0, u1] into intervals; each interval lists the openings (y0, y1) above it."""
    cuts = sorted({u0, u1, *[o[0] for o in openings], *[o[1] for o in openings]})
    out = []
    for a, c in zip(cuts, cuts[1:]):
        mid = (a + c) / 2
        holes = [(o[2], o[3]) for o in openings if o[0] <= mid <= o[1]]
        out.append((a, c, holes))
    return out


def build_wall_body(name, axis, plane, outward, u0, u1, openings, y0=-0.05, y1=H + 0.05):
    """Solid wall pieces with thickness T growing outward. The inner face is omitted (the stone skin covers it)."""
    mb = MeshBuilder(name)
    inner_skip = {("z", -1): "+z", ("z", 1): "-z", ("x", -1): "+x", ("x", 1): "-x"}[(axis, outward)]
    outer_skip = {"+z": "-z", "-z": "+z", "+x": "-x", "-x": "+x"}[inner_skip]
    # the front wall's outer face is seen from the vestibule; the others never are
    skips = (inner_skip,) if name == "wall_front" else (inner_skip, outer_skip)
    for a, c, holes in wall_segments(u0, u1, openings):
        spans = []
        cursor = y0
        for h0, h1 in sorted(holes):
            if h0 > cursor:
                spans.append((cursor, h0))
            cursor = max(cursor, h1)
        if cursor < y1:
            spans.append((cursor, y1))
        for s0, s1 in spans:
            if axis == "z":
                z0, z1 = (plane, plane + outward * T) if outward > 0 else (plane + outward * T, plane)
                mn, mx = (a, s0, z0), (c, s1, z1)
            else:
                x0, x1 = (plane, plane + outward * T) if outward > 0 else (plane + outward * T, plane)
                mn, mx = (x0, s0, a), (x1, s1, c)
            # reveal faces of openings keep the stone texture; the inner face is the skin
            mb.box(mn, mx, tile=2.0, grain="x" if axis == "z" else "z", material="stone", skip=skips)
    return mb.finish("room", M)


def displacement_sampler():
    img = bpy.data.images.load(str(paths.out / "textures" / "stone_disp.jpg"), check_existing=True)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    gray = px.reshape(h, w, 4)[:, :, 0]

    def sample(u, v):
        x = (u % 1.0) * (w - 1)
        y = (v % 1.0) * (h - 1)
        x0, y0 = int(x), int(y)
        x1, y1 = min(x0 + 1, w - 1), min(y0 + 1, h - 1)
        fx, fy = x - x0, y - y0
        top = gray[y0, x0] * (1 - fx) + gray[y0, x1] * fx
        bot = gray[y1, x0] * (1 - fx) + gray[y1, x1] * fx
        return top * (1 - fy) + bot * fy

    return sample


DISP = displacement_sampler()
STONE_TILE = 2.0
STONE_DEPTH = 0.022  # stones protrude up to 2.2 cm; mortar stays on the wall plane
STEP = 0.025


def stone_skin(name, axis, plane, normal_sign, u0, u1, holes, v0=WS["height"] - 0.1, v1=H):
    """Displaced stone surface on the inner face of a wall. holes: [(u0, u1, y0, y1)].
    Displacement fades to zero at holes, corners and the ceiling so no gaps open."""
    nu = round((u1 - u0) / STEP)
    nv = round((v1 - v0) / STEP)
    us = np.linspace(u0, u1, nu + 1)
    vs = np.linspace(v0, v1, nv + 1)

    def inside_hole(u, v):
        return any(h[0] - 1e-6 <= u <= h[1] + 1e-6 and h[2] - 1e-6 <= v <= h[3] + 1e-6 for h in holes)

    def edge_dist(u, v):
        d = min(u - u0, u1 - u, v1 - v, v - v0 + 0.2)
        for h in holes:
            du = max(h[0] - u, 0.0, u - h[1])
            dv = max(h[2] - v, 0.0, v - h[3])
            d = min(d, math.hypot(du, dv))
        return d

    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    grid = {}
    for i, u in enumerate(us):
        for j, v in enumerate(vs):
            ramp = min(1.0, max(0.0, edge_dist(u, v) / 0.06))
            ramp = ramp * ramp * (3 - 2 * ramp)
            uu, vv = u / STONE_TILE, v / STONE_TILE
            disp = DISP(uu, vv) * STONE_DEPTH * ramp
            off = plane + normal_sign * disp
            p3 = (u, v, off) if axis == "z" else (off, v, u)
            grid[(i, j)] = (bm.verts.new(b(p3)), (uu, vv))
    for i in range(nu):
        for j in range(nv):
            cu = (us[i] + us[i + 1]) / 2
            cv = (vs[j] + vs[j + 1]) / 2
            if inside_hole(cu, cv):
                continue
            quad = [grid[(i, j)], grid[(i + 1, j)], grid[(i + 1, j + 1)], grid[(i, j + 1)]]
            f = bm.faces.new([q[0] for q in quad])
            for loop, q in zip(f.loops, quad):
                loop[uvl].uv = q[1]
    # orient toward the room
    room_dir = b((0, 0, -normal_sign) if axis == "z" else (-normal_sign, 0, 0))
    bm.normal_update()
    for f in bm.faces:
        if f.normal.dot(room_dir) > 0:
            f.normal_flip()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    if sum(f.normal.dot(room_dir) for f in bm.faces) > 0:
        for f in bm.faces:
            f.normal_flip()
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    collection("room").objects.link(obj)
    mesh.materials.append(M["stone"])
    dec = obj.modifiers.new("decimate", "DECIMATE")
    dec.ratio = 0.35
    dec.use_collapse_triangulate = True
    return obj


win_holes_back = []
for w in cfg["windows"]:
    x0 = w["centerX"] - w["width"] / 2
    x1 = w["centerX"] + w["width"] / 2
    win_holes_back.append((x0, x1, w["sillY"], w["sillY"] + w["height"]))

door = cfg["door"]
door_hw = door["openingWidth"] / 2
door_hole = (door["centerX"] - door_hw - 0.02, door["centerX"] + door_hw + 0.02, -1.0, door["openingHeight"] + 0.02)

# back wall (normal toward +Z: the room is at z > ZB) and front wall (room at z < ZF)
build_wall_body("wall_back", "z", ZB, -1, XL - T, XR + T, win_holes_back)
build_wall_body("wall_front", "z", ZF, 1, XL - T, XR + T, [door_hole])
build_wall_body("wall_left", "x", XL, -1, ZB, ZF, [])
build_wall_body("wall_right", "x", XR, 1, ZB, ZF, [])

skin_holes_front = [(door_hole[0], door_hole[1], 0.0, door_hole[3])]
stone_skin("wall_back_stone", "z", ZB, +1, XL, XR, win_holes_back)
stone_skin("wall_front_stone", "z", ZF, -1, XL, XR, skin_holes_front)
stone_skin("wall_left_stone", "x", XL, +1, ZB, ZF, [])
stone_skin("wall_right_stone", "x", XR, -1, ZB, ZF, [])
log("shell + stone skins")

# ---------------------------------------------------------------------------
# Floor: wide planks, one quad per plank with its own UV offset and tint
# ---------------------------------------------------------------------------

V = cfg["vestibule"]
FLOOR_TEX = 1.70          # wood_floor texture size in meters
PLANK_COLS = 8            # planks across the texture
PLANK_W = FLOOR_TEX / PLANK_COLS
GAP = 0.0012
r = rng(7)
mb = MeshBuilder("floor", vertex_colors=True)
fx0, fx1 = XL - T, XR + T
fz0, fz1 = ZB - T, V["zTo"] + 0.2
n_strips = math.ceil((fx1 - fx0) / PLANK_W)
for s in range(n_strips):
    x0 = fx0 + s * PLANK_W
    x1 = min(x0 + PLANK_W, fx1)
    z = fz0 - r.uniform(0, 1.8)
    while z < fz1:
        length = r.uniform(1.1, 2.4)
        za, zb = max(z, fz0), min(z + length, fz1)
        if zb - za > 0.05:
            col = r.randrange(PLANK_COLS)
            vo = r.uniform(0, 1)
            tone = r.uniform(0.86, 1.08)
            warm = r.uniform(-0.03, 0.03)
            color = (tone * (1 + warm), tone, tone * (1 - warm), 1.0)
            pts = [(x0 + GAP, 0.0, za + GAP), (x0 + GAP, 0.0, zb - GAP), (x1 - GAP, 0.0, zb - GAP), (x1 - GAP, 0.0, za + GAP)]
            u0 = col / PLANK_COLS
            u1 = u0 + (x1 - x0) / FLOOR_TEX
            uvs = [(u0, vo + za / FLOOR_TEX), (u0, vo + zb / FLOOR_TEX), (u1, vo + zb / FLOOR_TEX), (u1, vo + za / FLOOR_TEX)]
            mb.face(pts, uvs, "floor", color)
        z += length
floor = mb.finish("room", M, merge=False)
# dark subfloor visible through the joints
sub = MeshBuilder("floor_joints")
sub.face([(fx0, -0.004, fz0), (fx0, -0.004, fz1), (fx1, -0.004, fz1), (fx1, -0.004, fz0)],
         [(0, 0), (0, 1), (1, 1), (1, 0)], "subfloor")
sub.finish("room", M, merge=False)
log("floor")

# ---------------------------------------------------------------------------
# Ceiling and beams
# ---------------------------------------------------------------------------

mb = MeshBuilder("ceiling")
mb.box((XL - T, H, ZB - T), (XR + T, H + 0.15, ZF + T), tile=2.0, grain="x", material="plaster",
       skip=("+y", "-x", "+x", "-z", "+z"))  # only the underside is ever seen
mb.finish("room", M)

beams = cfg["ceiling"]["beams"]
for i, bz in enumerate(beams["zPositions"]):
    mb = MeshBuilder(f"beam_{i}")
    hw = beams["width"] / 2
    mb.box((XL - 0.02, H - beams["height"], bz - hw), (XR + 0.02, H + 0.01, bz + hw), tile=1.0, grain="x",
           material="beam", uv_offset=(i * 0.37, i * 0.21))
    obj = mb.finish("room", M)
    bevel(obj, width=0.018, segments=3, angle=50)
# knee braces (mãos-francesas) in the top corners of the back wall, as in the reference
for side in (-1, 1):
    mb = MeshBuilder(f"brace_{'left' if side < 0 else 'right'}")
    length, sec = 0.95, 0.12
    mb.box((-length / 2, -sec / 2, ZB + 0.005), (length / 2, sec / 2, ZB + 0.005 + sec), tile=1.0, grain="x", material="beam")
    brace = mb.finish("room", M)
    bevel(brace, width=0.012, segments=2, angle=50)
    brace.location = b((side * (XR - 0.33), H - 0.33, 0.0))
    brace.rotation_euler = (0.0, math.radians(side * 45), 0.0)
log("ceiling + beams + braces")

# ---------------------------------------------------------------------------
# Wainscot: baseboard, frame (stiles + rails), raised panels, top rail
# ---------------------------------------------------------------------------

def wainscot_run(mb, axis, plane, sign, u0, u1, panel_w=WS["panelWidth"]):
    """One straight run of wainscot along a wall. sign: +1 if the room is on the + side of the plane."""
    h = WS["height"]
    bb = WS["baseboardHeight"]
    rail = WS["railHeight"]

    # the face against the wall and the underside on the floor are never seen
    wall_face = ("-" if sign > 0 else "+") + axis

    def box(ua, ub, y0, y1, d0, d1, grain_u=True):
        a, c = plane + sign * d0, plane + sign * d1
        lo, hi = min(a, c), max(a, c)
        skip = (wall_face, "-y") if d0 == 0.0 else ()
        if axis == "z":
            mb.box((ua, y0, lo), (ub, y1, hi), tile=1.0, grain="x" if grain_u else "y", material="wainscot", skip=skip)
        else:
            mb.box((lo, y0, ua), (hi, y1, ub), tile=1.0, grain="z" if grain_u else "y", material="wainscot", skip=skip)

    length = u1 - u0
    n = max(1, round(length / panel_w))
    pw = length / n
    stile = 0.07
    box(u0, u1, 0.0, h, 0.0, 0.012)                        # backing board
    box(u0, u1, 0.0, bb, 0.0, 0.032)                       # baseboard
    box(u0, u1, bb - 0.012, bb, 0.0, 0.036)                # baseboard cap
    box(u0, u1, bb, bb + 0.07, 0.0, 0.026)                 # bottom rail
    box(u0, u1, h - rail - 0.07, h - rail, 0.0, 0.026)     # top frame rail
    box(u0, u1, h - rail, h, 0.0, 0.034)                   # chair rail
    box(u0, u1, h - 0.012, h + 0.004, 0.0, 0.042)          # rail cap
    for k in range(n + 1):
        uc = u0 + k * pw
        box(max(u0, uc - stile / 2), min(u1, uc + stile / 2), bb + 0.07, h - rail - 0.07, 0.0, 0.026, grain_u=False)
    for k in range(n):
        a = u0 + k * pw + stile / 2 + 0.025
        c = u0 + (k + 1) * pw - stile / 2 - 0.025
        if c - a > 0.1:
            box(a, c, bb + 0.07 + 0.025, h - rail - 0.07 - 0.025, 0.0, 0.02, grain_u=False)  # raised field


mb = MeshBuilder("wainscot_back")
wainscot_run(mb, "z", ZB, +1, XL, XR)
bevel(mb.finish("room", M), width=0.003, segments=2)
mb = MeshBuilder("wainscot_left")
wainscot_run(mb, "x", XL, +1, ZB, ZF)
bevel(mb.finish("room", M), width=0.003, segments=2)
mb = MeshBuilder("wainscot_right")
wainscot_run(mb, "x", XR, -1, ZB, ZF)
bevel(mb.finish("room", M), width=0.003, segments=2)
mb = MeshBuilder("wainscot_front")
wainscot_run(mb, "z", ZF, -1, XL, door["centerX"] - door_hw - 0.115)
wainscot_run(mb, "z", ZF, -1, door["centerX"] + door_hw + 0.115, XR)
bevel(mb.finish("room", M), width=0.003, segments=2)
log("wainscot")

# ---------------------------------------------------------------------------
# Windows: frame, mullion grid, sill, glass
# ---------------------------------------------------------------------------

for w in cfg["windows"]:
    cx, sill, ww, wh = w["centerX"], w["sillY"], w["width"], w["height"]
    depth = w["frameDepth"]
    zc = ZB - T / 2
    zf0, zf1 = zc - depth / 2, zc + depth / 2
    x0, x1 = cx - ww / 2, cx + ww / 2
    y0, y1 = sill + 0.034, sill + wh
    fw = 0.06
    mb = MeshBuilder(f"{w['id']}_frame")
    mb.box((x0, y0, zf0), (x0 + fw, y1, zf1), tile=1.0, grain="y", material="window_paint")
    mb.box((x1 - fw, y0, zf0), (x1, y1, zf1), tile=1.0, grain="y", material="window_paint")
    mb.box((x0 + fw, y0, zf0), (x1 - fw, y0 + fw + 0.02, zf1), tile=1.0, grain="x", material="window_paint")
    mb.box((x0 + fw, y1 - fw, zf0), (x1 - fw, y1, zf1), tile=1.0, grain="x", material="window_paint")
    ix0, ix1, iy0, iy1 = x0 + fw, x1 - fw, y0 + fw + 0.02, y1 - fw
    bar, bd = 0.024, 0.045
    cols, rows = w["panes"]["cols"], w["panes"]["rows"]
    transom = w["panes"].get("transomFromTop", 0.0)
    yt = iy1 - (iy1 - iy0) * transom if transom else iy1
    if transom:
        # transom bar (travessa) and the meeting stile between the two lower leaves
        mb.box((ix0, yt - 0.025, zf0 + 0.02), (ix1, yt + 0.025, zf1 - 0.02), tile=1.0, grain="x", material="window_paint")
        xm = (ix0 + ix1) / 2
        mb.box((xm - 0.025, iy0, zf0 + 0.02), (xm + 0.025, yt, zf1 - 0.02), tile=1.0, grain="y", material="window_paint")
    for k in range(1, cols):
        xm = ix0 + (ix1 - ix0) * k / cols
        if transom and k == cols // 2:
            ybot = yt  # the meeting stile already covers the lower part
        else:
            ybot = iy0
        mb.box((xm - bar / 2, ybot, zc - bd / 2), (xm + bar / 2, iy1, zc + bd / 2), tile=1.0, grain="y", material="window_paint")
    upper_rows = max(1, round(rows * transom)) if transom else 0
    lower_rows = rows - upper_rows
    for k in range(1, lower_rows):
        ym = iy0 + (yt - iy0) * k / lower_rows
        mb.box((ix0, ym - bar / 2, zc - bd / 2), (ix1, ym + bar / 2, zc + bd / 2), tile=1.0, grain="x", material="window_paint")
    for k in range(1, upper_rows):
        ym = yt + (iy1 - yt) * k / upper_rows
        mb.box((ix0, ym - bar / 2, zc - bd / 2), (ix1, ym + bar / 2, zc + bd / 2), tile=1.0, grain="x", material="window_paint")
    # inner sill (peitoril) over the reveal, protruding into the room
    mb.box((x0 - 0.08, sill + 0.004, zf1 - 0.01), (x1 + 0.08, sill + 0.034, ZB + 0.05), tile=1.0, grain="x", material="window_paint")
    frame = mb.finish("room", M)
    bevel(frame, width=0.004, segments=2)

    gb = MeshBuilder(f"{w['id']}_glass")
    gb.face([(ix0, iy0, zc), (ix1, iy0, zc), (ix1, iy1, zc), (ix0, iy1, zc)],
            [(0, 0), (1, 0), (1, 1), (0, 1)], "glass")
    glass = gb.finish("dynamic", M, merge=False)
    # Cycles: the glass must not block the sun or the sky (bake and preview)
    glass.visible_shadow = False
    glass.visible_diffuse = False
log("windows")

# ---------------------------------------------------------------------------
# Door: jamb lining, casings, two raised-panel leaves open inward, brass hardware
# ---------------------------------------------------------------------------

oh = door["openingHeight"]
mb = MeshBuilder("door_frame")
dx0, dx1 = door["centerX"] - door_hw, door["centerX"] + door_hw
lin = 0.02
mb.box((dx0 - lin, 0, ZF), (dx0, oh, ZF + T), tile=1.0, grain="y", material="door")
mb.box((dx1, 0, ZF), (dx1 + lin, oh, ZF + T), tile=1.0, grain="y", material="door")
mb.box((dx0 - lin, oh, ZF), (dx1 + lin, oh + lin, ZF + T), tile=1.0, grain="x", material="door")
cw = 0.09
for zc0, zc1 in ((ZF - 0.022, ZF), (ZF + T, ZF + T + 0.022)):
    mb.box((dx0 - lin - cw, 0, zc0), (dx0 - lin, oh + lin + cw, zc1), tile=1.0, grain="y", material="door")
    mb.box((dx1 + lin, 0, zc0), (dx1 + lin + cw, oh + lin + cw, zc1), tile=1.0, grain="y", material="door")
    mb.box((dx0 - lin - cw, oh + lin, zc0), (dx1 + lin + cw, oh + lin + cw, zc1), tile=1.0, grain="x", material="door")
bevel(mb.finish("room", M), width=0.004, segments=2)


def door_leaf(name, hinge_x, direction):
    """Leaf built closed along +X (direction=+1) or −X (−1) from its hinge, then rotated inward."""
    lw = door_hw - 0.006
    th = 0.045
    mb = MeshBuilder(name)

    def bx(a, c, y0, y1, d, grain):
        u0, u1 = sorted((direction * a, direction * c))
        mb.box((u0, y0, -d / 2), (u1, y1, d / 2), tile=1.0, grain=grain, material="door")

    y_b = 0.016  # clears the rug
    bx(0, lw, y_b, oh - 0.004, 0.026, "y")                       # core
    st, top, mid, bot = 0.12, 0.12, 0.17, 0.22
    bx(0, st, y_b, oh - 0.004, th, "y")                            # hinge stile
    bx(lw - st, lw, y_b, oh - 0.004, th, "y")                      # lock stile
    bx(st, lw - st, oh - 0.004 - top, oh - 0.004, th, "x")         # top rail
    bx(st, lw - st, y_b, y_b + bot, th, "x")                       # bottom rail
    ym = 0.95
    bx(st, lw - st, ym, ym + mid, th, "x")                         # lock rail
    for y0, y1 in ((y_b + bot, ym), (ym + mid, oh - 0.004 - top)):
        bx(st + 0.03, lw - st - 0.03, y0 + 0.03, y1 - 0.03, 0.038, "y")   # raised panel
    leaf = mb.finish("room", M)
    bevel(leaf, width=0.004, segments=2)
    # hardware on both faces near the lock stile
    parts = [leaf]
    kx = direction * (lw - 0.065)
    for side in (-1, 1):
        plate = MeshBuilder(f"{name}_plate")
        plate.box((kx - 0.022, 0.86, side * th / 2 - (0.004 if side < 0 else 0)),
                  (kx + 0.022, 1.12, side * th / 2 + (0.004 if side > 0 else 0)), tile=0.3, grain="y", material="brass")
        p = plate.finish("room", M)
        bevel(p, width=0.003, segments=2)
        parts.append(p)
        knob = lathe(f"{name}_knob", [(0.0, 0.0), (0.012, 0.0), (0.009, 0.03), (0.022, 0.05), (0.026, 0.062), (0.018, 0.075), (0.0, 0.078)],
                     segments=20, material=M["brass"])
        knob.rotation_euler = (math.radians(90 * side), 0, 0)
        knob.location = b((kx, 1.0, side * th / 2))
        parts.append(knob)
    for p in parts[1:]:
        bpy.context.view_layer.update()
        p.data.transform(p.matrix_basis)
        p.matrix_basis.identity()
    leaf = join(parts, name)
    place(leaf, (hinge_x, 0, ZF - th / 2 - 0.004), direction * door["openInwardDeg"])
    return leaf


door_leaf("door_leaf_left", dx0, +1)
door_leaf("door_leaf_right", dx1, -1)
log("door")

# ---------------------------------------------------------------------------
# Vestibule: short dark corridor behind the door
# ---------------------------------------------------------------------------

vx = V["width"] / 2
vz0, vz1, vh = ZF + T, V["zTo"], V["height"]
mb = MeshBuilder("vestibule_shell")
mb.box((-vx - 0.2, -0.05, vz0), (-vx, vh + 0.05, vz1 + 0.2), tile=2.0, grain="z", material="plaster")
mb.box((vx, -0.05, vz0), (vx + 0.2, vh + 0.05, vz1 + 0.2), tile=2.0, grain="z", material="plaster")
mb.box((-vx - 0.2, -0.05, vz1), (vx + 0.2, vh + 0.05, vz1 + 0.2), tile=2.0, grain="x", material="plaster")
mb.box((-vx - 0.2, vh, vz0), (vx + 0.2, vh + 0.15, vz1 + 0.2), tile=2.0, grain="x", material="plaster")
mb.finish("room", M)
mb = MeshBuilder("vestibule_wainscot")
wainscot_run(mb, "x", -vx, +1, vz0, vz1)
wainscot_run(mb, "x", vx, -1, vz0, vz1)
wainscot_run(mb, "z", vz1, -1, -vx, vx)
bevel(mb.finish("room", M), width=0.003, segments=2)
log("vestibule")

# ---------------------------------------------------------------------------
# Rug with gentle waves and a modeled fringe
# ---------------------------------------------------------------------------

rug = cfg["rug"]
rx, rz = rug["size"]
rcx, rcz = rug["center"][0], rug["center"][2]
thick = 0.007
nx, nz = 60, 45
bm = bmesh.new()
uvl = bm.loops.layers.uv.new("UVMap")
rr = rng(11)
phase = [rr.uniform(0, 6.28) for _ in range(4)]
verts = {}
for i in range(nx + 1):
    for j in range(nz + 1):
        u, v = i / nx, j / nz
        x = rcx - rx / 2 + u * rx
        z = rcz - rz / 2 + v * rz
        edge = min(u, 1 - u, v, 1 - v)
        wave = 0.0015 * math.sin(x * 2.3 + phase[0]) * math.sin(z * 3.1 + phase[1]) + 0.001 * math.sin(x * 5.7 + z * 4.1 + phase[2])
        y = thick + wave * min(1.0, edge * 12) + 0.0008
        verts[(i, j)] = (bm.verts.new(b((x, y, z))), (u, 1 - v))
for i in range(nx):
    for j in range(nz):
        q = [verts[(i, j)], verts[(i, j + 1)], verts[(i + 1, j + 1)], verts[(i + 1, j)]]
        f = bm.faces.new([a[0] for a in q])
        for loop, a in zip(f.loops, q):
            loop[uvl].uv = a[1]
# side band down to the floor
border = [verts[(i, 0)] for i in range(nx + 1)] + [verts[(nx, j)] for j in range(1, nz + 1)] + \
         [verts[(i, nz)] for i in range(nx - 1, -1, -1)] + [verts[(0, j)] for j in range(nz - 1, 0, -1)]
for k in range(len(border)):
    a, c = border[k], border[(k + 1) % len(border)]
    pa, pc = a[0].co.copy(), c[0].co.copy()
    lo_a = bm.verts.new((pa.x, pa.y, 0.0005))
    lo_c = bm.verts.new((pc.x, pc.y, 0.0005))
    f = bm.faces.new((a[0], lo_a, lo_c, c[0]))
    for loop, uv in zip(f.loops, (a[1], a[1], c[1], c[1])):
        loop[uvl].uv = uv
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bm.normal_update()
up = Vector((0, 0, 1))
for f in bm.faces:
    if abs(f.normal.z) > 0.5 and f.normal.dot(up) < 0:
        f.normal_flip()
mesh = bpy.data.meshes.new("rug")
bm.to_mesh(mesh)
bm.free()
for p in mesh.polygons:
    p.use_smooth = True
rug_obj = bpy.data.objects.new("rug", mesh)
collection("room").objects.link(rug_obj)
mesh.materials.append(M["rug"])

mb = MeshBuilder("rug_fringe")
for end in (-1, 1):
    xe = rcx + end * rx / 2
    zz = rcz - rz / 2 + 0.01
    while zz < rcz + rz / 2 - 0.01:
        ln = rr.uniform(0.045, 0.07)
        w_ = 0.006
        x0, x1 = sorted((xe, xe + end * ln))
        mb.box((x0, 0.0005, zz), (x1, 0.003, zz + w_), tile=0.27, grain="x", material="fringe")
        zz += rr.uniform(0.012, 0.016)
mb.finish("room", M)
log("rug")

# ---------------------------------------------------------------------------
# Writing desk (modeled): bevelled top, apron with three drawers, turned legs
# ---------------------------------------------------------------------------

dk = cfg["desk"]
dw, dh, dd = dk["size"]
parts = []
mb = MeshBuilder("desk_body")
mb.box((-dw / 2, dh - 0.035, -dd / 2), (dw / 2, dh, dd / 2), tile=1.0, grain="x", material="desk")
ax, az = dw / 2 - 0.05, dd / 2 - 0.04
mb.box((-ax, dh - 0.16, -az), (ax, dh - 0.035, az), tile=1.0, grain="x", material="desk")
for (fx0, fx1, fy0) in ((-ax + 0.02, -0.21, dh - 0.152), (-0.19, 0.19, dh - 0.12), (0.21, ax - 0.02, dh - 0.152)):
    mb.box((fx0, fy0, az), (fx1, dh - 0.045, az + 0.012), tile=1.0, grain="x", material="desk")
top = mb.finish("room", M)
bevel(top, width=0.004, segments=3, angle=35)
parts.append(top)
for sx in (-1, 1):
    for sz in (-1, 1):
        leg = lathe("desk_leg", [(0.0, 0.0), (0.018, 0.0), (0.02, 0.03), (0.032, 0.07), (0.026, 0.11), (0.021, 0.3),
                                  (0.024, 0.46), (0.03, 0.5), (0.022, 0.53), (0.026, dh - 0.16), (0.0, dh - 0.16)],
                    segments=18, material=M["desk"], tile=1.0)
        leg.location = b((sx * (ax - 0.03), 0, sz * (az - 0.03)))
        parts.append(leg)
for kx in (-(ax + 0.21) / 2 + 0.01, 0.0, (ax + 0.21) / 2 - 0.01):
    pull = lathe("desk_pull", [(0.0, 0.0), (0.008, 0.0), (0.005, 0.01), (0.011, 0.018), (0.0, 0.024)], segments=14, material=M["brass"])
    pull.rotation_euler = (math.radians(90), 0, 0)
    pull.location = b((kx, dh - 0.1, az + 0.012))
    parts.append(pull)
bpy.context.view_layer.update()
for p in parts[1:]:
    p.data.transform(p.matrix_basis)
    p.matrix_basis.identity()
desk = join(parts, "desk")
place(desk, dk["position"], dk["rotationYDeg"])
log("desk")

# ---------------------------------------------------------------------------
# Imported assets: oil lamp, picture, chandelier
# ---------------------------------------------------------------------------

def import_gltf(key):
    folder = paths.assets / key
    files = sorted(folder.glob("*.gltf")) + sorted(folder.glob("*.glb"))
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(files[0]))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
    return new


def bounds(objs):
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    bpy.context.view_layer.update()
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def adopt(objs, coll, root_name, location3, rot_y_deg=0.0, scale=1.0):
    """Parents imported objects to an empty at location (three.js), base at the origin."""
    for o in objs:
        collection(coll).objects.link(o)
    lo, hi = bounds(objs)
    root = bpy.data.objects.new(root_name, None)
    collection(coll).objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
            o.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    root.scale = (scale, scale, scale)
    place(root, location3, rot_y_deg)
    return root


# desk lamp
lamp_objs = import_gltf("desk_lamp")
a = math.radians(dk["rotationYDeg"])
off = dk["lamp"]["offset"]
lamp_pos = (dk["position"][0] + off[0] * math.cos(a) + off[2] * math.sin(a),
            dk["position"][1] + off[1],
            dk["position"][2] - off[0] * math.sin(a) + off[2] * math.cos(a))
for o in lamp_objs:
    o.name = o.name.replace("vintage_oil_lamp", "desk_lamp")
lamp_root = adopt(lamp_objs, "room", "desk_lamp_root", lamp_pos, rot_y_deg=dk["rotationYDeg"])
glass_mat = flat_material("lamp_glass", "#F4EBDC", roughness=0.08, transmission=1.0)
flame_mat = flat_material("lamp_flame", "#FFB45A", roughness=1.0, emission_hex="#FFB060", emission_strength=40.0)
for o in lamp_objs:
    if o.name.endswith("_glass"):
        o.data.materials.clear()
        o.data.materials.append(glass_mat)
        o.visible_shadow = False
        for c in list(o.users_collection):
            c.objects.unlink(o)
        collection("dynamic").objects.link(o)
    elif o.name.endswith("_flame"):
        o.data.materials.clear()
        o.data.materials.append(flame_mat)
        o.visible_shadow = False
        for c in list(o.users_collection):
            c.objects.unlink(o)
        collection("dynamic").objects.link(o)
bpy.context.view_layer.update()
flame = next((o for o in lamp_objs if o.name.endswith("_flame")), None)
lamp_light_pos = flame.matrix_world.translation.copy() if flame else b(lamp_pos) + Vector((0, 0, 0.4))
if flame:
    flo, fhi = bounds([flame])
    lamp_light_pos = (flo + fhi) / 2
log(f"desk lamp at {tuple(round(v, 3) for v in lamp_pos)}")

# picture on the left wall
pic = cfg["picture"]
pic_objs = import_gltf("picture_frame")
plo, phi = bounds(pic_objs)
pic_scale = pic["size"][0] / max(phi.x - plo.x, 1e-3)
for o in pic_objs:
    o.name = o.name.replace("fancy_picture_frame_01", "picture_frame")
pic_root = adopt(pic_objs, "room", "picture_frame_root", (0, 0, 0), scale=pic_scale)
# frame front faces −Y (Blender): rotate so it faces +X (three) = +X (Blender), hang at the configured center
pic_root.rotation_euler = (0, 0, math.radians(90 if pic["wall"] == "left" else -90))
depth = (phi.y - plo.y) * pic_scale
pic_root.location = b((pic["center"][0] + (depth / 2 if pic["wall"] == "left" else -depth / 2),
                       pic["center"][1] - pic["size"][1] / 2, pic["center"][2]))
log(f"picture scale {pic_scale:.2f}")

# chandelier
ch = cfg["chandelier"]
ch_objs = import_gltf("chandelier")
clo, chi = bounds(ch_objs)
ch_scale = (ch["anchor"][1] - ch["bottomY"]) / max(chi.z - clo.z, 1e-3)
for o in ch_objs:
    o.name = o.name.replace("Chandelier_03", "chandelier")
ch_root = adopt(ch_objs, "room", "chandelier_root", (ch["anchor"][0], ch["bottomY"], ch["anchor"][2]), scale=ch_scale)
bpy.context.view_layer.update()

# candle tips: local height maxima on a 1 cm grid, away from the central stem,
# grouped by height; candle rings are the groups with at least 4 members.
mesh_objs = [o for o in ch_objs if o.type == "MESH"]
axis = b(ch["anchor"])
cell = 0.01
top = {}
for o in mesh_objs:
    mw = o.matrix_world
    co = np.empty(len(o.data.vertices) * 3, dtype=np.float64)
    o.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    for v in co:
        p = mw @ Vector(v)
        k = (int(math.floor(p.x / cell)), int(math.floor(p.y / cell)))
        if k not in top or p.z > top[k].z:
            top[k] = p
maxima = []
for (i, j), p in top.items():
    if math.hypot(p.x - axis.x, p.y - axis.y) < 0.1:
        continue
    neigh = [top.get((i + di, j + dj)) for di in range(-3, 4) for dj in range(-3, 4) if (di or dj)]
    if all(q is None or q.z < p.z - 1e-4 for q in neigh):
        maxima.append(p)
maxima.sort(key=lambda p: p.z)
groups = []
for p in maxima:
    if groups and p.z - groups[-1][-1].z < 0.025:
        groups[-1].append(p)
    else:
        groups.append([p])
tips = [p for g in groups if len(g) >= 4 for p in g]
log(f"chandelier scale {ch_scale:.2f}, {len(tips)} candle tips")

# flames: small emissive teardrops on each candle
flames = []
for i, p in enumerate(tips):
    fl = lathe(f"chandelier_flame_{i}", [(0.0, 0.0), (0.006, 0.006), (0.008, 0.014), (0.005, 0.024), (0.0, 0.034)],
               segments=10, coll="dynamic",
               material=flat_material("candle_flame", "#FFB45A", roughness=1.0, emission_hex="#FFA048", emission_strength=60.0))
    fl.location = p + Vector((0, 0, 0.003))
    fl.visible_shadow = False
    flames.append(fl)
if flames:
    join(flames, "chandelier_flames")

# ---------------------------------------------------------------------------
# Lights (Cycles only; the app has its own dynamic lights)
# ---------------------------------------------------------------------------

L = cfg["lighting"]
sun_data = bpy.data.lights.new("sun", "SUN")
sun_data.energy = 7.0
sun_data.angle = math.radians(1.5)
sun_data.color = kelvin_to_rgb(L["sun"]["kelvin"])
sun = bpy.data.objects.new("sun", sun_data)
sun.rotation_euler = sun_rotation_blender(L["sun"])
collection("lights").objects.link(sun)

for w in cfg["windows"]:
    pd = bpy.data.lights.new(f"{w['id']}_portal", "AREA")
    pd.shape = "RECTANGLE"
    pd.size = w["width"]
    pd.size_y = w["height"]
    try:
        pd.cycles.is_portal = True
    except AttributeError:
        log("light portals unavailable in this Blender version")
    po = bpy.data.objects.new(f"{w['id']}_portal", pd)
    po.location = b((w["centerX"], w["sillY"] + w["height"] / 2, ZB - T - 0.01))
    po.rotation_euler = (math.radians(-90), 0, 0)  # area light emits along its −Z: point it into the room (+Z three = −Y Blender)
    collection("lights").objects.link(po)

ch_color = kelvin_to_rgb(L["chandelier"]["kelvin"])
for i, p in enumerate(tips):
    ld = bpy.data.lights.new(f"candle_{i}", "POINT")
    ld.energy = 9.0
    ld.shadow_soft_size = 0.015
    ld.color = ch_color
    lo = bpy.data.objects.new(f"candle_{i}", ld)
    lo.location = p + Vector((0, 0, 0.02))
    collection("lights").objects.link(lo)

ld = bpy.data.lights.new("desk_lamp_light", "POINT")
ld.energy = 22.0
ld.shadow_soft_size = 0.02
ld.color = kelvin_to_rgb(L["deskLamp"]["kelvin"])
lo = bpy.data.objects.new("desk_lamp_light", ld)
lo.location = lamp_light_pos
collection("lights").objects.link(lo)

# World: sky HDRI aligned with the sun; lighting rays see a clamped sky (no second sun disk)
world = bpy.data.worlds.new("sky")
scene.world = world
nt = world.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
hdr_path = next((paths.assets / "exterior_sky").glob("*.hdr"))
env = nt.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(str(hdr_path), check_existing=True)
coord = nt.nodes.new("ShaderNodeTexCoord")
mapping = nt.nodes.new("ShaderNodeMapping")
nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])

# brightest pixel of a downscaled copy = the sun in the HDRI
small = env.image.copy()
small.scale(512, 256)
spx = np.empty(512 * 256 * 4, dtype=np.float32)
small.pixels.foreach_get(spx)
lum = spx.reshape(256, 512, 4)[:, :, :3].sum(axis=2)
iy, ix = np.unravel_index(int(np.argmax(lum)), lum.shape)
bpy.data.images.remove(small)
u = (ix + 0.5) / 512
alpha = (u - 0.5) * 2 * math.pi
psi_hdr = math.atan2(math.sin(alpha), -math.cos(alpha))
to_sun = -b(sun_travel_three(L["sun"]))
psi_target = math.atan2(to_sun.y, to_sun.x)
mapping.inputs["Rotation"].default_value[2] = psi_hdr - psi_target
log(f"HDRI sun pixel ({ix},{iy}) → world rotation {math.degrees(psi_hdr - psi_target):.1f}°")

clamp = nt.nodes.new("ShaderNodeVectorMath")
clamp.operation = "MINIMUM"
clamp.inputs[1].default_value = (4.0, 4.0, 4.0)
nt.links.new(env.outputs["Color"], clamp.inputs[0])
lp = nt.nodes.new("ShaderNodeLightPath")
mix = nt.nodes.new("ShaderNodeMix")
mix.data_type = "RGBA"
nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Factor"])
nt.links.new(clamp.outputs["Vector"], mix.inputs[6])
nt.links.new(env.outputs["Color"], mix.inputs[7])
bg = nt.nodes.new("ShaderNodeBackground")
bg.inputs["Strength"].default_value = 1.0
nt.links.new(mix.outputs[2], bg.inputs["Color"])
wout = nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(bg.outputs["Background"], wout.inputs["Surface"])
log("lights + world")

# ---------------------------------------------------------------------------
# Cameras cam_N* (FOV vertical + lens shift, see $conventions.lensShift)
# ---------------------------------------------------------------------------

for node_id, node in cfg["nodes"].items():
    cd = bpy.data.cameras.new(f"cam_{node_id}")
    cd.sensor_fit = "VERTICAL"
    cd.sensor_height = 24.0
    cd.lens = 12.0 / math.tan(math.radians(node["fovDeg"]) / 2)
    cd.clip_start = 0.05
    cd.clip_end = 60.0
    cam = bpy.data.objects.new(f"cam_{node_id}", cd)
    cam.location = b(node["position"])
    # yaw 0 looks at −Z (three) = +Y (Blender); positive yaw turns right; pitch up positive
    cam.rotation_euler = (math.radians(90 + node["pitchDeg"]), 0, math.radians(-node["yawDeg"]))
    cam["lensShiftY"] = node["lensShiftY"]
    collection("cameras").objects.link(cam)

# render defaults (preview.py overrides resolution and samples)
scene.view_settings.view_transform = "AgX"
try:
    scene.view_settings.look = "AgX - Base Contrast"
except TypeError:
    pass
scene.cycles.samples = 64
scene.cycles.use_denoising = True

save_room(paths)
counts = {c.name: len(c.objects) for c in bpy.data.collections}
log(f"collections: {counts}")
