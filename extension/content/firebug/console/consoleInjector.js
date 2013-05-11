/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/console/console",
    "firebug/debugger/debuggerLib",
    "firebug/lib/array",
    "firebug/console/consoleExposed",
    "firebug/console/errors",
],
function(Firebug, Console, DebuggerLib, Arr) {

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
        var fbConsoleInstance = this.getFbConsole(win);
        if (fbConsoleInstance)
        {
            Firebug.ConsoleExposed.setContext(fbConsoleInstance, context);
            return;
        }

        var console = Firebug.ConsoleExposed.createFirebugConsole(context, win);
        var dglobal = DebuggerLib.getDebuggeeGlobal(context, win);
        var nativeConsole = getNativeConsole(win, dglobal);
        if (!nativeConsole)
        {
            if (FBTrace.DBG_ERROR || FBTrace.DBG_CONSOLE)
                FBTrace.sysout("Console.injector.attachConsoleInjector; "+
                    "nativeConsole not found, abort");
            return;
        }

        wrappedConsole = getWrappedConsoleManager(console, nativeConsole);

        dglobal.defineProperty("console", {
            "enumerable": true,
            "congigurable": true,
            "writable": true,
            "value": dglobal.makeDebuggeeValue(wrappedConsole)
        });

        // Notes:
        // - to early to use win.document in case of iframes
        // - this function is called each time a window is reloaded / changed its location or
        //   Firebug is activated. So consoleInstancesMap.get(win) should be set as expected.
        consoleInstancesMap.set(win, {
            fbConsole: console,
            wrappedConsole: wrappedConsole
        });

        win.addEventListener("unload", function()
        {
            consoleInstancesMap.delete(win);
        });

        if (FBTrace.DBG_CONSOLE)
            FBTrace.sysout("console.attachConsoleInjector; Firebug console attached to: " +
                context.getName());
    },

    getExposedConsole: function(win)
    {
        var instances = consoleInstancesMap.get(win);
        return instances && instances.wrappedConsole;
    },

    getFbConsole: function(win)
    {
        var instances = consoleInstancesMap.get(win);
        return instances && instances.fbConsole;
    },

    // For extensions that still use this function.
    getConsoleHandler: function(context, win)
    {
        return {
            win: Wrapper.wrapObject(win),
            context: context,
            console: this.getFbConsole(win)
        };
    },

    unattachConsole: function(win)
    {
        var fbConsole = this.getFbConsole(win);
        if (!fbConsole)
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("Console.injector.unattachConsole; no exposed console found, skip");
            return;
        }
        Firebug.ConsoleExposed.setContext(fbConsole, null);
    }
};

// ********************************************************************************************* //
// Local Helpers

function getNativeConsole(win, dglobal)
{
    var resEval = dglobal.evalInGlobal("window.console");
    if (resEval.return)
    {
        var nativeConsole = DebuggerLib.unwrapDebuggeeValue(resEval.return, win, dglobal);
        if (nativeConsole !== undefined)
            return nativeConsole;
    }
    if (FBTrace.DBG_ERROR || FBTrace.DBG_CONSOLE)
    {
        FBTrace.sysout("Console.injector.getNativeConsole; can't get the native console");
        if (resEval.throw)
        {
            var exception = DebuggerLib.unwrapDebuggeeValue(resEval.throw, win, dglobal);
            FBTrace.sysout("Console.injector.getNativeConsole; exception: ", exception);
        }
    }
    return;
}

function isFbConsoleEnabled(fbConsole)
{
    return !!Firebug.ConsoleExposed.getContext(fbConsole);
}

/**
 * Helper (hack'y) that creates a console wrapper whose methods invoke both native and firebug
 * Console API.
 */
