const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;

// http://zderadicka.eu/gsettings-flexible-configuration-system/

const Gettext = imports.gettext.domain("gnome-shell-extensions");
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

var SETTING_BEHAVIOR_MODE = "behavior-mode";
var SETTING_FOCUS_HIDDEN = "focus-hidden";

function _strong(text) {
  return "<b>" + _(text) + "</b>";
}


function init() {
    Convenience.initTranslations();
}

const WindowCornerPreviewPrefsWidget = new GObject.Class({
    Name: "WindowCornerPreview.Prefs.Widget",
    GTypeName: "WindowCornerPreviewPrefsWidget",
    Extends: Gtk.VBox,

    _init: function(params) {
        this.parent(params);

   //     this.shadow_type = Gtk.ShadowType.NONE;
        this.margin = 24;

        this.spacing = 6;

        this._settings = Convenience.getSettings();

        // 1. Behavior 

        this.add(new Gtk.Label({
            label: _strong("Behavior when mouse is over (UNDER DEVELOPMENT)"),
            use_markup: true,
            xalign: 0.0, // left
            yalign: 0.0 // top
        }));

        let boxBehavior = new Gtk.VBox({
            spacing: 6,
            margin_top: 6,
            margin_left: 12
        });
//https://valadoc.org/gtk+-3.0/Gtk.ComboBox.html

        let currentMode = this._settings.get_string(SETTING_BEHAVIOR_MODE);
        let range = this._settings.get_range(SETTING_BEHAVIOR_MODE);
        let modes = range.deep_unpack()[1].deep_unpack();

        let modeLabels = {
            seethrough: _("See-through (one click to drive it away)"),
            autohide: _("Hide-and-seek (vanish and turn up automatically)")
        };

        let radio = null;
        for (let i = 0; i < modes.length; i++) {
            let mode = modes[i];
            let label = modeLabels[mode];
            if (! label) {
               log("Unhandled option '%s' for %s.".format(mode, SETTING_BEHAVIOR_MODE));
               continue;
            }

            radio = new Gtk.RadioButton({ active: currentMode == mode,
                                          label: label,
                                          group: radio,
                                          sensitive: false});
            boxBehavior.add(radio);

            radio.connect('toggled', Lang.bind(this, function(button) {
                if (button.active)
                    this._settings.set_string(SETTING_BEHAVIOR_MODE, mode);
            }));
        }
        this.add(boxBehavior);

        // 2. Hide on top 
        
        let checkHideOnFocus = new Gtk.CheckButton({
            label: _("Hide when the mirrored window is on top"),
            active: this._settings.get_boolean(SETTING_FOCUS_HIDDEN)
        });

        checkHideOnFocus.connect("toggled", Lang.bind(this, function(button) {
            this._settings.set_boolean(SETTING_FOCUS_HIDDEN, button.active);
        }));

        let boxHideOnFocus = new Gtk.VBox({margin_top: 12});

        boxHideOnFocus.add(checkHideOnFocus);
        this.add(boxHideOnFocus);
    }
});

function buildPrefsWidget() {
    let widget = new WindowCornerPreviewPrefsWidget();
    widget.show_all();

    return widget;
}
