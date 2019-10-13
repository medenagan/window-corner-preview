"use strict";

// Global modules
const Lang = imports.lang;
const PointerWatcher = imports.ui.pointerWatcher;
const Signals = imports.signals;

// Internal modules
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Shape = Me.imports.shape;

const Rectangle = Shape.Rectangle;

var Area = class Area {

    constructor() {
        // Hi
    }

    _onPointerChange(x, y) {
        if (! this._tester) {
            return;
        }

        // true === inside; false === outside
        const position = this._tester.call(null, x, y);

        if (position) {
            if (! this._lastPosition) {
                this.emit("enter-event");
            }
            this.emit("motion-event", x, y);
        }
        else if (this._lastPosition) {
            this.emit("leave-event");
        }
        this._lastPosition = position;
    }

    get tester() {
        return this._tester;
    }

    set tester(fn) {
        // Area.tester = (x, y) => true|false
        if (! fn) {
            this._tester = null;
            if (this._watch) {
                this._watch.remove();
                this._watch = null;
            }
        }

        else if (typeof fn === "function") {
            if (fn.length < 2) {
                log("WARNING: Sensitive.Area.tester was given a function unsupporting explicit (x, y) params");
            }
            this._tester = fn;
            if (! this._watch) {
                const IDLE = 100;
                this._watch = PointerWatcher.
                    getPointerWatcher().
                    addWatch(IDLE, (...params) => this._onPointerChange(...params));
                // Force first event
                this._lastPosition = false;
                const [x, y] = global.get_pointer();
                this._onPointerChange(x, y);
            }
        }

        else {
            throw new Error("Sensitive.Area.tester requires either a function or null");
        }
    }
}

Signals.addSignalMethods(Area.prototype);
