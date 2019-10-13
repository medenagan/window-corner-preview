// Contributor:
// Scott Ames https://github.com/scottames

// Global modules
const Meta = imports.gi.Meta;

var DisplayWrapper = {
    getScreen() {
        return global.display;
    },
    getWorkspaceManager() {
        return global.workspace_manager;
    },
    getMonitorManager() {
        return Meta.MonitorManager.get();
    }
};

// Result: [{windows: [{win1}, {win2}, ...], workspace: {workspace}, index: nWorkspace, isActive: true|false}, ..., {...}]
// Omit empty (with no windows) workspaces from the array
function getWorkspaceWindowsArray() {
    let array = [];

    let wsActive = DisplayWrapper.getWorkspaceManager().get_active_workspace_index();

    for (let i = 0; i < DisplayWrapper.getWorkspaceManager().n_workspaces; i++) {
        let workspace = DisplayWrapper.getWorkspaceManager().get_workspace_by_index(i);
        let windows = workspace.list_windows();
        if (windows.length) array.push({
            workspace: workspace,
            windows: windows,
            index: i,
            isActive: (i === wsActive)
        });
    }
    return array;
};

function getWorkspaces() {
    const workspaceManager = DisplayWrapper.getWorkspaceManager();
    const workspaces = [];
    for (let i = 0; i < workspaceManager.n_workspaces; i++) {
        workspaces.push(workspaceManager.get_workspace_by_index(i));
    }
    return workspaces;
}

function getMetawindows() {
    return global.get_window_actors().map(function (actor) {
        return actor.get_meta_window();
    });
}
