"""Bounded accessory import and skinned v4 export. No asset code execution."""
import base64
import copy
import hashlib
import gzip
import json
import math
import re
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

APP = Path(sys._MEIPASS) if getattr(sys,'frozen',False) else Path(__file__).resolve().parents[1]
REPO = APP.parents[1]
LIMIT = 24 * 1024 * 1024
# Nyawing catalog row IDs and asset IDs are different namespaces. This matches
# ELYSIA_ASSET_ALIAS_BASE; the fixed delivery host resolves aliases server-side.
CATALOG_ALIAS_BASE = 2100000000
MAX_CATALOG_ID = 2147483647 - CATALOG_ALIAS_BASE
CATEGORY_IDS={'hat':8,'hair':41,'face_accessory':42,'neck':43,'shoulder':44,'front':45,'back':46,'waist':47}
BRIDGE_URL='https://www.nyawing.com/api/v1/jiggle-bridge/index.php'


class BridgeDownloadError(ValueError):
    pass


class AnonymousBridge:
    def __init__(self,root):self.root=root;self.group=None;self.results={}

    def call(self,action,payload=None,job=None,binary=False):
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args):return None
        headers={'Content-Type':'application/json'}
        if self.group:headers['Authorization']='Import '+self.group['importId']+':'+self.group['token']
        request=urllib.request.Request(BRIDGE_URL+'?action=anon_'+action+('&jobId='+job if job else ''),data=json.dumps(payload).encode() if payload is not None else None,headers=headers)
        try:
            with urllib.request.build_opener(NoRedirect()).open(request,timeout=25) as response:data=response.read(LIMIT+1)
        except urllib.error.HTTPError as error:
            if error.code==429:raise BridgeDownloadError('Лимит: 10 аксессуаров за 15 минут с одного IP. Попробуйте позже.') from None
            raise BridgeDownloadError('Мост загрузки недоступен (HTTP '+str(error.code)+').') from None
        if len(data)>LIMIT:raise ValueError('Результат моста превышает лимит.')
        return data if binary else json.loads(data)['data']

    def wait(self,job):
        deadline=time.monotonic()+120
        while time.monotonic()<deadline:
            result=self.call('status',job=job)
            if result['state']=='ready':return self.call('download',job=job,binary=True)
            if result['state']=='failed':raise BridgeDownloadError('Roblox не разрешил загрузку или сервер не смог скачать ассет: '+str(result.get('error','download_failed')))
            time.sleep(2)
        raise ValueError('Сервер ещё загружает предмет. Повторите попытку позже.')

    def fetch(self,number):
        if not self.group:
            self.group=self.call('begin',{'assetId':self.root})
            self.results[self.root]=self.wait(self.group['jobId'])
        if number not in self.results:self.results[number]=self.wait(self.call('request',{'assetId':number})['jobId'])
        return self.results[number]


def fetch_with_bridge(uri,folder=None,context=None):
    try:return fetch_roblox_asset(uri,folder)
    except urllib.error.HTTPError as error:
        if error.code not in (401,403):raise
    number=re.search(r'(?:rbxassetid://|[?&]id=)(\d+)',uri or '')[1]
    return (context or AnonymousBridge(number)).fetch(number)
ACCESSORY_ENUM={str(i):name for i,name in enumerate(CATEGORY_IDS,1)}
ATTACHMENT_TYPES={'HatAttachment':'hat','HairAttachment':'hair','FaceFrontAttachment':'face_accessory','FaceCenterAttachment':'face_accessory','NeckAttachment':'neck','NeckRigAttachment':'neck','LeftShoulderAttachment':'shoulder','RightShoulderAttachment':'shoulder','LeftCollarAttachment':'shoulder','RightCollarAttachment':'shoulder','BodyFrontAttachment':'front','BodyBackAttachment':'back','WaistFrontAttachment':'waist','WaistCenterAttachment':'waist','WaistBackAttachment':'waist'}


def accessory_category(accessory):
    """Classification hints, not an authorization or a substitute for server validation."""
    handle,_=handles(accessory)
    attachments=sorted({value(n,'Name') for n in handle.findall('Item') if n.get('class')=='Attachment'})
    candidates={ATTACHMENT_TYPES[n] for n in attachments if n in ATTACHMENT_TYPES}
    enum=value(accessory,'AccessoryType','0')
    declared=ACCESSORY_ENUM.get(enum)
    if declared:candidates.add(declared)
    if accessory.get('class')=='Hat':candidates.add('hat')
    unsupported=enum not in ('','0') and declared is None
    category=next(iter(candidates)) if len(candidates)==1 and not unsupported else None
    return {'catalogType':category,'assetTypeId':CATEGORY_IDS.get(category),'categoryNeedsReview':category is None,'categoryEvidence':{'accessoryType':enum,'attachments':attachments,'candidates':sorted(candidates),'unsupportedType':unsupported}}


