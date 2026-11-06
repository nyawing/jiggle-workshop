-- Only serialize the model; never execute scripts found inside it.
local input, output, inputFormat, outputFormat = ...
local objects = fs.read(input, inputFormat)
-- RBXMX represents BrickColor with an <int> element. Without a descriptor,
-- rbxmk otherwise retains it as Int and writes wire type 3 instead of 11.
if outputFormat == "rbxm" then
    local descendants = objects:GetDescendants()
    table.insert(descendants, objects)
    for _, item in ipairs(descendants) do
        local color = item.BrickColor
        if color ~= nil and typeof(color) ~= "BrickColor" then
            item.BrickColor = BrickColor.new(color)
        end
    end
end
if outputFormat == "rbxmx" then
    do
        local descendants = objects:GetDescendants()
        table.insert(descendants, objects)
        for _, item in ipairs(descendants) do
            if item.ClassName == "Script" or item.ClassName == "LocalScript" or item.ClassName == "ModuleScript" then
                item:Destroy()
            else
                -- Binary RBXM strings lack XML type hints without a descriptor.
                -- Restore known binary fields before serializing XML; otherwise
                -- embedded NULs become invalid XML character references.
                for _, name in ipairs({"Tags", "AttributesSerialize", "PhysicsData", "ChildData", "MeshData", "CSGData", "SmoothGrid"}) do
                    local value = item[name]
                    -- SharedString and other explicitly typed strings are
                    -- userdata. Keep their original type/payload: passing a
                    -- SharedString to BinaryString fails and destroys the
                    -- distinction needed by XML's shared-string table.
                    if type(value) == "string" then
                        item[name] = types.BinaryString(value)
                    end
                end
            end
        end
    end
end
fs.write(output, objects, outputFormat)
