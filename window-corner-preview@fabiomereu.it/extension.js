// Copyright (c) 2017 Fabius <fabio@mereu.info>
// Released under the MIT license
//
// Window Corner Preview Gnome Extension
//
// Purpose: It adds a menu to Gnome panel from which you can turn on a preview of any desktop window
//          helping you watch a movie or a video while studying or working
//
// This is a fork of https://github.com/Exsul/float-youtube-for-gnome by "Enelar" Kirill Berezin
// which was originally forked itself from https://github.com/Shou/float-mpv by "Shou" Benedict Aas
//

"use strict";

// Imports
const Lang = imports.lang;
const Main = imports.ui.main;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;
const Slider = imports.ui.slider;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Clutter = imports.gi.Clutter;
const Util = imports.misc.util;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Prefs = Me.imports.prefs;

// External constants
const GTK_MOUSE_LEFT_BUTTON = 1;
const GTK_MOUSE_MIDDLE_BUTTON = 2;
const GTK_MOUSE_RIGHT_BUTTON = 3;

const GDK_SHIFT_MASK = 1;
const GDK_CONTROL_MASK = 4;
const GDK_MOD1_MASK = 8;
const GDK_ALT_MASK = GDK_MOD1_MASK; // Most cases

// Extension settings
const MIN_ZOOM = 0.10; // User shouldn't be able to make the preview too small or big, as it may break normal experience
const MAX_ZOOM = 0.75;

const MAX_CROP_RATIO = 0.85;

const MAX_TITLE = 25; // Truncate too long window titles on the menu

const CORNER_TOP_LEFT = 0;
const CORNER_TOP_RIGHT = 1;
const CORNER_BOTTOM_RIGHT = 2;
const CORNER_BOTTOM_LEFT = 3;

// Extension default value, in the future some last-settings-memory may be add
const DEFAULT_ZOOM = 0.20;
const DEFAULT_CORNER = CORNER_TOP_RIGHT;

const DEFAULT_CROP_RATIO = 0.0; // [0.0 - 1.0]

// Animation constants
const TWEEN_OPACITY_FULL = 255;
const TWEEN_OPACITY_SEMIFULL = Math.round(TWEEN_OPACITY_FULL * 0.90);
const TWEEN_OPACITY_HALF = Math.round(TWEEN_OPACITY_FULL * 0.50);
const TWEEN_OPACITY_TENTH = Math.round(TWEEN_OPACITY_FULL * 0.10);
const TWEEN_OPACITY_NULL = 0;

const TWEEN_TIME_SHORT = 0.25;
const TWEEN_TIME_MEDIUM = 0.6;
const TWEEN_TIME_LONG = 0.80;

// Settings feature is under development, for now use SETTING_* constants
const SETTING_MAGNIFICATION_ALLOWED = false;

const SCROLL_ACTOR_MARGIN = 0.2; // scrolling: 20% external margin to crop, 80% to zoom
const SCROLL_ZOOM_STEP = 0.01; // 1% zoom for step
const SCROLL_CROP_STEP = 0.0063; // cropping step when user scrolls

// This is wrapper to maintain compatibility with GNOME-Shell 3.30+ as well as
// previous versions.
var DisplayWrapper = {
    getScreen: function() {
        return global.screen || global.display;
    },
    getWorkspaceManager: function() {
        return global.screen || global.workspace_manager;
    },
    getMonitorManager: function() {
        return global.screen || Meta.MonitorManager.get();
    }
};

// Utilities

function normalizeRange(denormal, min, max, step) {
    if (step !== undefined) denormal = Math.round(denormal / step) * step;
    // To a range 0-1
    return (denormal - min) / (max - min);
};