def apply_metadata_category(result,category):
    if category=='accessory':return  # Legacy coarse metadata cannot disambiguate.
    if category not in CATEGORY_IDS:return
    evidence=result.get('categoryEvidence',{})
    candidates=set(evidence.get('candidates',[]));candidates.add(category)
    resolved=category if len(candidates)==1 and not evidence.get('unsupportedType',False) else None
    result.update(catalogType=resolved,assetTypeId=CATEGORY_IDS.get(resolved),categoryNeedsReview=resolved is None)
    result['categoryEvidence']={**evidence,'metadataType':category,'candidates':sorted(candidates)}
    result['itemType']='hair' if resolved=='hair' else 'accessory'


def bounded_file(path):
    path = Path(path)
    if path.stat().st_size > LIMIT:
        raise ValueError('Файл слишком большой (предел 24 МБ).')
    return path.read_bytes()


def converter():
    candidates = [Path(sys.executable).parent/'rbxmk.exe', APP/'rbxmk.exe', APP/'backend/rbxmk.exe', REPO/'rbxmk/rbxmk.exe']
    for candidate in candidates:
        if candidate.is_file(): return candidate
    raise ValueError('Не найден компонент чтения RBXM (rbxmk).')


def convert(source, destination, in_format, out_format):
    result=subprocess.run([str(converter()),'run','--include-root',str(Path(source).resolve().parent),
                          '--include-root',str(Path(destination).resolve().parent),str(APP/'backend/convert.lua'),
                          str(Path(source).resolve()),str(Path(destination).resolve()),in_format,out_format],
                         check=True,timeout=20,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if not Path(destination).is_file():
        raise ValueError('Конвертер не создал файл: '+result.stderr.decode('utf-8',errors='replace')[:500])


def read_model(path):
    raw = bounded_file(path)
    if raw.lstrip().startswith((b'<roblox ',b'<roblox>',b'<?xml')):
        xml = raw
    else:
        with tempfile.TemporaryDirectory(prefix='jiggle-import-') as temp:
            output = Path(temp)/'model.rbxmx'
            convert(path,output,'rbxm','rbxmx')
            xml = bounded_file(output)
    if b'<!DOCTYPE' in xml or b'<!ENTITY' in xml:
        raise ValueError('XML с внешними сущностями не поддерживается.')
    doc = ET.fromstring(xml)
    if len(list(doc.iter())) > 60000: raise ValueError('Слишком много объектов в файле.')
    accessories = [i for i in doc.findall('Item') if i.get('class') in ('Accessory','Hat')]
    if len(accessories) != 1: raise ValueError('Нужен файл с одним аксессуаром (Accessory или Hat).')
    return doc, accessories[0]


def prop(item,name):
    return next((p for p in item.find('Properties') if p.get('name')==name),None)


def value(item,name,default=''):
    p = prop(item,name)
    if p is None: return default
    return p.findtext('url') if p.tag=='Content' else p.text or default


def vector(item,name,default):
    p = prop(item,name)
    return default if p is None else [float(p.findtext(k,'0')) for k in ('X','Y','Z')]


def handles(accessory):
    found=[]
    for item in accessory.iter('Item'):
        if item.get('class')=='MeshPart': found.append((item,item))
        elif item.get('class')=='SpecialMesh':
            parent = next((p for p in accessory.iter('Item') if item in list(p)),None)
            if parent is not None: found.append((parent,item))
    if len(found)!=1: raise ValueError('Пока поддерживается один меш в аксессуаре. Разделите сложный аксессуар на части.')
    return found[0]


def fetch_roblox_asset(uri, folder=None):
    """Public delivery only: no browser profile, cookie jar or stored credentials."""
    match=re.search(r'(?:rbxassetid://|[?&]id=)(\d+)',uri or '')
    if not match:raise ValueError('В ссылке ассета отсутствует ID.')
    class PublicRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,req,fp,code,msg,headers,newurl):
            target=urllib.parse.urlsplit(newurl)
            host=target.hostname or ''
            if target.scheme!='https' or target.username or target.password or target.port not in (None,443) or not (host=='assetdelivery.roblox.com' or host.endswith('.rbxcdn.com')):
                raise ValueError('Roblox вернул неподдерживаемый адрес загрузки.')
            return super().redirect_request(req,fp,code,msg,headers,newurl)
    opener=urllib.request.build_opener(PublicRedirect())
    request=urllib.request.Request('https://assetdelivery.roblox.com/v1/asset/?id='+match[1],headers={'User-Agent':'NyawingWorkshop/0.1.14'})
    with opener.open(request,timeout=20) as response:data=response.read(LIMIT+1)
    if len(data)>LIMIT:raise ValueError('Ассет слишком большой.')
    if data.startswith(b'\x1f\x8b'):
        import io
        with gzip.GzipFile(fileobj=io.BytesIO(data)) as stream:data=stream.read(LIMIT+1)
        if len(data)>LIMIT:raise ValueError('Распакованный ассет слишком большой.')
    return data


def fetch_asset(uri, folder):
    match = re.search(r'(?:rbxassetid://|[?&]id=)(\d+)',uri or '')
    if not match: raise ValueError('Меш не найден: выберите его файл .mesh.')
    number=match[1]
    for path in [Path(folder)/(number+'.mesh'), REPO/'Webserver/www/v1/asset/cache'/number]:
        if path.is_file(): return bounded_file(path)
    # Never follow asset-controlled URLs or redirects to arbitrary hosts.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args): return None
    opener=urllib.request.build_opener(NoRedirect())
    url='https://assetdelivery.nyawing.com/v1/asset?id='+number
    with opener.open(url,timeout=10) as response:
        data=response.read(LIMIT+1)
    if len(data)>LIMIT: raise ValueError('Ассет слишком большой.')
    return data


