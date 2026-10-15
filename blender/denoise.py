"""npm run blender:denoise — denoises the baked lightmaps and encodes them for the web.

For each blender/out/lightmaps/<atlas>.exr:
  1. Compositor (Blender 5.x API: scene.compositing_node_group) Image → Denoise → Group Output,
     rendered at the atlas resolution → <atlas>_dn.exr. The bake margin (EXTEND) already dilated the
     islands, so the denoiser does not pull black from empty texels; a final dilation pass covers gaps.
  2. RGBM encoding (8-bit PNG, Non-Color): rgb = c / (M · range), alpha = M; decode c = rgb · a · range.
     `range` per atlas goes to lightmaps.json (read by export/optimize → public/lightmaps/manifest.json).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bpy  # type: ignore  # noqa: E402
import numpy as np  # noqa: E402

from common import Paths, log, script_args  # noqa: E402

args = script_args([("--no-denoise", {"action": "store_true"})])
paths = Paths(args.root)
bake_cfg = json.loads(paths.bake_config.read_text(encoding="utf-8"))
scene = bpy.context.scene
result = {}


def read_pixels(img):
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)


def denoise(src: Path, dst: Path) -> bool:
    img = bpy.data.images.load(str(src), check_existing=False)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    tree = bpy.data.node_groups.new(f"denoise_{src.stem}", "CompositorNodeTree")
    try:
        tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        n_img = tree.nodes.new("CompositorNodeImage")
        n_img.image = img
        n_dn = tree.nodes.new("CompositorNodeDenoise")
        for key in ("prefilter",):
            if hasattr(n_dn, key):
                setattr(n_dn, key, "ACCURATE")
        out = tree.nodes.new("NodeGroupOutput")
        tree.links.new(n_img.outputs["Image"], n_dn.inputs["Image"])
        tree.links.new(n_dn.outputs["Image"], out.inputs[0])
        scene.compositing_node_group = tree
        scene.render.use_compositing = True
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.render.resolution_x = w
        scene.render.resolution_y = h
        scene.render.resolution_percentage = 100
        scene.render.film_transparent = False
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
        scene.display_settings.display_device = "sRGB"
        scene.render.image_settings.file_format = "OPEN_EXR"
        scene.render.image_settings.color_depth = "32"
        scene.render.filepath = str(dst)
        if scene.camera is None:
            cam = bpy.data.objects.new("dn_cam", bpy.data.cameras.new("dn_cam"))
            scene.collection.objects.link(cam)
            scene.camera = cam
        bpy.ops.render.render(write_still=True)
        return dst.exists()
    except Exception as err:  # noqa: BLE001 — any API mismatch falls back to the raw bake
        log(f"denoise falhou em {src.name}: {err}")
        return False


def dilate(px, coverage, iterations=8):
    """Fills uncovered texels from covered neighbors (safety net after denoising)."""
    filled = coverage.copy()
    rgb = px[:, :, :3].copy()
    for _ in range(iterations):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(filled.shape, dtype=np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            sh = np.roll(np.roll(filled, dy, 0), dx, 1)
            acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * sh[:, :, None]
            cnt += sh
        grow = (~filled) & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        filled |= grow
    return rgb


for atlas, spec in bake_cfg["atlases"].items():
    src = paths.lightmaps / f"{atlas}.exr"
    if not src.exists():
        log(f"{atlas}: sem bake ({src.name} ausente)")
        continue
    raw = bpy.data.images.load(str(src), check_existing=False)
    raw.colorspace_settings.name = "Non-Color"
    raw_px = read_pixels(raw)
    coverage = raw_px[:, :, 3] > 0.5
    dn = paths.lightmaps / f"{atlas}_dn.exr"
    ok = False if args.no_denoise else denoise(src, dn)
    if ok:
        dimg = bpy.data.images.load(str(dn), check_existing=False)
        dimg.colorspace_settings.name = "Non-Color"
        px = read_pixels(dimg)
        if px.shape != raw_px.shape:
            log(f"{atlas}: denoise mudou a resolução, usando o bake bruto")
            px = raw_px
            ok = False
    else:
        px = raw_px
    rgb = dilate(px, coverage if coverage.any() else np.ones(coverage.shape, bool))
    rgb = np.maximum(rgb, 0.0)

    # RGBM
    # small hot spots (flames, the lamp body) may clip: precision in the darks matters more
    peak = float(np.percentile(rgb.max(axis=2)[coverage] if coverage.any() else rgb.max(axis=2), 99.7)) if rgb.size else 1.0
    rng = float(max(1.0, np.ceil(peak * 1.25)))
    m = np.clip(rgb.max(axis=2) / rng, 1.0 / 255.0, 1.0)
    m = np.ceil(m * 255.0) / 255.0
    enc = np.clip(rgb / (m[:, :, None] * rng), 0.0, 1.0)
    h, w = m.shape
    out = np.concatenate([enc, m[:, :, None]], axis=2).astype(np.float32)
    png = bpy.data.images.new(f"{atlas}_rgbm", w, h, alpha=True, float_buffer=False)
    png.colorspace_settings.name = "Non-Color"
    png.alpha_mode = "STRAIGHT"
    png.pixels.foreach_set(out.ravel())
    png_path = paths.lightmaps / f"{atlas}.png"
    png.filepath_raw = str(png_path)
    png.file_format = "PNG"
    png.save()
    result[atlas] = {"file": png_path.name, "encoding": "rgbm", "range": rng, "size": w, "mode": spec["mode"],
                     "denoised": ok, "peak": round(peak, 3), "mean": round(float(rgb[coverage].mean()) if coverage.any() else 0.0, 4)}
    log(f"{atlas}: denoise={'ok' if ok else 'não'}, RGBM range {rng}, pico {peak:.2f} → {png_path.name}")

(paths.lightmaps / "lightmaps.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
