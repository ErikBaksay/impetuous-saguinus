"""Reference roadster, authored in Blender. X across, -Y forward, Z up, metres.

build_roadster(scene) is shared by the full asset build and the car-only update.
The latter preserves the existing driver and every scenery asset in the atelier.
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector

ASSET = 'saguinus-roadster'
RADIUS = .53
AXLES = (-1.69, 1.69)
DRIVER_PREFIXES = ('Driver_', 'Cream_chest', 'Ivory_mane_lock',
                   'Swept_cotton_crown', 'Dark_face', 'Soft_muzzle', 'Nose',
                   'Ear', 'Eye_', 'Brow', 'Upper_arm', 'Forearm',
                   'Gripping_hand', 'Fingers', 'Curled_tail')


def build_roadster(scene):
    parts = []

    def material(name, color, metal=0, rough=.45, emission=0, coat=0):
        name = 'Roadster / ' + name
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        m.diffuse_color = (*color, 1)
        p = m.node_tree.nodes.get('Principled BSDF')
        for key, value in [('Base Color', (*color, 1)), ('Metallic', metal),
                           ('Roughness', rough), ('Coat Weight', coat),
                           ('Coat Roughness', .19), ('Emission Color', (*color, 1)),
                           ('Emission Strength', emission)]:
            p.inputs[key].default_value = value
        return m

    pearl = material('Porcelain pearl clearcoat', (.88, .875, .86), .23, .25, coat=.85)
    rubber = material('Performance tire rubber', (.013, .016, .02), rough=.68)
    leather = material('Charcoal seat leather', (.018, .022, .027), rough=.52)
    trim = material('Satin black cockpit', (.012, .016, .021), .18, .32)
    graphite = material('Graphite five spoke alloy', (.046, .055, .066), .8, .29)
    steel = material('Machined brake steel', (.19, .21, .23), .85, .4)
    dark = material('Lamp recess and intake', (.004, .007, .011), .1, .36)
    blue = material('Ice blue LED', (.18, .59, 1), .1, .2, 4)
    white = material('LED core', (.75, .92, 1), rough=.2, emission=5)
    red = material('Ruby rear LED', (.8, .008, .018), .1, .25, 3.5)
    stitch = material('Seat seam', (.06, .07, .078), rough=.7)

    def register(obj, name, mat=None):
        obj.name = name
        obj['asset'] = ASSET
        obj['roadster_part'] = True
        if mat:
            obj.data.materials.append(mat)
        parts.append(obj)
        return obj

    def mesh(name, verts, faces, mat, smooth=True):
        data = bpy.data.meshes.new(name)
        data.from_pydata(verts, [], faces)
        data.update()
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data)
        bm.free()
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        register(obj, name, mat)
        for p in data.polygons:
            p.use_smooth = smooth
        return obj

    def bevel(obj, amount=.02, segments=3):
        mod = obj.modifiers.new('Manufactured edge radius', 'BEVEL')
        mod.width = amount
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.angle_limit = .48
        mod = obj.modifiers.new('Surface normals', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
        return obj

    def box(name, loc, size, mat, radius=.03):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        obj = register(bpy.context.object, name, mat)
        obj.scale = size
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        for p in obj.data.polygons:
            p.use_smooth = True
        if radius:
            bevel(obj, radius, 4)
        return obj

    def tube(name, points, radius, mat, cyclic=False, resolution=3):
        data = bpy.data.curves.new(name, 'CURVE')
        data.dimensions = '3D'
        data.resolution_u = 3
        data.bevel_depth = radius
        data.bevel_resolution = resolution
        spline = data.splines.new('POLY')
        spline.points.add(len(points)-1)
        for p, co in zip(spline.points, points):
            p.co = (*co, 1)
        spline.use_cyclic_u = cyclic
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        return register(obj, name, mat)

    def cylinder(name, loc, radius, depth, mat, count=48):
        bpy.ops.mesh.primitive_cylinder_add(vertices=count, radius=radius,
                                          depth=depth, location=loc,
                                          rotation=(0, math.pi/2, 0))
        obj = register(bpy.context.object, name, mat)
        for p in obj.data.polygons:
            p.use_smooth = len(p.vertices) == 4
        return obj

    def difference(body, cutter):
        bpy.context.view_layer.objects.active = cutter
        for mod in list(cutter.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.context.view_layer.objects.active = body
        mod = body.modifiers.new('Recess', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.solver = 'EXACT'
        mod.object = cutter
        bpy.ops.object.modifier_apply(modifier=mod.name)
        parts.remove(cutter)
        bpy.data.objects.remove(cutter, do_unlink=True)

    # Longitudinal design sections: y, half-width, crown, shoulder, underbody.
    stations = [(-2.63, .18, .87, .62, .33), (-2.60, .58, .98, .67, .28),
                (-2.53, .91, 1.08, .76, .26), (-2.39, 1.12, 1.18, .86, .26),
                (-2.14, 1.23, 1.26, .93, .27), (-1.69, 1.27, 1.29, .98, .28),
                (-1.15, 1.21, 1.27, .96, .29), (-.65, 1.14, 1.18, .88, .32),
                (0, 1.115, 1.13, .84, .37), (.6, 1.17, 1.23, .91, .32),
                (1.2, 1.27, 1.35, .97, .28), (1.69, 1.29, 1.36, .98, .27),
                (2.12, 1.23, 1.31, .94, .27), (2.38, 1.08, 1.24, .88, .28),
                (2.51, .82, 1.19, .82, .28), (2.56, .46, 1.15, .76, .30),
                (2.575, .15, 1.12, .71, .33)]

    def section(y):
        i = next((i for i in range(len(stations)-1) if y <= stations[i+1][0]), len(stations)-2)
        a, b = stations[i], stations[i+1]
        before, after = stations[max(0, i-1)], stations[min(len(stations)-1, i+2)]
        t = max(0, min(1, (y-a[0])/(b[0]-a[0])))
        span = b[0]-a[0]
        vals = []
        for k in range(1, 5):
            m0 = (b[k]-before[k])/(b[0]-before[0])*span
            m1 = (after[k]-a[k])/(after[0]-a[0])*span
            vals.append((2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*m0
                        +(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*m1)
        return vals

    def top_z(x, y):
        width, crown, shoulder, _ = section(y)
        q = min(.999999, abs(x)/width)
        sine = math.sqrt(max(0, 1-q*q))
        haunch = .13*math.exp(-((y+1.65)/.69)**2) + .105*math.exp(-((y-1.60)/.72)**2)
        return shoulder+(crown-shoulder)*sine**.65 + haunch*math.exp(-((q-.79)/.19)**2)*sine**.4

    verts, faces = [], []
    ny, na = 128, 96
    for j in range(ny+1):
        y = stations[0][0] + (stations[-1][0]-stations[0][0])*j/ny
        width, crown, shoulder, bottom = section(y)
        for k in range(na):
            a = math.tau*k/na
            if k <= na//2:
                x = width*math.cos(a)
                z = top_z(x, y)
            else:
                x = width*math.copysign(abs(math.cos(a))**.32, math.cos(a))
                z = bottom+(shoulder-bottom)*(1+math.sin(a))**2
            verts.append((x, y, z))
    for j in range(ny):
        for k in range(na):
            a, b = j*na+k, j*na+(k+1)%na
            faces.append((a, a+na, b+na, b))
    faces.extend([tuple(reversed(range(na))), tuple(ny*na+k for k in range(na))])
    body = mesh('Body_Pearl', verts, faces, pearl)

    # Open arches genuinely cut through the shell, with separate dark wheel wells.
    for y in AXLES:
        for s in (-1, 1):
            cut = cylinder('Arch cutting tool', (s*1.24, y, RADIUS), .588, .84, None, 96)
            difference(body, cut)
            points = [(s*1.10, y+.576*math.cos(a), RADIUS+.576*math.sin(a))
                      for a in [math.pi*i/64 for i in range(65)]]
            tube('Wheel_arch_inner_lip', points, .022, trim)

    def cockpit_ring(scale=1):
        points = []
        for i in range(96):
            a = math.tau*i/96
            v = math.copysign(abs(math.sin(a))**.64, math.sin(a))
            x = .705*(1-.085*v)*math.copysign(abs(math.cos(a))**.64, math.cos(a))*scale
            points.append((x, .26+.95*v*scale))
        return points

    ring = cockpit_ring()
    n = len(ring)
    verts = [(x, y, z) for z in (.67, 2.8) for x, y in ring]
    faces = [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    faces.extend([tuple(reversed(range(n))), tuple(n+i for i in range(n))])
    difference(body, mesh('Cockpit cutting tool', verts, faces, None))
    difference(body, box('Front intake cutting tool', (0, -2.50, .33), (1.74, .72, .39), None, .15))
    difference(body, box('Rear diffuser cutting tool', (0, 2.48, .34), (1.79, .64, .47), None, .17))
    bevel(body, .012, 3)

    # Sculpted rim, deep interior sidewalls, and a closed footwell.
    verts, faces = [], []
    for scale, offset in [(1.025, .01), (.983, -.013), (.93, -.08)]:
        for x, y in cockpit_ring(scale):
            verts.append((x, y, top_z(x, y)+offset))
    for x, y in cockpit_ring(.91):
        verts.append((x, y, .704))
    for j in range(3):
        for i in range(n):
            faces.append((j*n+i, j*n+(i+1)%n, (j+1)*n+(i+1)%n, (j+1)*n+i))
    faces.append(tuple(3*n+i for i in range(n)))
    mesh('Cockpit_recess_and_rim', verts, faces, trim)
    tube('Cockpit_soft_piping', [(x, y, top_z(x, y)+.011) for x, y in cockpit_ring(1.025)], .016, leather, True)
    box('Footwell', (0, -.15, .75), (1.12, 1.42, .08), dark, .035)
    box('Seat_cushion', (0, .43, .84), (.67, .67, .18), leather, .085)
    back = box('Seat_back', (0, .88, 1.19), (.73, .20, .75), leather, .09)
    back.rotation_euler.x = -.15
    back = box('Seat_center_insert', (0, .749, 1.19), (.49, .055, .48), leather, .026)
    back.rotation_euler.x = -.15
    box('Seat_headrest', (0, .96, 1.65), (.51, .23, .28), leather, .075)
    for s in (-1, 1):
        bolster = box('Seat_side_bolster', (s*.345, .60, 1.05), (.15, .58, .37), leather, .07)
        bolster.rotation_euler.y = -s*.12
        tube('Seat_double_stitch', [(s*.252, .739, z) for z in (.98, 1.10, 1.28, 1.39)], .0045, stitch, resolution=1)
        tube('Cushion_seam', [(s*.25, y, .936) for y in (.17, .30, .47, .67)], .004, stitch, resolution=1)
    box('Dashboard_cowl', (0, -.565, 1.14), (1.21, .24, .18), trim, .08)
    dash = box('Driver_display', (0, -.402, 1.285), (.34, .021, .125), dark, .025)
    dash.rotation_euler.x = -.20
    tube('Display_blue_indicator', [(-.11, -.386, 1.295), (.08, -.386, 1.295)], .006, blue, resolution=2)
    box('Steering_hub', (0, -.29, 1.47), (.19, .105, .12), trim, .032)
    wheel_points = []
    for i in range(80):
        a = math.tau*i/80
        wheel_points.append((.325*math.cos(a), -.29-.325*math.sin(a)*.3746,
                             1.47+.325*math.sin(a)*.9272))
    tube('Steering_wheel', wheel_points, .035, leather, True)
    for s in (-1, 1):
        tube('Steering_spoke', [(0, -.29, 1.47), (s*.28, -.313, 1.526)], .023, graphite)
    tube('Steering_lower_spoke', [(0, -.29, 1.47), (0, -.185, 1.20)], .023, graphite)
    tube('Steering_column', [(0, -.50, 1.17), (0, -.29, 1.47)], .045, trim)

    # Flush ribbons are projected onto the nose, keeping the LEDs embedded
    # in the body rather than making raised tubes on top of the hood.
    for s in (-1, 1):
        for name, height, inset, mat, margin in [('Headlight_graphite_socket', .039, .005, dark, 0),
                                               ('Headlight_ice_blue_lens', .021, .010, blue, .04),
                                               ('Headlight_white_core', .006, .013, white, .085)]:
            verts, faces = [], []
            for i in range(33):
                t = margin+(1-2*margin)*i/32
                x = s*(.70+.415*t)
                center_z = .938+.122*t+.013*t*t
                spread = height*max(.07, math.sin(math.pi*i/32)**.45)
                for z in (center_z-spread, center_z+spread):
                    hit, surface, _, _ = body.ray_cast(Vector((x, -3, z)), Vector((0, 1, 0)))
                    if not hit:
                        raise RuntimeError('Headlight has no body surface')
                    verts.append((x, surface.y-inset, z))
            for i in range(32):
                faces.append((i*2, i*2+1, i*2+3, i*2+2))
            lamp = mesh(name, verts, faces, mat)
            # The front-facing normal is also correct after a mirrored X layout.
            if lamp.data.polygons[16].normal.y > 0:
                bm = bmesh.new()
                bm.from_mesh(lamp.data)
                bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
                bm.to_mesh(lamp.data)
                bm.free()
        # Rear lamps sit in the vertical rear shoulders, visible from chase cameras.
        points = []
        for i in range(25):
            t = i/24
            x = s*(.65+.425*t)
            z = 1.032+.045*t
            hit, surface, _, _ = body.ray_cast(Vector((x, 3, z)), Vector((0, -1, 0)))
            if not hit:
                raise RuntimeError('Rear light has no body surface')
            points.append((x, surface.y+.009, z))
        tube('Taillight_dark_socket', points, .030, dark)
        tube('Taillight_ruby_outline', [(x, y+.025, z) for x, y, z in points[1:-1]], .017, red)
        tube('Taillight_inner_core', [(x, y+.043, z+.003) for x, y, z in points[2:-2]], .005, red, resolution=2)
        tube('Lower_sill_shadow', [(s*1.065, -.99, .317), (s*1.092, -.5, .335),
                                  (s*1.092, 0, .367), (s*1.11, .55, .326), (s*1.13, 1.02, .3)], .022, trim)
        # Fine shut line runs down the side instead of a raised decorative stripe.
        points = []
        for i in range(33):
            t = i/32
            y = .86-.17*math.sin(math.pi*t)
            width, crown, shoulder, bottom = section(y)
            z = top_z(width*.92, y)*(1-t)+.325*t
            if z >= shoulder:
                q = min([j/400 for j in range(401)], key=lambda q: abs(top_z(width*q, y)-z))
            else:
                u = min(1, max(0, (z-bottom)/(shoulder-bottom)))
                sine = 1-math.sqrt(u)
                q = max(0, 1-sine*sine)**.16
            points.append((s*(width*q+.0015), y, z))
        tube('Door_panel_gap', points, .004, graphite, resolution=1)

    box('Front_intake_cavity', (0, -2.34, .33), (1.59, .10, .29), dark, .085)
    box('Front_intake_lower_blade', (0, -2.34, .245), (1.62, .18, .042), trim, .018)
    box('Rear_diffuser_cavity', (0, 2.30, .34), (1.67, .13, .32), dark, .10)
    box('Rear_diffuser_lower_blade', (0, 2.26, .23), (1.73, .28, .045), trim, .02)
    for x in (-.57, -.285, 0, .285, .57):
        box('Diffuser_strake', (x, 2.26, .295), (.025, .22, .12), trim, .01)
    box('Undertray', (0, 0, .27), (1.67, 3.6, .09), trim, .06)

    # Wheels use a lathed tire profile and open five-spoke rims, not solid discs.
    # Blender empties have identity rotations; glTF keeps X as the axle.
    tire_profile = [(-.177, .377), (-.190, .411), (-.181, .461), (-.151, .503),
                    (-.111, .524), (-.058, .529), (.058, .529), (.111, .524),
                    (.151, .503), (.181, .461), (.190, .411), (.177, .377)]

    def lathe(name, profile, mat, segments=72):
        verts, faces = [], []
        n = len(profile)
        for i in range(segments):
            a = math.tau*i/segments
            verts.extend((x, r*math.cos(a), r*math.sin(a)) for x, r in profile)
        for i in range(segments):
            for j in range(n):
                faces.append((i*n+j, ((i+1)%segments)*n+j,
                              ((i+1)%segments)*n+(j+1)%n, i*n+(j+1)%n))
        return mesh(name, verts, faces, mat)

    for y, label in zip(AXLES, ('F', 'R')):
        for s, side in [(-1, 'L'), (1, 'R')]:
            tag = label+side
            pivot = bpy.data.objects.new('Wheel_'+tag, None)
            scene.collection.objects.link(pivot)
            register(pivot, 'Wheel_'+tag)
            pivot.location = (s*1.185, y, RADIUS)
            pivot['tireRadius'] = RADIUS
            spin = bpy.data.objects.new('WheelSpin_'+tag, None)
            scene.collection.objects.link(spin)
            register(spin, 'WheelSpin_'+tag)
            spin.parent = pivot
            start = len(parts)
            lathe('Tire_'+tag, tire_profile, rubber)
            # Small circumferential grooves and shallow shoulder sipes.
            for x in (-.083, .083):
                lathe('Tire_groove_'+tag, [(x-.006, .5293), (x+.006, .5293),
                                         (x+.004, .5301), (x-.004, .5301)], dark)
            for sidewall in (-1, 1):
                lathe('Tire_bead_'+tag, [(sidewall*.182, .393), (sidewall*.192, .402),
                                       (sidewall*.194, .410), (sidewall*.188, .416)], rubber)
            verts, faces = [], []
            for i in range(56):
                a = math.tau*i/56
                for edge in (-1, 1):
                    offset = len(verts)
                    for x, da, r in [(edge*.094, 0, .5295), (edge*.161, .065, .4965),
                                     (edge*.161, .080, .4965), (edge*.094, .015, .5295)]:
                        verts.append((x, r*math.cos(a+da), r*math.sin(a+da)))
                    faces.append(tuple(offset+j for j in range(4)))
            mesh('Tire_shoulder_sipes_'+tag, verts, faces, dark)
            lathe('Rim_barrel_'+tag, [(-.158, .347), (-.158, .379), (.158, .379),
                                    (.158, .347)], graphite)
            lathe('Rim_outer_lip_'+tag, [(s*.154, .347), (s*.18, .352), (s*.18, .376),
                                       (s*.166, .385), (s*.154, .378)], graphite)
            cylinder('Ventilated_brake_'+tag, (s*.107, 0, 0), .293, .021, steel, 64)
            # Rotor vents grouped into one mesh for economical draw calls.
            verts, faces = [], []
            for radius, count in ((.238, 18), (.273, 24)):
                for i in range(count):
                    a, startv = math.tau*i/count, len(verts)
                    for k in range(8):
                        t = math.tau*k/8
                        verts.append((s*.119, radius*math.cos(a)+.008*math.cos(t),
                                      radius*math.sin(a)+.008*math.sin(t)))
                    faces.append(tuple(startv+k for k in range(8)))
            mesh('Rotor_vents_'+tag, verts, faces, dark, False)
            for k in range(5):
                a = math.tau*k/5+.12
                shape = [(.062, -.045), (.18, -.042), (.363, -.022),
                         (.367, .025), (.20, .041), (.067, .044)]
                verts = []
                for depth in (.137, .177):
                    for r, tangent in shape:
                        verts.append((s*depth, r*math.cos(a)-tangent*math.sin(a),
                                      r*math.sin(a)+tangent*math.cos(a)))
                count = len(shape)
                faces = [tuple(reversed(range(count))), tuple(count+j for j in range(count))]
                faces += [(j, (j+1)%count, (j+1)%count+count, j+count) for j in range(count)]
                bevel(mesh('Forged_spoke_'+tag, verts, faces, graphite, False), .009, 2)
            cylinder('Hub_'+tag, (s*.179, 0, 0), .082, .036, graphite)
            cylinder('Hub_cap_'+tag, (s*.2, 0, 0), .051, .014, trim, 32)
            for k in range(5):
                a = math.tau*k/5
                cylinder('Wheel_bolt_'+tag, (s*.201, .061*math.cos(a), .061*math.sin(a)), .01, .008, steel, 10)
            for obj in parts[start:]:
                obj.parent = spin
            # Caliper stays with the upright when the wheel spins.
            caliper = box('Brake_caliper_'+tag, (s*.118, -.231, 0), (.084, .10, .23), trim, .027)
            caliper.parent = pivot

    # Mesh export also includes curve details. Convert now so selection export
    # and subsequent material batching cannot silently omit those details.
    for obj in list(parts):
        if obj.type == 'CURVE':
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.convert(target='MESH')
    return parts


def update_atelier(root):
    scene = bpy.data.scenes.get('Impetuous Saguinus • Asset Atelier')
    if scene is None:
        raise RuntimeError('Open the project asset atelier before updating the roadster.')
    bpy.context.window.scene = scene
    existing = [obj for obj in scene.objects if obj.get('asset') == ASSET]
    driver = [obj for obj in existing
              if not obj.get('roadster_part') and obj.name.startswith(DRIVER_PREFIXES)]
    if not driver:
        raise RuntimeError('The existing game driver is missing; run build_assets.py first.')
    for obj in existing:
        if obj not in driver:
            bpy.data.objects.remove(obj, do_unlink=True)
    parts = build_roadster(scene)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts + driver:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    destination = os.path.join(root, 'public/models', ASSET+'.glb')
    bpy.ops.export_scene.gltf(filepath=destination, export_format='GLB',
                              use_selection=True, export_apply=True,
                              export_yup=True, use_active_scene=True,
                              export_extras=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root, 'blender/impetuous-saguinus.blend'))
    print('ROADSTER_EXPORTED', len(parts), 'car objects;', len(driver), 'driver objects;',
          os.path.getsize(destination), 'bytes')
