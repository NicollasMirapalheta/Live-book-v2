"""npm run blender:bake -- --quality draft|final
Lightmaps (UV2 `lightmap`) per atlas of blender/bake_config.json + equirectangular env map from N1.

Outputs:
  blender/out/lightmaps/<atlas>.exr     linear float (irradiance or combined)
  blender/out/env/room_N1.hdr           Radiance HDR panorama
  blender/out/room_baked.blend          room with modifiers applied and the `lightmap` UV layer
  blender/out/lightmaps/bake.json       object → atlas/mode, sizes, device, timings
"""

import fnmatch
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bpy  # type: ignore  # noqa: E402

from common import Paths, load_room, log, log_environment, open_room, script_args, setup_gpu  # noqa: E402
from mathutils import Vector  # type: ignore  # noqa: E402
from geo import b  # noqa: E402

args = script_args([("--only", {"default": ""}), ("--skip-env", {"action": "store_true"})])
paths = Paths(args.root)
cfg = load_room(paths)
bake_cfg = json.loads(paths.bake_config.read_text(encoding="utf-8"))
open_room(paths)
log_environment()
scene = bpy.context.scene
device = setup_gpu()
draft = args.quality == "draft"
samples = args.samples or (64 if draft else 512)
MARGIN_PX = 6

report = {"quality": args.quality, "samples": samples, "device": device, "atlases": {}, "objects": {}}

# Static room objects only (no lights, cameras, props, glass)
room_coll = bpy.data.collections["room"]
room_objs = [o for o in room_coll.all_objects if o.type == "MESH"]


def matches(name, patterns):
    return any(fnmatch.fnmatchcase(name, p) for p in patterns)


def select_only(objs, active=None):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def apply_all_modifiers(objs):
    for o in objs:
        if not o.modifiers:
            continue
        select_only([o])
        for m in list(o.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=m.name)
            except RuntimeError as err:
                log(f"modifier {m.name} on {o.name}: {err}")


def make_single_user(objs):
    for o in objs:
        if o.data.users > 1:
            o.data = o.data.copy()


PLANAR_UP = ("floor", "rug", "ceiling")
PLANAR_WALL = ("wall_back_stone", "wall_front_stone", "wall_left_stone", "wall_right_stone")
COPY_UV = ("curtain_left_a", "curtain_left_b", "curtain_right_a", "curtain_right_b")
# texel density relative to the atlas density (objects that are barely seen get fewer texels)
DENSITY_WEIGHT = {"vestibule_shell": 0.3, "vestibule_wainscot": 0.4, "wall_back": 0.6, "wall_front": 0.5,
                  "wall_left": 0.5, "wall_right": 0.5, "ceiling": 0.7, "bookcase_knobs": 0.5}


def dominant_axis(obj):
    acc = [0.0, 0.0, 0.0]
    mw3 = obj.matrix_world.to_3x3()
    for p in obj.data.polygons:
        n = mw3 @ p.normal
        for i in range(3):
            acc[i] += abs(n[i]) * p.area
    return acc.index(max(acc))


def world_area(obj):
    import bmesh  # noqa: PLC0415
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    a = sum(f.calc_area() for f in bm.faces)
    bm.free()
    return a


def uv_area(obj, layer="lightmap"):
    uv = obj.data.uv_layers[layer].data
    total = 0.0
    for p in obj.data.polygons:
        pts = [uv[li].uv for li in p.loop_indices]
        a = 0.0
        for i in range(len(pts)):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % len(pts)]
            a += x1 * y2 - x2 * y1
        total += abs(a) / 2
    return total


