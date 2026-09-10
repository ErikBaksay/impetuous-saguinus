"""Render the authored car without its driver for comparison with the reference."""
import bpy
import os
from mathutils import Vector


def render_preview(root):
    name = 'Roadster • Studio'
    old = bpy.data.scenes.get(name)
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.scenes.remove(old)
    source = bpy.data.scenes['Impetuous Saguinus • Asset Atelier']
    studio = bpy.data.scenes.new(name)
    bpy.context.window.scene = studio
    copies = {}
    for obj in source.objects:
        if obj.get('roadster_part'):
            duplicate = obj.copy()
            duplicate.name = 'Studio / ' + obj.name
            studio.collection.objects.link(duplicate)
            copies[obj] = duplicate
    for original, duplicate in copies.items():
        duplicate.parent = copies.get(original.parent)
        duplicate.hide_set(False)
        duplicate.hide_render = False
    world = bpy.data.worlds.get(name) or bpy.data.worlds.new(name)
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.45, .48, .53, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .5
    studio.world = world
    ground = bpy.data.materials.get('Studio ground') or bpy.data.materials.new('Studio ground')
    ground.diffuse_color = (.28, .29, .31, 1)
    ground.use_nodes = True
    ground.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.28, .29, .31, 1)
    ground.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .85
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.008))
    bpy.context.object.name = 'Studio floor'
    bpy.context.object.data.materials.append(ground)
    for name, loc, power, size in [('Key', (1, -4, 7), 1500, 5),
                                    ('Fill', (-5, -1, 4), 1000, 5),
                                    ('Rim', (1, 5, 6), 1900, 4)]:
        data = bpy.data.lights.new('Studio '+name, 'AREA')
        data.energy, data.shape, data.size = power, 'DISK', size
        obj = bpy.data.objects.new('Studio '+name, data)
        studio.collection.objects.link(obj)
        obj.location = loc
        obj.rotation_euler = (Vector((0, 0, .8))-obj.location).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.cameras.new('Roadster studio camera')
    camera = bpy.data.objects.new('Roadster studio camera', data)
    studio.collection.objects.link(camera)
    camera.location = (6.4, -8.5, 3.8)
    camera.rotation_euler = (Vector((0, 0, .8))-camera.location).to_track_quat('-Z', 'Y').to_euler()
    data.type, data.ortho_scale = 'ORTHO', 6.9
    studio.camera = camera
    studio.render.engine = 'CYCLES'
    studio.cycles.samples = 24
    studio.cycles.use_denoising = True
    studio.render.resolution_x, studio.render.resolution_y = 1100, 760
    studio.render.resolution_percentage = 100
    studio.view_settings.view_transform = 'AgX'
    studio.render.image_settings.file_format = 'PNG'
    os.makedirs(root+'/blender/previews', exist_ok=True)
    studio.render.filepath = root+'/blender/previews/roadster.png'
    bpy.ops.render.render(write_still=True)
    bpy.context.window.scene = source
    # The studio is a render-only scene and does not enter the GLB export.
    bpy.ops.wm.save_as_mainfile(filepath=root+'/blender/impetuous-saguinus.blend')
    print('PREVIEW', studio.render.filepath)
