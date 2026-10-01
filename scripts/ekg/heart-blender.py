"""
在 Blender 裡把 heart-prep.py 的輸出組成網頁用的 GLB。

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/ekg/heart-blender.py

做的事：匯入各結構表面 → 輕度平滑、減面 → 材質與中英名稱 → 傳導系統管線與節點
→ 電極標記 → 存 scripts/ekg/build/heart.blend（可以打開目視檢查）
→ 匯出 assets/models/ekg/heart.glb，並算兩張預覽圖（build/preview-*.png）。

座標：prep 是 Y 朝上（three.js），Blender 是 Z 朝上，所以匯入時繞 X 轉 90°；
glTF 匯出（+Y up）會再轉回來，網頁拿到的就是 +x 左、+y 頭、+z 前。
"""
import json
import math
from pathlib import Path

import bmesh
import bpy
import mathutils

ROOT = Path(bpy.path.abspath("//")) if bpy.data.filepath else Path(__file__).resolve().parents[2]
BUILD = ROOT / "scripts/ekg/build"
GLB = ROOT / "assets/models/ekg/heart.glb"
PREP = json.load(open(BUILD / "heart-prep.json"))
R = mathutils.Matrix.Rotation(math.radians(90), 4, "X")   # Y 朝上 → Z 朝上

# 名稱、中文、顏色、減面比例、透明度
PARTS = {
    "LV":             ("左心室 Left ventricle",      (0.72, 0.20, 0.20), 0.30, 1.0),
    "RV":             ("右心室 Right ventricle",     (0.84, 0.38, 0.34), 0.30, 1.0),
    "LA":             ("左心房 Left atrium",         (0.80, 0.52, 0.44), 0.35, 1.0),
    "RA":             ("右心房 Right atrium",        (0.88, 0.60, 0.50), 0.35, 1.0),
    "Aorta":          ("主動脈 Aorta",               (0.78, 0.24, 0.30), 0.40, 1.0),
    "PulmArtery":     ("肺動脈 Pulmonary artery",    (0.36, 0.46, 0.78), 0.40, 1.0),
    "MitralValve":    ("二尖瓣 Mitral valve",        (0.94, 0.92, 0.82), 0.40, 0.35),
    "TricuspidValve": ("三尖瓣 Tricuspid valve",     (0.94, 0.92, 0.82), 0.40, 0.35),
    "AorticValve":    ("主動脈瓣 Aortic valve",      (0.94, 0.92, 0.82), 0.40, 0.35),
    "PulmonaryValve": ("肺動脈瓣 Pulmonary valve",   (0.94, 0.92, 0.82), 0.40, 0.35),
    "AVPlane":        ("房室纖維環 AV fibrous ring", (0.70, 0.70, 0.66), 0.40, 0.35),
}
PATHS = {   # 路徑名稱 → (中文, 管徑 mm)
    "Internodal_ant":  ("前結間徑路 Anterior internodal tract", 0.8),
    "Internodal_mid":  ("中結間徑路 Middle internodal tract (Wenckebach)", 0.8),
    "Internodal_post": ("後結間徑路 Posterior internodal tract (Thorel)", 0.8),
    "Bachmann":   ("巴赫曼束 Bachmann bundle", 0.9),
    "His_bundle": ("希氏束 Bundle of His", 1.3),
    "LAF": ("左前分支 Left anterior fascicle", 1.0),
    "LPF": ("左後分支 Left posterior fascicle", 1.0),
    "RBB": ("右束支 Right bundle branch", 1.0),
}
CORONARY = {   # 名稱 → (中文, 起點管徑 mm, 終點管徑 mm)
    "LM":  ("左主幹 Left main coronary artery", 2.0, 2.0),
    "LAD": ("左前降支 Left anterior descending", 1.7, 0.7),
    "LCx": ("左迴旋支 Left circumflex", 1.6, 0.9),
    "RCA": ("右冠狀動脈 Right coronary artery", 1.9, 1.1),
    "PDA": ("後降支 Posterior descending artery", 1.0, 0.5),
}
NODES = {"SA": ("竇房結 SA node", 2.5), "AVN": ("房室結 AV node", 2.0)}


def mm(v):
    return R @ (mathutils.Vector(v) / 1000.0)


