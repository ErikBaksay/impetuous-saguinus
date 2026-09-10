"""Original Impetuous Saguinus assets. Run inside Blender 5.x via the Blender MCP."""
import bpy, math, random, os, bmesh
from mathutils import Vector
random.seed(17)
ROOT = '/home/erikbaksay/Documents/Dev/impetuous-saguinus'
OUT = ROOT + '/public/models'
os.makedirs(OUT, exist_ok=True)
for old_scene in list(bpy.data.scenes):
    if old_scene.name.startswith('Impetuous Saguinus • Asset Atelier'):
        for old_object in list(old_scene.objects): bpy.data.objects.remove(old_object, do_unlink=True)
        bpy.data.scenes.remove(old_scene)
scene = bpy.data.scenes.new('Impetuous Saguinus • Asset Atelier')
bpy.context.window.scene = scene

def mat(name, color, metallic=0, rough=.6, emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic; p.inputs['Roughness'].default_value=rough
    if emission:
        p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
    if metallic: p.inputs['Coat Weight'].default_value=.6
    return m
pearl=mat('Ceramic pearl • warm ivory',(.91,.89,.79),.28,.22)
rubber=mat('Satin performance rubber',(.018,.022,.024),0,.78)
carbon=mat('Carbon and cockpit',(.025,.035,.035),.2,.4)
rim=mat('Graphite forged aluminum',(.055,.069,.074),.8,.25)
brake=mat('Brake rotor steel',(.17,.19,.19),.75,.4)
metal=mat('Brushed champagne',(.59,.47,.29),.75,.3)
blue=mat('Ice blue running lights',(.28,.7,1),.25,.12,5)
red=mat('Ruby rear lights',(.7,.025,.02),.3,.2,3)
fur=mat('Saguinus warm ochre fur',(.32,.18,.08))
furLight=mat('Saguinus golden accents',(.5,.3,.13))
mane=mat('Cotton top ivory',(.86,.78,.59))
face=mat('Soft charcoal face',(.105,.078,.054))
eye=mat('Amber iris',(.24,.115,.024),.1,.22)
pupil=mat('Deep glass eye',(.008,.007,.004),.1,.06)
cream=mat('Limestone plaster',(.77,.63,.42))
wallPink=mat('Rose plaster',(.75,.43,.3))
wallWhite=mat('Ivory plaster',(.9,.8,.59))
roof=mat('Handmade terracotta',(.52,.19,.08))
wood=mat('Dark teal shutters',(.045,.14,.13))
glass=mat('Warm dark windows',(.048,.09,.105),.3,.2)
leaf=mat('Palm jade',(.14,.28,.055))
leaf2=mat('Sunlit foliage',(.29,.37,.08))
bark=mat('Palm bark',(.29,.19,.1))
stone=mat('Coastal limestone',(.52,.43,.31))
white=mat('Natural sail canvas',(.9,.86,.69))
flowers=mat('Bougainvillea magenta',(.65,.075,.27))

active=[]
def register(o,name,m):
    o.name=name
    if m:o.data.materials.append(m)
    active.append(o)
    return o

def uv(name,loc,scale,m,seg=32,rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=loc)
    o=register(bpy.context.object,name,m);o.scale=scale
    for p in o.data.polygons:p.use_smooth=True
    return o

def cube(name,loc,scale,m,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=register(bpy.context.object,name,m);o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Soft handmade edges','BEVEL');mod.width=bevel;mod.segments=3
        mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def cyl(name,loc,r,depth,m,vertices=32,r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=loc)
    o=register(bpy.context.object,name,m)
    for p in o.data.polygons:p.use_smooth=True
    return o

def link(name,a,b,r,m,r2=None):
    a,b=Vector(a),Vector(b);o=cyl(name,(a+b)/2,r,(b-a).length,m,20,r2)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def torus(name,loc,major,minor,m,rot=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=16,location=loc,major_radius=major,minor_radius=minor,rotation=rot)
    o=register(bpy.context.object,name,m)
    for p in o.data.polygons:p.use_smooth=True
    return o

def mesh(name,verts,faces,m):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);return register(o,name,m)

def curve(name,points,r,m):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=12;data.bevel_depth=r;data.bevel_resolution=3
    s=data.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for p,co in zip(s.bezier_points,points):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);register(o,name,m);return o

