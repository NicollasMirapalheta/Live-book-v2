"""Shared helpers for the Live Book Blender scripts.

Every script is run by scripts/blender.mjs as:
    blender -b --python-exit-code 1 -P <script> -- --root <repo> [args...]

Conventions (config/room.json -> $conventions):
    three.js: X right, Y up, Z toward the door.
    Blender:  Z up.  (x, y, z)three -> (x, -z, y)blender
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

import bpy  # type: ignore
from mathutils import Vector  # type: ignore


# ---------------------------------------------------------------------------
# Arguments and paths
# ---------------------------------------------------------------------------

def script_args(extra: list[tuple[str, dict]] | None = None) -> argparse.Namespace:
    """Parse the arguments that come after `--` on the Blender command line."""
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--quality", choices=["draft", "final"], default="draft")
    parser.add_argument("--node", default="N0")
    parser.add_argument("--samples", type=int, default=0)
    for name, kwargs in extra or []:
        parser.add_argument(name, **kwargs)
    return parser.parse_args(argv)


class Paths:
    def __init__(self, root: str):
        self.root = Path(root)
        self.config = self.root / "config" / "room.json"
        self.assets = self.root / "assets" / "source"
        self.out = self.root / "blender" / "out"
        self.blend = self.out / "room.blend"
        self.lightmaps = self.out / "lightmaps"
        self.env = self.out / "env"
        self.shots = self.root / "shots" / "blender"
        self.public_data = self.root / "public" / "data"
        self.bake_config = self.root / "blender" / "bake_config.json"
        for p in (self.out, self.lightmaps, self.env, self.shots, self.public_data):
            p.mkdir(parents=True, exist_ok=True)


def load_room(paths: Paths) -> dict:
    with open(paths.config, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

_T0 = time.time()


def log(msg: str) -> None:
    print(f"[lb] {time.time() - _T0:7.1f}s {msg}", flush=True)


def log_environment() -> None:
    log(f"Blender {bpy.app.version_string}")
    log(f"render device: {setup_gpu()}")


# ---------------------------------------------------------------------------
# Axes
# ---------------------------------------------------------------------------

def to_blender(v) -> Vector:
    """three.js (x, y, z) -> Blender (x, -z, y)."""
    x, y, z = v
    return Vector((x, -z, y))


def sun_travel_three(sun: dict) -> tuple[float, float, float]:
    """lighting.sun.travelDirectionFormula, in three.js axes."""
    e = math.radians(sun["elevationDeg"])
    lat = math.radians(sun["lateralDeg"])
    return (math.sin(lat) * math.cos(e), -math.sin(e), math.cos(lat) * math.cos(e))


def sun_rotation_blender(sun: dict):
    """Euler for a Blender Sun lamp whose -Z axis points along the travel direction."""
    travel = to_blender(sun_travel_three(sun)).normalized()
    return travel.to_track_quat("-Z", "Y").to_euler()


def kelvin_to_rgb(kelvin: float) -> tuple[float, float, float]:
    """Approximate blackbody color (Tanner Helland), linear-ish 0..1."""
    t = kelvin / 100.0
    if t <= 66:
        r = 255.0
        g = 99.4708025861 * math.log(t) - 161.1195681661
        b = 0.0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307
    else:
        r = 329.698727446 * ((t - 60) ** -0.1332047592)
        g = 288.1221695283 * ((t - 60) ** -0.0755148492)
        b = 255.0
    c = [max(0.0, min(255.0, x)) / 255.0 for x in (r, g, b)]
    return (c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2)


def hex_to_linear(hex_str: str) -> tuple[float, float, float, float]:
    h = hex_str.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (lin[0], lin[1], lin[2], 1.0)


# ---------------------------------------------------------------------------
# Render device
# ---------------------------------------------------------------------------

def setup_gpu() -> str:
    """Enable the best Cycles GPU backend available; returns a description."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
    except KeyError:
        scene.cycles.device = "CPU"
        return "CPU (cycles addon prefs unavailable)"
    for backend in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue
        prefs.refresh_devices()
        gpus = [d for d in prefs.devices if d.type == backend]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == backend
            scene.cycles.device = "GPU"
            return f"GPU {backend}: " + ", ".join(d.name for d in gpus)
    scene.cycles.device = "CPU"
    return "CPU"


# ---------------------------------------------------------------------------
# Scene helpers
# ---------------------------------------------------------------------------

def reset_scene() -> None:
    bpy.ops.wm.read_homefile(use_empty=True)


def open_room(paths: Paths) -> None:
    if not paths.blend.exists():
        raise SystemExit(f"{paths.blend} não existe: rode `npm run blender:build` antes.")
    bpy.ops.wm.open_mainfile(filepath=str(paths.blend))


def save_room(paths: Paths) -> None:
    bpy.ops.wm.save_as_mainfile(filepath=str(paths.blend))
    log(f"saved {paths.blend}")


def collection(name: str):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def link(obj, coll_name: str):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    collection(coll_name).objects.link(obj)
    return obj


def asset_dir(paths: Paths, key: str) -> Path:
    return paths.assets / key


def find_map(paths: Paths, key: str, map_name: str) -> Path | None:
    """Find a Poly Haven map file (Diffuse, nor_gl, arm, Displacement) for an asset key."""
    folder = asset_dir(paths, key)
    if not folder.exists():
        return None
    token = map_name.lower()
    aliases = {"diffuse": ("diff", "diffuse"), "nor_gl": ("nor_gl",), "arm": ("arm",), "displacement": ("disp", "displacement")}
    for f in sorted(folder.rglob("*")):
        n = f.name.lower()
        if f.is_file() and any(a in n for a in aliases.get(token, (token,))):
            return f
    return None


def env_flag(name: str) -> bool:
    return os.environ.get(name, "") not in ("", "0", "false")
