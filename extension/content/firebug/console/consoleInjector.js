/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/js/stackFrame",
    "firebug/chrome/window",
    "firebug/console/console",
    "firebug/lib/array",
    "firebug/lib/dom",
    "firebug/console/consoleExposed",
    "firebug/console/errors",
],
function(Obj, Firebug, FirebugReps, Locale, Events, Url, StackFrame, Win, Console, Arr, Dom) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

// ********************************************************************************************* //
// Console Injector

Firebug.Console.injector =
{
    attachConsoleInjector: function(context, win)
    {
        // Get the 'console' object (this comes from chrome scope).
        var console = Firebug.ConsoleExposed.createFirebugConsole(context, win);

        // Do not expose the chrome object as is but, rather do a wrapper, see below.
        //win.wrappedJSObject.console = console;
        //return;

        // Construct a script string that defines a function. This function returns
        // an object that wraps every 'console' method. This function will be evaluated
        // in a window content sandbox and return a wrapper for the 'console' object.
        // Note that this wrapper appends an additional frame that shouldn't be displayed
        // to the user.
        var expr = "(function(x) { return {\n";
        for (var p in console)
        {
            var func = console[p];
            if (typeof(func) == "function")
            {
                expr += p + ": function() { return Function.apply.call(x." + p +
                    ", x, arguments); },\n";
            }
        }
        expr += "};})";

        // Evaluate the function in the window sandbox/scope and execute. The return value
        // is a wrapper for the 'console' object.
        var sandbox = Cu.Sandbox(win);
        var getConsoleWrapper = Cu.evalInSandbox(expr, sandbox);

        context.exposedConsole = getConsoleWrapper(console);
        win.wrappedJSObject.console = context.exposedConsole;

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.attachConsoleInjector; Firebug console attached to: " +
                context.getName());
    },

    getExposedConsole: function(context)
    {
        return context.exposedConsole;
    },
};

// ********************************************************************************************* //
// Registration

return Firebug.Console.injector;

// ********************************************************************************************* //
});
