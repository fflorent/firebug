/* See license.txt for terms of usage */

define([
    "firebug/lib/trace"
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci["nsIConsoleService"]);

var naggedCache = new WeakMap();

// ********************************************************************************************* //
// Module implementation

var Deprecated = {};

/**
 * wraps a function to display a deprecation warning message
 * each time that function is called.
 *
 * @param {String} msg the message to display
 * @param {Function} fnc the function to wrap
 * @param {Array-like Object} args the arguments to pass to the wrapped function (optional)
 */
Deprecated.deprecated = function(msg, fnc, args)
{
    return function deprecationWrapper()
    {
        if (!naggedCache.get(fnc))
        {
            log(msg, Components.stack.caller);

            naggedCache.set(fnc, true);
        }

        return fnc.apply(this, args || arguments);
    }
};

/**
 * displays a message for deprecation
 *
 * @param {String} msg the message to display
 */
Deprecated.log = function(msg)
{
    return log(msg, Components.stack.caller);
}


// ********************************************************************************************* //
// Local helpers

function log(msg, caller)
{
    var explain = "Deprecated function, " + msg;

    if (FBTrace)
        FBTrace.sysout(explain, getStackDump(caller));

    if (consoleService)
        consoleService.logStringMessage(explain + " " + caller.toString());
}

function getStackDump(startFrame)
{
    var lines = [];

    for (var frame = startFrame; frame; frame = frame.caller)
        lines.push(frame.filename + " (" + frame.lineNumber + ")");

    return lines.join("\n");
};

// ********************************************************************************************* //
// Registration

return Deprecated;

// ********************************************************************************************* //
});
