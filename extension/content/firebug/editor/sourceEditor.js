/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/http",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/wrapper",
    "firebug/lib/array",
],
function(Firebug, FBTrace, Obj, Http, Dom, Css, Wrapper, Arr) {

"use strict";

// ********************************************************************************************* //
// Resources

// CodeMirror: http://codemirror.net/

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;

// CodeMirror files. These scripts are dynamically included into panel.html
// Note that panel.html runs in content scope with restricted (no chrome) privileges.
var codeMirrorSrc = "chrome://firebug/content/editor/codemirror/codemirror.js";
var jsModeSrc = "chrome://firebug/content/editor/codemirror/mode/javascript.js";
var htmlMixedModeSrc = "chrome://firebug/content/editor/codemirror/mode/htmlmixed.js";
var xmlModeSrc = "chrome://firebug/content/editor/codemirror/mode/xml.js";
var cssModeSrc = "chrome://firebug/content/editor/codemirror/mode/css.js";

// Tracing helpers
var Trace = FBTrace.to("DBG_SOURCEEDITOR");
var TraceError = FBTrace.to("DBG_ERRORS");

// Debug location style classes
var WRAP_CLASS = "CodeMirror-debugLocation";
var BACK_CLASS = "CodeMirror-debugLocation-background";
var HIGHLIGHTED_LINE_CLASS = "CodeMirror-highlightedLine";
var BP_WRAP_CLASS = "CodeMirror-breakpoint";

// ********************************************************************************************* //
// Source Editor Constructor

function SourceEditor()
{
    this.editorObject = null;
    this.debugLocation = -1;
    this.highlightedLine = -1;
}

// ********************************************************************************************* //
// Gutters

SourceEditor.Gutters =
{
    breakpoints: "breakpoints",
};

// Shortcut
var bpGutter = SourceEditor.Gutters.breakpoints;

// ********************************************************************************************* //
// Config

SourceEditor.DefaultConfig =
{
    value: "",
    mode: "htmlmixed",
    theme: "firebug",
    indentUnit: 2,
    tabSize: 4,
    smartIndent: true,
    extraKeys: {},
    lineWrapping: false,
    lineNumbers: true,
    firstLineNumber: 1,
    gutters: [bpGutter],
    fixedGutter: false,
    readOnly: "nocursor",
    showCursorWhenSelecting: true,
    undoDepth: 200

    // xxxHonza: this is weird, when this props is set the editor is displayed twice.
    // There is one-line editor created at the bottom of the Script panel.
    // Just switch to the CSS panel and back to reproduce the problem.
    // autofocus: true
};

SourceEditor.Events =
{
    textChange: "change",
    beforeTextChange: "beforeChange",
    cursorActivity: "cursorActivity",
    beforeSelectionChange: "beforeSelectionChange",
    viewportChange: "viewportChange",
    gutterClick: "gutterClick",
    focus: "focus",
    blur: "blur",
    scroll: "scroll",
    update: "update",
    renderLine: "renderLine",
    breakpointChange: "breakpointchange",
    contextMenu: "contextmenu",
    mouseMove: "mousemove",
    mouseOut: "mouseout",
    mouseOver: "mouseover",
    mouseUp: "mouseup",
    keyDown: "keydown"
};

// ********************************************************************************************* //
// Source Editor Implementation

/**
 * @object This object represents a wrapper for CodeMirror editor. The rest of Firebug
 * should access all CodeMirror features through this object and so, e.g. make it easy to
 * switch to another editor in the future.
 *
 * Note that CodeMirror instances are running within Firebug UI (panel.html) that has
 * restricted (content) privileges. All objects passed into CM APIs (such as rectangles,
 * coordinates, positions, etc.) must be properly exposed to the content. You should usually
 * utilize {@Wrapper.cloneIntoContentScope} method for this purpose.
 */
SourceEditor.prototype =
/** @lends SourceEditor */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    init: function(parentNode, config, callback)
    {
        var doc = parentNode.ownerDocument;
        var onInit = this.onInit.bind(this, parentNode, config, callback);

        // xxxHonza: Expose FBTrace into the panel.html (and codemirror.js), so
        // debugging is easier. Should *not* be part of the distribution.
        //var view = Wrapper.getContentView(doc.defaultView);
        //view.FBTrace = ExposedFBTrace;

        this.loadScripts(doc, onInit);
    },

    onInit: function(parentNode, config, callback)
    {
        var doc = parentNode.ownerDocument;

        // All properties must be read-only so, they can't be modified in the DOM panel.
        function genPropDesc(value)
        {
            return {
                enumerable: true,
                configurable: true,
                writable: true,
                value: value
            };
        }

        // Unwrap Firebug content view (panel.html). This view is running in
        // content mode with no chrome privileges.
        var view = Wrapper.getContentView(doc.defaultView);

        Trace.sysout("sourceEditor.onInit; " + view.CodeMirror);

        // The config object passed to the view must be content-accessible.
        var newConfig = Cu.createObjectIn(view);

        // Compute properties of the final newConfig object.
        for (var prop in SourceEditor.DefaultConfig)
        {
            var value = prop in config ? config[prop] : SourceEditor.DefaultConfig[prop];
            Object.defineProperty(newConfig, prop, genPropDesc(value));
        }

        var self = this;

        // Create editor;
        this.editorObject = view.CodeMirror(function(view)
        {
            Trace.sysout("sourceEditor.onEditorCreate;");

            parentNode.appendChild(view);
            self.view = view;
        }, newConfig);

        // Mark lines so, we can search for them (see e.g. getLineIndex method).
        this.editorObject.on("renderLine", function(cm, lineHandle, element)
        {
            Css.setClass(element, "firebug-line");
        });

        // xxxHonza: 'contextmenu' event provides wrong target (clicked) element.
        // So, handle 'mousedown' first to remember the clicked element and use
        // it within the getContextMenu item
        var scroller = this.editorObject.display.scroller;
        scroller.addEventListener("mousedown", function(event)
        {
            self.currentTarget = event.target;
        });

        Trace.sysout("sourceEditor.init; ", this.view);

        // Execute callback function. It could be done asynchronously (e.g. for Orion)
        callback();
    },

    destroy: function()
    {
        Trace.sysout("sourceEditor.destroy;");
    },

    isInitialized: function()
    {
        return (this.editorObject != null)
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Load CM Scripts

    loadScripts: function(doc, callback)
    {
        Trace.sysout("sourceEditor.loadScripts;");

        var loader = this;

        //xxxHonza: Support for CM debugging. If <script> tags are inserted with
        // properly set 'src' attribute, stack traces produced by Firebug tracing
        // console are correct. But it's asynchronous causing the Script panel UI
        // to blink so, we don't need it for production. In any case the following
        // script loader object can be used for that.
        //loader = new ScriptLoader(callback);

        loader.addScript(doc, "cm", codeMirrorSrc);
        loader.addScript(doc, "cm-js", jsModeSrc);
        loader.addScript(doc, "cm-xml", xmlModeSrc);
        loader.addScript(doc, "cm-css", cssModeSrc);
        loader.addScript(doc, "cm-htmlmixed", htmlMixedModeSrc);

        if (loader == this)
            callback();
    },

    addScript: function(doc, id, url)
    {
        // Synchronous injecting of CM source into Firebug UI (panel.html).
        Dom.addScript(doc, id, Http.getResource(url));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Event Listeners

    addEventListener: function(type, handler)
    {
        Trace.sysout("sourceEditor.addEventListener; " + type);

        var editorNode;

        if (isBuiltInEvent(type))
        {
            var func = function()
            {
                handler(getEventObject(type, arguments));
            };

            if (!this.BuiltInEventsHandlers)
                this.BuiltInEventsHandlers = {};

            if (!this.BuiltInEventsHandlers[type])
            {
                this.BuiltInEventsHandlers[type] = [];
            }
            else
            {
                for (var i = 0; i < this.BuiltInEventsHandlers[type].length; i++)
                {
                    // There is already the same handler.
                    if (this.BuiltInEventsHandlers[type][i].handler == handler)
                        return;
                }

                editorNode = this.editorObject.getWrapperElement();
                editorNode.addEventListener(type, handler, false);
            }

            this.BuiltInEventsHandlers[type].push({ handler: handler, func: func });
            this.editorObject.on(type, func);
        }
        else if (type == SourceEditor.Events.breakpointChange)
        {
            if (!this.bpChangingHandlers)
                this.bpChangingHandlers = [];

            this.bpChangingHandlers.push(handler);
        }
        else
        {
            var supportedEvent = false;
            for (var eventType in SourceEditor.Events)
            {
                if (type == SourceEditor.Events[eventType])
                {
                    supportedEvent = true;
                    break;
                }
            }

            if (supportedEvent)
            {
                editorNode = this.editorObject.getWrapperElement();
                editorNode.addEventListener(type, handler, false);
            }
        }
    },

    removeEventListener: function(type, handler)
    {
        if (isBuiltInEvent(type))
        {
            if (!this.BuiltInEventsHandlers || !this.BuiltInEventsHandlers[type])
                return;

            var func = function()
            {
                handler(getEventObject(type, arguments));
            };

            for (var i = 0; i < this.BuiltInEventsHandlers[type].length; i++)
            {
                if (this.BuiltInEventsHandlers[type][i].handler == handler)
                {
                    this.editorObject.off(type, this.BuiltInEventsHandlers[type][i].func);

                    this.BuiltInEventsHandlers[type].splice(i, 1);
                    if (!this.BuiltInEventsHandlers[type].length)
                    {
                        delete this.BuiltInEventsHandlers[type];
                        return;
                    }
                }
            }
        }
        else if (type == SourceEditor.Events.breakpointChange)
        {
            if (!this.bpChangingHandlers)
                return;

            this.bpChangingHandlers = this.bpChangingHandlers.filter(function(func)
            {
                if (func != handler)
                    return func;
            });

            if (!this.bpChangingHandlers)
                this.bpChangingHandlers = null;
        }
        else
        {
            var supportedEvent = false;
            for (var eventType in SourceEditor.Events)
            {
                if (type == SourceEditor.Events[eventType])
                {
                    supportedEvent = true;
                    break;
                }
            }

            if (supportedEvent)
            {
                var editorNode = this.editorObject.getWrapperElement();
                editorNode.removeEventListener(type, handler, false);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Text Content

    setText: function(text, type)
    {
        Trace.sysout("sourceEditor.setText: " + type + " " + text, text);

        // xxxHonza: the default 'mixedmode' mode should be set only if the text
        // is actually a markup (first letter == '<'?). Note that applying mixed mode
        // on plain JS doesn't work (no color syntax at all).
        var mode = "htmlmixed";
        switch (type)
        {
            case "js":
                mode = "javascript";
            break;
            case "css":
                mode = "css";
            break;
            case "xml":
                mode = "xml";
            break;
        }

        this.editorObject.setOption("mode", mode);

        text = text || "";
        this.editorObject.setValue(text);
    },

    getText: function()
    {
        return this.editorObject.getValue();
    },

    getCharCount: function(line)
    {
        if (line != null)
            return this.getDocument().getLine(line).length;

        // The newline characters shouldn't be counted.
        return this.editorObject.getValue().replace(/\n/g, "").length;
    },

    getSelectedText: function()
    {
        return this.editorObject.getSelection();
    },

    setSelection: function(start, end)
    {
        var allCharCount = this.getCharCount();

        // It would be wrong If start is out of the body
        // or end(in positive case) is less than start.
        if (start > allCharCount || (end > 0 && end < start))
            return;

        var lineCount = this.getDocument().lineCount();
        var startLine = -1;
        var endLine = lineCount - 1;
        var startChar = 0;
        var endChar = 0;

        // In cases that both/one of the inputs is negative,
        // indicate an offset from the end of the text.
        start  = start < 0 ? allCharCount + start + 1 : start;
        end = end < 0 ? allCharCount + end + 1 : end;

        // If the one of the inputs, in negative case,
        // is out of the body.
        if (end < 0 || start < 0)
            return;

        // It's also possible that the end parameter, in negative case,
        // would be less than the start (e.g. setSelection(-1, -5)), so
        // just need to be swapped.
        if (end < start)
        {
            var temp = start;
            start = end;
            end = temp;
        }

        var charCount = 0;

        // Since Codemirror only accepts the start/end lines and chars in the lines
        // to set selection, It needs to go through the editor lines to find the
        // location of the inputs.
        for (var i = 0; i < lineCount; i++)
        {
            charCount += this.getCharCount(i);
            if (startLine == -1 && charCount >= start)
            {
                startLine = i;
                startChar = start - (charCount - this.getCharCount(i));
            }

            if (charCount >= end)
            {
                endLine = i;
                endChar = end - (charCount - this.getCharCount(i));
                break;
            }
        }

        this.editorObject.setSelection(
            {line: startLine, ch: startChar},
            {line: endLine, ch: endChar}
        );
    },

    getSelection: function()
    {
        var start = this.getCursor("start");
        var end = this.getCursor("end");
        var startOffset = 0;
        var endOffset = 0;

        // Count the chars of the lines before the
        // end/start lines.
        for (var i = 0; i < end.line; i++)
        {
            var lineCharCount = this.getCharCount(i);
            if (start.line > i)
                startOffset += lineCharCount;

            endOffset += lineCharCount;
        }

        // Add the number of chars between the first char
        // of the lines and cursor position.
        startOffset += start.ch;
        endOffset += end.ch;

        return {
            start: startOffset,
            end: endOffset
        };
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Document Management

    getDocument: function()
    {
        return this.editorObject.getDoc();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Cursor Methods

    setCursor: function(line, ch)
    {
        this.editorObject.setCursor(line, ch);
        this.editorObject.focus();
    },

    getCursor: function(start)
    {
        return this.getDocument().getCursor(start || "head");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Line API

    lastLineNo: function()
    {
        return this.editorObject.lastLine();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    setDebugLocation: function(line)
    {
        Trace.sysout("sourceEditor.setDebugLocation; line: " + line);

        if (this.debugLocation == line)
            return;

        if (this.debugLocation != -1)
        {
            var handle = this.editorObject.getLineHandle(this.debugLocation);
            this.editorObject.removeLineClass(handle, "wrap", WRAP_CLASS);
            this.editorObject.removeLineClass(handle, "background", BACK_CLASS);

            // Remove debug location marker (we are reusing breakpoints gutter for it).
            var marker = this.getGutterMarker(bpGutter, this.debugLocation);
            if (marker && marker.className == "debugLocation")
                this.removeGutterMarker(bpGutter, this.debugLocation);
        }

        this.debugLocation = line;

        if (this.debugLocation != -1)
        {
            var handle = this.editorObject.getLineHandle(line);
            this.editorObject.addLineClass(handle, "wrap", WRAP_CLASS);
            this.editorObject.addLineClass(handle, "background", BACK_CLASS);

            // Debug location marker is using breakpoints gutter and so, create the marker
            // only if there is no breakpoint marker already. This 'gutter reuse' allows to
            // place the debug location icon over a breakpoint icon and save some space.
            var marker = this.getGutterMarker(bpGutter, line);
            if (!marker)
            {
                var marker = this.getGutterElement().ownerDocument.createElement("div");
                marker.className = "debugLocation";
                this.editorObject.setGutterMarker(line, bpGutter, marker);
            }
        }
    },

    highlightLine: function(line)
    {
        Trace.sysout("sourceEditor.highlightLine; line: " + line);

        if (this.highlightedLine == line)
            return;

        if (this.highlightedLine != -1)
        {
            var handle = this.editorObject.getLineHandle(this.highlightedLine);
            this.editorObject.removeLineClass(handle, "wrap", HIGHLIGHTED_LINE_CLASS);
        }

        this.highlightedLine = line;

        if (this.highlightedLine == -1)
            return;

        var handle = this.editorObject.getLineHandle(line);
        this.editorObject.addLineClass(handle, "wrap", HIGHLIGHTED_LINE_CLASS);

        // Unhighlight after a timeout.
        var self = this;
        setTimeout(function()
        {
            self.highlightLine(-1);
        }, 1300);
    },

    scrollToLine: function(line, options)
    {
        line = line || 0;
        options = options || {};

        // The pos object is passed into CodeMirror that is running within
        // a content scope (restricted privileges, in panel.html).
        var pos = Wrapper.cloneIntoContentScope(this.view, {line: line, ch: 0});
        var coords = this.editorObject.charCoords(pos, "local");

        // If direct scroll (pixel) position is specified use it.
        if (options.scrollTop)
        {
            this.editorObject.scrollTo(null, options.scrollTop);
        }
        else
        {
            var scrollInfo = this.editorObject.getScrollInfo();
            var hScrollBar = this.view.getElementsByClassName("CodeMirror-hscrollbar")[0];

            // Do not include h-scrollbar in editor height (even if CM docs says getScrollInfo
            // returns the visible area minus scrollbars, it doesn't seem to work).
            var editorHeight = scrollInfo.clientHeight - hScrollBar.offsetHeight;
            var top = coords.top;
            var bottom = coords.bottom;
            var lineHeight = this.editorObject.defaultTextHeight();

            // Scroll only if the target line is outside of the viewport.
            if (top <= scrollInfo.top || bottom >= scrollInfo.top + editorHeight)
            {
                var middle = top - (editorHeight / 2);
                this.editorObject.scrollTo(null, middle);
            }
        }
    },

    scrollTo: function(left, top)
    {
        this.editorObject.scrollTo(left, top);
    },

    getScrollInfo: function()
    {
        return this.editorObject.getScrollInfo();
    },

    getTopIndex: function()
    {
        var scrollInfo = this.getScrollInfo();
        scrollInfo = Wrapper.cloneIntoContentScope(this.view, scrollInfo);
        var coords = this.editorObject.coordsChar(scrollInfo, "local");
        return coords.line;
    },

    setTopIndex: function(line)
    {
        var coords = Wrapper.cloneIntoContentScope(this.view, {line: line, ch: 0});
        this.editorObject.scrollTo(0, this.editor.charCoords(coords, "local").top);
    },

    hasFocus: function()
    {
        return this.editorObject.hasFocus();
    },

    focus: function()
    {
        this.editorObject.focus();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

    addBreakpoint: function(lineNo)
    {
        if (!this.editorObject)
            return;

        Trace.sysout("sourceEditor.addBreakpoint; line: " + lineNo);

        var info = this.editorObject.lineInfo(lineNo);
        if (!info)
        {
            Trace.sysout("sourceEditor.addBreakpoint; ERROR line doesn't exist: " + lineNo);
            return;
        }

        if (!info.gutterMarkers)
        {
            var breakpoint = this.getGutterElement().ownerDocument.createElement("div");
            breakpoint.className = "breakpoint";
            this.editorObject.setGutterMarker(lineNo, bpGutter, breakpoint);

            // Modify also the line-wrap element (also used by FBTest)
            var handle = this.editorObject.getLineHandle(lineNo);
            if (handle)
                this.editorObject.addLineClass(handle, "wrap", BP_WRAP_CLASS);

            // dispatch event;
            if (this.bpChangingHandlers)
            {
                var event = {
                    added: [{line: lineNo}],
                    removed: []
                };

                this.bpChangingHandlers.forEach(function(handler)
                {
                    handler(event);
                });
            }
        }
    },

    removeBreakpoint: function(lineNo)
    {
        if (!this.editorObject)
            return;

        Trace.sysout("sourceEditor.removeBreakpoint; line: " + lineNo);

        this.removeGutterMarker(bpGutter, lineNo);

        // Modify also the line-wrap element (also used by FBTest)
        var handle = this.editorObject.getLineHandle(lineNo);
        if (handle)
            this.editorObject.removeLineClass(handle, "wrap", BP_WRAP_CLASS);

        // dispatch event;
        if (this.bpChangingHandlers)
        {
            var event = {
                added: [],
                removed: [{line: lineNo}]
            };

            this.bpChangingHandlers.forEach(function(handler)
            {
                handler(event);
            });
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Gutters and Marker API

    setGutterMarker: function(gutter, lineNo, markerElt)
    {
        this.editorObject.setGutterMarker(lineNo, gutter, markerElt);
    },

    removeGutterMarker: function(gutter, lineNo)
    {
        this.editorObject.setGutterMarker(lineNo, gutter, null);
    },

    clearGutter: function(gutter)
    {
        this.editorObject.clearGutter(gutter);
    },

    getGutterMarker: function(gutter, lineNo)
    {
        if (!this.editorObject)
            return;

        var info = this.editorObject.lineInfo(lineNo);
        return (info && info.gutterMarkers && info.gutterMarkers[gutter] ?
            info.gutterMarkers[gutter] : null);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Editor DOM nodes

    getViewElement: function()
    {
        return this.editorObject.getWrapperElement();
    },

    getGutterElement: function()
    {
        return this.editorObject.getGutterElement();
    },

    getScrollerElement: function()
    {
        return this.editorObject.getScrollerElement();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getLineFromEvent: function(e)
    {
        var pos = {
            left: event.pageX,
            top: event.pageY - 60 //xxxHonza: why the top is not zero but 60 in the event?
        };

        return this.editorObject.coordsChar(pos);
    },

    getLineIndex: function(target)
    {
        // xxxHonza: the target provided by 'contextmenu' event is wrong and so,
        // use the one from 'mousedown'
        if (this.currentTarget)
            target = this.currentTarget;

        this.currentTarget = null;

        var lineElement;

        if (Css.hasClass(target, "breakpoint"))
        {
            // Sadly, CM doesn't use much class attributes so, this needs to be hardcoded.
            target = target.parentNode.parentNode.parentNode;
            lineElement = target.getElementsByClassName("firebug-line").item(0);
        }
        else
        {
            lineElement = Dom.getAncestorByClass(target, "firebug-line");
        }

        if (!lineElement)
            return -1;

        lineElement = lineElement.parentNode;

        var lineNumber = lineElement.getElementsByClassName("CodeMirror-linenumber")[0];
        var lineNo = parseInt(lineNumber.textContent, 10);
        if (isNaN(lineNo))
            return -1;

        // Return index (zero based)
        return lineNo - 1;
    },
};

// ********************************************************************************************* //
// Local Helpers

function getBuiltInEvents()
{
    return {
        textChange: "change",
        beforeTextChange: "beforeChange",
        cursorActivity: "cursorActivity",
        beforeSelectionChange: "beforeSelectionChange",
        viewportChange: "viewportChange",
        gutterClick: "gutterClick",
        focus: "focus",
        blur: "blur",
        scroll: "scroll",
        update: "update",
        renderLine: "renderLine"
    };
}

function isBuiltInEvent(eventType)
{
    var builtInEvents = getBuiltInEvents();
    for (var event in builtInEvents)
    {
        if (eventType == builtInEvents[event])
            return true;
    }

    return false;
}

function getEventObject(type, eventArg)
{
    var event = {};

    switch (type)
    {
        case "change":
        case "beforeChange":
            event.changedObj = eventArg[1];
            break;
        case "beforeSelectionChange":
            event.selection = eventArg[1];
            break;
        case "viewportChange":
            event.from = eventArg[1];
            event.to = eventArg[2];
            break;
        case "gutterClick":
            event.lineNo = eventArg[1];
            event.gutter = eventArg[2];
            event.rawEvent = eventArg[3];
            break;
    }

    return event;
}

// ********************************************************************************************* //
// Support for Debugging - Tracing

/**
 * Expose FBTrace to the Firebug UI (panel.html). This help to debug problems
 * with CodeMirror, since tracing lines can be directly inserted into CM code.
 * See also {@SourceEditor.init} where the exposure happens.
 */
var ExposedFBTrace =
{
    sysout: function(msg, obj)
    {
        FBTrace.sysout(msg, obj);
    },

    __exposedProps__:
    {
        sysout: "r"
    }
};

// ********************************************************************************************* //
// Support for Debugging - Async script loader

function ScriptLoader(callback)
{
    this.callback = callback;

    this.waiting = [];
    this.scripts = [];
}

ScriptLoader.prototype =
{
    addScript: function(doc, id, url)
    {
        if (this.scripts.length > 0)
        {
            this.waiting.push(Arr.cloneArray(arguments));
            return;
        }

        // xxxHonza: the callback should be executed, otherwise it fails in case
        // where only some scripts are already presented (should not happen in
        // our case, but it would make this object more generic).
        var script = doc.getElementById(id);
        if (script)
            return script;

        script = doc.createElementNS("http://www.w3.org/1999/xhtml", "html:script");
        script.onload = this.onScriptLoaded.bind(this);

        this.scripts.push(script);

        script.setAttribute("type", "text/javascript");
        script.setAttribute("id", id);
        script.setAttribute("src", url);

        doc.documentElement.appendChild(script);
    },

    onScriptLoaded: function(event)
    {
        Arr.remove(this.scripts, event.target);

        if (this.waiting.length > 0)
        {
            var args = this.waiting.shift();
            this.addScript.apply(this, args);
            return;
        }

        if (!this.scripts.length)
            this.callback();
    }
}

// ********************************************************************************************* //
// Registration

return SourceEditor;

// ********************************************************************************************* //
});
