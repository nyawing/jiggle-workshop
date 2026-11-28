-- Конвертер читает и записывает данные модели, не запуская вложенные скрипты.
local input, output, inputFormat, outputFormat = ...
local objects = fs.read(input, inputFormat)
-- RBXMX представляет BrickColor элементом <int>. Без дескриптора rbxmk сохраняет его как Int и пишет двоичный тип 3 вместо 11.
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
                -- Без дескриптора двоичные строки RBXM не содержат XML-подсказок типов. Перед сериализацией в XML восстанавливаем известные двоичные поля, иначе встроенные нули превращаются в недопустимые XML-ссылки на символы.
                for _, name in ipairs({"Tags", "AttributesSerialize", "PhysicsData", "ChildData", "MeshData", "CSGData", "SmoothGrid"}) do
                    local value = item[name]
                    -- SharedString и другие строки с явно заданным типом представлены как userdata. Сохраняем их исходный тип и содержимое: преобразование SharedString в BinaryString завершается ошибкой и уничтожает различие, необходимое таблице общих строк XML.
                    if type(value) == "string" then
                        item[name] = types.BinaryString(value)
                    end
                end
            end
        end
    end
end
fs.write(output, objects, outputFormat)