def reference_id(reference):
    """Extract an ID, never request the user-supplied URL itself."""
    if not isinstance(reference,str) or len(reference)>2048:
        raise ValueError('Вставьте ID предмета или ссылку на его страницу.')
    reference=reference.strip()
    number=reference if re.fullmatch(r'[1-9]\d{0,18}',reference) else None
    if reference.startswith('rbxassetid://'):
        number=reference.removeprefix('rbxassetid://')
    elif number is None:
        url=urllib.parse.urlsplit(reference)
        hosts={'nyawing.com','www.nyawing.com','catalog.nyawing.com','assetdelivery.nyawing.com','assetgame.nyawing.com','nyawing.lol','www.nyawing.lol','catalog.nyawing.lol','assetdelivery.nyawing.lol','assetgame.nyawing.lol','roblox.com','www.roblox.com'}
        if url.scheme not in ('https','http') or url.hostname not in hosts or url.username or url.password or url.port:
            raise ValueError('Нужна ссылка Nyawing/Roblox на предмет, либо его числовой ID.')
        match=re.fullmatch(r'/(?:catalog|library|items|assets)/(\d+)(?:/[^?]*)?/?',url.path)
        if match: number=match[1]
        elif url.path.rstrip('/') in ('/catalog/item','/v1/asset','/asset','/item'):
            query=urllib.parse.parse_qs(url.query)
            choices=[v for key in ('id','itemId') for v in query.get(key,[])]
            if len(choices)==1: number=choices[0]
    if not number or not re.fullmatch(r'[1-9]\d{0,18}',number):
        raise ValueError('В ссылке не найден ID предмета. Вставьте числовой ID.')
    return number


def product_type(asset_id):
    # Optional public metadata, no session or user-supplied host. A metadata
    # failure must not turn a successful accessory import into an error.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args):return None
    try:
        with urllib.request.build_opener(NoRedirect()).open('https://www.nyawing.com/marketplace/productinfo?assetId='+asset_id,timeout=5) as response:
            raw=response.read(16001)
        if len(raw)>16000:return None
        kind=json.loads(raw).get('AssetTypeId')
        return next((name for name,number in CATEGORY_IDS.items() if number==kind),None)
    except Exception:return None

def import_reference(reference):
    number=reference_id(reference)
    text=reference.strip()
    bare=bool(re.fullmatch(r'[1-9]\d{0,18}',text))
    url=urllib.parse.urlsplit(text)
    if url.hostname in {'roblox.com','www.roblox.com'}:
        context=AnonymousBridge(number)
        fetcher=lambda uri,folder=None:fetch_with_bridge(uri,folder,context=context)
        with tempfile.TemporaryDirectory(prefix='jiggle-roblox-') as temp:
            try:raw=fetcher('rbxassetid://'+number)
            except urllib.error.HTTPError as error:
                raise ValueError('Roblox не отдал предмет (HTTP '+str(error.code)+'). Проверьте доступность и ссылку на аксессуар.') from error
            if not raw.lstrip().startswith((b'<roblox!',b'<roblox ',b'<roblox>',b'<?xml')):
                raise ValueError('Нужна полная ссылка Roblox на аксессуар, а не на меш или изображение.')
            source=Path(temp)/'accessory.rbxm';source.write_bytes(raw)
            result=import_asset(source,fetcher=fetcher)
            result.update(sourceBase64=base64.b64encode(raw).decode(),assetId=number,provider='roblox')
            return result
    catalog_url=(url.hostname in {'nyawing.com','www.nyawing.com','catalog.nyawing.com','nyawing.lol','www.nyawing.lol','catalog.nyawing.lol'}
                 and url.path.rstrip('/') not in ('/v1/asset','/asset'))
    if catalog_url and int(number)>MAX_CATALOG_ID:
        raise ValueError('ID предмета Nyawing выходит за диапазон каталога.')
    catalog=catalog_url or (bare and int(number)<=MAX_CATALOG_ID)
    asset_id=str(CATALOG_ALIAS_BASE+int(number)) if catalog else number
    with tempfile.TemporaryDirectory(prefix='jiggle-download-') as temp:
        try:
            raw=fetch_asset('rbxassetid://'+asset_id,temp)
        except urllib.error.HTTPError as error:
            # Bare IDs also accept original asset IDs when there is no catalog
            # row. Explicit catalog URLs never fall through to a different item.
            if error.code==404 and bare and catalog:
                catalog=False;asset_id=number
                try:raw=fetch_asset('rbxassetid://'+asset_id,temp)
                except urllib.error.HTTPError as fallback:
                    if fallback.code==404:raise ValueError('Предмет '+number+' не найден в каталоге или хранилище ассетов Nyawing.') from fallback
                    raise
            elif error.code==404:
                raise ValueError(('Предмет каталога ' if catalog else 'Ассет ')+number+' не найден в Nyawing.') from error
            else:raise
        if not raw.lstrip().startswith((b'<roblox!',b'<roblox ',b'<roblox>',b'<?xml')):
            raise ValueError('По этому ID получен не аксессуар RBXM. Нужен ID предмета, не меша или картинки.')
        source=Path(temp)/'accessory.rbxm';source.write_bytes(raw)
        result=import_asset(source)
        detected=product_type(asset_id)
        if detected:apply_metadata_category(result,detected)
        result['sourceBase64']=base64.b64encode(raw).decode()
        result['assetId']=asset_id
        if catalog:result['catalogItemId']=number
        return result


