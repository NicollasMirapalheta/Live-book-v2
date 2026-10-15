"""npm run blender:preview -- --node N0 [--samples 64] [--approval]
Cycles preview render of cam_<node> → shots/blender/<node>.png.
N0 renders at 500×542 (reference aspect); other nodes at 960×540.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bpy  # type: ignore  # noqa: E402

from common import Paths, log, log_environment, open_room, script_args, setup_gpu  # noqa: E402

args = script_args([("--width", {"type": int, "default": 0}), ("--height", {"type": int, "default": 0}),
                    ("--exposure", {"type": float, "default": None})])
paths = Paths(args.root)
open_room(paths)
log_environment()
scene = bpy.context.scene
setup_gpu()

cam = bpy.data.objects.get(f"cam_{args.node}")
if cam is None:
    raise SystemExit(f"câmera cam_{args.node} não existe")
scene.camera = cam

if args.width and args.height:
    w, h = args.width, args.height
elif args.node == "N0":
    w, h = 500, 542
else:
    w, h = 960, 540
scene.render.resolution_x = w
scene.render.resolution_y = h
scene.render.resolution_percentage = 100

# lensShiftY is a fraction of the frame HEIGHT (positive shows more floor);
# Blender's shift is a fraction of the larger side, positive moves the view up.
shift = float(cam.get("lensShiftY", 0.0))
cam.data.shift_y = -shift * h / max(w, h)

scene.cycles.samples = args.samples or 64
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 3
scene.cycles.transmission_bounces = 6
if args.exposure is not None:
    scene.view_settings.exposure = args.exposure

out = paths.shots / f"{args.node}.png"
scene.render.filepath = str(out)
scene.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
log(f"preview {args.node} {w}×{h} samples={scene.cycles.samples} → {out}")
