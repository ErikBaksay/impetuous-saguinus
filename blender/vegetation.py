"""Original Mediterranean planting kit; execute through the Blender MCP.

Opaque, vertex-coloured meshes grouped into one draw call per asset. Blender
coordinates are X across, -Y forward, Z up; each plant is rooted at the origin.
Only this script's named scene is rebuilt. Other asset scenes are preserved.
"""
import bpy
import bmesh
import math
import os
import random
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCENE = 'Impetuous Saguinus • Mediterranean Nursery'
OUT = os.path.join(ROOT, 'public', 'models')


def build():
    old = bpy.data.scenes.get(SCENE)
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.scenes.remove(old)
    scene = bpy.data.scenes.new(SCENE)
    bpy.context.window.scene = scene
    rng = random.Random(917)
    material = bpy.data.materials.get('Vegetation / living colour') or bpy.data.materials.new('Vegetation / living colour')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .87
    vertex = nodes.get('Foliage Colour') or nodes.new('ShaderNodeVertexColor')
    vertex.name = 'Foliage Colour'
    vertex.layer_name = 'Col'
    material.node_tree.links.new(vertex.outputs['Color'], bsdf.inputs['Base Color'])
    material.diffuse_color = (.16, .29, .045, 1)
    material.use_backface_culling = False
    exports = []
    verts, faces, colours = [], [], []
    jade = (.105, .245, .038)
    goldgreen = (.25, .365, .065)
    darkgreen = (.06, .15, .027)
    olive = (.225, .30, .115)
    bark = (.245, .145, .07)
    pink = (.72, .035, .20)
    coral = (.96, .12, .245)

    def shade(c, amount=.16):
        s = 1 + rng.uniform(-amount, amount)
        return tuple(min(1, v*s) for v in c)

    def face(points, c):
        start = len(verts)
        verts.extend(points)
        faces.append(tuple(range(start, len(verts))))
        colours.extend([(*c, 1)]*len(points))

    def tube(points, radius, c, sides=7, end_radius=None):
        points = list(map(Vector, points))
        end_radius = radius*.55 if end_radius is None else end_radius
        rings = []
        for i, p in enumerate(points):
            tangent = (points[min(i+1, len(points)-1)] - points[max(0, i-1)]).normalized()
            axis = tangent.cross(Vector((0, 1, 0))).normalized()
            other = tangent.cross(axis).normalized()
            r = radius + (end_radius-radius)*i/(len(points)-1)
            rings.append([p+r*(axis*math.cos(k*math.tau/sides)+other*math.sin(k*math.tau/sides)) for k in range(sides)])
        face(list(reversed(rings[0])), c)
        for i in range(len(rings)-1):
            for k in range(sides):
                face([rings[i][k], rings[i][(k+1)%sides], rings[i+1][(k+1)%sides], rings[i+1][k]], shade(c,.1))
        face(rings[-1], c)

    def leaf(start, end, width, c, fold=.12):
        a, b = Vector(start), Vector(end)
        axis = b-a
        side = axis.cross(Vector((0, 0, 1)))
        if side.length < .0001:
            side = Vector((1, 0, 0))
        side.normalize()
        mid = a+axis*.47
        ridge = mid+Vector((0, 0, width*fold))
        left, right = mid+side*width, mid-side*width
        face([a, right, ridge], shade(c))
        face([right, b, ridge], shade(c))
        face([b, left, ridge], shade(c))
        face([left, a, ridge], shade(c))

    def mound(center, scale, c, rings=5, sides=9):
        p = Vector(center)
        rows = []
        for j in range(rings+1):
            phi = math.pi*j/rings
            rows.append([p+Vector((math.sin(phi)*math.cos(k*math.tau/sides)*scale[0], math.sin(phi)*math.sin(k*math.tau/sides)*scale[1], math.cos(phi)*scale[2]))*rng.uniform(.89,1.08) for k in range(sides)])
        for j in range(rings):
            for k in range(sides):
                q = (k+1)%sides
                if j == 0:
                    face([rows[j][k], rows[j+1][k], rows[j+1][q]], shade(c,.22))
                elif j == rings-1:
                    face([rows[j][k], rows[j+1][k], rows[j][q]], shade(c,.22))
                else:
                    face([rows[j][k], rows[j+1][k], rows[j+1][q], rows[j][q]], shade(c,.22))

    def spray(center, radius, count, c):
        center = Vector(center)
        for _ in range(count):
            a, z = rng.random()*math.tau, rng.uniform(-.45, .95)
            d = Vector((math.cos(a)*math.sqrt(1-z*z), math.sin(a)*math.sqrt(1-z*z), z))
            root = center+d*radius*rng.uniform(.35,.78)
            tip = center+d*radius*rng.uniform(.95,1.23)
            leaf(root, tip, rng.uniform(.07,.14)*radius, shade(c))

    def blossom(center, size, c):
        center = Vector(center)
        a = rng.random()*math.tau
        # Three papery bracts, each with a raised vein, around a cream centre.
        for k in range(3):
            t = a+k*math.tau/3
            tip = center+Vector((math.cos(t)*size, math.sin(t)*size, size*rng.uniform(.1,.6)))
            leaf(center, tip, size*.43, c, .3)
        face([center+Vector((-.017,-.017,.033)), center+Vector((.02,-.008,.033)), center+Vector((0,.025,.05))], (.96,.74,.34))

    def export(name, display):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        colour = mesh.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
        for i, c in enumerate(colours):
            colour.data[i].color = c
        obj = bpy.data.objects.new(name, mesh)
        scene.collection.objects.link(obj)
        obj.data.materials.append(material)
        obj['asset'] = name
        obj['authoring'] = 'Original procedural mesh, Blender MCP'
        # Weld the face-local vertices, preserving colour boundaries on export.
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
        bm.to_mesh(mesh)
        bm.free()
        mesh.calc_loop_triangles()
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        path = os.path.join(OUT, name+'.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, use_active_scene=True, export_apply=True, export_yup=True)
        exports.append({'asset': name, 'triangles':len(mesh.loop_triangles), 'bytes':os.path.getsize(path)})
        obj.location = display
        obj.select_set(False)
        verts.clear(); faces.clear(); colours.clear()
        return obj

    # A leaning date palm with a flared, ringed trunk and individually cut pinnae.
    points = [(.64*(i/18)**1.7, .19*math.sin(i/18*2), i/18*7.5) for i in range(19)]
    tube(points, .25, bark, 11, .13)
    for j in range(1, 22):
        t=j/22
        p=Vector((.64*t**1.7,.19*math.sin(t*2),t*7.5))
        tube([p-Vector((0,0,.038)),p+Vector((0,0,.032))], .24-.095*t, (.32,.205,.105), 10, .225-.095*t)
    crown = Vector(points[-1])
    for k in range(18):
        a=k*2.39996+rng.uniform(-.12,.12)
        upright=k>=13
        length=rng.uniform(2.2,2.9) if upright else rng.uniform(3.2,4.15)
        rise=1.75 if upright else rng.uniform(.7,1.35)
        drop=.1 if upright else rng.uniform(.7,1.35)
        radial=Vector((math.cos(a),math.sin(a),0))
        sideways=Vector((-math.sin(a),math.cos(a),0))
        def stem(t):
            return crown+radial*(length*t)+Vector((0,0,rise*math.sin(t*math.pi*.85)-drop*t*t))
        tube([stem(i/9) for i in range(10)], .028, goldgreen, 5, .008)
        for j in range(1, 20):
            t=j/21
            width=(.18+.53*math.sin(math.pi*t)**.8)*(length/3.8)
            for side in [-1,1]:
                p=stem(t+rng.uniform(-.007,.007))
                end=p+sideways*side*width+radial*(.17+.23*t)+Vector((0,0,-.10-.22*t))
                leaf(p,end,.13*(1-t*.55), jade if k%3 else goldgreen,.5)
        leaf(stem(.9),stem(1.07),.07,jade)
    for _ in range(5):
        mound(crown+Vector((rng.uniform(-.21,.21),rng.uniform(-.21,.21),-.2)),(.13,.13,.18),bark,3,6)
    export('palm',(-9,0,0))

    # A tapered Italian cypress, with small irregular evergreen sprays.
    tube([(0,0,0),(.03,0,2.5)],.15,bark,8,.065)
    for j in range(11):
        t=j/10
        radius=.68*(1-t)**.48+.045
        p=Vector((.08*math.sin(j*1.7),.045*math.cos(j*2),1.2+t*4.75))
        mound(p,(radius,radius*.82,.68 if j<9 else .48),darkgreen,4,8)
        spray(p,radius,13,jade)
    leaf((0,0,5.8),(.015,0,6.65),.075,jade)
    export('cypress',(-3,0,0))

    # Low, dense mastic / myrtle scrub, with visible leaves on a lobed canopy.
    for j in range(6):
        a=j*2.4
        p=Vector((math.cos(a)*.46,math.sin(a)*.35,.58+rng.uniform(-.08,.2)))
        tube([(0,0,0),p],.045,bark,5,.015)
        mound(p,(.55,.48,.47),darkgreen,4,7)
        spray(p,.62,24,jade if j%2 else goldgreen)
    export('coastal-shrub',(1,0,0))

    # Blooming garden shrub: large masses of pink bracts among green leaves.
    for j in range(7):
        a=j*2.4
        p=Vector((math.cos(a)*.54,math.sin(a)*.42,.61+rng.uniform(-.08,.35)))
        tube([(0,0,0),p],.04,bark,5,.01)
        mound(p,(.52,.44,.44),darkgreen,4,7)
        spray(p,.55,15,jade)
        for k in range(15):
            a=rng.random()*math.tau
            r=rng.uniform(.26,.58)
            pos=p+Vector((math.cos(a)*r,math.sin(a)*r,rng.uniform(.04,.4)))
            blossom(pos,rng.uniform(.12,.20),pink if (j+k)%3 else coral)
    export('bougainvillea',(4,0,0))

    # A flowering climber for plaster facades, with a spreading, trailing crown.
    for j in range(3):
        base=-.38+j*.37
        tube([(base,0,0),(base-.1,-.04,1.4),(base+.13,-.05,2.8),(base+.3,-.1,4.15)],.029,bark,5,.01)
    for j in range(15):
        z=.4+j*.28
        p=Vector((math.sin(j*.65)*(.24+z*.06),-.08,z))
        mound(p,(.32+z*.035,.20,.36),darkgreen,4,6)
        for _ in range(8):
            root=p+Vector((rng.uniform(-.28,.28),-.13,rng.uniform(-.2,.2)))
            leaf(root,root+Vector((rng.uniform(-.16,.16),-.05,rng.uniform(.15,.3))),.085,jade)
        for _ in range(8):
            blossom(p+Vector((rng.uniform(-.35,.35),rng.uniform(-.31,-.2),rng.uniform(-.2,.26))),rng.uniform(.12,.18),pink if j%3 else coral)
    export('flowering-vine',(7,0,0))

    # Tufts of ornamental grasses with a few lavender flower spikes.
    for j in range(28):
        a=rng.random()*math.tau
        base=Vector((math.cos(a)*rng.uniform(.02,.22), math.sin(a)*rng.uniform(.02,.22),0))
        end=base+Vector((math.cos(a)*rng.uniform(.2,.42),math.sin(a)*rng.uniform(.2,.42),rng.uniform(.3,.73)))
        leaf(base,end,.024,goldgreen if j%3 else jade,.4)
    for j in range(7):
        p=Vector((rng.uniform(-.25,.25),rng.uniform(-.25,.25),rng.uniform(.45,.74)))
        tube([(p.x*.5,p.y*.5,0),p],.009,jade,4,.005)
        mound(p,(.037,.037,.10),(.38,.13,.42),3,5)
    export('coastal-grass',(10,0,0))

    # Open, twisted olive trees give the inland terraces a softer middle canopy.
    tube([(0,0,0),(.16,.04,1),(-.08,.05,2),(.16,.05,2.7)],.24,(.24,.20,.13),9,.10)
    for j in range(8):
        a=j*2.4
        p=Vector((math.cos(a)*rng.uniform(.7,1.25),math.sin(a)*rng.uniform(.7,1.2),rng.uniform(2.9,4.1)))
        tube([(.08,.03,1.6),p*.77,p],.075,bark,6,.018)
        mound(p,(.78,.68,.58),(.12,.185,.056),4,8)
        spray(p,.78,25,olive if j%3 else goldgreen)
    export('olive-tree',(14,0,0))

    scene.world = bpy.data.worlds.new('Nursery daylight')
    scene.world.color = (.3,.3,.3)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'blender','vegetation.blend'))
    print('VEGETATION_EXPORTS', exports)
    return exports


if __name__ == '__main__':
    build()