def parse_mesh(data):
    if data.startswith(b'version 7.00\n'):
        return parse_draco_mesh(data)
    if data.startswith(b'version 2.00\n'):
        header,stride,face_stride,nv,nf=struct.unpack_from('<HBBII',data,13)
        if header!=12 or stride not in (36,40) or face_stride!=12: raise ValueError('Неизвестная структура меша v2.')
        start=25; faces_start=start+nv*stride; rigged=False
    elif data.startswith((b'version 4.00\n',b'version 4.01\n',b'version 5.00\n')):
        header,_,nv,nf,nl,nb,names,ns,hq,_=struct.unpack_from('<HHIIHHIHBB',data,13)
        if header not in (24,32): raise ValueError('Неизвестная структура меша v4/v5.')
        start=13+header;stride=40;faces_start=start+nv*stride+(nv*8 if nb else 0);rigged=bool(nb)
        # Faces from subsequent LODs overlap LOD0; they are alternatives, not
        # extra geometry. Keep only the highest-detail interval.
        lod_start=faces_start+nf*12
        if nl>=2:
            if nl>128 or lod_start+nl*4>len(data):raise ValueError('Повреждённая таблица LOD.')
            lods=struct.unpack_from('<%dI'%nl,data,lod_start)
            if lods[0]!=0 or any(a>b for a,b in zip(lods,lods[1:])) or lods[-1]>nf:raise ValueError('Некорректные границы LOD.')
            nf=lods[1]
    else: raise ValueError('Поддерживаются меши v2/v4/v5/v7. Этот формат пока не поддерживается.')
    if not 3<=nv<=100000 or not 1<=nf<=150000 or faces_start+nf*12>len(data):
        raise ValueError('Меш повреждён или превышает предел сложности.')
    positions=[];normals=[];uv=[]
    for i in range(nv):
        fields=struct.unpack_from('<8f',data,start+i*stride)
        if not all(math.isfinite(x) and abs(x)<1e7 for x in fields): raise ValueError('Некорректные координаты меша.')
        positions.extend(fields[:3]);normals.extend(fields[3:6]);uv.extend(fields[6:8])
    indices=list(struct.unpack_from('<%dI'%(nf*3),data,faces_start))
    if any(i>=nv for i in indices): raise ValueError('Повреждённые индексы треугольников.')
    return dict(positions=positions,normals=normals,uv=uv,indices=indices,rigged=rigged)


def parse_draco_mesh(data):
    import DracoPy
    import numpy as np
    cursor=13;core=None;rigged=False;lod_offsets=None;lod_type=None
    while cursor<len(data):
        if cursor+16>len(data):raise ValueError('Повреждённый заголовок меша v7.')
        tag,version,length=struct.unpack_from('<8sII',data,cursor);cursor+=16
        if length>LIMIT or cursor+length>len(data):raise ValueError('Повреждённый блок меша v7.')
        payload=data[cursor:cursor+length];cursor+=length
        if tag==b'COREMESH':
            if core is not None or version!=2 or len(payload)<4:raise ValueError('Неизвестный COREMESH v7.')
            count=struct.unpack_from('<I',payload)[0]
            if count!=len(payload)-4:raise ValueError('Повреждённый поток Draco.')
            core=payload[4:]
        if tag==b'SKINNING':
            if len(payload)<4:raise ValueError('Повреждённый скелет v7.')
            vertices=struct.unpack_from('<I',payload)[0];offset=4+vertices*8
            if offset+4>len(payload):raise ValueError('Повреждённые веса v7.')
            rigged=rigged or bool(struct.unpack_from('<I',payload,offset)[0])
        if tag==b'LODS\0\0\0\0':
            # LODS v1: three metadata bytes, uint32 boundary count, followed
            # by face offsets. Each interval is an alternative detail level,
            # not additional geometry; rendering all intervals causes overlap.
            if lod_offsets is not None or version!=1 or len(payload)<7:
                raise ValueError('Неизвестный или повреждённый блок LOD меша v7.')
            count=struct.unpack_from('<I',payload,3)[0]
            if not 2<=count<=128 or len(payload)!=7+count*4:
                raise ValueError('Повреждённая таблица LOD меша v7.')
            lod_type=struct.unpack_from('<H',payload)[0]
            lod_offsets=struct.unpack_from('<%dI'%count,payload,7)
    if core is None:raise ValueError('В меше v7 нет геометрии COREMESH.')
    decoded=DracoPy.decode(core)
    points=np.asarray(decoded.points,dtype=float);faces=np.asarray(decoded.faces,dtype=int)
    if points.ndim!=2 or points.shape[1]!=3 or not 3<=len(points)<=100000 or faces.ndim!=2 or faces.shape[1]!=3 or not 1<=len(faces)<=150000:raise ValueError('Меш Draco превышает предел сложности.')
    if not np.isfinite(points).all() or (np.abs(points)>1e7).any() or (faces<0).any() or (faces>=len(points)).any():raise ValueError('Некорректная геометрия Draco.')
    if lod_offsets is not None:
        # Roblox also emits a type-0 [0, 0] sentinel when there are no
        # alternative LODs. It denotes the whole core mesh, not an empty LOD0.
        no_lods=lod_type==0 and lod_offsets==(0,0)
        if not no_lods:
            if (lod_offsets[0]!=0 or lod_offsets[1]<=0 or lod_offsets[-1]!=len(faces) or
                any(a>b for a,b in zip(lod_offsets,lod_offsets[1:]))):
                raise ValueError('Некорректные границы LOD меша v7.')
            faces=faces[lod_offsets[0]:lod_offsets[1]]
    normals=decoded.normals
    if normals is None:
        attribute=decoded.get_attribute_by_unique_id(1)
        if attribute is not None and attribute.get('num_components')==3:normals=attribute['data']
    if normals is None:
        normals=np.zeros_like(points);tri=points[faces];face_normals=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
        for axis in range(3):np.add.at(normals,faces[:,axis],face_normals)
        lengths=np.linalg.norm(normals,axis=1);normals/=np.maximum(lengths,1e-12)[:,None]
    normals=np.asarray(normals,dtype=float)
    uv=np.zeros((len(points),2)) if decoded.tex_coord is None else np.asarray(decoded.tex_coord,dtype=float)
    if normals.shape!=points.shape or uv.shape!=(len(points),2) or not np.isfinite(normals).all() or not np.isfinite(uv).all():raise ValueError('Повреждённые нормали или UV Draco.')
    return dict(positions=points.reshape(-1).tolist(),normals=normals.reshape(-1).tolist(),uv=uv.reshape(-1).tolist(),indices=faces.reshape(-1).tolist(),rigged=rigged)


