/* See license.txt for terms of usage */
/*jshint noempty:false, esnext:true, curly:false, unused:false, moz:true*/
/*global define:1*/

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/module",
    "firebug/debugger/debugger",
    "firebug/debugger/debuggerLib",
], function(FBTrace, Obj, Module, Debugger, DebuggerLib) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_BREAKONNEXT");

// ********************************************************************************************* //
// Break On Next Instruction

var BreakOnNextInstruction = Obj.extend(Module,
/** @lends BreakOnNextInstruction **/
{
    /**
     * If enabled = true, enable the onEnterFrame callback for BreakOnNext.
     * Otherwise, disable it to avoid performance penalty.
     *
     * @param context The context object.
     * @param enabled
     */
    breakOnNext: function(context, enabled)
    {
        var breakOnNextActivated = !!context.breakOnNextActivated;
        if (enabled === breakOnNextActivated)
            return;

        Trace.sysout("breakOnNextInstruction.breakOnNext; enabled = " + enabled);
        var dbg = context.breakOnNextInstructionDebugger;
        if (enabled)
        {
            if (!dbg)
            {
                dbg = DebuggerLib.makeDebuggerForContext(context);
                context.breakOnNextInstructionDebugger = dbg;
            }

            dbg.onEnterFrame = onEnterFrame.bind(null, context);
        }
        else if (context.breakOnNextInstructionDebugger)
        {
            dbg.onEnterFrame = undefined;
            DebuggerLib.destroyDebuggerForContext(context, dbg);
            context.breakOnNextInstructionDebugger = null;
        }
        context.breakOnNextActivated = enabled;
    }
});


// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
// Helpers

function onEnterFrame(context, frame)
{
    // Note: for inline event handler, frame.type also equals to "call".
    if (frame.type === "call")
    {
        Trace.sysout("debuggerTool.onEnterFrame; triggering BreakOnNext");
        try
        {
            Debugger.breakNow(context);
        }
        finally
        {
            // Don't break on the next instruction anymore.
            BreakOnNextInstruction.breakOnNext(context, false);
        }
    }
}

return BreakOnNextInstruction;
});
