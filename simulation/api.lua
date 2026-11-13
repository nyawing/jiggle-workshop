local controller,part,bones,lastPosition,solverMode
local function numbers(text)
    assert(type(text)=='string' and #text<10000)
    local out={};for token in string.gmatch(text,'[^,]+') do local n=tonumber(token);assert(n and n==n and math.abs(n)<10000);table.insert(out,n) end
    return out
end
local function configure(inertia,elasticity,windInfluence,windStrength,windSpeed,windAngle,stiffness,damping,rotationLimit,ribbonWind,ribbonDirection,capeMode,useGravity,ribbonSelection,selectedMode)
    assert(controller,'Start simulation first')
    local function number(value,default,low,high)
        if value==nil then value=default end
        assert(type(value)=='number' and value==value and value>=low and value<=high,'Invalid physics parameter')
        return value
    end
    local values={Inertia=number(inertia,0,0,1),Elasticity=number(elasticity,.5,0,solverMode=='v2-sync'and 12 or 1),
        WindInfluence=number(windInfluence,0,0,1),WindStrength=number(windStrength,1,0,10),
        WindSpeed=number(windSpeed,8,0,30),Stiffness=number(stiffness,part:GetAttribute('Stiffness'),0,1),
        Damping=number(damping,part:GetAttribute('Damping'),0,1),RotationLimit=number(rotationLimit,180,0,180)}
    part:SetAttribute('SmartBoneWindAnimation',ribbonWind==true)
    local rows={}
    for index,direction in (ribbonSelection or ''):gmatch('(%d+):([%a]+)')do
        local bone=bones[tonumber(index)]
        assert(bone and (direction=='mixed'or direction=='horizontal'or direction=='vertical'or direction=='depth'),'Invalid wave bone')
        rows[#rows+1]=bone.Name..':'..direction
    end
    part:SetAttribute('SmartBoneWindBones',selectedMode and table.concat(rows,',')or nil)
    part:SetAttribute('SmartBoneMotionMode',capeMode==true and 'cape'or '')
    part:SetAttribute('SmartBoneUseGravity',useGravity~=false)
    ribbonDirection=ribbonDirection or 'mixed'
    assert(ribbonDirection=='mixed'or ribbonDirection=='horizontal'or ribbonDirection=='vertical'or ribbonDirection=='depth','Invalid ribbon direction')
    part:SetAttribute('SmartBoneWindDirection',ribbonDirection)
    local angle=math.rad(number(windAngle,0,-180,180))
    values.WindDirection=vec(math.cos(angle),0,math.sin(angle))
    for name,value in pairs(values)do
        part:SetAttribute(name,value)
        if solverMode~='v2-sync'then controller:UpdateParameters(name,value)end
    end
    if solverMode=='v2-sync'then
        services.Lighting:SetAttribute('WindDirection',values.WindDirection)
        services.Lighting:SetAttribute('WindStrength',values.WindStrength)
        services.Lighting:SetAttribute('WindSpeed',values.WindSpeed)
        for _,bone in ipairs(bones)do bone:SetAttribute('RotationLimit',values.RotationLimit)end
    end
    return true
end
local function initialize(positionsText,parentsText,rotationsText,stiffness,damping,sizeX,sizeY,sizeZ,x,y,z,yaw,rotationLimit,orientationText,mode)
    if controller then controller:Destroy() end
    if part then part:Destroy()end
    local positions,parents,rotations=numbers(positionsText),numbers(parentsText),numbers(rotationsText)
    assert(#parents>=3 and #parents<=26 and #positions==#parents*3 and #rotations==#parents*9)
    part=make('MeshPart');part.Size=vec(sizeX,sizeY,sizeZ)
    part.Parent=workspace
    solverMode=mode or 'legacy';assert(solverMode=='legacy'or solverMode=='v1-sync'or solverMode=='v2-sync','Invalid solver')
    -- Start the existing solver at the actual mesh transform, not world origin.
    -- Rest frames remain mesh-local, including when simulation restarts after edits.
    part.CFrame=CFrame.new(x or 0,y or 0,z or 0)*CFrame.Angles(0,yaw or 0,0)
    if orientationText then local r=numbers(orientationText);assert(#r==9);part.CFrame=cf(part.Position,r)end
    part.attrs={Stiffness=math.clamp(stiffness,0,1),Damping=math.clamp(damping,0,1),WindInfluence=0,Inertia=0,UpdateRate=60}
    if rotationLimit ~= nil then
        assert(type(rotationLimit)=="number" and rotationLimit==rotationLimit and rotationLimit>=0 and rotationLimit<=180)
        part.attrs.RotationLimit=rotationLimit
    end
    bones={}
    for i,parentIndex in ipairs(parents) do
        assert(parentIndex==-1 or parentIndex>=0 and parentIndex<i-1)
        local parent=parentIndex==-1 and part or bones[parentIndex+1]
        local bone=make('Bone');bone.Name=i==1 and 'RigidRoot' or i==2 and 'JiggleRoot' or 'Jiggle'..(i-2)
        bone.Parent=parent
        local world=vec(positions[(i-1)*3+1],positions[(i-1)*3+2],positions[(i-1)*3+3])
        local rotation={};for k=1,9 do rotation[k]=rotations[(i-1)*9+k] end
        bone.WorldCFrame=part.CFrame*cf(world,rotation)
        bones[i]=bone
    end
    if solverMode=='v2-sync'then
        -- V2 rotates a bone using its child's simulated point. An editor's last
        -- weighted endpoint therefore needs an unweighted calculation-only tip,
        -- just as the legacy solver creates its own leaf tails during Init.
        for _,bone in ipairs(bones)do
            if bone.Parent:IsA('Bone')and not bone:FindFirstChildWhichIsA('Bone')then
                local length=(bone.WorldPosition-bone.Parent.WorldPosition).Magnitude
                if length>.00001 then
                    local tail=make('Bone');tail.Name='WorkshopSimulationTail';tail.Parent=bone
                    tail.WorldCFrame=bone.WorldCFrame+bone.WorldCFrame.UpVector*length
                end
            end
        end
    end
    -- One trusted controller already supports independent root trees.
    local roots={}
    for i,parentIndex in ipairs(parents) do if parentIndex==0 then table.insert(roots,bones[i]) end end
    controller=loadSolver(solverMode).new(part,roots);controller.InRange=true
    for _,tree in ipairs(controller.ParticleTrees) do tree.ObjectPreviousPosition=part.Position end
    lastPosition=part.Position
    return #bones
end
local function step(dt,x,y,z,yaw,orientationText)
    assert(controller and dt==dt and dt>0 and dt<=(solverMode~='legacy'and 10 or .1))
    local position=vec(x,y,z)
    part.CFrame=CFrame.new(position)*CFrame.Angles(0,yaw,0)
    if orientationText then local r=numbers(orientationText);assert(#r==9);part.CFrame=cf(position,r)end
    if solverMode=='legacy'and(position-lastPosition).Magnitude>8 then
        for _,tree in ipairs(controller.ParticleTrees) do controller:PreUpdate(tree);controller:ResetParticles(tree) end
    end
    lastPosition=position
    controller:UpdateBones(dt,0)
    for _,tree in ipairs(controller.ParticleTrees) do controller:TransformBones(tree) end
    local result={}
    for _,bone in ipairs(bones) do
        local c=bone.CFrame
        table.insert(result,c.p.X);table.insert(result,c.p.Y);table.insert(result,c.p.Z)
        for _,n in ipairs(c.r) do table.insert(result,n) end
    end
    for i,n in ipairs(result) do assert(n==n and math.abs(n)<1e7,'Simulation became nonfinite');result[i]=string.format('%.9g',n) end
    return '['..table.concat(result,',')..']'
end
return {initialize=initialize,step=step,configure=configure}