def import_asset(path,fetcher=None):
    fetcher=fetcher or fetch_asset
    doc,accessory=read_model(path);handle,mesh=handles(accessory)
    result={'name':value(accessory,'Name','Аксессуар'),'meshUri':value(mesh,'MeshId'),
            'sourceHash':hashlib.sha256(bounded_file(path)).hexdigest(),'warnings':[],
            'itemType':'hair' if value(accessory,'AccessoryType')=='2' or any(i.get('class')=='Attachment' and value(i,'Name')=='HairAttachment' for i in accessory.iter('Item')) else 'accessory'}
    result['appearance']={'doubleSided':value(handle,'DoubleSided','false')=='true'}
    result.update(accessory_category(accessory))
    result['itemType']='hair' if result['catalogType']=='hair' else 'accessory'
    try:
        geometry=parse_mesh(fetcher(result['meshUri'],Path(path).parent))
        if mesh.get('class')=='SpecialMesh':
            scale=vector(mesh,'Scale',[1,1,1]);offset=vector(mesh,'Offset',[0,0,0])
        else:
            size=vector(handle,'size',vector(handle,'Size',[1,1,1]));initial=vector(handle,'InitialSize',size)
            scale=[size[i]/initial[i] if initial[i] else 1 for i in range(3)];offset=[0,0,0]
        if any(x<=0 or not math.isfinite(x) for x in scale): raise ValueError('Некорректный масштаб аксессуара.')
        for i in range(len(geometry['positions'])):
            geometry['positions'][i]=geometry['positions'][i]*scale[i%3]+offset[i%3]
        for i in range(0,len(geometry['normals']),3):
            n=[geometry['normals'][i+j]/scale[j] for j in range(3)];length=math.sqrt(sum(x*x for x in n)) or 1
            geometry['normals'][i:i+3]=[x/length for x in n]
        result['geometry']=geometry
        if geometry['rigged']: result['warnings'].append('Меш уже имеет скелет. Эта версия не перезаписывает существующие веса.')
    except BridgeDownloadError:raise
    except Exception as error:
        result['geometry']=None;result['warnings'].append(str(error))
    texture=value(mesh,'TextureID',value(mesh,'TextureId'))
    result['texture']=None
    if texture:
        try:
            raw=fetcher(texture,Path(path).parent)
            if raw.startswith(b'\x89PNG\r\n\x1a\n'): result['texture']='data:image/png;base64,'+base64.b64encode(raw).decode()
            elif raw.startswith(b'\xff\xd8\xff'): result['texture']='data:image/jpeg;base64,'+base64.b64encode(raw).decode()
            else: raise ValueError('Текстура не PNG/JPEG.')
        except BridgeDownloadError:raise
        except Exception: result['warnings'].append('Текстура недоступна; геометрию можно редактировать без неё.')
    return result