def layout_object(obj):
    """Fills the `lightmap` layer of one object with a layout in METERS (origin at 0,0)."""
    import numpy as np_  # noqa: PLC0415
    me = obj.data
    lm = me.uv_layers["lightmap"]
    n = len(lm.data)
    if obj.name in PLANAR_UP or obj.name in PLANAR_WALL:
        axis = 2 if obj.name in PLANAR_UP else dominant_axis(obj)
        a, c = [i for i in range(3) if i != axis]
        mw = obj.matrix_world
        co = np_.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        world = np_.array([list(mw @ Vector(v)) for v in co])
        vidx = np_.empty(len(me.loops), dtype=np_.int64)
        me.loops.foreach_get("vertex_index", vidx)
        uv = np_.stack([world[vidx, a], world[vidx, c]], axis=1)
    else:
        if obj.name in COPY_UV and "UVMap" in me.uv_layers:
            src = me.uv_layers["UVMap"].data
            uv = np_.empty(n * 2)
            src.foreach_get("uv", uv)
            uv = uv.reshape(-1, 2)
        else:
            # lightmap_pack: every face its own island, packed per object (~85% coverage, unlike
            # smart_project on long boxes); relative face areas are preserved
            select_only([obj])
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.lightmap_pack(PREF_CONTEXT="ALL_FACES", PREF_PACK_IN_ONE=True, PREF_NEW_UVLAYER=False,
                                     PREF_MARGIN_DIV=0.15)
            bpy.ops.object.mode_set(mode="OBJECT")
            lm = me.uv_layers["lightmap"]  # edit mode reallocates the layers: never reuse the old reference
            uv = np_.empty(n * 2)
            lm.data.foreach_get("uv", uv)
            uv = uv.reshape(-1, 2)
        lm.data.foreach_set("uv", uv.ravel())
        ua = uv_area(obj)
        wa = world_area(obj)
        scale = math.sqrt(wa / ua) if ua > 1e-9 and math.isfinite(ua) else math.sqrt(max(wa, 1e-4))
        if not math.isfinite(scale):
            scale = 1.0
        uv = uv * scale
    uv = uv - uv.min(axis=0)
    me.uv_layers["lightmap"].data.foreach_set("uv", uv.ravel())
    w, h = uv.max(axis=0)
    return float(max(w, 1e-4)), float(max(h, 1e-4))


def shelf_pack(rects, size, margin_px, density):
    """rects: {name: (w_m, h_m)}. Returns {name: (x_px, y_px, rotated)} or None if it does not fit."""
    items = []
    for name, (w, h) in rects.items():
        rot = h > w
        pw, ph = (h, w) if rot else (w, h)
        items.append((name, pw * density + 2 * margin_px, ph * density + 2 * margin_px, rot))
    items.sort(key=lambda it: -it[2])
    x = y = row_h = 0.0
    out = {}
    for name, pw, ph, rot in items:
        if pw > size:
            return None
        if x + pw > size:
            x = 0.0
            y += row_h
            row_h = 0.0
        if y + ph > size:
            return None
        out[name] = (x + margin_px, y + margin_px, rot)
        x += pw
        row_h = max(row_h, ph)
    return out


def unwrap(objs, size):
    """UV2 for an atlas: every object is laid out in meters on its own (planar for big flat surfaces,
    the fabric grid for curtains, smart project otherwise), then the object rectangles are shelf-packed
    with one texel density for the whole atlas (the highest that fits) and a margin of MARGIN_PX."""
    import numpy as np_  # noqa: PLC0415
    for o in objs:
        uvs = o.data.uv_layers
        lm = uvs.get("lightmap") or uvs.new(name="lightmap")
        uvs.active = lm
    rects = {}
    for o in objs:
        w, h = layout_object(o)
        k = DENSITY_WEIGHT.get(o.name, 1.0)
        if k != 1.0:
            lm = o.data.uv_layers["lightmap"]
            uv = np_.empty(len(lm.data) * 2)
            lm.data.foreach_get("uv", uv)
            lm.data.foreach_set("uv", uv * k)
        rects[o.name] = (w * k, h * k)
    for name, (w, h) in sorted(rects.items(), key=lambda kv: -kv[1][0] * kv[1][1])[:6]:
        log(f"  rect {name}: {w:.2f} × {h:.2f} m")
    lo, hi = 1.0, 4096.0
    best = None
    for _ in range(40):
        mid = (lo + hi) / 2
        placed = shelf_pack(rects, size, MARGIN_PX, mid)
        if placed:
            best, lo = (mid, placed), mid
        else:
            hi = mid
    if best is None:
        raise RuntimeError(f"UV2: objetos não cabem em {size}px: {rects}")
    density, placed = best
    for o in objs:
        x, y, rot = placed[o.name]
        lm = o.data.uv_layers["lightmap"]
        uv = np_.empty(len(lm.data) * 2)
        lm.data.foreach_get("uv", uv)
        uv = uv.reshape(-1, 2)
        if rot:
            uv = uv[:, ::-1].copy()
        uv = (uv * density + np_.array([x, y])) / size
        lm.data.foreach_set("uv", uv.ravel())
    log(f"UV2: {len(objs)} objetos, {density:.0f} px/m ({1000 / density:.1f} mm/px) em {size}px")
    return density


