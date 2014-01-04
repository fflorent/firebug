/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/module",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/stack/stackTrace",
],
function(Firebug, FBTrace, Obj, Module, DebuggerLib, StackTrace) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var Trace = FBTrace.to("DBG_DEBUGGERHALTER");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// DebuggerHalter Implementation

/**
 * @module
 */
var DebuggerHalter = Obj.extend(Module,
/** @lends DebuggerHalter */
{
    dispatchName: "DebuggerHalter",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Module.initialize.apply(this, arguments);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);
    },

    initContext: function(context)
    {
        var tool = context.getTool("debugger");
        tool.addListener(this);
    },

    destroyContext: function(context)
    {
        var tool = context.getTool("debugger");
        tool.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerTool Listener

    getCurrentStackTrace: function(context, callback)
    {
        var stackTrace;

        // breakNow halts this event loop so, even if the pause
        // is asynchronous, the current loop needs to wait till it's resumed.
        // So, the list of frames is actually get synchronously.
        this.breakNow(context, null, function()
        {
            var frames = DebuggerLib.getCurrentFrames(context);
            stackTrace = StackTrace.buildStackTrace(context, frames);

            Trace.sysout("debuggerHalter.getCurrentStackTrace; stackTrace:", stackTrace);

            if (callback)
                callback(stackTrace);
        });

        return stackTrace;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerTool Listener

    shouldResumeDebugger: function(context, event, packet)
    {
        var type = packet.why.type;
        var where = packet.frame ? packet.frame.where : {};

        Trace.sysout("debuggerHalter.shouldResumeDebugger; " + where.url, packet);

        // If breakNow is in progress, execute the callback and resume
        // the debugger completely.
        if (type == "debuggerStatement" && context.breakNowCallback)
        {
            context.breakNowInProgress = false;

            var callback = context.breakNowCallback
            context.breakNowCallback = null;

            if (callback)
                callback();

            Trace.sysout("debuggerHalter.shouldResumeDebugger; resume debugger");

            // null means resume completely.
            context.resumeLimit = null;
            return true;
        }

        // Resume the debugger till the URL is not from chrome (e.g. Firebug). This way we
        // unwind all frames that don't come from the page content.
        if (DebuggerLib.isFrameLocationEval(where.url))
        {
            Trace.sysout("debuggerHalter.shouldResumeDebugger; resume debugger");

            context.resumeLimit = {type: "step"};
            return true;
        }

        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public API

    breakNow: function(context, scope, callback)
    {
        Trace.sysout("debuggerHalter.breakNow; " + context.getName());

        // The callback (if any) will be executed when the debugger breaks.
        context.breakNowCallback = callback;
        context.breakNowInProgress = true;

        DebuggerLib.breakNow(context, scope);
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(DebuggerHalter);

return DebuggerHalter;

// ********************************************************************************************* //
});
