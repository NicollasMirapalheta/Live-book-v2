"""npm run blender:build (2/4) — parametric bookcase from config/room.json → room.blend + public/data/bookcase.json.

Base cabinet with two raised-panel doors and a top ledge, a set-back upper case between side pilasters,
`shelfLevels` shelves (the ledge is the first one), crown cornice and a boarded back.
Edge wear: after the bevels are applied, bevel faces get a lighter vertex color than flat faces.
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bpy  # type: ignore  # noqa: E402

from common import Paths, load_room, log, open_room, save_room, script_args  # noqa: E402
from geo import MeshBuilder, apply_modifiers, bevel, lathe, pbr_material, set_texture_dir, b, join, flat_material  # noqa: E402

args = script_args()
paths = Paths(args.root)
cfg = load_room(paths)
set_texture_dir(paths.out / "textures")
open_room(paths)

bc = cfg["bookcase"]
cx, _, cz = bc["center"]
W, H, Dp = bc["width"], bc["height"], bc["depth"]
base_h = bc["baseCabinetHeight"]
corn = bc["corniceHeight"]
th = bc["boardThickness"]
pil = bc["sidePilasterWidth"]
levels = bc["shelfLevels"]
ZB = cfg["walls"]["back"]["z"]

x0, x1 = cx - W / 2, cx + W / 2
z_back = cz - Dp / 2                # against the back wall
z_front_base = cz + Dp / 2          # base cabinet front
upper_depth = Dp - 0.08             # upper case is set back
z_front_up = z_back + upper_depth
back_t = 0.03                       # back panel is thick enough to hide the displaced stone
ledge = 0.03                        # base top ledge thickness (first shelf)
head = 0.06                         # head rail under the cornice

M = {"wood": pbr_material("bookcase", "bookcase", normal_strength=0.5, vertex_color=True, metallic=0.0)}
brass = bpy.data.materials.get("brass")

mb = MeshBuilder("bookcase", vertex_colors=True)


def box(mn, mx, grain="x"):
    mb.box(mn, mx, tile=1.0, grain=grain, material="wood")


# --- base cabinet --------------------------------------------------------------
plinth = 0.09
box((x0 + 0.01, 0.0, z_back + back_t), (x1 - 0.01, plinth, z_front_base - 0.015))          # recessed plinth
box((x0, plinth, z_back), (x0 + 0.04, base_h, z_front_base))                               # left side
box((x1 - 0.04, plinth, z_back), (x1, base_h, z_front_base))                               # right side
box((x0, plinth - 0.02, z_front_base - 0.03), (x1, plinth + 0.03, z_front_base + 0.008))   # base molding
box((x0 + 0.04, plinth, z_back + back_t), (x1 - 0.04, base_h, z_front_base - 0.02))        # carcass block
# face frame and two doors with raised panels
ff = 0.05
box((x0, plinth + 0.03, z_front_base - 0.02), (x0 + ff, base_h, z_front_base), "y")
box((x1 - ff, plinth + 0.03, z_front_base - 0.02), (x1, base_h, z_front_base), "y")
box((x0, base_h - ff, z_front_base - 0.02), (x1, base_h, z_front_base), "x")
box((cx - ff / 2, plinth + 0.03, z_front_base - 0.02), (cx + ff / 2, base_h, z_front_base), "y")
doors = bc["baseDoors"]
inner_w = (W - 2 * ff - (doors - 1) * ff) / doors
door_y0, door_y1 = plinth + 0.035, base_h - ff - 0.005
for d in range(doors):
    dx0 = x0 + ff + d * (inner_w + ff) + 0.003
    dx1 = dx0 + inner_w - 0.006
    zf = z_front_base
    box((dx0, door_y0, zf - 0.005), (dx0 + 0.07, door_y1, zf + 0.018), "y")       # stiles
    box((dx1 - 0.07, door_y0, zf - 0.005), (dx1, door_y1, zf + 0.018), "y")
    box((dx0 + 0.07, door_y1 - 0.07, zf - 0.005), (dx1 - 0.07, door_y1, zf + 0.018), "x")  # rails
    box((dx0 + 0.07, door_y0, zf - 0.005), (dx1 - 0.07, door_y0 + 0.08, zf + 0.018), "x")
    box((dx0 + 0.07, door_y0 + 0.08, zf - 0.005), (dx1 - 0.07, door_y1 - 0.07, zf + 0.004), "y")  # panel field
    box((dx0 + 0.1, door_y0 + 0.11, zf), (dx1 - 0.1, door_y1 - 0.1, zf + 0.014), "y")            # raised panel
# ledge: first shelf, overhangs the base on the front and the sides
ledge_y = base_h + ledge
box((x0 - 0.02, base_h, z_back), (x1 + 0.02, ledge_y, z_front_base + 0.025), "x")

# --- upper case ----------------------------------------------------------------
top_y = H - corn
box((x0, ledge_y, z_back), (x1, top_y, z_back + back_t))                                     # back (behind boards)
# back boards with V grooves (visible between the books)
n_boards = 9
inner_x0, inner_x1 = x0 + pil, x1 - pil
bw = (inner_x1 - inner_x0) / n_boards
for k in range(n_boards):
    box((inner_x0 + k * bw + 0.002, ledge_y, z_back + back_t), (inner_x0 + (k + 1) * bw - 0.002, top_y, z_back + back_t + 0.01), "y")
# side panels and pilasters (pilasters project a little and carry base/capital blocks)
for sx0, sx1 in ((x0, x0 + pil), (x1 - pil, x1)):
    box((sx0, ledge_y, z_back), (sx1, top_y, z_front_up), "y")
    box((sx0 - 0.006, ledge_y, z_front_up), (sx1 + 0.006, top_y, z_front_up + 0.018), "y")       # pilaster face
    box((sx0 - 0.012, ledge_y, z_front_up - 0.004), (sx1 + 0.012, ledge_y + 0.07, z_front_up + 0.026), "x")  # base block
    box((sx0 - 0.012, top_y - head - 0.06, z_front_up - 0.004), (sx1 + 0.012, top_y - head, z_front_up + 0.026), "x")  # capital
    # flutes: two shallow grooves suggested by thin strips
    for f in (0.3, 0.7):
        fx = sx0 + (sx1 - sx0) * f
        box((fx - 0.004, ledge_y + 0.09, z_front_up + 0.018), (fx + 0.004, top_y - head - 0.08, z_front_up + 0.021), "y")
# head rail and shelves
box((inner_x0, top_y - head, z_back + back_t), (inner_x1, top_y, z_front_up + 0.01), "x")
interior = (top_y - head) - ledge_y
bay = interior / levels
shelves = [{"index": 0, "y": round(ledge_y, 4)}]
for k in range(1, levels):
    y_top = ledge_y + k * bay
    box((inner_x0, y_top - th, z_back + back_t + 0.01), (inner_x1, y_top, z_front_up - 0.005), "x")
    box((inner_x0, y_top - th - 0.02, z_front_up - 0.025), (inner_x1, y_top, z_front_up - 0.005), "x")  # shelf lip
    shelves.append({"index": k, "y": round(y_top, 4)})

# --- cornice (stepped crown) ----------------------------------------------------
steps = [(0.0, 0.02, 0.005), (0.02, 0.045, 0.02), (0.045, 0.07, 0.035), (0.07, corn, 0.055)]
for y0, y1, proj in steps:
    box((x0 - proj, top_y + y0, z_back), (x1 + proj, top_y + y1, z_front_up + proj), "x")

obj = mb.finish("room", M)
bevel(obj, width=0.004, segments=2, angle=35)
apply_modifiers(obj)

# edge wear: bevel faces (not axis-aligned) lighter than flat faces
mesh = obj.data
col = mesh.color_attributes.get("Col") or mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
for poly in mesh.polygons:
    n = poly.normal
    flat = max(abs(n.x), abs(n.y), abs(n.z)) > 0.995
    v = 0.86 if flat else 1.0
    for li in poly.loop_indices:
        col.data[li].color = (v, v * 0.985, v * 0.97, 1.0)

# brass door knobs on the base cabinet
knobs = []
for d in range(doors):
    kx = cx + (-1 if d == 0 else 1) * 0.07
    knob = lathe("bookcase_knob", [(0.0, 0.0), (0.009, 0.0), (0.006, 0.012), (0.014, 0.022), (0.0, 0.03)], segments=14, material=brass)
    knob.rotation_euler = (math.radians(90), 0, 0)
    knob.location = b((kx, (door_y0 + door_y1) / 2, z_front_base + 0.018))
    knobs.append(knob)
bpy.context.view_layer.update()
for k in knobs:
    k.data.transform(k.matrix_basis)
    k.matrix_basis.identity()
join(knobs, "bookcase_knobs")

# --- public/data/bookcase.json --------------------------------------------------
for s in shelves:
    k = s["index"]
    next_y = (ledge_y + (k + 1) * bay - th) if k < levels - 1 else top_y - head
    s.update({
        "clearHeight": round(next_y - s["y"], 4),
        "xMin": round(inner_x0, 4),
        "xMax": round(inner_x1, 4),
        "zFront": round(z_front_up - 0.005, 4),
        "zBack": round(z_back + back_t + 0.01, 4),
    })
prop_slots = [
    {"shelf": 0, "x": round(inner_x0 + 0.09, 3), "kind": "bookend_pair"},
    {"shelf": 0, "x": round(inner_x1 - 0.22, 3), "kind": "clock"},
    {"shelf": 1, "x": round(inner_x0 + 0.2, 3), "kind": "plant"},
    {"shelf": 1, "x": round(inner_x1 - 0.5, 3), "kind": "bookend_pair"},
    {"shelf": 2, "x": round(inner_x0 + 0.5, 3), "kind": "bookend_pair"},
    {"shelf": 2, "x": round(inner_x1 - 0.18, 3), "kind": "candle"},
    {"shelf": 3, "x": round(inner_x0 + 0.16, 3), "kind": "vase"},
    {"shelf": 3, "x": round(inner_x1 - 0.42, 3), "kind": "bookend_pair"},
]
out = {"shelves": shelves, "propSlots": prop_slots,
       "bounds": {"xMin": round(x0, 4), "xMax": round(x1, 4), "zBack": round(z_back, 4), "zFront": round(z_front_base, 4), "height": H}}
(paths.public_data / "bookcase.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
log(f"bookcase: {len(shelves)} shelves, bay {bay:.3f} m, clear {shelves[0]['clearHeight']:.3f} m")

save_room(paths)