def material(name, rgb, alpha=1.0, emit=0.0):
    m = bpy.data.materials.new("M_" + name)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = 0.55
    if emit:
        b.inputs["Emission Color"].default_value = (*rgb, 1)
        b.inputs["Emission Strength"].default_value = emit
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
    m.diffuse_color = (*rgb, alpha)
    return m


def link(obj, coll):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    coll.objects.link(obj)


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def heart(coll):
    stats = {}
    for name, (zh, rgb, ratio, alpha) in PARTS.items():
        bpy.ops.wm.ply_import(filepath=str(BUILD / "ply" / f"{name}.ply"))
        o = bpy.context.selected_objects[0]
        o.name = o.data.name = name
        o.data.transform(R)
        link(o, coll)
        bpy.context.view_layer.objects.active = o
        dc = o.modifiers.new("decimate", "DECIMATE")
        dc.ratio = ratio
        for mod in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        o.data.shade_smooth()
        o.data.materials.append(material(name, rgb, alpha))
        o.color = (*rgb, alpha)
        o["label"] = zh
        o["kind"] = "chamber" if name in ("LV", "RV", "LA", "RA") else "structure"
        stats[name] = len(o.data.polygons)
    return stats


def conduction(coll):
    mat = material("Conduction", (1.0, 0.86, 0.25), emit=1.5)
    for name, (zh, r) in PATHS.items():
        pts = PREP["paths"][name]
        cu = bpy.data.curves.new(name, "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = r / 1000.0
        cu.bevel_resolution = 2
        cu.use_fill_caps = True
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for p, v in zip(sp.points, pts):
            p.co = (*mm(v), 1)
        o = bpy.data.objects.new("Cond_" + name, cu)
        coll.objects.link(o)
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.convert(target="MESH")
        o.select_set(False)
        o.data.materials.append(mat)
        o.data.shade_smooth()
        o.color = (1.0, 0.86, 0.25, 1)
        o["label"], o["kind"] = zh, "conduction"
        o["compute"] = not name.startswith("Internodal")   # 結間徑路只顯示
        # 路徑點也存起來，網頁可以沿著它播放電流
        o["path_mm"] = json.dumps(pts)
    for name, (zh, r) in NODES.items():
        me = bpy.data.meshes.new("Node_" + name)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=r / 1000.0)
        bm.to_mesh(me)
        bm.free()
        me.shade_smooth()
        me.materials.append(mat)
        o = bpy.data.objects.new("Node_" + name, me)
        o.location = mm(PREP["landmarks"][name])
        o.color = (1.0, 0.86, 0.25, 1)
        o["label"], o["kind"] = zh, "node"
        coll.objects.link(o)


def coronaries(coll):
    """冠狀動脈主幹（右優勢型），由粗漸細。"""
    rgb = (0.86, 0.10, 0.12)
    mat = material("Coronary", rgb)
    for name, (zh, r0, r1) in CORONARY.items():
        pts = PREP["coronaries"][name]
        cu = bpy.data.curves.new(name, "CURVE")
        cu.dimensions, cu.bevel_depth, cu.bevel_resolution = "3D", r0 / 1000.0, 3
        cu.use_fill_caps = True
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for i, (p, v) in enumerate(zip(sp.points, pts)):
            p.co = (*mm(v), 1)
            p.radius = 1 + (r1 / r0 - 1) * i / max(1, len(pts) - 1)
        o = bpy.data.objects.new("Coronary_" + name, cu)
        coll.objects.link(o)
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.convert(target="MESH")
        o.select_set(False)
        o.data.materials.append(mat)
        o.data.shade_smooth()
        o.color = (*rgb, 1)
        o["label"], o["kind"] = zh, "coronary"


def electrodes(coll):
    mat = material("Electrode", (0.20, 0.55, 0.95))
    for name, v in PREP["electrodes"].items():
        if name.startswith("V"):
            me = bpy.data.meshes.new("Electrode_" + name)
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.005)
            bm.to_mesh(me)
            bm.free()
            me.materials.append(mat)
            o = bpy.data.objects.new("Electrode_" + name, me)
            o.color = (0.2, 0.55, 0.95, 1)
        else:   # 肢體電極離心臟 30 cm，只放空物件記位置
            o = bpy.data.objects.new("Electrode_" + name, None)
            o.empty_display_size = 0.01
        o.location = mm(v)
        o["label"], o["kind"] = name, "electrode"
        coll.objects.link(o)