exports=[]
def export(name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in active:o.select_set(True)
    bpy.context.view_layer.objects.active=active[0]
    bpy.ops.export_scene.gltf(filepath=OUT+'/'+name+'.glb',export_format='GLB',use_selection=True,export_apply=True,export_yup=True,use_active_scene=True)
    exports.append({'asset':name,'objects':len(active),'bytes':os.path.getsize(OUT+'/'+name+'.glb')})
    for o in active:o['asset']=name;o.hide_set(True)
    active.clear()

# Continuous sculpted body, with a real recessed, open cockpit.
verts=[];faces=[];rings=40;segs=64
for j in range(rings+1):
    t=j/rings; y=-2.32+t*4.62
    end=math.sin(math.pi*t)**.16
    width=(1.23+.04*math.cos((t-.2)*math.pi*2))*end+.035
    z=.95+.045*t
    for k in range(segs):
        a=2*math.pi*k/segs
        verts.append((width*math.copysign(abs(math.cos(a))**.72,math.cos(a)),y,z+.47*math.sin(a)*end))
for j in range(rings):
    for k in range(segs):
        a=j*segs+k;b=j*segs+(k+1)%segs
        faces.append((a,b,b+segs,a+segs))
faces += [tuple(reversed(range(segs))),tuple(rings*segs+k for k in range(segs))]
body=mesh('Body_Pearl',verts,faces,pearl)
bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
for p in body.data.polygons:p.use_smooth=True
for wy in [-1.43,1.46]:
    for side in [-1,1]:
        arch=cyl('Wheel arch cutter',(side*1.22,wy,.53),.59,.74,None,64);arch.rotation_euler.y=math.pi/2
        bpy.context.view_layer.objects.active=body;mod=body.modifiers.new('Sculpted wheel arch','BOOLEAN');mod.object=arch;mod.operation='DIFFERENCE';bpy.ops.object.modifier_apply(modifier=mod.name)
        active.remove(arch);bpy.data.objects.remove(arch,do_unlink=True)
cut=uv('Cockpit cutting volume',(0,.4,1.53),(.77,1.03,.64),None)
bpy.context.view_layer.objects.active=cut;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bpy.context.view_layer.objects.active=body;mod=body.modifiers.new('Open cockpit','BOOLEAN');mod.object=cut;mod.operation='DIFFERENCE';bpy.ops.object.modifier_apply(modifier=mod.name)
active.remove(cut);bpy.data.objects.remove(cut,do_unlink=True)
bevel=body.modifiers.new('Polished arch edges','BEVEL');bevel.width=.023;bevel.segments=3
uv('Recessed cockpit liner',(0,.42,1.13),(.72,.96,.17),carbon)
seat=cube('Saddle leather seat',(0,.78,1.28),(.77,.2,.63),carbon,.13);seat.rotation_euler.x=-.17
cube('Front lower intake',(0,-2.18,.71),(1.22,.12,.18),carbon,.085)
cube('Rear diffuser',(0,2.11,.63),(1.39,.13,.16),carbon,.055)
for s in [-1,1]:
    lamp=uv('Headlight_ice',(.78*s,-1.98,1.27),(.25,.045,.048),blue)
    lamp.rotation_euler.z=s*.28
    uv('Tail_light',(.8*s,2,1.26),(.25,.05,.042),red)
    cube('Sill_trim',(1.03*s,.05,.56),(.05,2.13,.09),carbon,.025)
    uv('Mirror_shell',(1.18*s,-.5,1.24),(.14,.18,.075),pearl)
for y,label in [(-1.43,'F'),(1.46,'R')]:
    for s,side in [(-1,'L'),(1,'R')]:
        start=len(active); center=Vector((1.16*s,y,.53))
        torus('Tire',center,.395,.14,rubber,(0,math.pi/2,0))
        o=cyl('Rim',center+Vector((s*.116,0,0)),.355,.045,rim,48);o.rotation_euler.y=math.pi/2
        o=cyl('Brake_disc',center+Vector((s*.14,0,0)),.265,.02,brake,48);o.rotation_euler.y=math.pi/2
        for k in range(7):
            a=k*math.tau/7
            link('Sculpted_spoke',center+Vector((s*.168,.07*math.cos(a),.07*math.sin(a))),center+Vector((s*.168,.32*math.cos(a+.15),.32*math.sin(a+.15))),.027,rim)
        o=cyl('Hub',center+Vector((s*.19,0,0)),.09,.025,carbon);o.rotation_euler.y=math.pi/2
        wheel=bpy.data.objects.new('Wheel_'+label+side,None);scene.collection.objects.link(wheel);wheel.location=center
        for o in active[start:]:o.parent=wheel;o.location-=center
        active.append(wheel)
# Cotton-top tamarin: dark face, white swept crown, articulated limbs, curled tail.
uv('Driver_torso',(0,.51,1.54),(.34,.26,.44),fur)
uv('Cream_chest',(0,.269,1.6),(.225,.04,.3),mane)
uv('Driver_head',(0,.4,2.16),(.335,.29,.37),fur)
# layered asymmetric locks form the recognizable cotton-top crest
for k in range(22):
    a=math.tau*k/22
    x=.31*math.cos(a);z=2.2+.32*math.sin(a)
    if math.sin(a)>-.9:
        start=(x,.43,z);end=(x*1.65,.55+random.uniform(-.04,.15),z+.14+.18*max(0,math.sin(a)))
        link('Ivory_mane_lock',start,end,.12,mane,.009)
for k in range(9):
    x=(k-4)*.074
    link('Swept_cotton_crown',(x,.3,2.41),(x*1.5,.61,2.66-abs(x)*.4),.115,mane,.008)
uv('Dark_face',(0,.148,2.16),(.257,.115,.27),face)
uv('Soft_muzzle',(0,.037,2.048),(.16,.073,.095),furLight)
uv('Nose',(0,-.025,2.11),(.062,.032,.04),face)
for s in [-1,1]:
    uv('Ear',(s*.3,.34,2.17),(.081,.047,.108),face)
    uv('Eye_amber',(s*.103,.041,2.237),(.054,.031,.055),eye)
    uv('Eye_pupil',(s*.101,.014,2.237),(.029,.019,.036),pupil)
    uv('Eye_catchlight',(s*.101-.009,-.002,2.253),(.009,.005,.01),white,16,12)
    link('Brow',(s*.048,.032,2.303),(s*.16,.06,2.3),.025,fur)
    shoulder=(s*.28,.38,1.74);elbow=(s*.4,.065,1.47);hand=(s*.29,-.28,1.54)
    link('Upper_arm',shoulder,elbow,.105,fur);link('Forearm',elbow,hand,.082,furLight)
    uv('Gripping_hand',hand,(.095,.081,.079),face)
    for f in range(3):uv('Fingers',(s*(.26+f*.023),-.333,1.53),(.018,.039,.027),face,16,10)
curve('Curled_tail',[(.15,.78,1.33),(.44,1.02,1.42),(.47,1.44,1.63),(.08,1.64,1.7),(-.12,1.44,1.62)],.085,fur)
torus('Steering_wheel',(0,-.29,1.47),.325,.037,carbon,(math.radians(68),0,0))
link('Steering_column',(0,-.23,1.24),(0,-.29,1.47),.055,carbon)
for s in [-1,1]:link('Wheel_spoke',(0,-.3,1.47),(s*.29,-.3,1.53),.022,metal)
export('saguinus-roadster')

# Hand shaped palm, with broad, segmented leaf blades.
for i in range(13):
    z=i*.55
    link('Palm_trunk',(math.sin(i*.11)*.3,0,z),(math.sin((i+1)*.11)*.3,0,z+.57),.2-i*.005,bark,.19-i*.005)
    torus('Bark_ring',(math.sin(i*.11)*.3,0,z),.19-i*.004,.025,bark)
for k in range(11):
    a=k*math.tau/11;length=3.2+random.random()*.9
    pts=[]
    for j in range(9):
        t=j/8;r=t*length
        pts.append(Vector((.3+r*math.cos(a),r*math.sin(a),7.1+1.5*math.sin(t*math.pi*.9)-1.4*t)))
    curve('Palm_frond_stem',pts,.027,leaf)
    vv=[];ff=[];normal=Vector((-math.sin(a),math.cos(a),0))
    for j,p in enumerate(pts):
        t=j/8;w=.44*math.sin(t*math.pi)**.55
        vv += [p-normal*w+Vector((0,0,-.13)),p+Vector((0,0,.065)),p+normal*w+Vector((0,0,-.13))]
    for j in range(8):
        n=j*3;ff.extend([(n,n+3,n+4,n+1),(n+1,n+4,n+5,n+2)])
    o=mesh('Palm_frond',vv,ff,leaf if k%3 else leaf2)
    sol=o.modifiers.new('Leaf thickness','SOLIDIFY');sol.thickness=.018
for k in range(5):uv('Coconut',(.3+random.uniform(-.2,.2),random.uniform(-.2,.2),7),(.17,.15,.22),bark,16,12)
export('palm')

# Mediterranean villa with recessed shutters, terracotta tiles and balcony.
cube('Villa_plaster',(0,0,3.3),(6,4.8,6.6),wallWhite,.09)
cube('Stone_foundation',(0,0,.3),(6.25,5.05,.6),cream,.09)
mesh('Pitched_terracotta_roof',[(-3.3,-2.7,6.6),(3.3,-2.7,6.6),(-3.3,2.7,6.6),(3.3,2.7,6.6),(-3.3,0,8),(3.3,0,8)],[(0,1,5,4),(2,4,5,3),(0,4,2),(1,3,5)],roof)
for x in range(23):
    for s in [-1,1]:
        link('Roof_tile_ridge',(-3.2+x*.29,0,8.02),(-3.2+x*.29,s*2.7,6.61),.057,roof)
for x in [-1.8,0,1.8]:
    for z in [1.9,4.7]:
        cube('Window_surround',(x,-2.44,z),(1.17,.16,1.69),cream,.035)
        cube('Recessed_window',(x,-2.54,z),(.86,.04,1.39),glass,.06)
        for s in [-1,1]:
            cube('Shutter',(x+s*.68,-2.57,z),(.4,.09,1.45),wood,.025)
            for n in range(7):cube('Shutter_louver',(x+s*.68,-2.626,z-.57+n*.19),(.32,.025,.033),wood)
        cube('Window_sill',(x,-2.64,z-.84),(1.38,.37,.13),cream,.03)
cube('Door',(0,-2.54,1.15),(1.04,.08,2.3),wood,.1)
cube('Balcony_slab',(0,-2.92,3.75),(2.8,1.13,.17),cream,.04)
for x in range(11):link('Balcony_spindle',(-1.25+x*.25,-3.4,3.8),(-1.25+x*.25,-3.4,4.55),.022,carbon)
link('Balcony_rail',(-1.4,-3.4,4.56),(1.4,-3.4,4.56),.039,carbon)
cube('Chimney',(1.8,.6,7.8),(.65,.65,2),wallWhite,.04)
for k in range(13):
    p=(-2.7+random.random()*.6,-2.72,random.random()*4.1)
    uv('Bougainvillea_leaves',p,(.45,.33,.42),leaf,12,8)
    for j in range(3):uv('Flower_cluster',(p[0]+random.uniform(-.3,.3),p[1]-.18,p[2]+random.uniform(-.3,.3)),(.16,.12,.16),flowers,10,8)
export('villa')

# Slender cypress silhouette.
cyl('Cypress_trunk',(0,0,1),.16,2,bark,16)
for i in range(6):uv('Cypress_crown',(math.sin(i)*.08,0,1.8+i*.65),(.65-i*.072,.6-i*.065,1.35),leaf,16,12)
export('cypress')

# Limestone bluff with an irregular, faceted silhouette.
for k in range(7):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(random.uniform(-1.4,1.4),random.uniform(-.7,.7),random.uniform(-.2,.3)))
    o=register(bpy.context.object,'Limestone_face',stone);o.scale=(1.6+random.random(),1.1+random.random(),2.3+random.random()*2);o.rotation_euler=(random.random()*.2,random.random()*.3,random.random())
