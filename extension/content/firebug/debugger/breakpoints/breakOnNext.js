/* See license.txt for terms of usage */
/*jshint noempty:false, esnext:true, curly:false, unused:false, moz:true*/
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/module",
    "firebug/debugger/debuggerHalter",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/breakpoints/breakpointModule",
],
function(Firebug, FBTrace, Obj, Module, DebuggerHalter, DebuggerLib, BreakpointModule) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_BREAKONNEXT");

// ********************************************************************************************* //
// Break On Next

var BreakOnNext = Obj.extend(Module,
/** @lends BreakOnNext **/
{
    dispatchName: "BreakOnNext",

    initContext: function(context)
    {
        var tool = context.getTool("debugger");
        // Add listener for "shouldResumeDebugger", to check that we step into an executable line.
        tool.addListener(this);
    },

    destroyContext: function(context)
    {
        var tool = context.getTool("debugger");
        tool.removeListener(this);
    },


    /**
     * If enabled = true, enable the onEnterFrame callback for BreakOnNext.
     * Otherwise, disable it to avoid performance penalty.
     *
     * @param context The context object.
     * @param enabled
     */
    breakOnNext: function(context, enabled, callback)
    {
        var breakOnNextActivated = !!context.breakOnNextActivated;
        // Don't continue if we don't change the state of Break On Next.
        if (enabled === breakOnNextActivated)
            return;

        Trace.sysout("BreakOnNext.breakOnNext; enabled = " + enabled);
        if (enabled)
        {
            // If it doesn't exist, create one.
            if (!context.breakOnNextDebugger)
                context.breakOnNextDebugger = DebuggerLib.makeDebuggerForContext(context);

            // Bind the "onEnterFrame" event, so we break on the next instruction being evaluated.
            context.breakOnNextDebugger.onEnterFrame = onEnterFrame.bind(null, context);
        }
        else if (context.breakOnNextDebugger)
        {
            // Unbind the "onEnterFrame" event and destroy the debugger.
            context.breakOnNextDebugger.onEnterFrame = undefined;
            DebuggerLib.destroyDebuggerForContext(context, context.breakOnNextDebugger);
            context.breakOnNextDebugger = null;
        }
        // Change the "breakOnNextActivated" property, so the button of the script panel is updated.
        context.breakOnNextActivated = enabled;

        if (callback)
            callback(context, enabled);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Listeners

    shouldResumeDebugger: function(context)
    {
        if (!context.breakOnNextActivated)
            return;
        Trace.sysout("BreakOnNext.shouldResumeDebugger;");
        var location = {
            url: context.currentFrame.getURL(),
            line: context.currentFrame.getLineNumber()
        };
        // Don't break if the current line is not executable. Currently, the debugger might break on
        // a function definition when stepping from an inline event handler into a function.
        // See also https://bugzilla.mozilla.org/show_bug.cgi?id=969816
        if (!DebuggerLib.isExecutableLine(context, location))
        {
            Trace.sysout("BreakOnNext.shouldResumeDebugger; hit a non-executable line => step in");
            context.resumeLimit = {type: "step"};
            return true;
        }
        else
        {
            Trace.sysout("BreakOnNext.shouldResumeDebugger; disable Break On Next");
            // We hit an executable line. Don't break on the next instruction anymore.
            BreakOnNext.breakOnNext(context, false);
            return false;
        }
    },

    /**
     * Event handler for all "break on next" buttons.
     */
    onToggleBreakOnNext: function(event)
    {
        var selectedPanel = Firebug.chrome.getSelectedPanel();
        var context = selectedPanel.context;
        // Ensure that the selected panel is breakable. Otherwise, abort.
        if (!selectedPanel.breakable)
            return;

        // Also ensure that the script panel is activated (required to have BON).
        // The contrary shouldn't happen (the UI prevent this case), but let's test that anyway.
        var scriptPanel = context.getPanel("script");
        if (!scriptPanel || !scriptPanel.isEnabled())
        {
            TraceError.sysout("BreakOnNext.onToggleBreakOnNext; BON activated whereas " +
                "the script panel is not activated. Abort");
            return;
        }

        var breaking = !selectedPanel.shouldBreakOnNext();

        Trace.sysout("BreakOnNext.onToggleBreakOnNext; selectedPanel = " +
            selectedPanel.name + "; breaking = " + breaking);

        selectedPanel.breakOnNext(breaking, function()
        {
            Trace.sysout("BreakOnNext.onToggleBreakOnNext; BreakOnNext " +
                (breaking ? "enabled" : "disabled"));

            // Toggle button's state.
            Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable", !breaking);

            // Update the state of the button of the selected panel.
            BreakpointModule.updatePanelState(selectedPanel);

            // Trigger an event for the FBTest API.
            var evArgs = {context: context, breaking: breaking};
            Firebug.dispatchEvent(context.browser, "breakOnNextUpdated", evArgs);
        });
    }
});

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
// Helpers

function onEnterFrame(context, frame)
{
    // Note: for inline event handler, frame.type also equals to "call".
    if (frame.type === "call")
    {
        Trace.sysout("BreakOnNext.onEnterFrame; triggering BreakOnNext");

        // If we are in an "inline" event, don't break. Let the debugger continue until we are 
        // on an executable line.
        if (isFrameInlineEvent(frame))
        {
            Trace.sysout("BreakOnNext.onEnterFrame; hit an inline event handler. " +
                "Wait for the next frame");
            return;
        }

        DebuggerHalter.breakNow(context);
    }
}

/**
 * Checks whether a frame is created from an inline event attribute.
 */
function isFrameInlineEvent(frame)
{
    // Hack: we don't know whether the frame is created from an inline event attribute using the
    // frame properties. As a workaround, check if the name of the callee begins with "on", that
    // an attribute of the name of the callee exists and compare if |this[callee.name] === callee|.
    var calleeName = frame.callee && frame.callee.name;
    var unsafeThis = frame.this && frame.this.unsafeDereference();
    var unsafeCallee = frame.callee.unsafeDereference();
    var parentEnv = frame.environment && frame.environment.parent;

    try
    {
        return calleeName && calleeName.startsWith("on") && unsafeThis &&
            parentEnv && parentEnv.type === "object" &&
            unsafeThis.nodeType === document.ELEMENT_NODE &&
            unsafeThis.getAttribute(calleeName) && unsafeThis[calleeName] === unsafeCallee;
    }
    catch (ex)
    {
        return false;
    }
}

// ********************************************************************************************* //
// Registration

Firebug.BreakOnNext = BreakOnNext;

Firebug.registerModule(BreakOnNext);

return BreakOnNext;
});