def on_chest(theta, y, out=0.0):
    """胸壁上的點（mm，Y 朝上座標）；out = 往外推多少 mm。"""
    c = PREP["chest"]
    t = math.radians(theta)
    a, b = c["half_width"] + out, c["half_depth"] + out
    return (c["midline_x"] + a * math.sin(t), y, c["center_z"] + b * math.cos(t))


def theta_at(u):
    c = PREP["chest"]
    return math.degrees(math.asin(max(-1, min(1, u / c["half_width"]))))


def ics_y(n, u):
    c = PREP["chest"]
    return c["ics_y"][str(n)] - c["slope"] * abs(u)


def tube(name, pts, r, mat, coll, label, kind="guide"):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions, cu.bevel_depth, cu.bevel_resolution = "3D", r / 1000.0, 1
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, v in zip(sp.points, pts):
        p.co = (*mm(v), 1)
    o = bpy.data.objects.new(name, cu)
    coll.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o.select_set(False)
    o.data.materials.append(mat)
    o.color = tuple(mat.diffuse_color)
    o["label"], o["kind"] = label, kind
    return o


def text(name, body, at, coll, size=8.0):
    t = bpy.data.curves.new(name, "FONT")
    t.body, t.size, t.align_x = body, size / 1000.0, "CENTER"
    o = bpy.data.objects.new(name, t)
    o.location = mm(at)
    o.rotation_euler = (math.radians(90), 0, 0)      # 面向前方
    o.color = (0.1, 0.1, 0.1, 1)
    coll.objects.link(o)
    return o


def guides(coll, labels):
    """胸廓參照：胸壁、胸骨、第 2–6 肋間、中線／鎖骨中線／前腋線／腋中線。"""
    c = PREP["chest"]
    top, bottom = c["ics_y"]["2"] + 70, c["ics_y"]["7"] - 40
    # 胸壁：橢圓柱
    me = bpy.data.meshes.new("Guide_Torso")
    bm = bmesh.new()
    n = 64
    ring = lambda y: [bm.verts.new(mm(on_chest(360 * i / n, y))) for i in range(n)]
    lo, hi = ring(bottom), ring(top)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.materials.append(material("Torso", (0.80, 0.80, 0.82), alpha=0.12))
    o = bpy.data.objects.new("Guide_Torso", me)
    o.color = (0.8, 0.8, 0.82, 0.12)
    o["label"], o["kind"] = "胸壁 Chest wall", "guide"
    coll.objects.link(o)
    # 胸骨：胸壁前方的條帶
    me = bpy.data.meshes.new("Guide_Sternum")
    bm = bmesh.new()
    th = [theta_at(-15), theta_at(15)]
    y0, y1 = c["ics_y"]["2"] + 45, c["ics_y"]["6"] - 15
    v = [bm.verts.new(mm(on_chest(t, y, 1))) for y in (y0, y1) for t in th]
    bm.faces.new((v[2], v[3], v[1], v[0]))
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material("Sternum", (0.92, 0.90, 0.84)))
    o = bpy.data.objects.new("Guide_Sternum", me)
    o.color = (0.92, 0.9, 0.84, 1)
    o["label"], o["kind"] = "胸骨 Sternum", "guide"
    coll.objects.link(o)
    # 肋間：從右側鎖骨中線到左側腋中線
    grey = material("GuideLine", (0.45, 0.45, 0.50))
    hl = material("GuideLineKey", (0.95, 0.45, 0.25))
    for k in range(2, 7):
        pts = []
        for t in range(-40, 91, 3):
            u = c["half_width"] * math.sin(math.radians(t))
            pts.append(on_chest(t, ics_y(k, u), 1))
        nth = {2: "2nd", 3: "3rd"}.get(k, f"{k}th")
        tube(f"Guide_ICS{k}", pts, 0.6, hl if k in (4, 5) else grey, coll, f"第 {k} 肋間 {nth} ICS")
        text(f"Lbl_ICS{k}", f"{nth} ICS", on_chest(-44, ics_y(k, 100), 2), labels, 6)
    # 垂直參考線
    for key, th, zh in [("Midline", 0.0, "胸骨中線 Midline"), ("MCL", theta_at(c["mcl"]), "鎖骨中線 MCL"),
                        ("AAL", c["aal_deg"], "前腋線 AAL"), ("MAL", 90.0, "腋中線 MAL")]:
        pts = [on_chest(th, y, 1) for y in (top - 20, bottom + 10)]
        tube(f"Guide_{key}", pts, 0.5, grey, coll, zh)
        text(f"Lbl_{key}", key, on_chest(th, top - 10, 2), labels, 6)
    for k, v in PREP["electrodes"].items():
        if k.startswith("V"):
            text(f"Lbl_{k}", k, (v[0], v[1] + 9, v[2] + 4), labels, 7)


