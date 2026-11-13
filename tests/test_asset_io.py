import importlib.util
import math
import json
import os
import subprocess
import sys
import urllib.error
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import xml.etree.ElementTree as ET

APP=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('asset_io',APP/'backend/asset_io.py')
io=importlib.util.module_from_spec(spec);spec.loader.exec_module(io)

def project():
    return {'geometry':{'positions':[0,0,0,1,0,0,0,1,0],'normals':[0,0,1]*3,'uv':[0,0,1,0,0,1],'indices':[0,1,2],'rigged':False},
            'bones':[{'name':'RigidRoot','parent':-1,'position':[0,0,0]},{'name':'JiggleRoot','parent':0,'position':[0,0,0]},{'name':'Jiggle1','parent':1,'position':[0,1,0]}],
            'skinIndices':[0,1,2,0]*3,'skinWeights':[.15,.25,.6,0]*3,
            'settings':{'damping':.18,'stiffness':.4},'meshAssetId':'123456'}

class Tests(unittest.TestCase):
    def test_cape_gravity_and_wave_export_types_and_validation(self):
        settings={'damping':.3,'stiffness':.4,'motionMode':'cape','useGravity':False,'ribbonWind':True,'ribbonDirection':'depth'}
        raw=io.base64.b64decode(io.attributes(settings));offset=4;fields={}
        for _ in range(struct.unpack_from('<I',raw)[0]):
            size=struct.unpack_from('<I',raw,offset)[0];offset+=4
            key=raw[offset:offset+size].decode();offset+=size
            kind=raw[offset];offset+=1
            if kind==2:
                size=struct.unpack_from('<I',raw,offset)[0];offset+=4
                value=raw[offset:offset+size].decode();offset+=size
            elif kind==3:value=bool(raw[offset]);offset+=1
            elif kind==6:value=struct.unpack_from('<d',raw,offset)[0];offset+=8
            elif kind==17:value=struct.unpack_from('<fff',raw,offset);offset+=12
            else:self.fail('Unexpected type')
            fields[key]=value
        self.assertEqual(offset,len(raw));self.assertEqual(fields['SmartBoneMotionMode'],'cape')
        self.assertIs(fields['SmartBoneUseGravity'],False);self.assertIs(fields['SmartBoneWindAnimation'],True)
        self.assertEqual(fields['SmartBoneWindDirection'],'depth')
        for key,value in [('motionMode','unknown'),('useGravity',0),('ribbonWind','true'),('ribbonDirection','invalid')]:
            with self.subTest(key=key),self.assertRaises(ValueError):io.validate_motion_settings({key:value})
    def test_v1_sync_keeps_legacy_export_attributes(self):
        settings={'damping':.3,'stiffness':.65,'inertia':.7,'elasticity':.65}
        self.assertEqual(io.attributes(settings),io.attributes(dict(settings,solver='v1-sync')))
        with tempfile.TemporaryDirectory() as temp:
            p=project();p['settings']['solver']='v1-sync'
            p['sourceHash']=io.hashlib.sha256((APP/'tests/fixture.rbxm').read_bytes()).hexdigest()
            target=Path(temp)/'export.zip'
            io.export_asset(APP/'tests/fixture.rbxm',target,p)
            with zipfile.ZipFile(target) as archive:
                self.assertIn('accessory.rbxm',archive.namelist())

    def test_v2_project_settings_are_preserved_but_not_silently_exported_as_legacy(self):
        self.assertEqual(io.validate_motion_settings({'solver':'v2-sync','elasticity':6})['elasticity'],6)
        with self.assertRaises(ValueError):io.validate_motion_settings({'solver':'unknown'})
        with self.assertRaisesRegex(ValueError,'V2'):
            io.export_asset('not-read.rbxm','not-written.zip',{'settings':{'solver':'v2-sync'}})

    def test_motion_attributes_keep_live_values_and_legacy_project_defaults(self):
        import base64
        settings={'damping':.3,'stiffness':.65,'inertia':.7,'elasticity':.65,'windInfluence':.6,'windStrength':2,'windSpeed':4,'windAngle':90}
        raw=base64.b64decode(io.attributes(settings));offset=4;fields={}
        for _ in range(struct.unpack_from('<I',raw)[0]):
            length=struct.unpack_from('<I',raw,offset)[0];offset+=4
            name=raw[offset:offset+length].decode();offset+=length
            kind=raw[offset];offset+=1
            if kind==2:
                length=struct.unpack_from('<I',raw,offset)[0];offset+=4;v=raw[offset:offset+length].decode();offset+=length
            elif kind==6:v=struct.unpack_from('<d',raw,offset)[0];offset+=8
            elif kind==17:v=struct.unpack_from('<fff',raw,offset);offset+=12
            else:self.fail('Unexpected attribute type')
            fields[name]=v
        self.assertEqual(fields['Inertia'],.7);self.assertEqual(fields['Elasticity'],.65);self.assertEqual(fields['WindInfluence'],.6)
        self.assertAlmostEqual(fields['WindDirection'][2],1);self.assertAlmostEqual(fields['WindDirection'][0],0)
        self.assertEqual(offset,len(raw))
        self.assertEqual(io.validate_motion_settings({})['windInfluence'],0)
        for name,bad in [('inertia',float('nan')),('elasticity',1.1),('windInfluence',True),('windSpeed',float('inf'))]:
            with self.subTest(name=name),self.assertRaises(ValueError):io.validate_motion_settings({name:bad})

    def test_export_preserves_original_backface_culling(self):
        for double_sided in ('false', 'true'):
            with self.subTest(double_sided=double_sided), tempfile.TemporaryDirectory() as temp:
                root=Path(temp);doc,accessory=io.read_model(APP/'tests/fixture.rbxm')
                handle,_=io.handles(accessory);io.set_prop(handle,'bool','DoubleSided',double_sided)
                source=root/'original.rbxmx';ET.ElementTree(doc).write(source,encoding='utf-8')
                p=project();p['sourceHash']=io.hashlib.sha256(source.read_bytes()).hexdigest()
                io.export_asset(source,root/'export.zip',p)
                with zipfile.ZipFile(root/'export.zip') as archive:
                    model=root/'export.rbxm';model.write_bytes(archive.read('accessory.rbxm'))
                    _,result=io.read_model(model)
                    self.assertEqual(io.value(io.handles(result)[0],'DoubleSided'),double_sided)


    def test_converter_preserves_typed_shared_binary_fields(self):
        # SharedString is represented as userdata by rbxmk, not as a Lua string.
        # It must retain its type and exact bytes, including NUL/non-UTF8 data.
        raw=b'physics\0mesh\xff\xfe'
        encoded=io.base64.b64encode(raw).decode()
        key=io.base64.b64encode(io.hashlib.md5(raw).digest()).decode()
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);source=root/'shared.rbxmx';binary=root/'shared.rbxm';restored=root/'restored.rbxmx'
            source.write_text('<roblox version="4"><Item class="Accessory"><Properties><string name="Name">Typed</string></Properties><Item class="MeshPart"><Properties><string name="Name">Handle</string><SharedString name="PhysicsData">'+key+'</SharedString><SharedString name="MeshData">'+key+'</SharedString><BinaryString name="Tags">'+encoded+'</BinaryString></Properties></Item></Item><SharedStrings><SharedString md5="'+key+'">'+encoded+'</SharedString></SharedStrings></roblox>',encoding='utf-8')
            io.convert(source,binary,'rbxmx','rbxm')
            io.convert(binary,restored,'rbxm','rbxmx')
            doc=ET.fromstring(restored.read_bytes())
            fields={p.get('name'):p for p in doc.iter() if p.get('name') in ('PhysicsData','MeshData','Tags')}
            self.assertEqual(fields['PhysicsData'].tag,'SharedString')
            self.assertEqual(fields['MeshData'].tag,'SharedString')
            shared={node.get('md5'):io.base64.b64decode(node.text or '') for node in doc.findall('./SharedStrings/SharedString')}
            for name in ('PhysicsData','MeshData'):
                self.assertEqual(shared[fields[name].text],raw)
            self.assertEqual(io.base64.b64decode(fields['Tags'].text),raw)
            if os.environ.get('WORKSHOP_BACKEND'):
                packaged=subprocess.run([os.environ['WORKSHOP_BACKEND'],'import'],
                    input=json.dumps({'path':str(binary)}).encode('utf-8'),
                    stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
                result=json.loads(packaged.stdout)
                self.assertEqual(packaged.returncode,0,result.get('error'))
                self.assertEqual(result['name'],'Typed')

    def test_bridge_only_on_auth_denial_and_no_service_token(self):
        denied=urllib.error.HTTPError('public',403,'Forbidden',{},None)
        with patch.object(io,'fetch_roblox_asset',return_value=b'public'):
            self.assertEqual(io.fetch_with_bridge('rbxassetid://123'),b'public')
        with patch.object(io,'fetch_roblox_asset',side_effect=denied),patch.object(io.AnonymousBridge,'fetch',return_value=b'bridged'):
            self.assertEqual(io.fetch_with_bridge('rbxassetid://123'),b'bridged')
        with patch.object(io,'fetch_roblox_asset',side_effect=urllib.error.HTTPError('public',404,'Missing',{},None)):
            with self.assertRaises(urllib.error.HTTPError):io.fetch_with_bridge('rbxassetid://123')

    def test_anonymous_group_counts_root_once_for_dependencies(self):
        from unittest.mock import MagicMock
        replies=[b'{"data":{"importId":"group","token":"capability","jobId":"root"}}',b'{"data":{"state":"ready"}}',b'root-result',b'{"data":{"jobId":"mesh"}}',b'{"data":{"state":"ready"}}',b'mesh-result']
        actions=[]
        def response(request,timeout):
            self.assertTrue(request.full_url.startswith(io.BRIDGE_URL+'?action=anon_'))
            actions.append(request.full_url.split('action=')[1].split('&')[0])
            if actions[-1]=='anon_begin':self.assertIsNone(request.get_header('Authorization'))
            else:self.assertEqual(request.get_header('Authorization'),'Import group:capability')
            self.assertIsNone(request.get_header('Cookie'))
            result=MagicMock();result.__enter__.return_value.read.return_value=replies.pop(0);return result
        opener=MagicMock();opener.open.side_effect=response
        with patch.object(io.urllib.request,'build_opener',return_value=opener):
            group=io.AnonymousBridge('123');self.assertEqual(group.fetch('123'),b'root-result');self.assertEqual(group.fetch('456'),b'mesh-result');self.assertEqual(group.fetch('456'),b'mesh-result')
        self.assertEqual(actions.count('anon_begin'),1)
        self.assertEqual(opener.open.call_count,6)

    def test_auth_needed_for_dependencies_propagates_to_app(self):
        source=APP/'tests/fixture.rbxm'
        with patch.object(io,'fetch_asset',side_effect=io.BridgeDownloadError('Limit')):
            with self.assertRaises(io.BridgeDownloadError):io.import_asset(source)

    def test_lod0_only_for_v4_and_v5(self):
        for version,header_size in [('4.01',24),('5.00',32)]:
            header=struct.pack('<HHIIHHIHBB',header_size,4,3,2,3,0,0,0,0,0)
            if header_size==32:header+=struct.pack('<II',0,0)
            vertices=b''.join(struct.pack('<8f8x',*p,0,0,1,0,0) for p in [(0,0,0),(1,0,0),(0,1,0)])
            raw=('version '+version+'\n').encode()+header+vertices+struct.pack('<6I',0,1,2,2,1,0)+struct.pack('<3I',0,1,2)
            self.assertEqual(io.parse_mesh(raw)['indices'],[0,1,2])
            with self.assertRaises(ValueError):io.parse_mesh(raw[:-1])

    def test_draco_v7_geometry_uv_and_skin_guard(self):
        import DracoPy
        import numpy as np
        points=np.array([[0.,0.,0.],[1.,0.,0.],[0.,1.,0.]])
        encoded=DracoPy.encode(points,faces=np.array([[0,1,2]],dtype=np.uint32),tex_coord=np.array([[0.,0.],[1.,0.],[0.,1.]]))
        payload=struct.pack('<I',len(encoded))+encoded
        raw=b'version 7.00\nCOREMESH'+struct.pack('<II',2,len(payload))+payload
        parsed=io.parse_mesh(raw)
        self.assertEqual(len(parsed['positions']),9);self.assertEqual(len(parsed['indices']),3);self.assertFalse(parsed['rigged'])
        self.assertEqual(len(parsed['uv']),6)
        skin=struct.pack('<I',3)+bytes(24)+struct.pack('<I',1)
        self.assertTrue(io.parse_mesh(raw+b'SKINNING'+struct.pack('<II',1,len(skin))+skin)['rigged'])
        with self.assertRaises(ValueError):io.parse_mesh(raw[:-1])

    def test_draco_v7_uses_lod0_and_validates_boundaries(self):
        import DracoPy
        import numpy as np
        points=np.array([[0.,0.,0.],[1.,0.,0.],[0.,1.,0.],[1.,1.,0.]])
        encoded=DracoPy.encode(points,faces=np.array([[0,1,2],[1,3,2]],dtype=np.uint32),tex_coord=np.array([[0.,0.],[1.,0.],[0.,1.],[1.,1.]]))
        core=struct.pack('<I',len(encoded))+encoded
        raw=b'version 7.00\nCOREMESH'+struct.pack('<II',2,len(core))+core
        decoded=DracoPy.decode(encoded)
        self.assertEqual(len(io.parse_mesh(raw)['indices']),6)
        def chunk(offsets,version=1,lod_type=4):
            payload=struct.pack('<HBI',lod_type,1,len(offsets))+struct.pack('<%dI'%len(offsets),*offsets)
            return b'LODS\0\0\0\0'+struct.pack('<II',version,len(payload))+payload
        lod=chunk([0,1,2])
        parsed=io.parse_mesh(raw+lod)
        self.assertEqual(parsed['indices'],np.asarray(decoded.faces[0],dtype=int).tolist())
        self.assertEqual(parsed['uv'],io.parse_mesh(raw)['uv'],'LOD selection does not change UV coordinates')
        self.assertEqual(parsed['positions'],io.parse_mesh(raw)['positions'])
        self.assertEqual(io.parse_mesh(raw+chunk([0,0],lod_type=0)),io.parse_mesh(raw),'type-0 no-LOD sentinel keeps the complete core mesh')
        for invalid in (chunk([0,0]),chunk([0,0,2]),chunk([1,1,2]),chunk([0,3,2]),chunk([0,1,3]),chunk([0,1]),chunk([0,1,2],2),lod+lod,lod[:-1]):
            with self.subTest(invalid=invalid.hex()):
                with self.assertRaises(ValueError):io.parse_mesh(raw+invalid)

    def test_categories_preserve_all_rigid_accessory_types_and_conflicts(self):
        for category,enum in zip(io.CATEGORY_IDS,range(1,9)):
            accessory=ET.fromstring('<Item class="Accessory"><Properties><token name="AccessoryType">'+str(enum)+'</token></Properties><Item class="MeshPart"><Properties><string name="Name">Handle</string></Properties></Item></Item>')
            result=io.accessory_category(accessory)
            self.assertEqual(result['catalogType'],category)
            self.assertEqual(result['assetTypeId'],io.CATEGORY_IDS[category])
            self.assertFalse(result['categoryNeedsReview'])
        for attachment,category in io.ATTACHMENT_TYPES.items():
            accessory=ET.fromstring('<Item class="Accessory"><Properties/><Item class="MeshPart"><Properties/><Item class="Attachment"><Properties><string name="Name">'+attachment+'</string></Properties></Item></Item></Item>')
            self.assertEqual(io.accessory_category(accessory)['catalogType'],category)
            io.set_prop(accessory,'token','AccessoryType','2' if category!='hair' else '1')
            self.assertTrue(io.accessory_category(accessory)['categoryNeedsReview'])
            io.set_prop(accessory,'token','AccessoryType','9')
            self.assertIsNone(io.accessory_category(accessory)['catalogType'])
        result={'catalogType':'hair','categoryEvidence':{'candidates':['hair']}}
        io.apply_metadata_category(result,'back')
        self.assertTrue(result['categoryNeedsReview'])
        self.assertIsNone(result['catalogType'])
        self.assertEqual(result['categoryEvidence']['candidates'],['back','hair'])

    def test_ready_package_saves_without_allocating_asset_ids(self):
        p=project();p.pop('meshAssetId')
        source=APP/'tests/fixture.rbxm';p['sourceHash']=io.hashlib.sha256(source.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory() as temp:
            output=Path(temp)/'ready.zip';io.export_asset(source,output,p)
            with zipfile.ZipFile(output) as archive:
                manifest=json.loads(archive.read('manifest.json'))
                _,original=io.read_model(source)
                self.assertEqual(manifest['catalogType'],io.accessory_category(original)['catalogType'])
                self.assertEqual(manifest['classificationVersion'],1)
                self.assertTrue(manifest['assignIdsOnPublish'])
                self.assertEqual(manifest['meshReference'],'rbxasset://jiggle/accessory.mesh')
                self.assertNotIn('123456',archive.read('README.txt').decode())
                for name,digest in manifest['sha256'].items():self.assertEqual(io.hashlib.sha256(archive.read(name)).hexdigest(),digest)
                model=Path(temp)/'ready.rbxm';model.write_bytes(archive.read('accessory.rbxm'))
                _,accessory=io.read_model(model);handle,_=io.handles(accessory)
                self.assertEqual(io.value(handle,'MeshId'),manifest['meshReference'])
                self.assertEqual(len([i for i in accessory.iter('Item') if i.get('class')=='Bone']),3)

    def test_full_roblox_link_uses_direct_provider_for_all_dependencies(self):
        asset=(APP/'tests/fixture.rbxm').read_bytes()
        with patch.object(io,'fetch_roblox_asset',return_value=asset) as fetch,patch.object(io,'import_asset',return_value={'name':'Fixture'}) as load,patch.object(io,'fetch_asset',side_effect=AssertionError('must not use Nyawing')):
            result=io.import_reference('https://www.roblox.com/catalog/175567/item')
            fetch.assert_called_once_with('rbxassetid://175567',None)
            self.assertTrue(callable(load.call_args.kwargs['fetcher']))
            self.assertEqual(result['provider'],'roblox')
            self.assertEqual(result['assetId'],'175567')
            self.assertNotIn('catalogItemId',result)

    def test_brickcolor_binary_wire_type_is_11(self):
        sys.path.insert(0,str(APP.parents[1]/'tools'))
        from build_accessory_effects_client import model_chunks
        from rbxm_tree import read_string
        with tempfile.TemporaryDirectory() as temp:
            xml=Path(temp)/'model.rbxmx';binary=Path(temp)/'model.rbxm'
            xml.write_text('<roblox version="4"><Item class="MeshPart" referent="part"><Properties><string name="Name">Ear</string><int name="BrickColor">194</int></Properties></Item></roblox>',encoding='utf-8')
            io.convert(xml,binary,'rbxmx','rbxm')
            found=[]
            for header,_,payload in model_chunks(binary.read_bytes()):
                if header[:4]==b'PROP':
                    name,pos=read_string(payload,4)
                    if name=='BrickColor':
                        found.append(payload[pos]);self.assertEqual(payload[pos+1:],bytes.fromhex('000000c2'))
            self.assertEqual(found,[11])
    def test_utf8_pipe_preserves_cyrillic_path_under_windows_codepage(self):
        with tempfile.TemporaryDirectory() as temp:
            target=Path(temp)/'ушки ёжик.mesh'
            payload=json.dumps({'path':str(target),'project':project()},ensure_ascii=False).encode('utf-8')
            env={**os.environ,'PYTHONIOENCODING':'cp1251','PYTHONUTF8':'0'}
            command=[os.environ['WORKSHOP_BACKEND'],'save-mesh'] if os.environ.get('WORKSHOP_BACKEND') else [sys.executable,str(APP/'backend/asset_io.py'),'save-mesh']
            result=subprocess.run(command,input=payload,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,timeout=20)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(json.loads(result.stdout)['path'],str(target))
            self.assertTrue(target.is_file())
            self.assertEqual(list(Path(temp).iterdir()),[target])
    def test_com_migration_and_legacy_catalog_links(self):
        for host in ('nyawing.com','www.nyawing.com','catalog.nyawing.com','nyawing.lol'):
            reference='https://'+host+'/catalog/175567/item'
            self.assertEqual(io.reference_id(reference),'175567')
            with patch.object(io,'fetch_asset',side_effect=ValueError('stop')) as fetch:
                with self.assertRaisesRegex(ValueError,'stop'):io.import_reference(reference)
                self.assertEqual(fetch.call_args.args[0],'rbxassetid://2100175567')
        for reference in ('https://nyawing.com.evil.example/catalog/123',
                          'https://me@nyawing.com/catalog/123',
                          'https://evilnyawing.com/catalog/123'):
            with self.assertRaises(ValueError):io.reference_id(reference)

    def test_edited_rest_positions_and_zero_weights_survive_mesh_and_rbxm_export(self):
        p=project();p['version']=1;p['mask']=[0,.85,0];p['anchor']=[.1,.2,.15];p['tip']=[.3,1,.2]
        p['bones'][1]['position']=p['anchor'];p['bones'][2]['position']=p['tip']
        p['bones'][1]['rotation']=[0,-1,0,1,0,0,0,0,1]
        p['skinWeights']=[1,0,0,0,.15,.25,.6,0,1,0,0,0]
        raw=io.build_skinned(p);skin_offset=37+3*40
        self.assertEqual(raw[skin_offset+4:skin_offset+8],bytes([255,0,0,0]))
        self.assertEqual(raw[skin_offset+20:skin_offset+24],bytes([255,0,0,0]))
        records=skin_offset+3*8+12+8
        for i,bone in enumerate(p['bones']):
            self.assertEqual(list(struct.unpack_from('<3f',raw,records+i*60+48)),[io.struct.unpack('<f',io.struct.pack('<f',n))[0] for n in bone['position']])
        with tempfile.TemporaryDirectory() as temp:
            source=APP/'tests/fixture.rbxm';p['sourceHash']=io.hashlib.sha256(source.read_bytes()).hexdigest()
            target=Path(temp)/'edited.zip';io.export_asset(source,target,p)
            with zipfile.ZipFile(target) as z:
                saved=json.loads(z.read('accessory.jiggle.json'));self.assertEqual(saved['bones'],p['bones']);self.assertEqual(saved['skinWeights'],p['skinWeights'])
                self.assertEqual(io.base64.b64decode(saved['sourceBase64']),source.read_bytes())
                binary=Path(temp)/'edited.rbxm';binary.write_bytes(z.read('accessory.rbxm'))
                _,accessory=io.read_model(binary);nodes=[n for n in accessory.iter('Item') if n.get('class')=='Bone']
                root_frame=io.prop(nodes[1],'CFrame');tip_frame=io.prop(nodes[2],'CFrame')
                for axis,k in enumerate(['X','Y','Z']):self.assertAlmostEqual(float(root_frame.findtext(k)),p['anchor'][axis],places=6)
                delta=[p['tip'][i]-p['anchor'][i] for i in range(3)]
                for axis,k in enumerate(['X','Y','Z']):self.assertAlmostEqual(float(tip_frame.findtext(k)),[delta[1],-delta[0],delta[2]][axis],places=6)
                self.assertEqual([float(tip_frame.findtext(k)) for k in ['R00','R01','R02','R10','R11','R12','R20','R21','R22']],[0,1,0,-1,0,0,0,0,1])
        p['skinWeights'][:4]=[.9,.1,0,0]
        with self.assertRaisesRegex(ValueError,'нулевой вес'):io.build_skinned(p)
        p=project();p['bones'][0]['position']=[1,0,0]
        with self.assertRaisesRegex(ValueError,'RigidRoot'):io.build_skinned(p)

    def test_reference_parser_rejects_arbitrary_urls(self):
        for reference in ('123',' rbxassetid://123 ','https://nyawing.lol/catalog/123/name','https://www.roblox.com/catalog/123/name','https://nyawing.lol/catalog/item?itemId=123','https://assetdelivery.nyawing.lol/v1/asset?id=123'):
            self.assertEqual(io.reference_id(reference),'123')
        for reference in ('0','123junk','https://evil.example/catalog/123','http://localhost/item?id=123','https://nyawing.lol.evil.example/catalog/123','https://me@nyawing.lol/catalog/123','https://nyawing.lol/catalog/item?itemId=123&itemId=456','file:///123',123):
            with self.assertRaises(ValueError):io.reference_id(reference)

    def test_reference_import_fetches_accessory_and_geometry_without_running_code(self):
        vertices=[(0,1,0),(-.5,-1,0),(.5,-1,0)]
        mesh=b'version 2.00\n'+struct.pack('<HBBII',12,40,12,3,1)+b''.join(struct.pack('<8f8x',*v,0,0,1,0,0) for v in vertices)+struct.pack('<3I',0,1,2)
        asset=(APP/'tests/fixture.rbxm').read_bytes()
        def fetch(uri,folder):return asset if uri=='rbxassetid://2100000123' else mesh
        with patch.object(io,'fetch_asset',side_effect=fetch) as download,patch.object(io,'product_type',return_value=None):
            result=io.import_reference('https://nyawing.lol/catalog/123/test')
        self.assertEqual(result['name'],'Fixture');self.assertEqual(result['geometry']['positions'],list(sum(vertices,())))
        self.assertEqual(io.base64.b64decode(result['sourceBase64']),asset)
        self.assertEqual(download.call_count,2)
        self.assertEqual(result['assetId'],'2100000123');self.assertEqual(result['catalogItemId'],'123')
        with patch.object(io,'fetch_asset',return_value=b'<html>error</html>'):
            with self.assertRaisesRegex(ValueError,'не аксессуар'):io.import_reference('123')

    def test_catalog_ids_and_asset_ids_are_separate_namespaces(self):
        asset=(APP/'tests/fixture.rbxm').read_bytes()
        with patch.object(io,'import_asset',side_effect=lambda source:{'name':'Fixture'}),patch.object(io,'product_type',return_value=None):
            for reference,expected in [('https://nyawing.lol/catalog/175567/item','2100175567'),('https://www.nyawing.lol/catalog/item?itemId=175567','2100175567'),('175567','2100175567'),('https://www.roblox.com/catalog/175567/item','175567'),('rbxassetid://175567','175567'),('https://assetdelivery.nyawing.lol/v1/asset?id=175567','175567'),('https://nyawing.lol/v1/asset/?id=175567','175567'),('9876543210','9876543210')]:
                if 'roblox.com' in reference:continue  # Direct provider is covered separately.
                with self.subTest(reference=reference),patch.object(io,'fetch_asset',return_value=asset) as fetch:
                    result=io.import_reference(reference);self.assertEqual(result['assetId'],expected);fetch.assert_called_once()
                    self.assertEqual(fetch.call_args.args[0],'rbxassetid://'+expected)
            missing=urllib.error.HTTPError('fixed',404,'Not Found',{},None)
            with patch.object(io,'fetch_asset',side_effect=[missing,asset]) as fetch:
                result=io.import_reference('175567');self.assertEqual(result['assetId'],'175567');self.assertNotIn('catalogItemId',result)
                self.assertEqual([c.args[0] for c in fetch.call_args_list],['rbxassetid://2100175567','rbxassetid://175567'])
            for reference in ['https://nyawing.lol/catalog/175567/item','https://roblox.com/catalog/175567/item','rbxassetid://175567']:
                if 'roblox.com' in reference:continue
                with patch.object(io,'fetch_asset',side_effect=missing) as fetch:
                    with self.assertRaisesRegex(ValueError,'не найден'):io.import_reference(reference)
                    fetch.assert_called_once()
            with patch.object(io,'fetch_asset',side_effect=urllib.error.HTTPError('fixed',503,'Unavailable',{},None)) as fetch:
                with self.assertRaises(urllib.error.HTTPError):io.import_reference('175567')
                fetch.assert_called_once()

    def test_skinned_layout_and_exact_quantized_weights(self):
        p=project();raw=io.build_skinned(p)
        self.assertEqual(io.parse_mesh(raw)['positions'],p['geometry']['positions'])
        self.assertTrue(io.parse_mesh(raw)['rigged'])
        for vertex in range(3):self.assertEqual(sum(raw[37+3*40+vertex*8+4:37+3*40+vertex*8+8]),255)
        header=struct.unpack_from('<HHIIHHIHBB',raw,13)
        self.assertEqual(header[5],3);self.assertEqual(header[7],1)

    def test_invalid_inputs_rejected(self):
        p=project();p['skinWeights'][0]=float('nan')
        with self.assertRaises(ValueError):io.build_skinned(p)
        p=project();p['geometry']['indices'][0]=900
        with self.assertRaises(ValueError):io.build_skinned(p)
        with self.assertRaises((ValueError,struct.error)):io.parse_mesh(b'version 2.00\n')
        p=project();p['geometry']['rigged']=True
        with self.assertRaises(ValueError):io.build_skinned(p)

    def test_binary_rbxm_round_trip_preserves_attachment_and_removes_code(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);original=root/'test.rbxmx'
            original.write_text('<roblox version="4"><Item class="Accessory" referent="A"><Properties><string name="Name">Test</string></Properties><Item class="Part" referent="H"><Properties><string name="Name">Handle</string></Properties><Item class="SpecialMesh" referent="M"><Properties><Content name="MeshId"><url>rbxassetid://987</url></Content></Properties></Item><Item class="Attachment" referent="AT"><Properties><string name="Name">HatAttachment</string></Properties></Item><Item class="LocalScript" referent="S"><Properties><string name="Name">Untrusted</string><ProtectedString name="Source">error("never execute")</ProtectedString></Properties></Item></Item></Item></roblox>')
            p=project();p['sourceHash']=io.hashlib.sha256(original.read_bytes()).hexdigest()
            io.export_asset(original,root/'bundle.zip',p)
            with zipfile.ZipFile(root/'bundle.zip') as z:
                raw=z.read('accessory.rbxm');self.assertTrue(raw.startswith(b'<roblox!'))
                binary=root/'edited.rbxm';binary.write_bytes(raw)
                doc,a=io.read_model(binary);h,m=io.handles(a)
                self.assertEqual(h.get('class'),'MeshPart')
                self.assertEqual(io.value(m,'MeshId'),'rbxassetid://123456')
                self.assertEqual(len([n for n in a.iter('Item') if n.get('class')=='Attachment']),1)
                self.assertEqual(len([n for n in a.iter('Item') if n.get('class')=='Bone']),3)
                self.assertFalse(any(n.get('class')=='LocalScript' for n in a.iter('Item')))
                self.assertIn(b'SmartBone',io.base64.b64decode(io.value(h,'Tags')))
                self.assertIn(b'JiggleRoot',io.base64.b64decode(io.value(h,'AttributesSerialize')))
            self.assertIn('never execute',original.read_text())

    def test_type_detection_from_local_attachment_and_public_metadata(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'hair.rbxmx'
            source.write_text('<roblox version="4"><Item class="Accessory"><Properties><string name="Name">Hair</string></Properties><Item class="Part"><Properties><string name="Name">Handle</string></Properties><Item class="Attachment"><Properties><string name="Name">HairAttachment</string></Properties></Item><Item class="SpecialMesh"><Properties><Content name="MeshId"><url>rbxassetid://987</url></Content></Properties></Item></Item></Item></roblox>',encoding='utf-8')
            with patch.object(io,'fetch_asset',side_effect=ValueError('no mesh')):
                self.assertEqual(io.import_asset(source)['itemType'],'hair')
            source.write_text(source.read_text(encoding='utf-8').replace('HairAttachment','HatAttachment'),encoding='utf-8')
            with patch.object(io,'fetch_asset',side_effect=ValueError('no mesh')):
                self.assertEqual(io.import_asset(source)['itemType'],'accessory')
        asset=(APP/'tests/fixture.rbxm').read_bytes()
        with patch.object(io,'import_asset',return_value={'itemType':'accessory'}),patch.object(io,'fetch_asset',return_value=asset),patch.object(io,'product_type',return_value='hair'):
            self.assertEqual(io.import_reference('https://nyawing.lol/catalog/175567/item')['itemType'],'hair')
        from unittest.mock import MagicMock
        for payload,expected in [(b'{"AssetTypeId":41}','hair'),(b'{"AssetTypeId":8}','hat'),(b'{"AssetTypeId":17}',None),(b'{"AssetTypeId":18}',None),(b'invalid',None),(b'x'*16001,None)]:
            response=MagicMock();response.__enter__.return_value.read.return_value=payload
            opener=MagicMock();opener.open.return_value=response
            with patch.object(io.urllib.request,'build_opener',return_value=opener):
                self.assertEqual(io.product_type('2100175567'),expected)
            request=opener.open.call_args.args[0]
            self.assertEqual(request.full_url,'https://www.nyawing.com/marketplace/productinfo?assetId=2100175567')
            self.assertEqual(request.get_header('User-agent'),io.DOWNLOAD_USER_AGENT)
        with patch.object(io.urllib.request,'build_opener',side_effect=OSError('offline')):
            self.assertIsNone(io.product_type('123'))

    def test_draft_preserves_paint_after_deleting_last_bone_but_cannot_export_skin(self):
        p=project();p['mask']=[0,.85,1];p['bones']=[];p['skinIndices']=[];p['skinWeights']=[]
        self.assertEqual(io.validate_project(p,allow_empty=True),(3,1))
        self.assertEqual(p['mask'],[0,.85,1])
        with self.assertRaisesRegex(ValueError,'цепочку'):io.build_skinned(p)
        p['skinWeights']=[1]
        with self.assertRaisesRegex(ValueError,'skin'):io.validate_project(p,allow_empty=True)
        p['skinWeights']=[];p['mask']=[0,float('nan'),1]
        with self.assertRaisesRegex(ValueError,'выделение'):io.validate_project(p,allow_empty=True)

    def test_independent_parts_export_all_roots_and_validate_ownership(self):
        p=project();p['bones'] += [{'name':'JiggleRoot2','parent':0,'position':[1,0,0]},{'name':'Jiggle2_1','parent':3,'position':[1,1,0]}]
        p['mask']=[0,1,.2];p['owners']=['','JiggleRoot','JiggleRoot2'];p['partNames']={'JiggleRoot':'Left bell','JiggleRoot2':'Weak ear'}
        p['skinIndices']=[0,0,0,0,0,1,2,0,0,3,4,0];p['skinWeights']=[1,0,0,0,0,.2,.8,0,.8,.05,.15,0]
        raw=io.build_skinned(p);self.assertEqual(io.parse_mesh(raw)['positions'],p['geometry']['positions'])
        self.assertEqual(struct.unpack_from('<HHIIHHIHBB',raw,13)[5],5)
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);source=APP/'tests/fixture.rbxm';p['sourceHash']=io.hashlib.sha256(source.read_bytes()).hexdigest()
            io.export_asset(source,root/'parts.zip',p)
            with zipfile.ZipFile(root/'parts.zip') as archive:
                model=root/'parts.rbxm';model.write_bytes(archive.read('accessory.rbxm'));_,accessory=io.read_model(model);handle,_=io.handles(accessory)
                self.assertIn(b'JiggleRoot,JiggleRoot2',io.base64.b64decode(io.value(handle,'AttributesSerialize')))
                restored=json.loads(archive.read('accessory.jiggle.json'));self.assertEqual(restored['owners'],p['owners']);self.assertEqual(restored['partNames'],p['partNames'])
                self.assertEqual(len([b for b in accessory.iter('Item') if b.get('class')=='Bone']),5)
        p['owners'][2]='JiggleRoot'
        with self.assertRaisesRegex(ValueError,'другой части'):io.build_skinned(p)
        p['owners'][2]='';p['skinIndices'][8:12]=[0,0,0,0];p['skinWeights'][8:12]=[1,0,0,0]
        self.assertEqual(io.validate_project(p,allow_empty=True),(3,1))
        with self.assertRaisesRegex(ValueError,'без кости'):io.build_skinned(p)

if __name__=='__main__':unittest.main()