def validate_project(project,allow_empty=False):
    geometry=project['geometry'];nv=len(geometry['positions'])//3
    if geometry.get('rigged'): raise ValueError('Экспорт существующего рига пока отключён: не хотим потерять его веса.')
    if not 3<=nv<=100000: raise ValueError('Некорректное число вершин.')
    for key,stride in [('positions',3),('normals',3),('uv',2)]:
        fields=geometry[key]
        if len(fields)!=nv*stride or any(not isinstance(x,(int,float)) or not math.isfinite(x) or abs(x)>1e7 for x in fields):
            raise ValueError('Некорректные данные геометрии.')
    indices=geometry['indices']
    if not indices or len(indices)%3 or len(indices)>450000 or any(type(i)!=int or not 0<=i<nv for i in indices): raise ValueError('Некорректные грани.')
    mask=project.get('mask')
    if mask is not None and (len(mask)!=nv or any(not isinstance(x,(int,float)) or not math.isfinite(x) or not 0<=x<=1 for x in mask)):
        raise ValueError('Некорректное выделение проекта.')
    bones=project['bones']
    # A saved editor draft may retain paint after deleting its final bone.
    # Skinned mesh/RBXM export still requires a real chain and valid skin rows.
    if allow_empty and bones==[]:
        if project['skinIndices']!=[] or project['skinWeights']!=[]:raise ValueError('У проекта без костей не должно быть skin-привязок.')
        owners=project.get('owners')
        if owners is not None and (len(owners)!=nv or any(owner!='' for owner in owners)):raise ValueError('У проекта без костей не должно быть привязок частей.')
        if project.get('partNames'):raise ValueError('У проекта без костей не должно быть названий цепочек.')
        return nv,len(indices)//3
    if not 3<=len(bones)<=26: raise ValueError('Сначала создайте цепочку костей.')
    for i,bone in enumerate(bones):
        if bone['parent']!=-1 and not 0<=bone['parent']<i: raise ValueError('Некорректная иерархия костей.')
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,40}',bone['name']): raise ValueError('Некорректное имя кости.')
        if len(bone['position'])!=3 or any(not math.isfinite(x) or abs(x)>10000 for x in bone['position']): raise ValueError('Некорректная позиция кости.')
        r=bone.get('rotation',[1,0,0,0,1,0,0,0,1])
        if len(r)!=9 or any(not math.isfinite(x) or abs(x)>1.001 for x in r): raise ValueError('Некорректный поворот кости.')
        for row in range(3):
            if abs(sum(x*x for x in r[row*3:row*3+3])-1)>1e-4: raise ValueError('Некорректная матрица кости.')
            for other in range(row):
                if abs(sum(r[row*3+k]*r[other*3+k] for k in range(3)))>1e-4: raise ValueError('Оси кости не ортогональны.')
        determinant=r[0]*(r[4]*r[8]-r[5]*r[7])-r[1]*(r[3]*r[8]-r[5]*r[6])+r[2]*(r[3]*r[7]-r[4]*r[6])
        if abs(determinant-1)>1e-4: raise ValueError('Отражённая матрица кости не поддерживается.')
    if len({b['name'] for b in bones})!=len(bones): raise ValueError('Имена костей повторяются.')
    rigid=bones[0]
    if rigid['name']!='RigidRoot' or rigid['parent']!=-1 or rigid['position']!=[0,0,0] or rigid.get('rotation',[1,0,0,0,1,0,0,0,1])!=[1,0,0,0,1,0,0,0,1]:
        raise ValueError('Неподвижный RigidRoot должен оставаться в исходной позиции.')
    roots={i:b['name'] for i,b in enumerate(bones) if b['parent']==0}
    root_for={0:''}
    for i,b in enumerate(bones[1:],1):
        if b['parent']<0: raise ValueError('Все гибкие цепочки должны идти от RigidRoot.')
        root_for[i]=roots.get(i,root_for[b['parent']])
        children=[j for j,node in enumerate(bones) if node['parent']==i]
        if len(children)>1 or (i in roots and not children): raise ValueError('Каждая часть должна содержать последовательную цепочку с началом и концом.')
    owners=project.get('owners')
    if owners is not None and (len(owners)!=nv or any(owner and owner not in roots.values() for owner in owners)): raise ValueError('Некорректная привязка частей.')
    names=project.get('partNames',{})
    if not isinstance(names,dict) or any(key not in roots.values() or not isinstance(value,str) or len(value)>60 for key,value in names.items()): raise ValueError('Некорректные названия частей.')
    mask=project.get('mask')
    if mask is not None and (len(mask)!=nv or any(not isinstance(x,(int,float)) or not math.isfinite(x) or not 0<=x<=1 for x in mask)):
        raise ValueError('Некорректное выделение проекта.')
    if len(project['skinIndices'])!=nv*4 or len(project['skinWeights'])!=nv*4: raise ValueError('Нет весов для всех вершин.')
    for i in range(nv):
        weights=project['skinWeights'][i*4:i*4+4];ids=project['skinIndices'][i*4:i*4+4]
        if any(type(j)!=int or not 0<=j<len(bones) for j in ids) or any(not math.isfinite(w) or not 0<=w<=1 for w in weights) or abs(sum(weights)-1)>1e-4:
            raise ValueError('Некорректные веса вершин.')
        if mask is not None:
            flexible=sum(w for j,w in zip(ids,weights) if j!=0)
            pending=owners is not None and not owners[i] and mask[i]>0
            if pending and not allow_empty: raise ValueError('Есть покрашенные вершины без кости. Привяжите их кистью к части или сотрите вес.')
            if owners is not None and any(w>0 and j!=0 and root_for[j]!=owners[i] for j,w in zip(ids,weights)): raise ValueError('Вес вершины относится к другой части.')
            expected=0 if pending else mask[i]
            if (mask[i]==0 and flexible!=0) or abs(flexible-expected)>1e-4:
                raise ValueError('Веса не соответствуют выделению: нулевой вес должен быть полностью неподвижным.')
    return nv,len(indices)//3