def frame_viewports():
    """存檔時讓 3D 視窗對準心臟（模型只有 13 cm，預設視角太遠）。"""
    for scr in bpy.data.screens:
        for a in scr.areas:
            if a.type != "VIEW_3D":
                continue
            sp = a.spaces[0]
            sp.clip_start, sp.clip_end = 0.001, 50
            sp.shading.color_type = "OBJECT"
            r3 = sp.region_3d
            r3.view_location = (0, 0, 0)
            r3.view_distance = 0.45
            r3.view_rotation = mathutils.Euler((math.radians(80), 0, math.radians(20))).to_quaternion()


def previews():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "OBJECT"
    sc.render.resolution_x = sc.render.resolution_y = 900
    sc.render.film_transparent = False
    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 0.17
    sc.camera = cam
    views = {
        "anterior": ((0, -0.6, 0), (math.radians(90), 0, 0)),          # 從前方看
        "left":     ((0.6, 0, 0), (math.radians(90), 0, math.radians(90))),  # 從病人左側看
    }
    guide = [o for o in bpy.data.objects if o.name.startswith(("Guide_", "Lbl_"))]
    # 心臟外觀預覽（不透明）只看冠狀動脈，傳導系統在 xray 版看
    for o in guide:
        o.hide_render = True
    for xray in (False, True):
        sc.display.shading.show_xray = xray
        sc.display.shading.xray_alpha = 0.25
        for k, (loc, rot) in views.items():
            cam.location, cam.rotation_euler = loc, rot
            sc.render.filepath = str(BUILD / f"preview-{k}{'-xray' if xray else ''}.png")
            bpy.ops.render.render(write_still=True)
    # 全景：帶胸廓參照
    for o in guide:
        o.hide_render = False
    sc.display.shading.show_xray = True
    sc.display.shading.xray_alpha = 0.45
    cam.data.ortho_scale = 0.40
    overview = {
        "chest-anterior": ((0, -0.8, 0), (math.radians(90), 0, 0)),
        "chest-top": ((0, 0, 0.8), (0, 0, 0)),         # 從頭往下看：上 = 背側、右 = 病人左（同 Fig 1.10）
    }
    for k, (loc, rot) in overview.items():
        cam.location, cam.rotation_euler = loc, rot
        sc.render.filepath = str(BUILD / f"preview-{k}.png")
        bpy.ops.render.render(write_still=True)
    sc.display.shading.show_xray = False
    bpy.data.objects.remove(cam)


def main():
    reset()
    bpy.context.scene.unit_settings.system = "METRIC"
    stats = heart(collection("Heart"))
    conduction(collection("Conduction"))
    coronaries(collection("Coronary"))
    electrodes(collection("Electrodes"))
    guides(collection("ChestGuide"), collection("GuideLabels"))
    bpy.context.scene["source"] = json.dumps(PREP["source"], ensure_ascii=False)
    previews()
    frame_viewports()
    bpy.ops.wm.save_as_mainfile(filepath=str(BUILD / "heart.blend"))
    GLB.parent.mkdir(parents=True, exist_ok=True)
    # 文字標籤只留在 .blend 方便檢查，不匯出（網頁自己畫標籤）
    for o in bpy.data.objects:
        o.select_set(not o.name.startswith("Lbl_"))
    bpy.ops.export_scene.gltf(
        use_selection=True,
        filepath=str(GLB), export_format="GLB", export_extras=True, export_yup=True,
        export_apply=True, export_cameras=False, export_lights=False, export_materials="EXPORT",
    )
    print("FACES", json.dumps(stats), "TOTAL", sum(stats.values()))
    print("GLB", GLB, GLB.stat().st_size)


main()
