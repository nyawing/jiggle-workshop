const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { rmSync } = require('node:fs');
const { spawn } = require('node:child_process');
const os = require('node:os'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
let win, importedPath = null, importedDirectory = null;
function backend(command, payload) {
    return new Promise((resolve, reject) => {
        const executable = app.isPackaged ? path.join(process.resourcesPath, 'backend', 'workshop-backend.exe') : 'python';
        const args = app.isPackaged ? [command] : [path.join(root, 'backend', 'asset_io.py'), command];
        const proc = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        let output = '', error = '';
        const timer = setTimeout(() => { proc.kill(); reject(new Error('Время обработки истекло. Повторите операцию.')); }, command === 'import-reference' ? 300000 : 60000);
        proc.stdout.on('data', b => { output += b; if (output.length > 32e6)
            proc.kill(); });
        proc.stderr.on('data', b => { if (error.length < 4000)
            error += b; });
        proc.on('error', e => { clearTimeout(timer); reject(e); });
        proc.on('close', code => { clearTimeout(timer); try {
            const result = JSON.parse(output);
            if (code || result.error) {
                const failure = new Error(result.error || error);
                failure.code = result.code;
                reject(failure);
            }
            else
                resolve(result);
        }
        catch (e) {
            reject(new Error(error || 'Импортёр вернул ответ, который редактор не смог разобрать.'));
        } });
        proc.stdin.end(JSON.stringify(payload));
    });
}
function trusted(event) { if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
    throw new Error('Unknown sender'); }
async function setImportedSource(file, directory = null) {
    const previous = importedDirectory;
    importedPath = file;
    importedDirectory = directory;
    if (previous)
        await fs.rm(previous, { recursive: true, force: true }).catch(() => { });
}
async function importProject(file) {
    if ((await fs.stat(file)).size > 64e6)
        throw new Error('Размер проекта превышает допустимый предел.');
    let project;
    try {
        project = JSON.parse(await fs.readFile(file, 'utf8'));
    }
    catch {
        throw new Error('Файл проекта не удалось разобрать как JSON.');
    }
    if (project?.version !== 1)
        throw new Error('Редактор не поддерживает эту версию проекта.');
    await backend('validate-project', { project });
    if (project.sourceBase64) {
        if (typeof project.sourceBase64 !== 'string' || project.sourceBase64.length > 34e6)
            throw new Error('В проекте записаны некорректные исходные данные.');
        const raw = Buffer.from(project.sourceBase64, 'base64');
        if (raw.length > 24 * 1024 * 1024 || crypto.createHash('sha256').update(raw).digest('hex') !== project.sourceHash)
            throw new Error('Проверка целостности исходных данных проекта не прошла.');
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jiggle-project-'));
        const source = path.join(directory, 'original.rbxm');
        try {
            await fs.writeFile(source, raw);
        }
        catch (error) {
            await fs.rm(directory, { recursive: true, force: true }).catch(() => { });
            throw error;
        }
        await setImportedSource(source, directory);
    }
    else {
        await setImportedSource(null);
    }
    return { name: project.name || 'Проект', geometry: project.geometry, texture: project.texture, appearance: project.appearance, attachments: project.attachments, catalogType: project.catalogType, sourceHash: project.sourceHash, itemType: project.itemType, warnings: [], savedProject: project };
}
async function openProjectFile(file) {
    const extension = typeof file === 'string' ? path.extname(file).toLowerCase() : '';
    if (extension === '.json')
        return importProject(file);
    if (extension !== '.zip')
        throw new Error('Откройте файл .jiggle.json либо архив ZIP, сохранённый Jiggle Workshop.');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jiggle-archive-'));
    try {
        const project = path.join(directory, 'accessory.jiggle.json');
        await backend('read-project-archive', { path: file, output: project });
        return await importProject(project);
    }
    finally {
        await fs.rm(directory, { recursive: true, force: true }).catch(() => { });
    }
}
app.whenReady().then(() => {
    win = new BrowserWindow({ show: process.env.WORKSHOP_TEST !== '1', width: 1250, height: 830, minWidth: 980, minHeight: 650, backgroundColor: '#11151f', title: 'Jiggle Workshop', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: process.env.WORKSHOP_TEST === '1' } });
    win.setMenu(null);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    // Защищаем изменения при закрытии крестиком, Alt+F4, app.quit и перезагрузке окна.
    win.webContents.on('will-prevent-unload', event => {
        const choice = dialog.showMessageBoxSync(win, {
            type: 'warning', title: 'Несохранённые изменения',
            message: 'В проекте есть несохранённые изменения.',
            detail: 'Закрыть Workshop и потерять эти изменения?',
            buttons: ['Продолжить редактирование', 'Закрыть без сохранения'],
            defaultId: 0, cancelId: 0, noLink: true,
        });
        if (choice === 1)
            event.preventDefault();
    });
    ipcMain.handle('open', async (event) => { trusted(event); const result = await dialog.showOpenDialog(win, { filters: [{ name: 'Проекты Jiggle Workshop', extensions: ['zip', 'json'] }] }); return result.canceled ? null : openProjectFile(result.filePaths[0]); });
    ipcMain.handle('import', async (event, file) => { trusted(event); return openProjectFile(file); });
    ipcMain.handle('import-reference', async (event, reference) => {
        trusted(event);
        const result = await backend('import-reference', { reference });
        const raw = Buffer.from(result.sourceBase64, 'base64');
        if (raw.length > 24 * 1024 * 1024 || crypto.createHash('sha256').update(raw).digest('hex') !== result.sourceHash)
            throw new Error('Скачанный предмет повреждён.');
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jiggle-accessory-'));
        const file = path.join(directory, 'original.rbxm');
        await fs.writeFile(file, raw);
        await setImportedSource(file, directory);
        delete result.sourceBase64;
        return result;
    });
    ipcMain.handle('mesh', async (event) => { trusted(event); const result = await dialog.showOpenDialog(win, { filters: [{ name: 'Геометрия Roblox', extensions: ['mesh'] }] }); return result.canceled ? null : backend('mesh', { path: result.filePaths[0] }); });
    ipcMain.handle('save-project', async (event, project) => {
        trusted(event);
        await backend('validate-project', { project });
        const result = await dialog.showSaveDialog(win, { defaultPath: 'accessory.jiggle.json' });
        if (result.canceled)
            return null;
        if (importedPath && project.sourceHash) {
            const raw = await fs.readFile(importedPath);
            if (crypto.createHash('sha256').update(raw).digest('hex') !== project.sourceHash)
                throw new Error('Исходник изменился.');
            project = { ...project, sourceBase64: raw.toString('base64') };
        }
        const text = JSON.stringify(project, null, 2);
        if (text.length > 64e6)
            throw new Error('Размер проекта превышает допустимый предел.');
        await fs.writeFile(result.filePath, text, { flag: 'w' });
        return result.filePath;
    });
    ipcMain.handle('save-mesh', async (event, project) => { trusted(event); const result = await dialog.showSaveDialog(win, { defaultPath: 'accessory.mesh', filters: [{ name: 'Skinned mesh', extensions: ['mesh'] }] }); return result.canceled ? null : backend('save-mesh', { path: result.filePath, project }); });
    ipcMain.handle('export', async (event, project) => { trusted(event); if (!importedPath)
        throw new Error('Для этого действия нужно открыть аксессуар.'); const result = await dialog.showSaveDialog(win, { defaultPath: 'accessory-jiggle.zip', filters: [{ name: 'Комплект аксессуара', extensions: ['zip'] }] }); if (result.canceled)
        return null; if (path.resolve(result.filePath) === path.resolve(importedPath))
        throw new Error('Оригинал нельзя перезаписывать.'); return backend('export', { source: importedPath, path: result.filePath, project }); });
    win.loadFile(path.join(root, 'dist', 'index.html'));
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { if (importedDirectory)
    rmSync(importedDirectory, { recursive: true, force: true, maxRetries: 2 }); });