export('cliff')

# Lighthouse landmark.
cyl('Lighthouse_tower',(0,0,7.5),1.7,15,wallWhite,48,1.2)
cyl('Tower_base',(0,0,.4),2.1,.8,cream,48)
for z in [2,5.6,9.2,12.4]:
    for a in [0,math.pi/2,math.pi,math.pi*1.5]:
        o=cube('Lighthouse_window',(1.48*math.sin(a),-1.48*math.cos(a),z),(.48,.1,.85),wood,.12);o.rotation_euler.z=a
cyl('Lantern_balcony',(0,0,14.4),1.8,.3,cream,48)
cyl('Lantern_glass',(0,0,15.4),1.2,1.7,glass,12)
for k in range(8):
    a=k*math.tau/8;link('Lantern_frame',(1.23*math.cos(a),1.23*math.sin(a),14.5),(1.23*math.cos(a),1.23*math.sin(a),16.3),.06,metal)
cyl('Lantern_roof',(0,0,16.6),1.7,1,roof,32,0)
cyl('Finial',(0,0,17.35),.07,.6,metal,16)
uv('Lighthouse_beacon',(0,0,15.5),(.4,.4,.5),blue)
export('lighthouse')

# Sailboat: sculpted hull and slightly billowed double-sided sails.
uv('Sailboat_hull',(0,0,.1),(.8,2.5,.48),pearl)
cube('Teak_deck',(0,0,.32),(1.14,3.8,.12),cream,.3)
link('Mast',(0,0,.3),(0,0,7.7),.055,metal)
link('Boom',(0,0,1.3),(0,2.0,1.3),.045,metal)
for name,pts in [('Main_sail',[(0,.1,7.5),(0,2.1,1.5),(0,.1,1.5)]),('Jib',[(0,-.13,7.2),(0,-2.15,.7),(0,-.13,1.4)])]:
    a,b,c=map(Vector,pts);center=(a+b+c)/3;center.x=.38
    o=mesh(name,[a,b,c,center],[(0,1,3),(1,2,3),(2,0,3)],white)
    sol=o.modifiers.new('Canvas thickness','SOLIDIFY');sol.thickness=.015
export('sailboat')

# Low coastal masonry wall segment.
for row in range(2):
    for k in range(3):cube('Wall_limestone_block',((k-1)*.96+(row%2)*.12,0,.3+row*.49),(.92,.61,.46),cream,.06)
cube('Wall_coping',(0,0,1.04),(3.1,.73,.16),wallWhite,.035)
export('wall')

# A flower urn to dress village sidewalks.
cyl('Terracotta_urn',(0,0,.43),.35,.85,roof,24,.49)
torus('Urn_lip',(0,0,.86),.48,.055,roof)
for i in range(12):
    a=random.random()*math.tau;r=random.random()*.45
    uv('Flower_leaves',(r*math.cos(a),r*math.sin(a),.97+random.random()*.2),(.25,.25,.19),leaf,12,8)
    uv('Petals',(r*math.cos(a),r*math.sin(a),1.12+random.random()*.2),(.14,.13,.1),flowers,12,8)
export('flower-urn')
# Keep the player's model visible in the atelier.
for o in scene.objects:
    if o.get('asset')=='saguinus-roadster':o.hide_set(False)
bpy.ops.wm.save_as_mainfile(filepath=ROOT+'/blender/impetuous-saguinus.blend')
print('ASSET_EXPORTS',exports)