function getWrappedConsoleManager(fbConsole, nativeConsole)
{
    var __exposedProps__ = Proxy.create({
        get: function(/*_target, */name)
        {
            return "rw";
        },

        getOwnPropertyDescriptor: function(/*_target, */name)
        {
            // Return the same descriptor than fbConsole.__exposedProps__.log for any property.
            return {
                value: "rw",
                enumerable: true,
                configurable: true,
                writable: true
            };
        },

        // xxxFlorent: Remove once we can use the new API.
        getPropertyDescriptor: function()
        {
            return this.getOwnPropertyDescriptor.apply(this, arguments);
        },

        hasOwn: function()
        {
            return true;
        },

        has: function()
        {
            return true;
        }
    }, {});


    return Proxy.create({
        delete: function(name)
        {
            delete fbConsole[name];
            delete nativeConsole[name];
        },

        has: function(/*target, */name)
        {
            return name === "__exposedProps__" ||
                (isFbConsoleEnabled(fbConsole) && name in fbConsole) ||
                (name in nativeConsole);
        },

        hasOwn: function(/*target, */name)
        {
            return name === "__exposedProps__" ||
                nativeConsole.hasOwnProperty(name) ||
                (isFbConsoleEnabled(fbConsole) && fbConsole.hasOwnProperty(name));
        },

        get: function(target, name)
        {
            if (name === "__exposedProps__")
                return __exposedProps__;
            if (!isFbConsoleEnabled(fbConsole) || !(name in fbConsole))
                return nativeConsole[name];
            if (isFbConsoleEnabled(fbConsole) && (name in fbConsole) && !(name in nativeConsole))
                return fbConsole[name];
            var wrappedFunc = function()
            {
                var args = Array.prototype.slice.call(arguments);
                fbConsole[name].apply(fbConsole, args);
                // xxxFlorent: For a reason I ignore, the above line only works with a copy
                //  of `arguments`.
                nativeConsole[name].apply(nativeConsole, args);
            };
            wrappedFunc.displayName = "function";
            return wrappedFunc;
        },

        set: function(target, name, value)
        {
            this.defineProperty(nativeConsole, name, {
                "enumerable": true,
                "configurable": true,
                "writable": true,
                "value": value
            });
        },

        enumerate: function()
        {
            if (!isFbConsoleEnabled(fbConsole))
                return Arr.keys(nativeConsole);
            return mapAndConcat([fbConsole, nativeConsole], Arr.keys, ["__exposedProps__"]);
        },

        keys: function()
        {
            if (!isFbConsoleEnabled(fbConsole))
                return Object.keys(nativeConsole);
            return mapAndConcat([fbConsole, nativeConsole], Object.keys, ["__exposedProps__"]);
        },

        getOwnPropertyNames: function()
        {
            if (!isFbConsoleEnabled(fbConsole))
                return Object.getOwnPropertyNames(nativeConsole);
            return mapAndConcat([fbConsole, nativeConsole], Object.getOwnPropertyNames, 
                ["__exposedProps__"]);
        },

        getOwnPropertyDescriptor: function(/*target, */name)
        {
            // xxxFlorent: To remove when we can use the new Proxy API.
            var target = fbConsole;

            return {
                "writable": true,
                "enumerable": true,
                "configurable": true,
                "value": this.get(target, name)
            };
        },

        // xxxFlorent: Remove once we can use the new API.
        getPropertyDescriptor: function(/*target, */name)
        {
            return this.getOwnPropertyDescriptor(name);
        },

        defineProperty: function(/*target, */name, descriptor)
        {
            this.delete(name);
            Object.defineProperty(nativeConsole, name, descriptor);
        }
    }, {});
}

// xxxFlorent: lib/array.js, I guess
function mapAndConcat(objects, fn, excludeObjects)
{
    var res = [];
    for (var i = 0; i < objects.length; i++)
        res = res.concat(fn(objects[i]));
    return Arr.unique(res).filter(function(el)
    {
        return excludeObjects.indexOf(el) === -1;
    });
}
// ********************************************************************************************* //
// Registration

return Firebug.Console.injector;

// ********************************************************************************************* //
});
