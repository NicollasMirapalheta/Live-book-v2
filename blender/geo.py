"""Geometry and material helpers for the Live Book build scripts.

All coordinates passed to these helpers are in three.js space (X right, Y up, Z toward the door);
conversion to Blender (Z up) happens here: (x, y, z)three -> (x, -z, y)blender.
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import bmesh  # type: ignore
import bpy  # type: ignore
from mathutils import Matrix, Vector  # type: ignore

from common import collection, hex_to_linear

TEX_DIR: Path | None = None


def set_texture_dir(path: Path) -> None:
    global TEX_DIR
    TEX_DIR = path


def b(v) -> Vector:
    """three.js -> Blender coordinates."""
    return Vector((v[0], -v[2], v[1]))


def t(v) -> Vector:
    """Blender -> three.js coordinates."""
    return Vector((v[0], v[2], -v[1]))


# ---------------------------------------------------------------------------
# Mesh builder
# ---------------------------------------------------------------------------

AXES = {"x": 0, "y": 1, "z": 2}


class MeshBuilder:
    """Accumulates boxes / quads (three.js space) with world-scale UVs into one bmesh."""

    def __init__(self, name: str, vertex_colors: bool = False):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.col = self.bm.loops.layers.float_color.new("Col") if vertex_colors else None
        self.mat_index: dict[str, int] = {}

    def _mat(self, material: str | None) -> int:
        if material is None:
            return 0
        if material not in self.mat_index:
            self.mat_index[material] = len(self.mat_index)
        return self.mat_index[material]

    def face(self, pts3, uvs, material: str | None = None, color=None):
        verts = [self.bm.verts.new(b(p)) for p in pts3]
        f = self.bm.faces.new(verts)
        f.material_index = self._mat(material)
        for loop, uv in zip(f.loops, uvs):
            loop[self.uv].uv = uv
            if self.col is not None:
                loop[self.col] = color or (1.0, 1.0, 1.0, 1.0)
        return f

    def box(self, mn, mx, tile: float = 1.0, grain: str = "x", material: str | None = None,
            uv_offset=None, color=None, skip: tuple[str, ...] = ()):
        """Axis-aligned box in three.js space. `grain` is the world axis that follows texture U.
        `skip` lists faces to omit: '-x', '+x', '-y', '+y', '-z', '+z'."""
        x0, y0, z0 = mn
        x1, y1, z1 = mx
        if uv_offset is None:
            # a different patch of the texture for every piece: breaks the repetition of the grain
            h = math.sin(x0 * 12.9898 + y0 * 78.233 + z0 * 37.719 + x1 * 4.1 + z1 * 2.3) * 43758.5453
            ou, ov = h - math.floor(h), (h * 7.31) - math.floor(h * 7.31)
        else:
            ou, ov = uv_offset

        def uv_for(p, normal_axis):
            # the two in-plane axes, ordered so U follows `grain` when possible
            plane = [a for a in "xyz" if a != normal_axis]
            if grain in plane:
                u_axis = grain
                v_axis = plane[0] if plane[1] == grain else plane[1]
            else:
                u_axis, v_axis = (plane[0], plane[1]) if normal_axis != "x" else ("z", "y")
                if normal_axis == "z":
                    u_axis, v_axis = "x", "y"
            return (p[AXES[u_axis]] / tile + ou, p[AXES[v_axis]] / tile + ov)

        faces = {
            "-x": ([(x0, y0, z1), (x0, y1, z1), (x0, y1, z0), (x0, y0, z0)], "x"),
            "+x": ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], "x"),
            "-y": ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], "y"),
            "+y": ([(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)], "y"),
            "-z": ([(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)], "z"),
            "+z": ([(x1, y0, z1), (x1, y1, z1), (x0, y1, z1), (x0, y0, z1)], "z"),
        }
        for key, (pts, axis) in faces.items():
            if key in skip:
                continue
            self.face(pts, [uv_for(p, axis) for p in pts], material, color)

    def finish(self, coll: str, materials: dict[str, bpy.types.Material] | list | None = None,
               merge: bool = True) -> bpy.types.Object:
        """Faces are wound outward by construction (box() and face()); no normal recalculation:
        on open boxes (a face skipped against a wall) it flips normals inward and the bake lights
        them from inside."""
        if merge:
            bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        collection(coll).objects.link(obj)
        if isinstance(materials, dict):
            ordered = sorted(self.mat_index.items(), key=lambda kv: kv[1])
            for key, _ in ordered:
                mesh.materials.append(materials[key])
            if not ordered and materials:
                mesh.materials.append(next(iter(materials.values())))
        elif materials:
            for m in materials:
                mesh.materials.append(m)
        for poly in mesh.polygons:
            poly.use_smooth = False
        return obj


def bevel(obj, width=0.006, segments=2, angle=40.0):
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    mod.use_clamp_overlap = True
    mod.harden_normals = True
    return mod


def weighted_normals(obj):
    mod = obj.modifiers.new("wnormals", "WEIGHTED_NORMAL")
    mod.keep_sharp = True
    return mod


def lathe(name: str, profile, segments: int = 20, coll: str = "room", material=None,
          tile: float = 0.5, caps: bool = True) -> bpy.types.Object:
    """Solid of revolution around the local Y (three.js up) axis. profile: [(radius, y), ...] bottom→top."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    rings = []
    for r, y in profile:
        ring = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            ring.append(bm.verts.new(b((r * math.cos(a), y, r * math.sin(a)))))
        rings.append(ring)
    length = 0.0
    vs = [0.0]
    for (r0, y0), (r1, y1) in zip(profile, profile[1:]):
        length += math.hypot(r1 - r0, y1 - y0)
        vs.append(length)
    for k in range(len(rings) - 1):
        for i in range(segments):
            j = (i + 1) % segments
            f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            u0, u1 = i / segments, (i + 1) / segments
            for loop, (u, v) in zip(f.loops, ((u0, vs[k]), (u1, vs[k]), (u1, vs[k + 1]), (u0, vs[k + 1]))):
                loop[uv].uv = (u * 0.3 / tile, v / tile)
    # caps
    if caps and profile[0][0] > 0:
        bm.faces.new(list(reversed(rings[0])))
    if caps and profile[-1][0] > 0:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    collection(coll).objects.link(obj)
    if material:
        mesh.materials.append(material)
    return obj


