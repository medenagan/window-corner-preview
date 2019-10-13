"use strict";

// Global modules
const GObject = imports.gi.GObject;
const St = imports.gi.St;
const Util = imports.misc.util;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

// Internal modules
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const PopupSliderMenuItem = Me.imports.popupSliderMenuItem.PopupSliderMenuItem;
const Bundle = Me.imports.bundle;
const Polygnome = Me.imports.polygnome;
const Preview = Me.imports.preview;

// Utilities
const getWorkspaceWindowsArray = Polygnome.getWorkspaceWindowsArray;
const spliceTitle = Bundle.spliceTitle;

// Preview default values
const MIN_ZOOM = Preview.MIN_ZOOM;
const MAX_ZOOM = Preview.MAX_ZOOM;
const MAX_CROP_RATIO = Preview.MAX_CROP_RATIO;
const DEFAULT_ZOOM = Preview.DEFAULT_ZOOM;
const DEFAULT_CROP_RATIO = Preview.DEFAULT_CROP_RATIO;

var WindowCornerIndicator = GObject.registerClass(class WindowCornerIndicator extends PanelMenu.Button {

    _init() {
        super._init(null, "WindowCornerPreview.indicator");
    }

    // Handler to turn preview on / off
    _onMenuIsEnabled(item) {
        (item.state) ? this.preview.show() : this.preview.hide();
    }

    _updateSliders() {
        this.menuZoom.value = this.preview.zoom;
        this.menuZoomLabel.label.set_text("Monitor Zoom:  " + Math.floor(this.preview.zoom * 100).toString() + "%");

        this.menuLeftCrop.value = this.preview.leftCrop;
        this.menuRightCrop.value = this.preview.rightCrop;
        this.menuTopCrop.value = this.preview.topCrop;
        this.menuBottomCrop.value = this.preview.bottomCrop;
    }

    _onZoomChanged(source, value) {
        this.preview.zoom = value;
        this._updateSliders();
        this.preview.emit("zoom-changed");
    }

    _onLeftCropChanged(source, value) {
        this.preview.leftCrop = value;
        this._updateSliders();
        this.preview.emit("crop-changed");
    }

    _onRightCropChanged(source, value) {
        this.preview.rightCrop = value;
        this._updateSliders();
        this.preview.emit("crop-changed");
    }

    _onTopCropChanged(source, value) {
        this.preview.topCrop = value;
        this._updateSliders();
        this.preview.emit("crop-changed");
    }

    _onBottomCropChanged(source, value) {
        this.preview.bottomCrop = value;
        this._updateSliders();
        this.preview.emit("crop-changed");
    }

    _onClearCropActivate(source) {
        this.preview.topCrop = 0.0;
        this.preview.leftCrop = 0.0;
        this.preview.rightCrop = 0.0;
        this.preview.bottomCrop = 0.0;
        this._updateSliders();
        this.preview.emit("crop-changed");
    }

    _onCornerActivate(source, event, corner) {
        this.preview.corner = corner;
        this._updateSliders();
        this.preview.emit("corner-changed");
    }

    _onSettings() {
        Util.trySpawnCommandLine("gnome-shell-extension-prefs window-corner-preview@fabiomereu.it");
    }

    _onWindowActivate() {
        if (this.preview.window) {
            this.preview.window.activate(global.get_current_time());
        }
    }

    // Update windows list and other menus before menu pops up
    _onUserTriggered() {
        this.menuIsEnabled.setToggleState(this.preview.visible);
        this.menuIsEnabled.reactive = this.preview.window;
        this.menuActivate.visible = this.preview.visible;
        this.menuActivate.label.set_text(
            ["◪", "⬕", "◩", "⬔"][this.preview.corner] + " " +
            spliceTitle(this.preview.window && this.preview.window.get_title())
        );
        this.menuTopLeftCorner.label.set_text(
            (this.preview.corner == 0 ? "⬉" : "⬁") + "\t" +
            "Top Left"
        );
        this.menuTopRightCorner.label.set_text(
            (this.preview.corner == 1 ? "⬈" : "⬀") + "\t" +
            "Top Right"
        );
        this.menuBottomRightCorner.label.set_text(
            (this.preview.corner == 2 ? "⬊" : "⬂") + "\t" +
            "Bottom Right"
        );
        this.menuBottomLeftCorner.label.set_text(
            (this.preview.corner == 3 ? "⬋" : "⬃") + "\t" +
            "Bottom Left"
        );
        this._updateSliders()
        this.menuWindows.menu.removeAll();
        getWorkspaceWindowsArray().forEach((workspace, i) => {
            if (i > 0) {
                this.menuWindows.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }

            // Populate window list on submenu
            workspace.windows.forEach((window) => {
                let winMenuItem = new PopupMenu.PopupMenuItem(spliceTitle(window.get_title()));
                winMenuItem.connect("activate", () => {
                    this.preview.window = window;
                    this.preview.show();
                });

                this.menuWindows.menu.addMenuItem(winMenuItem);
            });
        });
    }

    enable() {

        // Add icon
        this.icon = new St.Icon({
            icon_name: "face-monkey-symbolic",
            style_class: "system-status-icon"
        });
        this.add_actor(this.icon);

        // Prepare Menu...

        // 1. Preview ON/OFF
        this.menuIsEnabled = new PopupMenu.PopupSwitchMenuItem("Preview", false, {
            hover: false,
            reactive: true
        });
        this.menuIsEnabled.connect("toggled", (...params) => this._onMenuIsEnabled(...params));
        this.menu.addMenuItem(this.menuIsEnabled);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 1.5 Activate Mirrored window
        this.menuActivate = new PopupMenu.PopupMenuItem("Activate");
        this.menuActivate.connect("activate", (...params) => this._onWindowActivate(...params));
        this.menu.addMenuItem(this.menuActivate);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 2. Windows list
        this.menuWindows = new PopupMenu.PopupSubMenuMenuItem("Windows");
        this.menu.addMenuItem(this.menuWindows);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 3a. Zoom label
        this.menuZoomLabel = new PopupMenu.PopupMenuItem("", {
            activate: false,
            reactive: false
        });
        this.menu.addMenuItem(this.menuZoomLabel);

        // 3b, Zoom slider
        this.menuZoom = new PopupSliderMenuItem(false, DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, 0.005); // slider step: 0.5%
        this.menuZoom.connect("value-changed", (...params) => this._onZoomChanged(...params));
        this.menu.addMenuItem(this.menuZoom);

        // 4. Crop Sliders
        this.menuCrop = new PopupMenu.PopupSubMenuMenuItem("Crop");
        this.menu.addMenuItem(this.menuCrop);

        this.menuTopCrop = new PopupSliderMenuItem("Top", DEFAULT_CROP_RATIO, 0.0, MAX_CROP_RATIO);
        this.menuTopCrop.connect("value-changed", (...params) => this._onTopCropChanged(...params));
        this.menuCrop.menu.addMenuItem(this.menuTopCrop);

        this.menuLeftCrop = new PopupSliderMenuItem("Left", DEFAULT_CROP_RATIO, 0.0, MAX_CROP_RATIO);
        this.menuLeftCrop.connect("value-changed", (...params) => this._onLeftCropChanged(...params));
        this.menuCrop.menu.addMenuItem(this.menuLeftCrop);

        this.menuRightCrop = new PopupSliderMenuItem("Right", DEFAULT_CROP_RATIO, 0.0, MAX_CROP_RATIO);
        this.menuRightCrop.connect("value-changed", (...params) => this._onRightCropChanged(...params));
        this.menuCrop.menu.addMenuItem(this.menuRightCrop);

        this.menuBottomCrop = new PopupSliderMenuItem("Bottom", DEFAULT_CROP_RATIO, 0.0, MAX_CROP_RATIO);
        this.menuBottomCrop.connect("value-changed", (...params) => this._onBottomCropChanged(...params));
        this.menuCrop.menu.addMenuItem(this.menuBottomCrop);

        this.menuClearCrop = new PopupMenu.PopupMenuItem("Clear");
        this.menuClearCrop.connect("activate", (...params) => this._onClearCropActivate(...params));
        this.menuCrop.menu.addMenuItem(this.menuClearCrop);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 5. Corner
        this.menuCorner = new PopupMenu.PopupSubMenuMenuItem("Corner");
        this.menu.addMenuItem(this.menuCorner);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this.menuTopRightCorner = new PopupMenu.PopupMenuItem("");
        this.menuTopRightCorner.connect("activate", (...params) => this._onCornerActivate(...params, 1));
        this.menuCorner.menu.addMenuItem(this.menuTopRightCorner);

        this.menuBottomRightCorner = new PopupMenu.PopupMenuItem("");
        this.menuBottomRightCorner.connect("activate", (...params) => this._onCornerActivate(...params, 2));
        this.menuCorner.menu.addMenuItem(this.menuBottomRightCorner);

        this.menuBottomLeftCorner = new PopupMenu.PopupMenuItem("");
        this.menuBottomLeftCorner.connect("activate", (...params) => this._onCornerActivate(...params, 3));
        this.menuCorner.menu.addMenuItem(this.menuBottomLeftCorner);

        this.menuTopLeftCorner = new PopupMenu.PopupMenuItem("");
        this.menuTopLeftCorner.connect("activate", (...params) => this._onCornerActivate(...params, 0));
        this.menuCorner.menu.addMenuItem(this.menuTopLeftCorner);

        // 6. Settings
        this.menuSettings = new PopupMenu.PopupMenuItem("Settings");
        this.menuSettings.connect("activate", (...params) => this._onSettings(...params));
        this.menu.addMenuItem(this.menuSettings);

        this.connect("enter-event", (...params) => this._onUserTriggered(...params));

    }

    disable() {
        this.menu.removeAll();
    }
});
