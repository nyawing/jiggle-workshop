-- Minimal Roblox math/instance adapter for the trusted SmartBone solver.
-- Not a general Roblox emulator, and not an executor for imported asset scripts.
local vectorMethods, vectorMeta = {}, {}
local function vec(x,y,z) return setmetatable({X=x or 0,Y=y or 0,Z=z or 0},vectorMeta) end
vectorMeta.__index=function(v,key)
    if key=='Magnitude' then return math.sqrt(v.X*v.X+v.Y*v.Y+v.Z*v.Z) end
    if key=='Unit' then local length=v.Magnitude;return length>1e-10 and v/length or vec() end
    return vectorMethods[key]
end
vectorMeta.__add=function(a,b) return vec(a.X+b.X,a.Y+b.Y,a.Z+b.Z) end
vectorMeta.__sub=function(a,b) return vec(a.X-b.X,a.Y-b.Y,a.Z-b.Z) end
vectorMeta.__unm=function(a) return vec(-a.X,-a.Y,-a.Z) end
vectorMeta.__mul=function(a,b) if type(a)=='number' then return b*a end;if getmetatable(b)==vectorMeta then return vec(a.X*b.X,a.Y*b.Y,a.Z*b.Z)end;return vec(a.X*b,a.Y*b,a.Z*b) end
vectorMeta.__div=function(a,b) if getmetatable(b)==vectorMeta then return vec(a.X/b.X,a.Y/b.Y,a.Z/b.Z)end;return vec(a.X/b,a.Y/b,a.Z/b) end
function vectorMethods:Dot(b) return self.X*b.X+self.Y*b.Y+self.Z*b.Z end
function vectorMethods:Cross(b) return vec(self.Y*b.Z-self.Z*b.Y,self.Z*b.X-self.X*b.Z,self.X*b.Y-self.Y*b.X) end
function vectorMethods:Lerp(b,t)return self+(b-self)*t end
function vectorMethods:Min(b)return vec(math.min(self.X,b.X),math.min(self.Y,b.Y),math.min(self.Z,b.Z))end
function vectorMethods:Max(b)return vec(math.max(self.X,b.X),math.max(self.Y,b.Y),math.max(self.Z,b.Z))end
local Vector3={new=vec}
local identity={1,0,0,0,1,0,0,0,1}
local cfMethods,cfMeta={},{}
local function cf(position,matrix) return setmetatable({p=position or vec(),r=matrix or identity},cfMeta) end
-- Roblox supports CFrame - Vector3; the shared legacy solver uses this to
-- extract rotation without depending on the newer CFrame.Rotation property.
cfMeta.__sub=function(c,v) return cf(c.p-v,c.r) end
local function rotate(r,v) return vec(r[1]*v.X+r[2]*v.Y+r[3]*v.Z,r[4]*v.X+r[5]*v.Y+r[6]*v.Z,r[7]*v.X+r[8]*v.Y+r[9]*v.Z) end
cfMeta.__index=function(c,key)
    if key=='Position' then return c.p elseif key=='Rotation' then return cf(vec(),c.r)
    elseif key=='UpVector' then return vec(c.r[2],c.r[5],c.r[8])
    elseif key=='RightVector' then return vec(c.r[1],c.r[4],c.r[7])
    elseif key=='LookVector' then return -vec(c.r[3],c.r[6],c.r[9]) end
    return cfMethods[key]
end
cfMeta.__add=function(c,v) return cf(c.p+v,c.r) end
cfMeta.__mul=function(a,b)
    if getmetatable(b)==vectorMeta then return a.p+rotate(a.r,b) end
    local r={}
    for row=0,2 do for col=0,2 do
        r[row*3+col+1]=a.r[row*3+1]*b.r[col+1]+a.r[row*3+2]*b.r[col+4]+a.r[row*3+3]*b.r[col+7]
    end end
    return cf(a*b.p,r)
end
function cfMethods:Inverse()
    local a=self.r;local r={a[1],a[4],a[7],a[2],a[5],a[8],a[3],a[6],a[9]}
    return cf(rotate(r,-self.p),r)
