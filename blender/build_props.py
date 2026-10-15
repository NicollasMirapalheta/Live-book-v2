"""npm run blender:build (3/4) — shelf props (dynamic, outside the bake) into the `props` collection.

Each prop is an empty `prop_<kind>_<i>` placed on a slot of public/data/bookcase.json, with its meshes
as children. Exported separately to props.glb (app: real-time PBR, shadows).
Kinds: bookend_pair (modeled brass), clock, plant, vase, candle (Poly Haven assets).
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bmesh  # type: ignore  # noqa: E402
import bpy  # type: ignore  # noqa: E402
from mathutils import Vector  # type: ignore  # noqa: E402

from common import Paths, collection, load_room, log, open_room, save_room, script_args  # noqa: E402
from geo import b, bevel, flat_material, pbr_material, set_texture_dir  # noqa: E402

args = script_args()
paths = Paths(args.root)
cfg = load_room(paths)
set_texture_dir(paths.out / "textures")
open_room(paths)

shelf_data = json.loads((paths.public_data / "bookcase.json").read_text(encoding="utf-8"))
shelves = {s["index"]: s for s in shelf_data["shelves"]}
brass = pbr_material("brass_props", "brass", normal_strength=0.4)
terracotta = flat_material("terracotta", "#8E5236", roughness=0.85, normal_prefix="plaster", normal_strength=0.6)
flame_mat = bpy.data.materials.get("candle_flame") or flat_material(
    "candle_flame", "#FFB45A", roughness=1.0, emission_hex="#FFA048", emission_strength=60.0)

COLL = "props"
collection(COLL)


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


def import_gltf(key):
    folder = paths.assets / key
    files = sorted(folder.glob("*.gltf")) + sorted(folder.glob("*.glb"))
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(files[0]))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        collection(COLL).objects.link(o)
    return new


def root_at(name, objs, x, shelf, z=None, rot_deg=0.0, height=None):
    """Parents objs under an empty standing on the shelf at x (three.js)."""
    s = shelves[shelf]
    z = z if z is not None else (s["zFront"] + s["zBack"]) / 2
    lo, hi = bounds(objs)
    scale = 1.0
    if height is not None:
        scale = height / max(hi.z - lo.z, 1e-4)
    root = bpy.data.objects.new(name, None)
    collection(COLL).objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
            o.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    root.scale = (scale, scale, scale)
    root.location = b((x, s["y"], z))
    root.rotation_euler = (0, 0, math.radians(rot_deg))
    bpy.context.view_layer.update()
    lo2, hi2 = bounds(objs)
    if hi2.z - lo2.z > s["clearHeight"] - 0.01:
        log(f"AVISO {name}: altura {hi2.z - lo2.z:.3f} m > vão {s['clearHeight']:.3f} m")
    return root


def bookend(name):
    """Brass L bookend: base plate + upright with an arched top and a pierced roundel."""
    bm = bmesh.new()
    # upright outline in the (x=depth, y=height) plane, extruded along the bookend thickness
    depth, height, thick = 0.11, 0.16, 0.006
    pts = []
    for i in range(0, 13):
        a = math.pi * i / 12
        pts.append((depth / 2 - math.cos(a) * depth / 2, height - depth / 2 + math.sin(a) * depth / 2 * 0.55))
    outline = [(0.0, 0.0)] + pts + [(depth, 0.0)]
    verts_a = [bm.verts.new((0.0, x - depth / 2, y)) for x, y in outline]
    face = bm.faces.new(verts_a)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(thick, 0, 0))
    # base plate
    base = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(0.1, depth, 0.004), verts=base["verts"])
    bmesh.ops.translate(bm, vec=(0.05, 0, 0.002), verts=base["verts"])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (co.y * 3 + co.x * 3, co.z * 3)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    collection(COLL).objects.link(obj)
    mesh.materials.append(brass)
    bevel(obj, width=0.0015, segments=2, angle=30)
    # roundel ornament on the outer face
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.022, depth=0.004,
                                        location=(-0.002, 0, height * 0.55), rotation=(0, math.radians(90), 0))
    ring = bpy.context.object
    for c in list(ring.users_collection):
        c.objects.unlink(ring)
    collection(COLL).objects.link(ring)
    ring.name = name + "_roundel"
    ring.data.materials.append(brass)
    ring.parent = obj
    bevel(ring, width=0.001, segments=2)
    return obj


counts: dict[str, int] = {}
for slot in shelf_data["propSlots"]:
    kind = slot["kind"]
    i = counts.get(kind, 0)
    counts[kind] = i + 1
    name = f"prop_{kind}_{i}"
    if kind == "bookend_pair":
        gap = 0.32  # room for a row of books between the two
        left = bookend(f"{name}_l")
        right = bookend(f"{name}_r")
        # upright faces inward: left bookend's plate extends to +X, right one mirrored
        left.location = Vector((-gap / 2, 0, 0))
        right.location = Vector((gap / 2, 0, 0))
        right.rotation_euler = (0, 0, math.pi)
        root_at(name, [left, right], slot["x"] + gap / 2, slot["shelf"])
    elif kind == "clock":
        objs = import_gltf("mantel_clock")
        root_at(name, objs, slot["x"], slot["shelf"], height=0.16)
    elif kind == "plant":
        objs = import_gltf("plant")
        for o in list(objs):
            if o.name.endswith("_ground"):
                objs.remove(o)
                bpy.data.objects.remove(o)
            elif o.name.endswith("_pot") and o.type == "MESH":
                o.data.materials.clear()
                o.data.materials.append(terracotta)
        root_at(name, objs, slot["x"], slot["shelf"], height=min(0.27, shelves[slot["shelf"]]["clearHeight"] - 0.03))
    elif kind == "vase":
        objs = import_gltf("brass_vase")
        root_at(name, objs, slot["x"], slot["shelf"], height=min(0.28, shelves[slot["shelf"]]["clearHeight"] - 0.03))
    elif kind == "candle":
        objs = import_gltf("candleholders")
        keep = []
        for o in objs:
            if "candleholder_02" in o.name:
                bpy.data.objects.remove(o)
            else:
                keep.append(o)
        objs = keep
        for o in objs:
            # the two small holders closer together
            if o.parent is None and "candleholder_01" in o.name:
                o.location.x += 0.29
            if o.parent is None and "candleholder_03" in o.name:
                o.location.x -= 0.29
            if o.type == "MESH":
                for slot_m in o.material_slots:
                    if slot_m.material and "flame" in slot_m.material.name:
                        slot_m.material = flame_mat
        root_at(name, objs, slot["x"], slot["shelf"], height=min(0.24, shelves[slot["shelf"]]["clearHeight"] - 0.04))
    log(f"{name} on shelf {slot['shelf']} at x={slot['x']}")

save_room(paths)