def bake_atlas(name, spec):
    objs = [o for o in room_objs if matches(o.name, spec["objects"])]
    if not objs:
        log(f"{name}: nenhum objeto")
        return
    size = spec["size"] // (2 if draft else 1)
    t0 = time.time()
    make_single_user(objs)
    apply_all_modifiers(objs)
    density = unwrap(objs, size)

    img = bpy.data.images.get(name) or bpy.data.images.new(name, size, size, alpha=True, float_buffer=True)
    if img.size[0] != size:
        img.scale(size, size)
    img.colorspace_settings.name = "Non-Color"
    img.generated_color = (0, 0, 0, 0)

    # every material of these objects gets an active (unconnected) image node targeting this atlas
    added = []
    for o in objs:
        for slot in o.material_slots:
            mat = slot.material
            if mat is None:
                continue
            nt = mat.node_tree
            node = nt.nodes.get("__bake__") or nt.nodes.new("ShaderNodeTexImage")
            node.name = "__bake__"
            node.image = img
            nt.nodes.active = node
            node.select = True
            added.append(mat)

    select_only(objs)
    bake = scene.render.bake
    bake.margin = MARGIN_PX
    bake.margin_type = "EXTEND"
    bake.use_clear = True
    bake.target = "IMAGE_TEXTURES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False   # the bake does not denoise; see denoise.py
    if spec["mode"] == "lightmap":
        bake.use_pass_direct = True
        bake.use_pass_indirect = True
        bake.use_pass_color = False
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True, margin=bake.margin)
    else:
        bpy.ops.object.bake(type="COMBINED",
                            pass_filter={"DIRECT", "INDIRECT", "DIFFUSE", "TRANSMISSION", "EMIT"},
                            use_clear=True, margin=bake.margin)
    out = paths.lightmaps / f"{name}.exr"
    img.filepath_raw = str(out)
    img.file_format = "OPEN_EXR"
    img.save()
    dt = time.time() - t0
    log(f"{name}: {len(objs)} objetos, {size}px, {spec['mode']}, {dt:.0f}s → {out.name}")
    report["atlases"][name] = {"size": size, "mode": spec["mode"], "objects": [o.name for o in objs], "seconds": round(dt, 1),
                               "pxPerMeter": round(density, 1)}
    for o in objs:
        report["objects"][o.name] = {"atlas": name, "mode": spec["mode"]}
    for mat in set(added):
        n = mat.node_tree.nodes.get("__bake__")
        if n:
            mat.node_tree.nodes.remove(n)
    # the export uses UVMap as TEXCOORD_0 and lightmap as TEXCOORD_1
    for o in objs:
        uvs = o.data.uv_layers
        if uvs.get("UVMap"):
            uvs.active = uvs["UVMap"]
            uvs["UVMap"].active_render = True


scene.render.engine = "CYCLES"
scene.cycles.max_bounces = 8
scene.cycles.diffuse_bounces = 5
scene.cycles.glossy_bounces = 2
scene.cycles.transmission_bounces = 6

for name, spec in bake_cfg["atlases"].items():
    if args.only and name not in args.only.split(","):
        continue
    bake_atlas(name, spec)

bpy.ops.wm.save_as_mainfile(filepath=str(paths.out / "room_baked.blend"))

# ---------------------------------------------------------------------------
# Environment map: equirectangular HDR panorama from N1
# ---------------------------------------------------------------------------

if not args.skip_env:
    env = bake_cfg["env"]
    node = cfg["nodes"][env["node"]]
    cd = bpy.data.cameras.new("env_cam")
    cd.type = "PANO"
    try:
        cd.panorama_type = "EQUIRECTANGULAR"
    except AttributeError:
        cd.cycles.panorama_type = "EQUIRECTANGULAR"
    cam = bpy.data.objects.new("env_cam", cd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = b(node["position"])
    # three.js equirect convention: image center = +X, image right = +Z (three) → camera forward +X Blender
    cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
    scene.camera = cam
    scene.render.resolution_x = env["width"] // (2 if draft else 1)
    scene.render.resolution_y = env["height"] // (2 if draft else 1)
    scene.render.resolution_percentage = 100
    scene.cycles.samples = max(32, samples // 2)
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = "HDR"
    scene.view_settings.view_transform = "Standard"
    out = paths.env / f"room_{env['node']}.hdr"
    scene.render.filepath = str(out)
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    report["env"] = {"file": out.name, "seconds": round(time.time() - t0, 1)}
    log(f"env map → {out.name} ({time.time() - t0:.0f}s)")

    # sky only (what the windows show in the app): same panorama with every object hidden,
    # display-referred (AgX) JPEG so the app can draw it as is
    for o in scene.objects:
        o.hide_render = o is not cam
    scene.view_settings.view_transform = "AgX"
    scene.cycles.samples = 16
    scene.render.resolution_x = 2048
    scene.render.resolution_y = 1024
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 90
    sky = paths.env / "sky.jpg"
    scene.render.filepath = str(sky)
    bpy.ops.render.render(write_still=True)
    log(f"sky → {sky.name}")

(paths.lightmaps / "bake.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
