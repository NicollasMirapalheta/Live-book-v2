"""Renders a thumbnail of each glTF model in assets/source/ (for the asset contact sheet, T1).

Each model is centered on a neutral floor next to a 1 m reference bar, under a simple
studio light, so color and scale can be judged. Output: shots/blender/assets/<key>.png
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bpy  # type: ignore  # noqa: E402
from mathutils import Vector  # type: ignore  # noqa: E402

from common import Paths, log, log_environment, reset_scene, script_args  # noqa: E402

args = script_args()
paths = Paths(args.root)
out_dir = paths.shots / "assets"
out_dir.mkdir(parents=True, exist_ok=True)

manifest = json.loads((paths.root / "assets" / "manifest.json").read_text(encoding="utf-8"))
models = [a for a in manifest["assets"] if a["type"] == "model"]


def world_bounds(objs):
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


for asset in models:
    folder = paths.assets / asset["key"]
    gltfs = sorted(folder.glob("*.gltf")) + sorted(folder.glob("*.glb"))
    if not gltfs:
        log(f"skip {asset['key']}: no gltf")
        continue
    reset_scene()
    scene = bpy.context.scene
    log_environment() if asset is models[0] else None
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.view_settings.view_transform = "AgX"

    bpy.ops.import_scene.gltf(filepath=str(gltfs[0]))
    imported = list(bpy.context.selected_objects)
    lo, hi = world_bounds(imported)
    size = hi - lo
    center = (lo + hi) / 2

    # floor + 1 m reference bar (10 cm stripes)
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, lo.z))
    floor = bpy.context.object
    mat = bpy.data.materials.new("floor")
    mat.diffuse_color = (0.18, 0.17, 0.16, 1)
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.18, 0.17, 0.16, 1)
    floor.data.materials.append(mat)
    for i in range(10):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(lo.x - 0.08, lo.y + 0.05 + i * 0.1, lo.z + 0.005))
        bar = bpy.context.object
        bar.scale = (0.03, 0.1, 0.01)
        m = bpy.data.materials.new(f"bar{i}")
        m.use_nodes = True
        v = 0.8 if i % 2 == 0 else 0.05
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (v, v * 0.2 if i % 2 else v, v * 0.2 if i % 2 else v, 1)
        bar.data.materials.append(m)

    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.5, 0.48, 0.45, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    bpy.ops.object.light_add(type="AREA", location=(center.x + 2, center.y - 2, hi.z + 2))
    key = bpy.context.object
    key.data.energy = 600
    key.data.size = 2
    key.rotation_euler = (math.radians(50), 0, math.radians(45))

    extent = max(size.x, size.y, size.z, 1.0)
    bpy.ops.object.camera_add(location=(center.x + extent * 1.3, center.y - extent * 1.6, center.z + extent * 0.7))
    cam = bpy.context.object
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50
    scene.camera = cam

    scene.render.filepath = str(out_dir / f"{asset['key']}.png")
    bpy.ops.render.render(write_still=True)
    log(f"{asset['key']}: size {size.x:.2f} × {size.y:.2f} × {size.z:.2f} m (x, y, z Blender)")
    (out_dir / f"{asset['key']}.json").write_text(json.dumps({"size_m": [size.x, size.y, size.z]}))
