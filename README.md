# Jiggle Workshop

Jiggle Workshop — Windows-редактор гибких аксессуаров для Nyawing. В нём можно настроить движение волос, плащей, хвостов, лент и подвесных украшений.

## Скачать 0.5.9

| Материал | Ссылка |
|---|---|
| Программа для Windows x64 | [Windows x64 ZIP](https://github.com/nyawing/jiggle-workshop/releases/download/v0.5.9/Jiggle-Workshop-0.5.9-Windows-x64.zip) |
| Исходники 0.5.9 | [Source.zip](https://github.com/nyawing/jiggle-workshop/releases/download/v0.5.9/Jiggle-Workshop-0.5.9-Source.zip) |
| Контрольные суммы | [SHA256SUMS.txt](https://github.com/nyawing/jiggle-workshop/releases/download/v0.5.9/SHA256SUMS.txt) |
| Текущие исходники main | [Скачать ZIP](https://github.com/nyawing/jiggle-workshop/archive/refs/heads/main.zip) |

Предыдущие исходники доступны в релизах: [0.5.8](https://github.com/nyawing/jiggle-workshop/releases/tag/v0.5.8), [0.5.7](https://github.com/nyawing/jiggle-workshop/releases/tag/v0.5.7), [0.5.6](https://github.com/nyawing/jiggle-workshop/releases/tag/v0.5.6), [0.5.5](https://github.com/nyawing/jiggle-workshop/releases/tag/v0.5.5), [0.5.4](https://github.com/nyawing/jiggle-workshop/releases/tag/v0.5.4), [0.5.1](https://github.com/nyawing/jiggle-workshop/releases/tag/v0.5.1).

## Начало работы

Скачайте архив Windows x64 и распакуйте его в отдельную папку. Запускайте **Jiggle Workshop.exe**, оставив рядом папку `resources`. Устанавливать Python и Node отдельно не нужно.

1. Укажите предмет из каталога Nyawing или Roblox. Сохранённую работу можно открыть как `.jiggle.json` или ZIP, выпущенный Jiggle Workshop.
2. Выберите поверхность, которая должна двигаться, и поставьте начало и конец цепочки. Дополнительные точки задают изгиб.
3. Распределите веса кистью или градиентом. Вес 0 оставляет поверхность жёсткой; больший вес усиливает её связь с движением цепочки.
4. Запустите проверку движения или откройте примерку на персонаже.
5. Для волны ветра выберите нужную часть во вкладке костей, включите волну и задайте направление.
6. Выполните экспорт. Готовый ZIP загрузите в создание аксессуаров на сайте Nyawing.

## Что нового в 0.5.9

- Из настроек волос убрано «Отставание при ходьбе».
- Ctrl+A выделяет текст в полях ввода и не перехватывает работу в остальных частях окна.

## Сборка из исходников

Для работы с исходниками нужны Node.js/npm и Python 3:

```sh
npm ci
python -m pip install -r backend/requirements.txt
npm run build
npm test
python -m unittest discover -s tests -p test_asset_io.py
node tests/ui-smoke.mjs
npm start
```

Для чтения и записи двоичного RBXM положите `rbxmk.exe` в `backend/` до запуска проверок. Этот сторонний исполняемый файл в архив исходников не включён. UI-проверка работает в собственном скрытом окне Electron.

## Ресурсы репозитория

- [`src/`](src/) — интерфейс, редактирование костей и весов, примерка.
- [`backend/`](backend/) — чтение аксессуаров и экспорт.
- [`electron/`](electron/) — окно приложения и связь с импортёром.
- [`simulation/`](simulation/) — адаптеры симуляции редактора.
- [`scripts/`](scripts/) — подготовка поставляемых модулей.
- [`tests/`](tests/) — автоматические проверки.
- [`vendor/`](vendor/) и [`licenses/`](licenses/) — сторонние модули и их лицензии.

Поясняющие комментарии сохраняются в наших исходниках. Сборщик удаляет их только из поставляемых копий наших Lua-модулей, сохраняя сторонний код и обязательные уведомления.

## Лицензии

Условия использования стороннего кода приведены в `licenses`. Уведомления SmartBone и остальных зависимостей сохранены в исходном виде.
