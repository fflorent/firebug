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

const EXPOSED_CONSOLE_KEY = "fbConsoleExposed" + Math.random();

// ********************************************************************************************* //
// Console Injector

Firebug.Console.injector =
{
    attachConsoleInjector: function(context, win)
    {
        try
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
            //
            // Since we are using .caller and .arguments for stack walking, the function must
            // not be in strict mode.
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
            var exposedConsole = getConsoleWrapper(console);

            // xxxFlorent-Test: to be tested with http://jsfiddle.net/ekMtZ/embedded/result/
            // xxxFlorent-Test: detect when win is the iframe (win.location = http://fiddle.jshell.net/ekMtZ/show/light/)
            var isIframe = win.location.href.indexOf("shell") >= 0;
            // Note: to early to use weakmap's + win.document in case of iframes. So we use an expando.

            // xxxFlorent-Test: attempt to make win[EXPOSED_CONSOLE_KEY] non-writable, 
            //                  non-configurable for the iframe... But that doesn't work.
            Object.defineProperty(win, EXPOSED_CONSOLE_KEY, {
                configurable: !isIframe,
                writable: !isIframe,
                enumerable: false,
                value: exposedConsole
            });
            // xxxFlorent-Test: Detect when the property is deleted...
            //                  Looks like it is quite immediately (~15/30 ms after)
            if (isIframe)
            {
                var date = new Date();
                (function a()
                {
                    var time = (new Date() - date);
                    if (this.getExposedConsole(win))
                    {
                        setTimeout(a.bind(this), 4);
                        FBTrace.sysout("still okay after " + time + " ms");
                    }
                    else
                        FBTrace.sysout("disappeared after "+ time + " ms");
                }).call(this);
            }
            FBTrace.sysout("exposedConsole "+win.location.href, this.getExposedConsole(win));
            win.wrappedJSObject.console = exposedConsole;
            // xxxFlorent-Test: Just keep a reference to the iframe to play with it in the FBTrace
            //                  console.
            if (isIframe)
                Firebug.iframe = win;

            FBTrace.sysout("console.attachConsoleInjector; Firebug console attached to: " +
                win.location.href);
        }
        catch (ex)
        {
                FBTrace.sysout("consoleInjector.attachConsoleInjector; exception while injecting",
                    ex.toString());
                Firebug.iframeExc = win;
        }
    },

    getExposedConsole: function(win)
    {
        return win[EXPOSED_CONSOLE_KEY];
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