def build_skinned(project):
    nv,nf=validate_project(project);g=project['geometry'];bones=project['bones']
    vertices=bytearray();skin=bytearray();records=bytearray();names=bytearray()
    for i in range(nv):
        vertices+=struct.pack('<3f3f2f4b4B',*g['positions'][i*3:i*3+3],*g['normals'][i*3:i*3+3],*g['uv'][i*2:i*2+2],0,0,0,127,255,255,255,255)
        weights=project['skinWeights'][i*4:i*4+4]
        quant=[int(w*255) for w in weights]
        # Give the rounding remainder to the largest influence, keeping sum 255.
        quant[max(range(4),key=lambda k:weights[k])]+=255-sum(quant)
        skin+=bytes(project['skinIndices'][i*4:i*4+4])+bytes(quant)
    for bone in bones:
        records+=struct.pack('<IHH13f',len(names),65535 if bone['parent']==-1 else bone['parent'],65535,0,*bone.get('rotation',[1,0,0,0,1,0,0,0,1]),*bone['position'])
        names+=bone['name'].encode()+b'\0'
    subset=struct.pack('<5I26H',0,nf,0,nv,len(bones),*list(range(len(bones))),*([65535]*(26-len(bones))))
    header=struct.pack('<HHIIHHIHBB',24,1,nv,nf,2,len(bones),len(names),1,1,0)
    return b'version 4.01\n'+header+vertices+skin+struct.pack('<%dI'%len(g['indices']),*g['indices'])+struct.pack('<II',0,nf)+records+names+subset


def set_prop(item,tag,name,text=None):
    properties=item.find('Properties')
    old=prop(item,name)
    if old is not None: properties.remove(old)
    p=ET.SubElement(properties,tag,name=name);p.text=text
    return p


def frame(item,position,rotation=None):
    p=set_prop(item,'CoordinateFrame','CFrame')
    for key,num in zip(('X','Y','Z','R00','R01','R02','R10','R11','R12','R20','R21','R22'),[*position,*(rotation or [1,0,0,0,1,0,0,0,1])]): ET.SubElement(p,key).text=str(num)


def attributes(settings,roots='JiggleRoot'):
    fields={'Roots':roots,'Damping':float(settings['damping']),'Stiffness':float(settings['stiffness']),
            'WindInfluence':0.0,'Inertia':0.0,'UpdateRate':60.0}
    out=bytearray(struct.pack('<I',len(fields)))
    for name,v in fields.items():
        encoded=name.encode();out+=struct.pack('<I',len(encoded))+encoded
        if isinstance(v,str): encoded=v.encode();out+=b'\x02'+struct.pack('<I',len(encoded))+encoded
        else: out+=b'\x06'+struct.pack('<d',v)
    return base64.b64encode(out).decode()


