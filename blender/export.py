"""npm run blender:export — exports blender/out/room.glb (static room + glass/flames, UV2 `lightmap`)
and blender/out/props.glb (shelf props), both without Draco, lights or cameras.

Also writes blender/out/lightmaps/assign.json: mesh name → atlas/mode (from bake.json), the input of
public/lightmaps/manifest.json (scripts/optimize.ts).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bpy  # type: ignore  # noqa: E402

from common import Paths, log, script_args  # noqa: E402

args = script_args()
paths = Paths(args.root)
baked = paths.out / "room_baked.blend"
src = baked if baked.exists() else paths.blend
bpy.ops.wm.open_mainfile(filepath=str(src))
log(f"export de {src.name}")

KNOWN = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}


def lightmap_uv_reference(objs):
    """The exporter only writes UV maps that materials use: give every baked material a tiny
    occlusion texture read through the `lightmap` UV map (glTF Material Output → Occlusion), so the
    layer is exported as TEXCOORD_1. optimize.ts removes the occlusion texture afterwards."""
    dummy = bpy.data.images.get("__lm_ref__") or bpy.data.images.new("__lm_ref__", 4, 4)
    dummy.generated_color = (1, 1, 1, 1)
    done = set()
    for o in objs:
        if o.type != "MESH" or "lightmap" not in o.data.uv_layers:
            continue
        for slot in o.material_slots:
            mat = slot.material
            if mat is None or mat.name in done:
                continue
            done.add(mat.name)
            nt = mat.node_tree
            grp = bpy.data.node_groups.get("glTF Material Output")
            if grp is None:
                grp = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
                grp.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
                grp.interface.new_socket(name="Thickness", in_out="INPUT", socket_type="NodeSocketFloat")
            gnode = nt.nodes.new("ShaderNodeGroup")
            gnode.node_tree = grp
            uv = nt.nodes.new("ShaderNodeUVMap")
            uv.uv_map = "lightmap"
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = dummy
            tex.name = "__lm_ref__"
            sep = nt.nodes.new("ShaderNodeSeparateColor")
            nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
            nt.links.new(tex.outputs["Color"], sep.inputs["Color"])
            nt.links.new(sep.outputs["Red"], gnode.inputs["Occlusion"])


def export(filepath, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    opts = dict(
        filepath=str(filepath), export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_materials="EXPORT", export_image_format="AUTO",
        export_lights=False, export_cameras=False, export_extras=True,
        export_draco_mesh_compression_enable=False, export_vertex_color="MATERIAL",
    )
    opts = {k: v for k, v in opts.items() if k in KNOWN or k == "filepath"}
    bpy.ops.export_scene.gltf(**opts)
    log(f"{filepath.name}: {len(objs)} objetos, {filepath.stat().st_size / 1e6:.1f} MB")


def collect(coll_names):
    objs = []
    for name in coll_names:
        coll = bpy.data.collections.get(name)
        if coll:
            objs += [o for o in coll.all_objects if o.type in {"MESH", "EMPTY"}]
    return objs


room_objs = collect(["room", "dynamic"])
lightmap_uv_reference(room_objs)
export(paths.out / "room.glb", room_objs)
export(paths.out / "props.glb", collect(["props"]))

bake_report = paths.lightmaps / "bake.json"
assign = json.loads(bake_report.read_text(encoding="utf-8"))["objects"] if bake_report.exists() else {}
# glTF mesh names follow the object names; multi-material objects become one primitive per material
(paths.lightmaps / "assign.json").write_text(json.dumps(assign, indent=2), encoding="utf-8")
log(f"assign.json: {len(assign)} objetos com lightmap")
