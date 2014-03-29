/* See license.txt for terms of usage */
/*jshint noempty:false, esnext:true, curly:false, moz:true*/
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/module",
    "firebug/debugger/debuggerLib",
], function(Firebug, FBTrace, Obj, Module, DebuggerLib) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_RETURNVALUEMODIFIER");

// ********************************************************************************************* //
// Variables

var wmUserReturnValues = new WeakMap();
var wmDbg = new WeakMap();

// ********************************************************************************************* //
// Return Value Modifier

/**
 * @module Gathers the functions to get and set the return value of a function (see issue 6857).
 */
var ReturnValueModifier = Obj.extend(Module, {
/** @lends BreakOnNext */

    dispatchName: "ReturnValueModifier",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initContext: function(context)
    {
        var tool = context.getTool("debugger");
        tool.addListener(this);
    },

    destroyContext: function(context)
    {
        var tool = context.getTool("debugger");
        tool.removeListener(this);
        destroyDebuggerForContext(context);
    },

    setUserReturnValue: function(context, userReturnValue)
    {
        var frame = getDebugger(context).getNewestFrame();
        if (!frame)
        {
            TraceError.sysout("debuggerTool.setReturnValue; newest frame not found");
            return;
        }

        // Note: userReturnValue is not a grip, so undefined and null are valid values.
        wmUserReturnValues.set(frame, userReturnValue);

        if (frame.onPop)
        {
            Trace.sysout("debuggerTool.attachOnPopToTopFrame; frame.onPop already attached");
            return;
        }

        frame.onPop = this.onPopFrame.bind(this, frame, context);
    },

    /**
     * Returns the return value set by the user, as follow:
     * - If there is no return value, return {"found": false}
     * - If there is, return an object of this form: {"userReturnValue": returnValue, "found": true}
     *
     * Note that the return value can be null or undefined. That's why an object is returned
     * in any case with the "found" property.
     *
     * @return {Object} The object has described above.
     */
    getUserReturnValue: function(context)
    {
        var frame = getDebugger(context).getNewestFrame();
        if (!frame || !wmUserReturnValues.has(frame))
            return {"found": false};

        var userReturnValue = wmUserReturnValues.get(frame);

        return {"found": true, "userReturnValue": userReturnValue};
    },

    /**
     * Gets the return value set by the user as a Grip, or null if not found.
     * Note: if the user has set it to null, the grip would be {type: "null"}.
     *
     * @return {Grip} The return value grip or null if not found.
     */
    getUserReturnValueAsGrip: function(context)
    {
        var {userReturnValue, found} = this.getUserReturnValue(context);
        if (!found)
            return null;

        var dbgGlobal = DebuggerLib.getThreadActor(context.browser).globalDebugObject;
        var dbgUserReturnValue = dbgGlobal.makeDebuggeeValue(userReturnValue);
        return DebuggerLib.createValueGrip(context, dbgUserReturnValue);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debugger Listeners

    onPopFrame: function(frame, context, completionValue)
    {
        if (!completionValue || !completionValue.hasOwnProperty("return"))
            return completionValue;

        var userReturnValue = wmUserReturnValues.get(frame);

        var wrappedUserReturnValue = frame.callee.global.makeDebuggeeValue(userReturnValue);

        // If the current frame is the oldest one, destroy the debugger after the completion value
        // has been returned.
        if (!frame.older)
            setTimeout(destroyDebuggerForContext, 0, context);

        return {"return": wrappedUserReturnValue};
    },

    onStartDebugging: function(context)
    {
        // getNewestFrame() is a Singleton that creates a Frame object (if not done before) and
        // returns it. We need to force that Frame object to be created while the debugger pauses
        // because it fetches only the instances that have been created to call the "onPop"
        // handlers. So when calling setReturnValue, it is too late to create that Frame object.
        // Also see: http://ur1.ca/gc9dy
        getDebugger(context).getNewestFrame();
    },

    onResumeDebugger: function(context)
    {
        // A debugger degrades performance a bit. So destroy it when the user resumes it.
        destroyDebuggerForContext(context);
    },

});

// ********************************************************************************************* //
// Helpers

function getDebugger(context)
{
    var dbg = wmDbg.get(context);
    if (!dbg)
    {
        dbg = DebuggerLib.makeDebuggerForContext(context);
        wmDbg.set(context, dbg);
    }

    var oldestFrame = getOldestFrame(dbg.getNewestFrame());
    if (!oldestFrame.onPop)
        oldestFrame.onPop = destroyDebuggerForContext.bind(null, context);

    return dbg;
}

function getOldestFrame(frame)
{
    var curFrame = frame;
    while (curFrame.older)
        curFrame = curFrame.older;

    return curFrame;
}

function destroyDebuggerForContext(context)
{
    var dbg = wmDbg.get(context);
    if (!dbg)
        return;
    Trace.sysout("ReturnValueModifier.destroyDebuggerForContext", context);
    wmDbg.delete(context);
    DebuggerLib.destroyDebuggerForContext(context, dbg);
}
// ********************************************************************************************* //
// Registration

Firebug.registerModule(ReturnValueModifier);

return ReturnValueModifier;

});
