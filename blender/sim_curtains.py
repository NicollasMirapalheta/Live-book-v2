"""npm run blender:build (4/4) — brass rods and linen curtains, two tied-back panels per window.

The panels start as pleated sheets shaped like a tied-back curtain (gathered at the top, pinched at the
tieback, flaring to the hem). A cloth simulation then lets the fabric settle under gravity with the top row
and the tieback ring pinned, colliding with the bookcase, the walls and the sill. The last frame is applied
as a mesh.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bmesh  # type: ignore  # noqa: E402
import bpy  # type: ignore  # noqa: E402

from common import Paths, collection, hex_to_linear, load_room, log, open_room, save_room, script_args  # noqa: E402
from geo import b, bevel, lathe, pbr_material, set_texture_dir, rng, MeshBuilder  # noqa: E402

args = script_args([("--frames", {"type": int, "default": 45})])
paths = Paths(args.root)
cfg = load_room(paths)
set_texture_dir(paths.out / "textures")
open_room(paths)

cur = cfg["curtains"]
ZB = cfg["walls"]["back"]["z"]
rod_y = cur["rodY"]
rod_z = ZB + 0.13
brass = bpy.data.materials.get("brass") or pbr_material("brass", "brass", normal_strength=0.4)


def linen_material():
    """Linen with light translucency (Cycles); curtains are baked in `combined` mode, so the
    app only needs the baked texture."""
    mat = bpy.data.materials.get("linen_curtain") or bpy.data.materials.new("linen_curtain")
    base = pbr_material("linen_curtain_base", "linen", normal_strength=0.8, metallic=0.0)
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    # copy the PBR setup, then mix with a translucent BSDF tinted like the fabric
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    col = nt.nodes.new("ShaderNodeTexImage")
    col.image = base.node_tree.nodes["Image Texture"].image
    nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    nor = nt.nodes.new("ShaderNodeTexImage")
    nor.image = next(n.image for n in base.node_tree.nodes if n.type == "TEX_IMAGE" and "normal" in n.image.name)
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.8
    nt.links.new(nor.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    tr = nt.nodes.new("ShaderNodeBsdfTranslucent")
    tr.inputs["Color"].default_value = hex_to_linear("#E8D2A8")
    nt.links.new(col.outputs["Color"], tr.inputs["Color"])
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = 0.35
    nt.links.new(bsdf.outputs["BSDF"], mix.inputs[1])
    nt.links.new(tr.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return mat


linen = linen_material()

# ---------------------------------------------------------------------------
# Rods
# ---------------------------------------------------------------------------

for w in cfg["windows"]:
    cx, hw = w["centerX"], w["width"] / 2
    x0, x1 = cx - hw - cur["rodOverhang"], cx + hw + cur["rodOverhang"]
    rod = lathe(f"curtain_rod_{w['id']}", [(0.0, 0.0), (0.012, 0.0), (0.012, x1 - x0), (0.0, x1 - x0)], segments=16, material=brass)
    rod.rotation_euler = (0, math.radians(90), 0)  # lathe axis (Blender Z) → Blender +X
    rod.location = b((x0, rod_y, rod_z))
    parts = [rod]
    for end, sign in ((x0, -1), (x1, 1)):
        fin = lathe(f"curtain_finial_{w['id']}", [(0.0, 0.0), (0.016, 0.0), (0.02, 0.012), (0.03, 0.03), (0.022, 0.05), (0.0, 0.058)],
                    segments=16, material=brass)
        fin.rotation_euler = (0, math.radians(90 * sign), 0)
        fin.location = b((end, rod_y, rod_z))
        parts.append(fin)
        # bracket back to the wall
        br = MeshBuilder(f"curtain_bracket_{w['id']}")
        bx = end - sign * 0.06
        br.box((bx - 0.008, rod_y - 0.012, ZB), (bx + 0.008, rod_y + 0.012, rod_z + 0.01), tile=0.3, grain="z", material="brass")
        bobj = br.finish("room", {"brass": brass})
        parts.append(bobj)
    bpy.context.view_layer.update()
    for p in parts[1:]:
        p.data.transform(p.matrix_basis)
        p.matrix_basis.identity()
    rod.data.transform(rod.matrix_basis)
    rod.matrix_basis.identity()
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = rod
    bpy.ops.object.join()
    rod.name = f"curtain_rod_{w['id'].replace('window_', '')}"

# ---------------------------------------------------------------------------
# Collision objects
# ---------------------------------------------------------------------------

colliders = [o for o in bpy.data.objects if o.type == "MESH" and (
    o.name.startswith("bookcase") or o.name.startswith("wall_back") or o.name.startswith("wainscot_back")
    or (o.name.startswith("window_") and o.name.endswith("_frame")) or o.name.startswith("wall_left") or o.name.startswith("wall_right"))]
for o in colliders:
    if not any(m.type == "COLLISION" for m in o.modifiers):
        o.modifiers.new("collision", "COLLISION")
        o.collision.thickness_outer = 0.006
        o.collision.cloth_friction = 5.0

# ---------------------------------------------------------------------------
# Curtain panels
# ---------------------------------------------------------------------------

def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def panel(name, x_top, toward, seed):
    """toward: −1/+1, the side the tieback pulls to (away from the window opening)."""
    r = rng(seed)
    top_y = rod_y - 0.04
    hem_y = cur["hemY"]
    tie_y = cur["tiebackY"]
    gw = cur["panelWidthGathered"]
    nx, ny = 36, 110
    fabric_w = gw * 2.4
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    grid = {}
    pin_top, pin_tie = [], []
    for j in range(ny + 1):
        v = j / ny
        y = top_y + (hem_y - top_y) * v
        if y >= tie_y:
            t = (top_y - y) / (top_y - tie_y)
            # swag: width narrows toward the tieback, center drifts toward `toward`
            half = gw / 2 * (1 - 0.62 * smooth(t))
            xc = x_top + toward * 0.05 * smooth(t) + toward * 0.03 * math.sin(math.pi * t)
            amp = 0.035 + 0.02 * smooth(t)
        else:
            t = (tie_y - y) / (tie_y - hem_y)
            half = gw / 2 * (0.38 + 0.32 * smooth(t))
            xc = x_top + toward * 0.05 * (1 - 0.6 * smooth(t))
            amp = 0.055 - 0.01 * smooth(t)
        zc = rod_z + (0.02 if abs(y - tie_y) < 0.25 else 0.0) * (1 - abs(y - tie_y) / 0.25)
        for i in range(nx + 1):
            u = i / nx
            x = xc + (u - 0.5) * 2 * half
            phase = u * fabric_w / 0.1 * 2 * math.pi
            z = zc + amp * math.sin(phase) + r.uniform(-0.002, 0.002)
            vert = bm.verts.new(b((x, y, z)))
            grid[(i, j)] = (vert, (u * fabric_w / 0.27, (top_y - y) / 0.27))
            if j == 0:
                pin_top.append(vert)
            if abs(y - tie_y) < (top_y - hem_y) / ny * 0.6:
                pin_tie.append(vert)
    for j in range(ny):
        for i in range(nx):
            q = [grid[(i, j)], grid[(i, j + 1)], grid[(i + 1, j + 1)], grid[(i + 1, j)]]
            f = bm.faces.new([a[0] for a in q])
            for loop, a in zip(f.loops, q):
                loop[uvl].uv = a[1]
    bm.normal_update()
    # face the room (+Z three = −Y Blender)
    room = b((0, 0, 1))
    if sum(f.normal.dot(room) for f in bm.faces) < 0:
        for f in bm.faces:
            f.normal_flip()
    bm.verts.index_update()
    pin_idx = [v.index for v in pin_top + pin_tie]
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    collection("room").objects.link(obj)
    mesh.materials.append(linen)
    vg = obj.vertex_groups.new(name="pin")
    vg.add(pin_idx, 1.0, "REPLACE")
    return obj, half_at_tie(gw), tie_y


def half_at_tie(gw):
    return gw / 2 * 0.38


curtains = []
for w in cfg["windows"]:
    cx, hw = w["centerX"], w["width"] / 2
    x0, x1 = cx - hw - cur["rodOverhang"], cx + hw + cur["rodOverhang"]
    gw = cur["panelWidthGathered"]
    side = "left" if cx < 0 else "right"
    # panel a: on the side nearer the bookcase (x toward 0); panel b: toward the side wall
    inner_x = x1 - gw / 2 - 0.02 if cx < 0 else x0 + gw / 2 + 0.02
    outer_x = x0 + gw / 2 + 0.02 if cx < 0 else x1 - gw / 2 - 0.02
    a, ha, ty = panel(f"curtain_{side}_a", inner_x, +1 if cx < 0 else -1, 21 if cx < 0 else 23)
    bb, hb, _ = panel(f"curtain_{side}_b", outer_x, -1 if cx < 0 else +1, 22 if cx < 0 else 24)
    curtains += [(a, inner_x + (0.05 if cx < 0 else -0.05), ha), (bb, outer_x + (-0.05 if cx < 0 else 0.05), hb)]

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = args.frames
for obj, _, _ in curtains:
    cloth = obj.modifiers.new("cloth", "CLOTH")
    s = cloth.settings
    s.quality = 8
    s.mass = 0.25
    s.tension_stiffness = 25
    s.compression_stiffness = 25
    s.shear_stiffness = 8
    s.bending_stiffness = 0.6
    s.air_damping = 2.0
    s.vertex_group_mass = "pin"
    s.pin_stiffness = 1.0
    cloth.collision_settings.use_collision = True
    cloth.collision_settings.distance_min = 0.004
    cloth.collision_settings.use_self_collision = False
    cloth.point_cache.frame_start = 1
    cloth.point_cache.frame_end = args.frames

for f in range(1, args.frames + 1):
    scene.frame_set(f)
log(f"cloth simulated {args.frames} frames")

for obj, _, _ in curtains:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier="cloth")
    obj.vertex_groups.clear()
    sol = obj.modifiers.new("thickness", "SOLIDIFY")
    sol.thickness = 0.002
scene.frame_set(1)

for o in colliders:
    for m in list(o.modifiers):
        if m.type == "COLLISION":
            o.modifiers.remove(m)

# tiebacks: fabric band around each gathered panel + brass holdback on the wall
for obj, x_tie, half in curtains:
    band = lathe(obj.name.replace("curtain_", "tieback_"), [(half + 0.035, 0.0), (half + 0.04, 0.012), (half + 0.04, 0.03), (half + 0.035, 0.042), (half + 0.03, 0.042), (half + 0.03, 0.0)],
                 segments=24, material=linen, caps=False)
    band.scale = (1.0, 0.55, 1.0)
    band.location = b((x_tie, cur["tiebackY"] - 0.02, rod_z + 0.02))

log(f"curtains: {len(curtains)} panels")
save_room(paths)
