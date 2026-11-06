local solver=loadSolver()
local controller,part,bones,lastPosition
local function numbers(text)
    assert(type(text)=='string' and #text<10000)
    local out={};for token in string.gmatch(text,'[^,]+') do local n=tonumber(token);assert(n and n==n and math.abs(n)<10000);table.insert(out,n) end
    return out
end
local function initialize(positionsText,parentsText,rotationsText,stiffness,damping,sizeX,sizeY,sizeZ,x,y,z,yaw)
    if controller then controller:Destroy() end
    local positions,parents,rotations=numbers(positionsText),numbers(parentsText),numbers(rotationsText)
    assert(#parents>=3 and #parents<=26 and #positions==#parents*3 and #rotations==#parents*9)
    part=make('MeshPart');part.Size=vec(sizeX,sizeY,sizeZ)
    -- Start the existing solver at the actual mesh transform, not world origin.
    -- Rest frames remain mesh-local, including when simulation restarts after edits.
    part.CFrame=CFrame.new(x or 0,y or 0,z or 0)*CFrame.Angles(0,yaw or 0,0)
    part.attrs={Stiffness=math.clamp(stiffness,0,1),Damping=math.clamp(damping,0,1),WindInfluence=0,Inertia=0,UpdateRate=60}
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
    -- One trusted controller already supports independent root trees.
    local roots={}
    for i,parentIndex in ipairs(parents) do if parentIndex==0 then table.insert(roots,bones[i]) end end
    controller=solver.new(part,roots);controller.InRange=true
    for _,tree in ipairs(controller.ParticleTrees) do tree.ObjectPreviousPosition=part.Position end
    lastPosition=part.Position
    return #bones
end
local function step(dt,x,y,z,yaw)
    assert(controller and dt==dt and dt>0 and dt<=0.1)
    local position=vec(x,y,z)
    part.CFrame=CFrame.new(position)*CFrame.Angles(0,yaw,0)
    if (position-lastPosition).Magnitude>8 then
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
return {initialize=initialize,step=step}