function deNormalizeRange(normal, min, max, step) {
    // from [0, 1] to MIN - MAX
    let denormal = (max - min) * normal + min;
    if (step !== undefined) denormal = Math.round(denormal / step) * step;
    return denormal;
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

// Char based, so not very precise for now
function spliceTitle(text) {
    text = text || "";
    if (text.length > MAX_TITLE) {
        return text.substr(0, MAX_TITLE - 2) + "...";
    }
    else {
        return text;
    }
};

// Helper to disconnect more signals at once
const CSignalBundle = new Lang.Class({

    Name: "WindowCornerPreview.signalBundle",

    _init: function () {
        this._connections = [];
    },

    tryConnect: function (actor, signal, callback) {
        try {
            let handle = actor.connect(signal, callback);
            this._connections.push({actor: actor, handle: handle});
        }

        catch(e) {
            logError(e, "CSignalBundle.tryConnect failed");
        }
    },

    disconnectAll: function () {
        for (let i = 0; i < this._connections.length; i++) {
            try {
                let connection = this._connections[i];
                connection.actor.disconnect(connection.handle);
                this._connections[i] = null;
            }

            catch(e) {
                logError(e, "CSignalBundle.disconnectAll failed");
            }
        }
        this._connections = [];
    }
});

const PopupSliderMenuItem = new Lang.Class({
    Name: "WindowCornerPreview.PopupSliderMenuItem",
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function (text, value, min, max, step, params) {

        this.min = (min !== undefined ? min : 0.0);
        this.max = (max !== undefined ? max : 1.0);
        this.defaultValue = (value !== undefined ? value : (this.max + this.min) / 2.0);
        // *** KNOWN ISSUE: Scrolling may get stucked if step value > 1.0 (and |min-max| is a low value)
        // due to const SLIDER_SCROLL_STEP = 0.02 on js/ui/slider.js ***
        this.step = step;
        params = params || {};

        params.activate = false;

        this.parent(params);

        this.label = new St.Label({text: text || ""});
        // Setting text to false allow a little bit extra space on the left
        if (text !== false) this.actor.add_child(this.label);
        this.actor.label_actor = this.label;

        this.slider = new Slider.Slider(0.0);
        this.value = this.defaultValue;

        // PopupSliderMenuItem emits its own value-change event which provides a normalized value
        this.slider.connect("value-changed", Lang.bind(this, function (x) {
            let normalValue = this.value;
            // Force the slider to set position on a stepped value (if necessary)
            if (this.step !== undefined) this.value = normalValue;
            // Don't through any event if step rounded it to the same value
            if (normalValue !== this._lastValue) this.emit("value-changed", normalValue);
            this._lastValue = normalValue;
        }));

        this.actor.add(this.slider.actor, {expand: true, align: St.Align.END});
    },

    get value() {
        return deNormalizeRange(this.slider.value, this.min, this.max, this.step);
    },

    set value(newValue) {
        this._lastValue = normalizeRange(newValue, this.min, this.max, this.step);
        this.slider.setValue(this._lastValue);
    }
});

const CWindowCornerPreview = new Lang.Class({

    Name: "WindowCornerPreview.preview",

    _init: function () {
        this._corner = DEFAULT_CORNER;
        this._zoom = DEFAULT_ZOOM;

        this._leftCropRatio = DEFAULT_CROP_RATIO;
        this._rightCropRatio = DEFAULT_CROP_RATIO;
        this._topCropRatio = DEFAULT_CROP_RATIO;
        this._bottomCropRatio = DEFAULT_CROP_RATIO;

        // The following properties are documented on _adjustVisibility()
        this._naturalVisibility = false;
        this._focusHidden = true;

        this._container = null;
        this._window = null;

        this._windowSignals = new CSignalBundle();
        this._environmentSignals = new CSignalBundle();
        log("INIZIO");
    },

    _onClick: function (actor, event) {
        let button = event.get_button();
        let state = event.get_state();

        // CTRL + LEFT BUTTON activate the window on top
        if (button === GTK_MOUSE_LEFT_BUTTON && (state & GDK_CONTROL_MASK)) {
            this._window.activate(global.get_current_time());
        }

        // Otherwise move the preview to another corner
        else {
            switch(button) {
                case GTK_MOUSE_RIGHT_BUTTON:
                    this.corner += 1;
                break;

                case GTK_MOUSE_MIDDLE_BUTTON:
                    this.corner += -1;
                    break;

                default: // GTK_MOUSE_LEFT_BUTTON:
                    this.corner += 2;
            }
        }
    },

    _onScroll: function (actor, event) {
        let scroll_direction = event.get_scroll_direction();

        let direction;
        switch (scroll_direction) {

            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT:
                direction = +1.0
                break;

            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT:
                direction = -1.0
                break;

            default:
                direction = 0.0;
        }

        if (! direction) return; // Clutter.EVENT_PROPAGATE;

        // On mouse over it's normally pretty transparent, but user needs to see more for adjusting it
        Tweener.addTween(this._container, {
            opacity: TWEEN_OPACITY_SEMIFULL,
            time: TWEEN_TIME_SHORT, transition: "easeOutQuad"
        });

        // Coords are absolute, screen related
        let [mouseX, mouseY] = event.get_coords();

        // _container absolute rect
        let [actorX1, actorY1] = this._container.get_transformed_position();
        let [actorWidth, actorHeight] = this._container.get_transformed_size();
        let actorX2 = actorX1 + actorWidth;
        let actorY2 = actorY1 + actorHeight;

        // Distance of pointer from each side
        let deltaLeft = Math.abs(actorX1 - mouseX);
        let deltaRight = Math.abs(actorX2 - mouseX);
        let deltaTop = Math.abs(actorY1 - mouseY);
        let deltaBottom = Math.abs(actorY2 - mouseY);

        let sortedDeltas = [
            {property: "leftCropRatio", pxDistance: deltaLeft, comparedDistance: deltaLeft / actorWidth, direction: -direction},
            {property: "rightCropRatio", pxDistance: deltaRight, comparedDistance: deltaRight / actorWidth, direction: -direction},
            {property: "topCropRatio", pxDistance: deltaTop, comparedDistance: deltaTop / actorHeight, direction: -direction /* feels more natural */},
            {property: "bottomCropRatio", pxDistance: deltaBottom, comparedDistance: deltaBottom / actorHeight, direction: -direction}
        ];
        sortedDeltas.sort(function (a, b) {return a.pxDistance - b.pxDistance});
        let deltaMinimum = sortedDeltas[0];

        // Scrolling inside the preview triggers the zoom
        if (deltaMinimum.comparedDistance > SCROLL_ACTOR_MARGIN) {
            this.zoom += direction * SCROLL_ZOOM_STEP;
        }

        // Scrolling along the margins triggers the cropping instead
        else {
            this[deltaMinimum.property] += deltaMinimum.direction * SCROLL_CROP_STEP;
        }
    },

    _onEnter: function (actor, event) {
        let [x, y, state] = global.get_pointer();

        // SHIFT: ignore standard behavior
        if (state & GDK_SHIFT_MASK) {
            return; // Clutter.EVENT_PROPAGATE;
        }

        Tweener.addTween(this._container, {
            opacity: TWEEN_OPACITY_TENTH,
            time: TWEEN_TIME_MEDIUM,
            transition: "easeOutQuad"
        });
    },

    _onLeave: function () {
        Tweener.addTween(this._container, {
            opacity: TWEEN_OPACITY_FULL,
            time: TWEEN_TIME_MEDIUM,
            transition: "easeOutQuad"
        });
    },

    _onParamsChange: function () {
        // Zoom or crop properties changed
        if (this.enabled) this._setThumbnail();
    },

    _onWindowUnmanaged: function () {
        this._disable();
        this._window = null;
    },

    _adjustVisibility: function (options) {
        options = options || {};

        /*
            [Boolean] this._naturalVisibility:
                        true === show the preview whenever is possible;
                        false === don't show it in any case
            [Boolean] this._focusHidden:
                        true === hide in case the mirrored window should be active

            options = {
                onComplete: [function] to call once the process is done.
                            It's called even if visibility was already set as requested

                noAnimate: [Boolean] to skip animation. If switching from window A to window B,
                             for example, the preview gets first destroyed (so hidden) then recreated.
                             This would lead to a fade-out + fade-in, which is not what most users like.
                             noAnimate === true avoids that.
            };
        */

        if (! this._container) {
            if (options.onComplete) options.onComplete();
            return;
        }

        // Hide when overView is shown, or source window is on top, or user related reasons
        let canBeShownOnFocus = (! this._focusHidden) || (global.display.focus_window !== this._window);

        let calculatedVisibility =  this._window
                                    && this._naturalVisibility
                                    && canBeShownOnFocus
                                    && (! Main.overview.visibleTarget);

        let calculatedOpacity = (calculatedVisibility) ? TWEEN_OPACITY_FULL : TWEEN_OPACITY_NULL;

        // Already OK (hidden / shown), no change needed
        if ((calculatedVisibility === this._container.visible) && (calculatedOpacity === this._container.get_opacity())) {
            if (options.onComplete) options.onComplete();
        }

        // Quick set (show or hide), but don't animate
        else if (options.noAnimate) {
            this._container.set_opacity(calculatedOpacity)
            this._container.visible = calculatedVisibility;
            if (options.onComplete) options.onComplete();
        }

        // Animation needed (either from less to more opacity or viceversa)
        else {
            this._container.reactive = false;
            if (! this._container.visible) {
                this._container.set_opacity(TWEEN_OPACITY_NULL);
                this._container.visible = true;
            }

            Tweener.addTween(this._container, {
                opacity: calculatedOpacity,
                time: TWEEN_TIME_SHORT,
                transition: "easeOutQuad",
                onComplete: Lang.bind(this, function () {
                    this._container.visible = calculatedVisibility;
                    this._container.reactive = true;
                    if (options.onComplete) options.onComplete();
                })
            });
        }
    },

    _onNotifyFocusWindow: function () {
        this._adjustVisibility();
    },

    _onOverviewShowing: function () {
        this._adjustVisibility();
    },

    _onOverviewHiding: function () {
        this._adjustVisibility();
    },

    _onMonitorsChanged: function () {
        // TODO multiple monitors issue, the preview doesn't stick to the right monitor
        log("Monitors changed");
    },

    // Align the preview along the chrome area
    _setPosition: function () {

        let posX, posY;

        let rectMonitor = Main.layoutManager.getWorkAreaForMonitor(global.screen.get_current_monitor());

        let rectChrome = {
            x1: rectMonitor.x,
            y1: rectMonitor.y,
            x2: rectMonitor.width + rectMonitor.x - this._container.get_width(),
            y2: rectMonitor.height + rectMonitor.y - this._container.get_height()
        };

        switch (this._corner) {

            case CORNER_TOP_LEFT:
                posX = rectChrome.x1;
                posY = rectChrome.y1;
                break;

            case CORNER_BOTTOM_LEFT:
                posX = rectChrome.x1;
                posY = rectChrome.y2;
                break;

            case CORNER_BOTTOM_RIGHT:
                posX = rectChrome.x2;
                posY = rectChrome.y2;
                break;

            default: // CORNER_TOP_RIGHT:
                posX = rectChrome.x2;
                posY = rectChrome.y1;
        }
        this._container.set_position(posX, posY);
    },

    // Create a window thumbnail and adds it to the container
    _setThumbnail: function () {
        let mutw = this._window.get_compositor_private();

        if (! mutw) return;

        let windowTexture = mutw.get_texture();
        let [windowWidth, windowHeight] =  windowTexture.get_size();

        /* To crop the window texture, for now I've found that:
           1. Using a clip rect on Clutter.clone will hide the outside portion but also will KEEP the space along it
           2. The Clutter.clone is stretched to fill all of its room when it's painted, so the transparent area outside
                cannot be easily left out by only adjusting the actor size (empty space only gets reproportioned).

           My current workaround:
           - Define a margin rect by using some proportional [0.0 - 1.0] trimming values for left, right, ... Zero: no trimming 1: all trimmed out
           - Set width and height of the Clutter.clone based on the crop rect and apply a translation to anchor it the top left margin
                (set_clip_to_allocation must be set true on the container to get rid of the translated texture overflow)
           - Ratio of the cropped texture is different from the original one, so this must be compensated with Clutter.clone scale_x/y parameters

           Known issues:
           - Strongly cropped textual windows like terminals get a little bit blurred. However, I was told this feature
                 was useful for framed videos to peel off, particularly. So shouldn't affect that much.

           Hopefully, some kind guy will soon explain to me how to clone just a portion of the source :D
        */

        // Get absolute margin values for cropping
        let margins = {
            left: windowWidth * this.leftCropRatio,
            right: windowWidth * this.rightCropRatio,
            top: windowHeight * this.topCropRatio,
            bottom: windowHeight * this.bottomCropRatio,
        };

        // Calculate the size of the cropped rect (based on the 100% window size)
        let croppedWidth = windowWidth - (margins.left + margins.right);
        let croppedHeight = windowHeight - (margins.top + margins.bottom);

        // To mantain a similar thumbnail size whenever the user selects a different window to preview,
        // instead of zooming out based on the window size itself, it takes the window screen as a standard unit (= 100%)
        let rectMonitor = Main.layoutManager.getWorkAreaForMonitor(global.screen.get_current_monitor());
        let targetRatio = rectMonitor.width * this.zoom / windowWidth;

        // No magnification allowed (KNOWN ISSUE: there's no height control if used, it still needs optimizing)
        if (! SETTING_MAGNIFICATION_ALLOWED && targetRatio > 1.0) {
            targetRatio = 1.0;
            this._zoom = windowWidth / rectMonitor.width; // do NOT set this.zoom (the encapsulated prop for _zoom) or it will be looping!
        }

        let thumbnail = new Clutter.Clone({ // list parameters https://www.roojs.org/seed/gir-1.2-gtk-3.0/seed/Clutter.Clone.html
            source: windowTexture,
            reactive: false,

            magnification_filter: Clutter.ScalingFilter.NEAREST, //NEAREST, //TRILINEAR,

            translation_x: -margins.left * targetRatio,
            translation_y: -margins.top * targetRatio,

            // Compensating scales due the different ratio of the cropped window texture
            scale_x: windowWidth / croppedWidth,
            scale_y: windowHeight / croppedHeight,

            width: croppedWidth * targetRatio,
            height: croppedHeight * targetRatio,

            margin_left: 0,
            margin_right: 0,
            margin_bottom: 0,
            margin_top: 0

        });

        this._container.foreach(function (actor) {
            actor.destroy();
        });

        this._container.add_actor(thumbnail);

        this._setPosition();
    },

    // xCropRatio properties normalize their opposite counterpart, so that margins won't ever overlap
    set leftCropRatio (value) {
        // [0, MAX] range
        this._leftCropRatio = Math.min(MAX_CROP_RATIO, Math.max(0.0, value));
        // Decrease the opposite margin if necessary
        this._rightCropRatio = Math.min(this._rightCropRatio, MAX_CROP_RATIO - this._leftCropRatio);
        this._onParamsChange();
    },

    set rightCropRatio (value) {
        this._rightCropRatio = Math.min(MAX_CROP_RATIO, Math.max(0.0, value));
        this._leftCropRatio = Math.min(this._leftCropRatio, MAX_CROP_RATIO - this._rightCropRatio);
        this._onParamsChange();
    },

    set topCropRatio (value) {
        this._topCropRatio = Math.min(MAX_CROP_RATIO, Math.max(0.0, value));
        this._bottomCropRatio = Math.min(this._bottomCropRatio, MAX_CROP_RATIO - this._topCropRatio);
        this._onParamsChange();
    },

    set bottomCropRatio (value) {
        this._bottomCropRatio = Math.min(MAX_CROP_RATIO, Math.max(0.0, value));
        this._topCropRatio = Math.min(this._topCropRatio, MAX_CROP_RATIO - this._bottomCropRatio);
        this._onParamsChange();
    },

    get leftCropRatio() {
        return this._leftCropRatio;
    },

    get rightCropRatio() {
        return this._rightCropRatio;
    },

    get topCropRatio() {
        return this._topCropRatio;
    },

    get bottomCropRatio() {
        return this._bottomCropRatio;
    },

    set zoom (value) {
        this._zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
        this._onParamsChange();
    },

    get zoom() {
        return this._zoom;
    },

    set focusHidden(value) {
        this._focusHidden = !!value;
        this._adjustVisibility();
    },

    get focusHidden() {
        return this._focusHidden;
    },

    set corner(value) {
        this._corner = (value %= 4) < 0 ? (value + 4) : (value);
        this._setPosition();
    },

    get corner() {
        return this._corner;
    },

    get enabled() {
        return !! this._container;
    },

    show: function () {
        this._naturalVisibility = true;
        if (this._window) this._adjustVisibility();
    },

    toggle: function(value) {
        if (! arguments.length) log("toggle with no args");

        (value) ? this.show() : this.passAway();
    },

    passAway: function () {
        this._naturalVisibility = false;
        this._adjustVisibility({onComplete: Lang.bind(this, this._disable)});
    },

    get window() {
        return this._window;
    },

    set window(metawindow) {
        this._enable(metawindow);
    },

    _enable: function (metawindow) {
        let isSwitchingWindow = this.enabled;

        this._disable();

        this._window = metawindow;

        if (! metawindow) return;

        this._windowSignals.tryConnect(this._window, "unmanaged", Lang.bind(this, this._onWindowUnmanaged));
        // Version 3.10 does not support size-changed
        this._windowSignals.tryConnect(this._window, "size-changed", Lang.bind(this, this._setThumbnail));
        //_windowSignals.tryConnect(_window, "notify::minimized", log.bind(null, "minimized"));
        this._windowSignals.tryConnect(this._window, "notify::maximized-vertically", Lang.bind(this, this._setThumbnail));
        this._windowSignals.tryConnect(this._window, "notify::maximized-horizontally", Lang.bind(this, this._setThumbnail));

        this._environmentSignals.tryConnect(Main.overview, "showing", Lang.bind(this, this._onOverviewShowing));
        this._environmentSignals.tryConnect(Main.overview, "hiding", Lang.bind(this, this._onOverviewHiding));
        this._environmentSignals.tryConnect(global.display, "notify::focus-window", Lang.bind(this, this._onNotifyFocusWindow));
        this._environmentSignals.tryConnect(global.screen, "monitors-changed", Lang.bind(this, this._onMonitorsChanged));


        this._container = new St.Button({style_class: "window-corner-preview"});
        // Force content not to overlap, allowing cropping
        this._container.set_clip_to_allocation(true);

        this._container.connect("enter-event", Lang.bind(this, this._onEnter));
        this._container.connect("leave-event", Lang.bind(this, this._onLeave));
        // Don't use button-press-event, as set_position conflicts and Gtk would react for enter and leave event of ANY item on the chrome area
        this._container.connect("button-release-event", Lang.bind(this, this._onClick));
        this._container.connect("scroll-event", Lang.bind(this, this._onScroll));

        this._container.visible = false;
        Main.layoutManager.addChrome(this._container);
        this._setThumbnail();

        // isSwitchingWindow = false means user only changed window, but preview was on, so does not animate
        this._adjustVisibility({noAnimate: isSwitchingWindow});
    },

    _disable: function () {
        log("disable", this._container);

        this._windowSignals.disconnectAll();
        this._environmentSignals.disconnectAll();

        if (! this._container) return;

        Main.layoutManager.removeChrome(this._container);
        this._container.destroy();
        this._container = null;
    },


})

const CWindowCornerPreviewMenu = new Lang.Class({

    Name: "WindowCornerPreview.indicator",
    Extends: PanelMenu.Button,

    _init: function () {
        this.parent(null, "WindowCornerPreview.indicator");
    },

    // Handler to turn preview on / off
    _onMenuIsEnabled: function (item) {
        this.preview.toggle(item.state);
    },

    _updateSliders: function () {
        this.menuZoom.value = this.preview.zoom;
        this.menuZoomLabel.label.set_text("Monitor Zoom:  " + Math.floor(this.preview.zoom * 100).toString() + "%");

        this.menuLeftCrop.value = this.preview.leftCropRatio;
        this.menuRightCrop.value = this.preview.rightCropRatio;
        this.menuTopCrop.value = this.preview.topCropRatio;
        this.menuBottomCrop.value = this.preview.bottomCropRatio;
    },

    _onZoomChanged: function (source, value) {
        this.preview.zoom = value;
        this._updateSliders();
    },

    _onLeftCropChanged: function (source, value) {
        this.preview.leftCropRatio = value;
        this._updateSliders();
    },

    _onRightCropChanged: function (source, value) {
        this.preview.rightCropRatio = value;
        this._updateSliders();
    },

    _onTopCropChanged: function (source, value) {
        this.preview.topCropRatio = value;
        this._updateSliders();
    },

    _onBottomCropChanged: function (source, value) {
        this.preview.bottomCropRatio = value;
        this._updateSliders();
    },

    _onSettings: function () {
        Util.trySpawnCommandLine("gnome-shell-extension-prefs window-corner-preview@fabiomereu.it");
    },

    // Update windows list and other menus before menu pops up
    _onUserTriggered: function () {
        this.menuIsEnabled.setToggleState(this.preview.enabled);
        this._updateSliders();
        this.menuWindows.menu.removeAll();
        getWorkspaceWindowsArray().forEach(function (workspace, i) {
            if (i > 0) {
                this.menuWindows.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }

            // Populate window list on submenu
            workspace.windows.forEach(function (window) {
                let winMenuItem = new PopupMenu.PopupMenuItem(spliceTitle(window.get_title()));
                winMenuItem.connect("activate", Lang.bind(this, function () {
                    this.preview.window = window;
                    this.preview.show();
                }));

                this.menuWindows.menu.addMenuItem(winMenuItem);
            }, this);
        }, this);
    },

    _onSettingsChanged: function (settings, key) {
        this.preview.focusHidden = this.settings.get_boolean(Prefs.SETTING_FOCUS_HIDDEN);

        switch (key) {
            case Prefs.SETTING_BEHAVIOR_MODE:
                //log("behaviour", key);
                break;

            case Prefs.SETTING_FOCUS_HIDDEN:
                //log("focus", key);
                break;
        }

    },

    enable: function () {

        // Add icon
        this.icon = new St.Icon({ icon_name: "face-monkey-symbolic", style_class: "system-status-icon"});
        this.actor.add_actor(this.icon);

        // Prepare Menu...

        // 1. Preview ON/OFF
        this.menuIsEnabled = new PopupMenu.PopupSwitchMenuItem("Preview", false, {hover: false, reactive: true});
        this.menuIsEnabled.connect("toggled", Lang.bind(this, this._onMenuIsEnabled));
        this.menu.addMenuItem(this.menuIsEnabled);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 2. Windows list
        this.menuWindows = new PopupMenu.PopupSubMenuMenuItem("Windows");
        this.menu.addMenuItem(this.menuWindows);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 3a. Zoom label
        this.menuZoomLabel = new PopupMenu.PopupMenuItem("", {activate: false, reactive: false});
        this.menu.addMenuItem(this.menuZoomLabel);

        // 3b, Zoom slider
        this.menuZoom = new PopupSliderMenuItem(false, DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, 0.005); // slider step: 0.5%
        this.menuZoom.connect("value-changed", Lang.bind(this, this._onZoomChanged));
        this.menu.addMenuItem(this.menuZoom);

        // 4. Crop Sliders
        this.menuCrop = new PopupMenu.PopupSubMenuMenuItem("Crop");
        this.menu.addMenuItem(this.menuCrop);

        this.menuTopCrop = new PopupSliderMenuItem("Top", DEFAULT_CROP_RATIO, 0.0, MAX_CROP_RATIO);
        this.menuTopCrop.connect("value-changed", Lang.bind(this, this._onTopCropChanged));
        this.menuCrop.menu.addMenuItem(this.menuTopCrop);

        this.menuLeftCrop = new PopupSliderMenuItem("Left", DEFAULT_CROP_RATIO, 0.0, MAX_CROP_RATIO);
        this.menuLeftCrop.connect("value-changed", Lang.bind(this, this._onLeftCropChanged));
        this.menuCrop.menu.addMenuItem(this.menuLeftCrop);

        this.menuRightCrop = new PopupSliderMenuItem("Right", DEFAULT_CROP_RATIO, 0.0, MAX_CROP_RATIO);
        this.menuRightCrop.connect("value-changed", Lang.bind(this, this._onRightCropChanged));
        this.menuCrop.menu.addMenuItem(this.menuRightCrop);

        this.menuBottomCrop = new PopupSliderMenuItem("Bottom", DEFAULT_CROP_RATIO, 0.0, MAX_CROP_RATIO);
        this.menuBottomCrop.connect("value-changed", Lang.bind(this, this._onBottomCropChanged));
        this.menuCrop.menu.addMenuItem(this.menuBottomCrop);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 5. Settings
        this.menuSettings = new PopupMenu.PopupMenuItem("Settings");
        this.menuSettings.connect("activate", Lang.bind(this, this._onSettings));
        this.menu.addMenuItem(this.menuSettings);

        this.actor.connect("enter-event", Lang.bind(this, this._onUserTriggered));

        this.settings = Convenience.getSettings();

        this.settings.connect("changed", Lang.bind(this, this._onSettingsChanged));
        this._onSettingsChanged();

    },

    disable: function () {
        this.menu.removeAll();
    }
});


let menu;

function init() {
    // nothing
}

function enable() {
    menu = new CWindowCornerPreviewMenu();
    menu.preview = new CWindowCornerPreview();
    menu.enable();
    Main.panel.addToStatusArea("CWindowCornerPreviewMenu", menu);
}

function disable() {
    menu.preview.passAway();
    menu.disable();
    menu.destroy();
}
