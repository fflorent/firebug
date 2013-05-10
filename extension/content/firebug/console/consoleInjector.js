/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/console/console",
    "firebug/console/consoleExposed",
    "firebug/console/errors",
],
function(Firebug, Console) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var consoleInstancesMap = new WeakMap();

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
        var consoleExposed = getConsoleWrapper(console);

        // Notes:
        // - to early to use win.document in case of iframes
        // - this function is called each time a window is reloaded / changed its location or
        //   Firebug is activated. So consoleInstancesMap.get(win) should be set as expected.
        consoleInstancesMap.set(win, consoleExposed);
        win.wrappedJSObject.console = consoleExposed;

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.attachConsoleInjector; Firebug console attached to: " +
                context.getName());
    },

    getExposedConsole: function(win)
    {
        return consoleInstancesMap.get(win);
    },

    // For extensions that still use this function.
    getConsoleHandler: function(context, win)
    {
        return {
            win: Wrapper.wrapObject(win),
            context: context,
            console: this.getExposedConsole(win)
        };
    }
};

// ********************************************************************************************* //
// Registration

return Firebug.Console.injector;

// ********************************************************************************************* //
});
