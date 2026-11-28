const { contextBridge, ipcRenderer, webUtils } = require('electron');
// Страница получает операции редактора, но не прямой доступ к IPC.
function observeImportStatus(callback) {
    const receiveStatus = (_event, message) => {
        if (typeof message === 'string')
            callback(message);
    };
    ipcRenderer.on('import-status', receiveStatus);
    return () => ipcRenderer.removeListener('import-status', receiveStatus);
}
contextBridge.exposeInMainWorld('workshop', Object.freeze({
    testMode: process.env.WORKSHOP_TEST === '1',
    onImportStatus: observeImportStatus,
    open: () => ipcRenderer.invoke('open'),
    importReference: reference => ipcRenderer.invoke('import-reference', reference),
    importDrop: file => ipcRenderer.invoke('import', webUtils.getPathForFile(file)),
    mesh: () => ipcRenderer.invoke('mesh'),
    export: project => ipcRenderer.invoke('export', project),
    saveProject: project => ipcRenderer.invoke('save-project', project),
    saveMesh: project => ipcRenderer.invoke('save-mesh', project),
}));
