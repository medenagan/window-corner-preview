"use strict";

var Rectangle = class Rectangle {

    constructor() {
        let x0 = 0, y0 = 0;
        let x1 = 0, y1 = 0;

        const length = arguments.length;

        // (x, y, width, height)
        if (length > 3) {
            x0 = +arguments[0];
            y0 = +arguments[1];
            x1 = x0 + Math.abs(arguments[2]);
            y1 = y0 + Math.abs(arguments[3]);
        }

        // (x, y, length)
        else if (length > 2) {
            x0 = +arguments[0];
            y0 = +arguments[1];
            x1 = y1 = Math.abs(arguments[2]);
            x1 += x0;
            y1 += y0;
        }

        // (width, height)
        else if (length > 1) {
            x1 = Math.abs(arguments[0]);
            y1 = Math.abs(arguments[1]);
        }

        // (length) = a square
        else if (length) {
            x1 = y1 = Math.abs(arguments[0]);
        }

        this._x0 = x0;
        this._x1 = x1;
        this._y0 = y0;
        this._y1 = y1;
    }

    offset() {
        let dX = 0, dY = 0;

        if (arguments.length > 1) {
            dX = +arguments[0];
            dY = +arguments[1];
        }

        else if (arguments.length) {
            dX = dY = +arguments[0];
        }

        this._x0 += dX;
        this._y0 += dY;
        this._x1 += dX;
        this._y1 += dY;
    }

    move(x, y) {
        this._x1 += x - this._x0;
        this._y1 += y - this._y0;
        this._x0 = x;
        this._y0 = y;
    }

    toString() {
        return "Rectangle(" +
            (+this._x0) + ", " +
            (+this._y0) + ")-(" +
            (+this._x1) + ", " +
            (+this._y1) + ")";
    }

    getXY() {
        return [this._x0, this._y0, this._x1, this._y1];
    }

    isPointInside (x, y) {
        return (
            x >= this._x0 &&
            x <= this._x1 &&
            y >= this._y0 &&
            y <= this._y1
        );
    }

    get width() {
        return Math.abs(this._x0 - this._x1);
    }

    get height() {
        return Math.abs(this._y0 - this._y1);
    }

    get x0() {
        return this._x0;
    }

    get y0() {
        return this._y0;
    }

    get x1() {
        return this._x1;
    }

    get y1() {
        return this._y1;
    }

}
