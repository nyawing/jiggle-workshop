-- Контакт проверяется в нескольких точках звена, как у плаща. Для пряди,
-- пересекающей упрощённое тело в позе покоя, допустимую глубину задаёт исходная поверхность.
local hairContactFrames
-- Сторона цепочки определяется по позе покоя в системе торса и сохраняется при раскачивании.
local function hairGravityRelease(tree,torso)
    torso=torso or hairContactFrames and hairContactFrames[2]
    if not torso then return 0 end
    local back=torso.frame:VectorToWorldSpace(vec(0,0,1))
    if math.abs(back.Y)<.15 then return 0 end
    local depth,count=0,0
    for _,point in ipairs(tree.Particles) do
        if point.ParentIndex>=1 and not point.Anchored then
            depth+=(torso.inverse*point.TransformOffset.Position).Z
            count+=1
        end
    end
    if count==0 then return 0 end
    local facingDown=-back.Y*depth/(count*torso.half.Z)
    local release=math.clamp((facingDown-.15)/.55,0,1)
    return release*release*(3-2*release)
end

local function updateHairPose(tree,head,torso,neckY)
    tree.WorkshopHairGravityRelease=0
    tree.WorkshopHairNeckRelease=0
    if not head or not torso or tree.RootPart:GetAttribute("SmartBoneUseGravity")==false then return end
    if not tree.WorkshopNeckMapped then
        neckY=neckY or torso.half.Y
        local band=math.max(.15,torso.half.Y*.35)
        local front=0
        local reachesBelowHead=false
        local pivot,pivotDistance=nil,math.huge
        for i,point in ipairs(tree.Particles) do
            if not point.Anchored and point.ParentIndex>=1 then
                local y=(torso.inverse*point.TransformOffset.Position).Y
                local blend=math.clamp((neckY+band-y)/(2*band),0,1)
                point.WorkshopNeckWeight=blend*blend*(3-2*blend)
                local headLocal=head.inverse*point.TransformOffset.Position
                front-=headLocal.Z
                reachesBelowHead=reachesBelowHead or headLocal.Y < -head.half.Y-.15
                local distance=math.abs(y-neckY-.08)
                if distance<pivotDistance then pivot,pivotDistance=i,distance end
            end
        end
        tree.WorkshopFrontLock=reachesBelowHead and front>0
        if tree.WorkshopFrontLock and pivot then
            local below={}
            for i,point in ipairs(tree.Particles) do
                if i==pivot then below[i]=.5
                elseif below[point.ParentIndex] then below[i]=1 end
                point.WorkshopTorsoBasisWeight=below[i]
            end
        end
        tree.WorkshopNeckMapped=true
    end
    tree.WorkshopHairGravityRelease=hairGravityRelease(tree,torso)
    local tilt=math.acos(math.clamp(head.frame.UpVector:Dot(torso.frame.UpVector),-1,1))
    local blend=math.clamp((tilt-math.rad(5))/math.rad(20),0,1)
    tree.WorkshopHairNeckRelease=.8*blend*blend*(3-2*blend)
    tree.WorkshopHeadUp=head.frame.UpVector
    tree.WorkshopTorsoUp=torso.frame.UpVector
end

local function workshopRelease(tree, point)
    local tilt=tree.WorkshopHairGravityRelease or 0
    local neck=tree.WorkshopHairNeckRelease or 0
    local depth=(point.WorkshopNeckWeight or 0)
    return math.max(tilt,neck*depth)
end
local function workshopHangingTarget(tree,point,parent,restPosition)
    local neck=tree.WorkshopHairNeckRelease or 0
    local weight=neck*(point.WorkshopNeckWeight or 0)
    if weight<=0 then return restPosition end
    local authored=restPosition-parent.Position
    local length=authored.Magnitude
    if length<1e-6 then return restPosition end
    local direction=authored/length
    local basis=(tree.WorkshopUseTorsoBasis and point.WorkshopTorsoBasisWeight or 0)*neck
    if basis>0 then
        local a,b=tree.WorkshopHeadUp,tree.WorkshopTorsoUp
        local axis=a:Cross(b)
        if axis.Magnitude>1e-6 then
            axis=axis.Unit
            local angle=math.acos(math.clamp(a:Dot(b),-1,1))*basis
            direction=direction*math.cos(angle)+axis:Cross(direction)*math.sin(angle)+
                axis*(axis:Dot(direction)*(1-math.cos(angle)))
        end
    end
    local down=basis>0 and -tree.WorkshopTorsoUp or vec(0,-1,0)
    local cosine=math.clamp(direction:Dot(down),-1,1)
    if cosine>1-1e-6 then return parent.Position+direction*length end
    local tangent=down-direction*cosine
    if tangent.Magnitude<1e-6 then
        tangent=tree.RootPart.CFrame.RightVector
        tangent=tangent-direction*tangent:Dot(direction)
        if tangent.Magnitude<1e-6 then
            tangent=tree.RootPart.CFrame.LookVector
            tangent=tangent-direction*tangent:Dot(direction)
        end
    end
    local angle=math.acos(cosine)*weight
    local hanging=direction*math.cos(angle)+tangent.Unit*math.sin(angle)
    return parent.Position+hanging*length