end
function cfMethods:ToObjectSpace(b) return self:Inverse()*b end
function cfMethods:PointToWorldSpace(v) return self*v end
function cfMethods:PointToObjectSpace(v) return self:Inverse()*v end
function cfMethods:VectorToObjectSpace(v) return rotate(self:Inverse().r,v) end
function cfMethods:VectorToWorldSpace(v)return rotate(self.r,v)end
local function fromQuaternion(position,x,y,z,w)
    local n=math.sqrt(x*x+y*y+z*z+w*w)
    if n<1e-12 then return cf(position) end
    x,y,z,w=x/n,y/n,z/n,w/n
    return cf(position,{1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)})
end
local function quaternion(c)
    local m=c.r;local trace=m[1]+m[5]+m[9]
    if trace>0 then local s=math.sqrt(trace+1)*2;return {(m[8]-m[6])/s,(m[3]-m[7])/s,(m[4]-m[2])/s,s/4} end
    if m[1]>m[5] and m[1]>m[9] then local s=math.sqrt(1+m[1]-m[5]-m[9])*2;return {s/4,(m[2]+m[4])/s,(m[3]+m[7])/s,(m[8]-m[6])/s} end
    if m[5]>m[9] then local s=math.sqrt(1+m[5]-m[1]-m[9])*2;return {(m[2]+m[4])/s,s/4,(m[6]+m[8])/s,(m[3]-m[7])/s} end
    local s=math.sqrt(1+m[9]-m[1]-m[5])*2;return {(m[3]+m[7])/s,(m[6]+m[8])/s,s/4,(m[4]-m[2])/s}
end
function cfMethods:Lerp(b,alpha)
    local aQ,bQ=quaternion(self),quaternion(b);local dot=0
    for i=1,4 do dot+=aQ[i]*bQ[i] end
    if dot<0 then dot=-dot;for i=1,4 do bQ[i]=-bQ[i] end end
    local sA,sB=1-alpha,alpha
    if dot<0.9995 then local angle=math.acos(math.clamp(dot,-1,1));local sine=math.sin(angle);sA=math.sin((1-alpha)*angle)/sine;sB=math.sin(alpha*angle)/sine end
    return fromQuaternion(self.p+(b.p-self.p)*alpha,aQ[1]*sA+bQ[1]*sB,aQ[2]*sA+bQ[2]*sB,aQ[3]*sA+bQ[3]*sB,aQ[4]*sA+bQ[4]*sB)
end
local CFrame={}
function CFrame.new(x,y,z,qx,qy,qz,qw)
    if getmetatable(x)==vectorMeta then return cf(x) end
    local position=vec(x,y,z)
    return qx and fromQuaternion(position,qx,qy,qz,qw) or cf(position)
end
function CFrame.fromAxisAngle(axis,angle)
    axis=axis.Unit;local s=math.sin(angle/2)
    return fromQuaternion(vec(),axis.X*s,axis.Y*s,axis.Z*s,math.cos(angle/2))
end
function CFrame.Angles(x,y,z)
    return CFrame.fromAxisAngle(vec(1,0,0),x)*CFrame.fromAxisAngle(vec(0,1,0),y)*CFrame.fromAxisAngle(vec(0,0,1),z)
end
function CFrame.lookAt(position,target)
    local back=(position-target).Unit;local right=vec(0,1,0):Cross(back).Unit
    if right.Magnitude<1e-8 then right=vec(1,0,0) end
    local up=back:Cross(right)
    return cf(position,{right.X,up.X,back.X,right.Y,up.Y,back.Y,right.Z,up.Z,back.Z})
end
local function signal()
    local handlers={};local out={}
    function out:Connect(fn)local entry={fn=fn};handlers[entry]=true;return{Disconnect=function()handlers[entry]=nil end}end
    function out:Fire(...)for entry in pairs(handlers)do entry.fn(...)end end
    function out:Destroy()table.clear(handlers)end
    return out
end
local methods,instanceMeta={},{}
local function make(class)
    return setmetatable({ClassName=class,Name=class,MeshId='',_parent=nil,_cf=CFrame.new(),children={},attrs={},Transform=CFrame.new(),AttributeChanged=signal(),AncestryChanged=signal(),Size=vec(1,1,1)},instanceMeta)
end
instanceMeta.__index=function(o,key)
    if key=='Parent' then return o._parent elseif key=='CFrame' then return o._cf
    elseif key=='Position' then return o._cf.Position
    elseif key=='WorldCFrame' then return o.ClassName=='Bone' and o.Parent and o.Parent.WorldCFrame*o._cf or o._cf
    elseif key=='TransformedCFrame'then return o._cf*o.Transform
    elseif key=='TransformedWorldCFrame'then return o.ClassName=='Bone'and o.Parent and (o.Parent.ClassName=='Bone'and o.Parent.TransformedWorldCFrame or o.Parent.CFrame)*o.TransformedCFrame or o._cf
    elseif key=='WorldPosition' then return o.WorldCFrame.Position end
    return methods[key]