def place(obj, position3=(0, 0, 0), rot_y_deg: float = 0.0):
    """Places an object at a three.js position, rotated around three.js Y (= Blender Z)."""
    obj.location = b(position3)
    obj.rotation_euler = (0.0, 0.0, math.radians(rot_y_deg))
    return obj


def join(objs, name: str):
    """Joins objects (applying their transforms into the first one) and returns it."""
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    return obj


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


# ---------------------------------------------------------------------------
# Materials (node setups the glTF exporter understands)
# ---------------------------------------------------------------------------

def _image(name: str, non_color: bool):
    assert TEX_DIR is not None, "set_texture_dir() first"
    for ext in ("jpg", "png"):
        path = TEX_DIR / f"{name}.{ext}"
        if path.exists():
            img = bpy.data.images.load(str(path), check_existing=True)
            img.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
            return img
    raise FileNotFoundError(f"textura {name} não encontrada em {TEX_DIR} (rode npm run textures)")


def _clear(mat):
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (600, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (300, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return nt, bsdf


def pbr_material(name: str, prefix: str, normal_strength: float = 1.0, vertex_color: bool = False,
                 color_texture: str | None = None, arm: bool = True, metallic: float | None = None):
    """Principled BSDF fed by <prefix>_color / _normal / _arm from blender/out/textures."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt, bsdf = _clear(mat)
    col = nt.nodes.new("ShaderNodeTexImage")
    col.image = _image(color_texture or f"{prefix}_color", False)
    col.location = (-600, 300)
    if vertex_color:
        attr = nt.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        attr.location = (-600, 500)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.location = (-250, 350)
        nt.links.new(col.outputs["Color"], mix.inputs[6])
        nt.links.new(attr.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    else:
        nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    if arm:
        armn = nt.nodes.new("ShaderNodeTexImage")
        armn.image = _image(f"{prefix}_arm", True)
        armn.location = (-600, 0)
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        sep.location = (-250, 0)
        nt.links.new(armn.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        if metallic is None:
            nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    if metallic is not None:
        bsdf.inputs["Metallic"].default_value = metallic
    nor = nt.nodes.new("ShaderNodeTexImage")
    nor.image = _image(f"{prefix}_normal", True)
    nor.location = (-600, -300)
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = normal_strength
    nmap.location = (-250, -300)
    nt.links.new(nor.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def flat_material(name: str, color_hex: str, roughness: float = 0.5, metallic: float = 0.0,
                  normal_prefix: str | None = None, normal_strength: float = 0.3,
                  emission_hex: str | None = None, emission_strength: float = 0.0,
                  transmission: float = 0.0, alpha: float = 1.0):
    """Uniform material (paint, brass, glass, emitters). Variation comes from normal maps and the bake."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt, bsdf = _clear(mat)
    bsdf.inputs["Base Color"].default_value = hex_to_linear(color_hex)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if normal_prefix:
        nor = nt.nodes.new("ShaderNodeTexImage")
        nor.image = _image(f"{normal_prefix}_normal", True)
        nor.location = (-600, -300)
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nmap.location = (-250, -300)
        nt.links.new(nor.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if emission_hex:
        bsdf.inputs["Emission Color"].default_value = hex_to_linear(emission_hex)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if transmission:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
    return mat


def rng(seed: int) -> random.Random:
    return random.Random(seed)


def look_at_euler(origin: Vector, target: Vector):
    return (target - origin).to_track_quat("-Z", "Y").to_euler()


__all__ = [
    "MeshBuilder", "bevel", "weighted_normals", "lathe", "place", "join", "apply_modifiers",
    "pbr_material", "flat_material", "set_texture_dir", "b", "t", "rng", "look_at_euler", "Matrix",
]
