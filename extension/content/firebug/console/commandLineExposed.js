/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false, evil:true, forin: false*/
/*global Firebug:true, FBTrace:true, Components:true, define:true */

define([
    "firebug/lib/wrapper",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/debugger/debuggerLib",
    "firebug/lib/object",
    "firebug/console/commandLineAPI",
],
function(Wrapper, Events, Dom, DebuggerLib, Obj, CommandLineAPI) {
"use strict";

// ********************************************************************************************* //
// Constants

const Cu = Components.utils;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

var commandLineCache = new WeakMap();

// ********************************************************************************************* //
// Command Line APIs

// List of command line APIs
var commandNames = ["$", "$$", "$x", "$n", "cd", "clear", "inspect", "keys",
    "values", "debug", "undebug", "monitor", "unmonitor", "traceCalls", "untraceCalls",
    "traceAll", "untraceAll", "copy" /*, "memoryProfile", "memoryProfileEnd"*/];

// List of shortcuts for some console methods
var consoleShortcuts = ["dir", "dirxml", "table"];

// List of console variables.
var props = ["$0", "$1"];

// Registered commands, name -> config object.
var userCommands = Object.create(null);

// ********************************************************************************************* //
// Command Line Implementation

/**
 * Returns a command line object (bundled with passed window through closure). The object
 * provides all necessary APIs as described here:
 * http://getfirebug.com/wiki/index.php/Command_Line_API
 *
 * @param {Object} context
 * @param {Object} win
 */
function createFirebugCommandLine(context, win)
{
    var contentView = Wrapper.getContentView(win);
    if (!contentView)
    {
        if (FBTrace.DBG_COMMANDLINE || FBTrace.DBG_ERRORS)
            FBTrace.sysout("createFirebugCommandLine ERROR no contentView " + context.getName());

        return null;
    }

    // the debuggee global:
    var dglobal = DebuggerLib.getDebuggeeGlobal(context, win);

    var commandLine = commandLineCache.get(win.document);
    if (commandLine)
        return copyCommandLine(commandLine, dglobal);

    // The commandLine object
    commandLine = dglobal.makeDebuggeeValue(Object.create(null));

    // Get the console Object
    var defaultReturnValue = Firebug.Console.getDefaultReturnValue(win);
    var console = Firebug.ConsoleExposed.createFirebugConsole(context, win,
        defaultReturnValue, false);

    // The command line API instance:
    var commands = CommandLineAPI.getCommandLineAPI(context);

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Exposed Properties

    function createCommandHandler(command)
    {
        var wrappedCommand = function()
        {
            try
            {
                return command.apply(null, arguments);
            }
            catch(ex)
            {
                throw new Error(ex.message, ex.fileName, ex.lineNumber);
            }
        };
        return dglobal.makeDebuggeeValue(wrappedCommand);
    }

    function createVariableHandler(handler)
    {
        var object = dglobal.makeDebuggeeValue({});
        object.handle = function()
        {
            try
            {
                return handler(context);
            }
            catch(ex)
            {
                throw new Error(ex.message, ex.fileName, ex.lineNumber);
            }
        };
        return object;
    }

    function createUserCommandHandler(config, name)
    {
        return function()
        {
            try
            {
                return config.handler.call(null, context, arguments);
            }
            catch (exc)
            {
                Firebug.Console.log(exc, context, "errorMessage");

                if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("commandLine.api; EXCEPTION when executing " +
                        "a command: " + name + ", " + exc, exc);
                }
            }
        };
    };

    // Define command line methods
    for (var commandName in commands)
    {
        var command = commands[commandName];
        commandLine[commandName] = createCommandHandler(command);
    }

    // Register shortcut.
    consoleShortcuts.forEach(function(name)
    {
        var command = console[name].bind(console);
        commandLine[name] = createCommandHandler(command);
    });

    // Register user commands.
    for (var name in userCommands)
    {
        var config = userCommands[name];
        var command = createUserCommandHandler(config, name);
        if (userCommands[name].getter)
            commandLine[name] = createVariableHandler(command);
        else
            commandLine[name] = createCommandHandler(command);
    }

    // Register Console API (exposed to the command line)
    commandLine.console = dglobal.makeDebuggeeValue(console);

    commandLineCache.set(win.document, commandLine);

    // return a copy so the original one is preserved from changes
    return copyCommandLine(commandLine, dglobal);
}

function copyCommandLine(commandLine, dglobal)
{
    var copy = dglobal.makeDebuggeeValue(Object.create(null));
    for (var name in commandLine)
        copy[name] = commandLine[name];
    return copy;
}

function findLineNumberInExceptionStack(splitStack)
{
    var m = splitStack[0].match(/:(\d+)$/);
    return m !== null ? +m[1] : null;
}

function correctStackTrace(splitStack)
{
    var filename = Components.stack.filename;
    // remove the frames over the evaluated expression
    for (var i = 0; i < splitStack.length-1 &&
        splitStack[i+1].indexOf(evaluate.name + "@" + filename, 0) === -1 ; i++);

    if (i >= splitStack.length)
        return false;
    splitStack.splice(0, i);
    return true;
}

// ********************************************************************************************* //
// User Commands

function registerCommand(name, config)
{
    if (commandNames[name] || consoleShortcuts[name] || props[name] || userCommands[name])
    {
        if (FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("firebug.registerCommand; ERROR This command is already " +
                "registered: " + name);
        }

        return false;
    }

    userCommands[name] = config;
    return true;
}

function unregisterCommand(name)
{
    if (!userCommands[name])
    {
        if (FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("firebug.unregisterCommand; ERROR This command is not " +
                "registered: " + name);
        }

        return false;
    }

    delete userCommands[name];
    return true;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
// Helpers (not accessible from web content)

function updateVars(commandLine, dglobal, context)
{
    var htmlPanel = context.getPanel("html", true);
    var vars = htmlPanel ? htmlPanel.getInspectorVars() : null;

    for (var prop in vars)
        commandLine[prop] = dglobal.makeDebuggeeValue(vars[prop]);
}

function removeConflictingNames(commandLine, context, contentView)
{
    for (var name in commandLine)
    {
        if (contentView.hasOwnProperty(name) && name !== "console")
            delete commandLine[name];
    }
}

function evaluate(context, win, expr, origExpr, onSuccess, onError)
{
    var result;
    var contentView = Wrapper.getContentView(win);
    var commandLine = createFirebugCommandLine(context, win);
    var dglobal = DebuggerLib.getDebuggeeGlobal(context, win);
    var resObj;

    updateVars(commandLine, dglobal, context);
    removeConflictingNames(commandLine, context, contentView);

    resObj = dglobal.evalInGlobalWithBindings(expr, commandLine);

    var unwrap = function(obj)
    {
        return DebuggerLib.unwrapDebuggeeValue(obj, contentView, dglobal);
    };

    // In case of abnormal termination, as if by the "slow script" dialog box,
    // do not print anything in the console.
    if (!resObj)
    {
        return;
    }

    if (resObj.hasOwnProperty("return"))
    {
        result = unwrap(resObj.return);
        if (resObj.return && resObj.return.handle)
        {
            resObj.return.handle();
            // Do not print anything in the console in case of getter commands.
            return;
        }
    }
    else if (resObj.hasOwnProperty("yield"))
    {
        result = unwrap(resObj.yield);
    }
    else if (resObj.hasOwnProperty("throw"))
    {
        // Change source and line number of exceptions from commandline code
        // create new error since properties of nsIXPCException are not modifiable.
        // Example of code raising nsIXPCException: `alert()` (without arguments)

        // xxxFlorent: FIXME: we can't get the right stack trace with this example:
        //     function a(){
        //          throw new Error("error");
        //     }
        //     <ENTER>
        //     a();
        //     <ENTER>
        var exc = unwrap(resObj.throw);

        if (exc === null || exc === undefined)
            return;

        // xxxFlorent: FIXME (?): the line number and the stacktrace are wrong in that case
        if (typeof exc !== "object")
            exc = {message: exc};

        var shouldModify = false, isXPCException = false;
        var fileName = exc.filename || exc.fileName || "";
        var isInternalError = fileName.lastIndexOf("chrome://", 0) === 0;
        var lineNumber = null;
        var stack = null;
        var splitStack;
        var isFileNameMasked = (fileName === "debugger eval code");
        if (isInternalError || isFileNameMasked)
        {
            shouldModify = true;
            isXPCException = (exc.filename !== undefined);

            // Lie and show the pre-transformed expression instead.
            // xxxFlorent: needs to discuss about keeping that + localize?
            // xxxFlorent: FIXME the link to the source should open a new window
            fileName = "data:,/* EXPRESSION EVALUATED USING THE FIREBUG COMMAND LINE: */"+
                encodeURIComponent("\n"+origExpr);

            if (isInternalError && typeof exc.stack === "string")
            {
                splitStack = exc.stack.split("\n");
                var correctionSucceeded = correctStackTrace(splitStack);
                if (correctionSucceeded)
                {
                    // correct the line number so we take into account the comment prepended above
                    lineNumber = findLineNumberInExceptionStack(splitStack) + 1;

                    // correct the first trace
                    splitStack.splice(0, 1, "@" + fileName + ":" + lineNumber);
                    stack = splitStack.join("\n");
                }
                else
                    shouldModify = false;
            }
            else
            {
                // correct the line number so we take into account the comment prepended above
                lineNumber = exc.lineNumber + 1;
            }
        }

        result = new Error();

        if (shouldModify)
        {
            result.stack = stack;
            result.source = origExpr;
            result.message = exc.message;
            result.lineNumber = lineNumber;
            result.fileName = fileName;

            // The error message can also contain post-transform details about the
            // source, but it's harder to lie about. Make it prettier, at least.
            if (typeof result.message === "string")
                result.message = result.message.replace(/__fb_scopedVars\(/g, "<get closure>(");

            if (!isXPCException)
                result.name = exc.name;
        }
        else
        {
            Obj.getPropertyNames(exc).forEach(function(prop)
            {
                result[prop] = exc[prop];
            });
            result.stack = exc.stack;
            result.source = exc.source;
        }

        onError(result, context);
        return result;
    }

    onSuccess(result, context);
    return result;
}

// ********************************************************************************************* //
// Registration

Firebug.CommandLineExposed =
{
    createFirebugCommandLine: createFirebugCommandLine,
    commands: commandNames,
    consoleShortcuts: consoleShortcuts,
    properties: props,
    userCommands: userCommands,
    registerCommand: registerCommand,
    unregisterCommand: unregisterCommand,
    evaluate: evaluate,
};

return Firebug.CommandLineExposed;

// ********************************************************************************************* //
});