end
instanceMeta.__newindex=function(o,key,value)
    if key=='Parent' then
        if o._parent then for i,child in ipairs(o._parent.children) do if child==o then table.remove(o._parent.children,i);break end end end
        rawset(o,'_parent',value);if value then table.insert(value.children,o) end
        o.AncestryChanged:Fire(o,value)
    elseif key=='CFrame' then rawset(o,'_cf',value)
    elseif key=='WorldCFrame' then o.CFrame=o.Parent and o.Parent.WorldCFrame:Inverse()*value or value
    else rawset(o,key,value) end
end
function methods:IsA(class) return self.ClassName==class or class=='BasePart' and (self.ClassName=='MeshPart'or self.ClassName=='Part')or class=='Attachment'and self.ClassName=='Bone'end
function methods:GetAttribute(name) return self.attrs[name] end
function methods:SetAttribute(name,value)if self.attrs[name]~=value then self.attrs[name]=value;self.AttributeChanged:Fire(name)end end
function methods:GetAttributes()return table.clone(self.attrs)end
function methods:FindFirstChild(name,recursive)
    for _,child in ipairs(self.children)do if child.Name==name then return child end end
    if recursive then for _,child in ipairs(self.children)do local found=child:FindFirstChild(name,true);if found then return found end end end
end
function methods:FindFirstChildWhichIsA(class,recursive)
    for _,child in ipairs(self.children)do if child:IsA(class)then return child end end
    if recursive then for _,child in ipairs(self.children)do local found=child:FindFirstChildWhichIsA(class,true);if found then return found end end end
end
function methods:GetFullName()return self.Parent and self.Parent:GetFullName()..'.'..self.Name or self.Name end
function methods:IsDescendantOf(ancestor)local p=self.Parent;while p do if p==ancestor then return true end;p=p.Parent end;return false end
function methods:Clone()
    local copy=make(self.ClassName)
    for key,value in pairs(self)do if key~='children'and key~='_parent'and key~='attrs'and key~='AttributeChanged'and key~='AncestryChanged'then copy[key]=value end end
    copy.attrs=table.clone(self.attrs)
    for _,child in ipairs(self.children)do child:Clone().Parent=copy end
    return copy
end
function methods:GetChildren() return table.clone(self.children) end
function methods:GetDescendants()
    local out={};for _,child in ipairs(self.children) do table.insert(out,child);for _,desc in ipairs(child:GetDescendants()) do table.insert(out,desc) end end;return out
end
function methods:Destroy()for _,child in ipairs(self:GetChildren())do child:Destroy()end;self.Parent=nil;self.AttributeChanged:Destroy();self.AncestryChanged:Destroy()end
local Instance={new=function(class) if class=='BindableEvent' then return signal() end;return make(class) end}
local Random={new=function(seed)
    local n=seed%2147483647
    return {NextNumber=function(_,a,b) n=(n*48271)%2147483647;return a+(b-a)*n/2147483647 end,
            NextInteger=function(_,a,b) n=(n*48271)%2147483647;return math.floor(a+(b-a+1)*n/2147483647) end}
end}
local function typeof(value)
    if getmetatable(value)==vectorMeta then return 'Vector3' end
    if getmetatable(value)==cfMeta then return 'CFrame' end
    if type(value)=='table'and value.__type then return value.__type end
    return type(value)
end
local NumberRange={new=function(a,b)return{Min=a,Max=b or a,__type='NumberRange'}end}
local services={Lighting=make('Lighting'),RunService={IsClient=function() return true end},CollectionService={GetTagged=function() return {} end,GetInstanceRemovedSignal=function()return signal()end,RemoveTag=function()end}}
local game=make('DataModel')
function game:GetService(name)return services[name]end
local guid=0;services.HttpService={GenerateGUID=function()guid=guid+1;return 'workshop-'..guid end}
local workspace=make('Workspace');workspace.Parent=game;workspace.CurrentCamera={CFrame=CFrame.new(),ViewportSize={X=0,Y=0}}
local task={spawn=function(f,...) return f(...) end,wait=function() end}
local function wait() end
local function warn() end