end

local function constrainHairBend(point,parent,frontLock)
    if not hairContactFrames then return end
    for _,body in ipairs(hairContactFrames) do
        local inverse,half=body.inverse,body.half
        local restA,restB=inverse*parent.TransformOffset.Position,inverse*point.TransformOffset.Position
        local bestDepth,bestT,bestNormal=0,nil,nil
        for sample=1,4 do
            local t=sample/4
            local rest=restA:Lerp(restB,t)
            local poseContact=body.forwardPoseContact or 0
            local stableFront=frontLock and poseContact>0
            local alongX=math.abs(rest.X)/half.X>math.abs(rest.Z)/half.Z
            local side=(alongX and rest.X or rest.Z)<0 and -1 or 1
            if stableFront then alongX=false;side=-1 end
            local restDepth=(alongX and rest.X or rest.Z)*side
            local p=inverse*parent.Position:Lerp(point.Position,t)
            local top=half.Y+(body.shoulderMargin or 0)
            local width=alongX and half.Z-math.abs(p.Z) or half.X-math.abs(p.X)
            if body.jumpShoulder and not alongX and side<0 and rest.Y<=top then
                -- Верх движущегося плеча ограничивает прядь, заходящую в грудь сверху.
                top=top+.22
                width=width+.13
            end
            -- При наклоне головы волосы ниже шеи проверяются также о переднюю верхнюю
            -- поверхность торса. Для прямой позы прежняя схема контакта сохраняется.
            local neckContact=body.neckContact or 0
            local frontPose=poseContact>0 and side<0 and not alongX and (stableFront or rest.Y<=half.Y+.35)
            local frontShoulder=neckContact>0 and side<0 and not alongX and
                rest.Y<=half.Y+.35 and p.Y>=half.Y-.6
            if frontShoulder then
                top=math.max(top,half.Y+.15*neckContact)
                width+=.08*neckContact
            end
            if frontPose then
                top=math.max(top,half.Y+.18*poseContact)
                width=math.max(width,half.X-math.abs(p.X)+.10*poseContact)
            end
            local edge=math.min(top-p.Y,p.Y+half.Y,width)
            local clearance=body.rearHeadContact and not alongX and side>0 and .002 or .012
            local limit=math.min(alongX and half.X or half.Z,restDepth)-clearance
            -- У переднего звена снаружи груди учитывается толщина видимой пряди в позе покоя.
            if body.forwardWalk and not alongX and side<0 and restDepth>=half.Z then
                limit=math.max(limit,half.Z+.05)
            end
            if frontShoulder then
                limit=math.max(limit,half.Z+.045*neckContact)
            end
            if frontPose then
                limit=math.max(limit,half.Z+.065*poseContact)
            end
            local depth=limit-(alongX and p.X or p.Z)*side
            local weighted=depth*math.clamp(edge/.045,0,1)
            local normal=alongX and vec(side,0,0) or vec(0,0,side)
            if weighted>bestDepth then
                bestDepth,bestT=weighted,t
                bestNormal=body.frame:VectorToWorldSpace(normal)
            end
        end
        if bestT then
            -- На одну часть тела выполняется коррекция самого глубокого контакта.
            -- Последовательные частичные коррекции могут снова загнать звено внутрь и вызвать дрожь.
            local a=parent.Anchored and 0 or 1-bestT
            local normal=bestNormal
            local offset=math.min(.12,bestDepth/(a*a+bestT*bestT))
            local function move(node,weight)
                local before=node.Position
                local velocity=before-node.LastPosition
                local movement=body.previous and before-body.previous*(inverse*before) or vec(0,0,0)
                velocity=velocity-normal*math.min(0,(velocity-movement):Dot(normal))
                node.Position=before+normal*(offset*weight)
                node.LastPosition=node.Position-velocity
            end
            if a>0 then move(parent,a) end
            move(point,bestT)
        end
    end
end
