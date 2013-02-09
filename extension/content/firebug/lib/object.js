/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/deprecated",
],
function(FBTrace, Deprecated) {
"use strict";
// xxxFlorent: TODO add that specific tag in jsdoc...

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;

/**
 * @name Obj
 * @lib Utility for objects
 */
var Obj = {};

// ********************************************************************************************* //

// xxxFlorent: [ES6-REST]
/**
 * Creates a new function that, when called, uses the provided <code>this</code> value 
 * and appends the provided arguments. Note that it differs from Function.prototype.bind which 
 * prepends the provided arguments (that is why this function is called bindRight).
 *
 * @param {function} fn The function to bind
 * @param {*} thisObject The object to pass as the <code>this</code> value
 * @param {*} ...args the series of parameters to pass to the new function
 *
 * @return {function} the new function
 */
Obj.bind = function(fn, thisObject/*, ...origArgs*/)
{
    var origArgs = Array.prototype.slice.call(arguments, 2);
    return function(/*...additionalArgs*/)
    {
        var additionalArgs = Array.prototype.slice.call(arguments);
        return fn.apply(thisObject, additionalArgs.concat(origArgs));
    };
}

// xxxFlorent: TODO: [REST]
/**
 * Creates a new function that, when called, uses the provided <code>this</code> value and the
 * provided arguments.
 * At the contrary of <code>Function.prototype.bind</code>, any parameter provided at the call is
 * ignored.
 *
 * @param {function} fn The function to bind
 * @param {*} thisObject The object to pass as the `this` value
 * @param {*} ...args the series of parameters to pass to the new function
 *
 * @return {function} the new Function
 */
Obj.bindFixed = function(fn, thisObject/*, ...args*/)
{
    var args = Array.prototype.slice.call(arguments, 2);
    return function() { return fn.apply(thisObject, args); };
}

/**
 * Merges several objects into one.
 *
 * @param {Object} ...objects The objects to merge
 *
 * @example
 * var parentObj = {foo: "foo" };
 * var newObj = Obj.extend(parentObj, {bar: "bar"}); // => {foo: "foo", bar: "bar"}
 */
Obj.extend = function(parentObject/*, ...extensions*/)
{
    if (arguments.length < 2)
    {
        FBTrace.sysout("object.extend; ERROR", arguments);
        throw new Error("Obj.extend on undefined object");
    }

    var newOb = {};
    var objects = Array.prototype.slice.call(arguments);

    objects.forEach(function(object)
    {
        for (var prop in object)
        {
            var propDesc = getPropertyDescriptor(object, prop);
            Object.defineProperty(newOb, prop, propDesc);
            // newOb[prop] = object[prop];
        }
    });

    return newOb;
};

/**
 * Creates a new instance inheriting from a parent "class".
 * That class is then extended with child properties.
 *
 * @param {Object} protototypeParent The parent "class" prototype
 * @param {Object} childProperties The properties extending the new object
 *
 * @return {Object} the new object
 */
Obj.descend = function(prototypeParent, childProperties)
{
    function protoSetter() {};
    protoSetter.prototype = prototypeParent;
    var newOb = new protoSetter();
    for (var n in childProperties)
        newOb[n] = childProperties[n];
    return newOb;
};

// ************************************************************************************************

/**
 * Returns true if the passed object has any properties, otherwise returns false.
 *
 * @param {Object} ob Inspected object
 * @param {Object} nonEnumProps If set to true, check also non-enumerable properties (optional)
 * @param {Object} ownPropsOnly If set to true, only check own properties not inherited (optional)
 */
Obj.hasProperties = function(ob, nonEnumProps, ownPropsOnly)
{
    try
    {
        if (!ob)
            return false;

        try
        {
            // This is probably unnecessary in Firefox 19 or so.
            if ("toString" in ob && ob.toString() === "[xpconnect wrapped native prototype]")
                return true;
        }
        catch (exc) {}

        // The default case (both options false) is relatively simple.
        // Just use for..in loop.
        if (!nonEnumProps && !ownPropsOnly)
        {
            for (var name in ob)
                return true;
            return false;
        }

        var type = typeof(ob);
        if (type == "string" && ob.length)
            return true;

        if (type === "number" || type === "boolean" || type === "undefined" || ob === null)
            return false;

        if (nonEnumProps)
            props = Object.getOwnPropertyNames(ob);
        else
            props = Object.keys(ob);

        if (props.length)
            return true;

        // Not interested in inherited properties, bail out.
        if (ownPropsOnly)
            return false;

        // Climb prototype chain.
        var parent = Object.getPrototypeOf(ob);
        if (parent)
            return this.hasProperties(parent, nonEnumProps, ownPropsOnly);
    }
    catch (exc)
    {
        // workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=648560
        if (ob.wrappedJSObject)
            return true;
    }

    return false;
};

/**
 * Returns the prototype of an object, or null if the function fails to do so.
 *
 * @deprecated use <code>myObj.prototype</code> instead (plus clever checks before)
 */
Obj.getPrototype = Deprecated.deprecated("use myObj.prototype instead (+ clever checks before)",
function(ob)
{
    try
    {
        return ob.prototype;
    } catch (exc) {}
    return null;
});

/**
 * Returns a unique ID (random integer between 0 and 65536)
 *
 * @return {Number} the random number
 */
Obj.getUniqueId = function()
{
    var min = 0;
    var max = 65536;
    return Math.floor(Math.random() * (max - min + 1) + min);
};

/**
 * Cross Window instanceof
 *
 * @param {Object} obj The object to test
 * @param {*} type The type (local to this window)
 *
 * @returns {Boolean} true if the test succeeded, false otherwise
 *
 */
Obj.XW_instanceof = function(obj, type)
{
    if (obj instanceof type)
        return true;  // within-window test

    if (!type)
        return false;

    if (!obj)
        return (type == "undefined");

    // compare strings: obj constructor.name to type.name.
    // This is not perfect, we should compare type.prototype to object.__proto__,
    // but mostly code does not change the constructor object.
    do
    {
        // then the function that constructed us is the argument
        if (obj.constructor && obj.constructor.name == type.name)
            return true;
    }
    while(obj = obj.__proto__);  // walk the prototype chain.

    return false;

    // https://developer.mozilla.org/en/Core_JavaScript_1.5_Guide/Property_Inheritance_Revisited
    // /Determining_Instance_Relationships
};

/**
 * Tells if the given property of the provided object is a non-native getter or not.
 * This method depends on PropertyPanel.jsm module available in Firefox 5+
 * isNonNativeGetter has been introduced in Firefox 7
 * The method has been moved to WebConsoleUtils.jsm in Fx 18
 *
 * @param {object} obj The object that contains the property.
 * @param {string} propName The property you want to check if it is a getter or not.
 * @return {boolean} True if the given property is a getter, false otherwise.
 */
Obj.isNonNativeGetter = function(obj, propName)
{
    try
    {
        var scope = {};
        Cu.import("resource://gre/modules/devtools/WebConsoleUtils.jsm", scope);

        if (scope.WebConsoleUtils.isNonNativeGetter)
        {
            Obj.isNonNativeGetter = function(obj, propName)
            {
                return scope.WebConsoleUtils.isNonNativeGetter(obj, propName);
            };

            return Obj.isNonNativeGetter(obj, propName);
        }
    }
    catch (err)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("Obj.isNonNativeGetter; EXCEPTION " + err, err);
    }

    // OK, the method isn't available let's use an empty implementation
    Obj.isNonNativeGetter = function()
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("Obj.isNonNativeGetter; ERROR built-in method not found!");
        return true;
    };

    return true;
};

// ********************************************************************************************* //
// Local helpers

// xxxFlorent: [ES6-getPropertyDescriptor]?
// http://wiki.ecmascript.org/doku.php?id=harmony:extended_object_api
// xxxFlorent: until there is no need to move it public, this should remain as a local helper
//             so we prevent potentential future refactoring
function getPropertyDescriptor(subject, name)
{
    var pd = Object.getOwnPropertyDescriptor(subject, name);
    var proto = Object.getPrototypeOf(subject);
    while (pd === undefined && proto !== null)
    {
        pd = Object.getOwnPropertyDescriptor(proto, name);
        proto = Object.getPrototypeOf(proto);
    }
    return pd;
}

// ********************************************************************************************* //

return Obj;

// ********************************************************************************************* //
});