def export_asset(source,path,project):
    if project.get('sourceHash')!=hashlib.sha256(bounded_file(source)).hexdigest(): raise ValueError('Исходный файл изменился. Загрузите его заново.')
    mesh_bytes=build_skinned(project)
    mesh_id=str(project.get('meshAssetId',''))
    if mesh_id and not re.fullmatch(r'[1-9]\d{0,18}',mesh_id):raise ValueError('Некорректный служебный ID меша.')
    # Offline packages use a relative binding, not a fabricated/reserved asset ID.
    # Publication assigns the real IDs and rewrites this one declared reference.
    mesh_uri='rbxassetid://'+mesh_id if mesh_id else 'rbxasset://jiggle/accessory.mesh'
    for name in ('damping','stiffness'):
        v=project['settings'][name]
        if not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=1: raise ValueError('Некорректные настройки физики.')
    doc,accessory=read_model(source);handle,old_mesh=handles(accessory)
    # Keep attachments and accessory identity; turn a rigid Handle into MeshPart.
    texture=value(old_mesh,'TextureID',value(old_mesh,'TextureId'))
    if old_mesh is not handle: handle.remove(old_mesh)
    handle.set('class','MeshPart')
    for parent in list(accessory.iter()):
        for child in list(parent):
            if child.tag=='Item' and child.get('class') in ('Script','LocalScript','ModuleScript','Bone'): parent.remove(child)
    for name in ('MeshId','TextureID'):
        p=set_prop(handle,'Content',name);ET.SubElement(p,'url').text=mesh_uri if name=='MeshId' else texture
    set_prop(handle,'bool','HasSkinnedMesh','true');set_prop(handle,'token','RenderFidelity','0')
    set_prop(handle,'bool','CanCollide','false');set_prop(handle,'bool','Massless','true')
    # Preserve backface culling: inverted hulls use it for cartoon outlines.
    # Forcing double-sided rendering exposes the shell and fills its interior.
    set_prop(handle,'bool','DoubleSided',value(handle,'DoubleSided','false'))
    for name in ('size','InitialSize'):
        p=set_prop(handle,'Vector3',name)
        positions=project['geometry']['positions']
        for axis,key in enumerate(('X','Y','Z')):
            extent=max(positions[axis::3])-min(positions[axis::3])
            ET.SubElement(p,key).text=str(max(extent,0.001))
    set_prop(handle,'BinaryString','Tags',base64.b64encode(b'SmartBone\0').decode())
    set_prop(handle,'BinaryString','AttributesSerialize',attributes(project['settings'],','.join(b['name'] for b in project['bones'] if b['parent']==0)))
    items=[]
    for i,bone in enumerate(project['bones']):
        parent=handle if bone['parent']==-1 else items[bone['parent']]
        node=ET.SubElement(parent,'Item',{'class':'Bone','referent':'JIGGLE_BONE_'+str(i)})
        ET.SubElement(node,'Properties');set_prop(node,'string','Name',bone['name'])
        parent_bone=None if bone['parent']==-1 else project['bones'][bone['parent']]
        base=[0,0,0] if parent_bone is None else parent_bone['position']
        parent_r=[1,0,0,0,1,0,0,0,1] if parent_bone is None else parent_bone.get('rotation',[1,0,0,0,1,0,0,0,1])
        world_r=bone.get('rotation',[1,0,0,0,1,0,0,0,1]);delta=[bone['position'][k]-base[k] for k in range(3)]
        local_p=[sum(parent_r[k*3+row]*delta[k] for k in range(3)) for row in range(3)]
        local_r=[sum(parent_r[k*3+row]*world_r[k*3+col] for k in range(3)) for row in range(3) for col in range(3)]
        frame(node,local_p,local_r);items.append(node)
    with tempfile.TemporaryDirectory(prefix='jiggle-export-') as temp:
        xml=Path(temp)/'accessory.rbxmx';binary=Path(temp)/'accessory.rbxm'
        ET.ElementTree(doc).write(xml,encoding='utf-8',xml_declaration=False)
        convert(xml,binary,'rbxmx','rbxm')
        with zipfile.ZipFile(path,'x',compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr('accessory.mesh',mesh_bytes);z.writestr('accessory.rbxm',binary.read_bytes())
            saved={**project,'sourceBase64':base64.b64encode(bounded_file(source)).decode()}
            z.writestr('accessory.jiggle.json',json.dumps(saved,ensure_ascii=False))
            manifest={'format':'nyawing-jiggle','version':1,'name':project.get('name',value(accessory,'Name','Accessory')),'model':'accessory.rbxm','mesh':'accessory.mesh','meshReference':mesh_uri,'assignIdsOnPublish':not bool(mesh_id),'sha256':{'accessory.rbxm':hashlib.sha256(binary.read_bytes()).hexdigest(),'accessory.mesh':hashlib.sha256(mesh_bytes).hexdigest()}}
            manifest.update(accessory_category(accessory))
            manifest['classificationVersion']=1
            z.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False))
            z.writestr('README.txt','Nyawing Jiggle accessory package: geometry, bones, weights and SmartBone settings. Publish the complete ZIP; the catalog importer must assign IDs and replace the declared meshReference. No asset scripts are included.\n')
    return {'path':str(path),'meshAssetId':mesh_id}


def main():
    # Electron sends UTF-8 JSON over stdin. Windows' default text code page
    # would turn Cyrillic paths into mojibake before pathlib sees them.
    command=sys.argv[1];payload=json.loads(sys.stdin.buffer.read().decode('utf-8'))
    if command=='import': result=import_asset(payload['path'])
    elif command=='import-reference': result=import_reference(payload['reference'])
    elif command=='mesh': result=parse_mesh(bounded_file(payload['path']))
    elif command=='export': result=export_asset(payload['source'],payload['path'],payload['project'])
    elif command=='save-mesh':
        Path(payload['path']).write_bytes(build_skinned(payload['project']));result={'path':payload['path']}
    elif command=='validate-project':
        project=payload['project'];nv,_=validate_project(project,allow_empty=True)
        if len(project['mask'])!=nv or any(not isinstance(x,(int,float)) or not math.isfinite(x) or not 0<=x<=1 for x in project['mask']): raise ValueError('Некорректное выделение проекта.')
        for name in ('anchor','tip'):
            if len(project[name])!=3 or any(not math.isfinite(x) or abs(x)>10000 for x in project[name]): raise ValueError('Некорректное крепление проекта.')
        for name in ('damping','stiffness'):
            if not 0<=project['settings'][name]<=1: raise ValueError('Некорректные параметры проекта.')
        texture=project.get('texture')
        if texture and (not isinstance(texture,str) or not re.fullmatch(r'data:image/(?:png|jpeg);base64,[A-Za-z0-9+/=]+',texture) or len(texture)>LIMIT*2): raise ValueError('Некорректная текстура проекта.')
        result={'valid':True}
    else: raise ValueError('Неизвестная операция.')
    print(json.dumps(result,ensure_ascii=True))


if __name__=='__main__':
    try: main()
    except Exception as error:
        print(json.dumps({'error':str(error)},ensure_ascii=True));sys.exit(1)
