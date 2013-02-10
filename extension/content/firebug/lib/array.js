/* See license.txt for terms of usage */

/*jshint es5:true, curly:false, esnext:true*/
/*global define:true, Components:true, XPCNativeWrapper:true*/

define([
    "firebug/lib/trace",
    "firebug/lib/deprecated",
],
function(FBTrace, Deprecated) {
"use strict";
// ********************************************************************************************* //
// Constants

const Ci = Components.interfaces;
const Cu = Components.utils;


/**
 * @name Arr
 * @lib Utility for Arrays
 */
var Arr = {};


// Array Generic methods
// use them to call Array methods with Array-Like objects (arguments, String, NodeList...)
// example: var firstArg = Array.forEach(nodeList, func);
//
// xxxFlorent: [ES6-ARRAY_GENERICS]
var ArrayGen = {};
(function()
{
    var methods = [
        'join', 'reverse', 'sort', 'push', 'pop', 'shift', 'unshift',
        'splice', 'concat', 'slice', 'indexOf', 'lastIndexOf',
        'forEach', 'map', 'reduce', 'reduceRight', 'filter',
        'some', 'every'
    ];

    methods.forEach(function(methodName)
    {
        // xxxFlorent: TODO: [REST]
        ArrayGen[methodName] = function(thisObj/*, ...args*/)
        {
            var args = Array.prototype.slice.call(arguments, 1);
            return Array.prototype[methodName].apply(thisObj, args);
        };
    });
})();

Object.seal(ArrayGen);

Arr.ArrayGen = ArrayGen;

// ********************************************************************************************* //
// Arrays

/**
 * @deprecated use Array.isArray instead
 */ 
Arr.isArray = Deprecated.deprecated("Use Array.isArray instead", Array.isArray);
/**
 * Returns true if the given object is an Array or an Array-Like object
 *
 * @param {*} obj The object
 * @return true if it is an array-like object or false otherwise
 */
Arr.isArrayLike = function(obj)
{
    try
    {
        if (typeof obj !== "object")
            return false;
        if (!isFinite(obj.length))
            return false;
        if (Array.isArray(obj))
            return true;
        if (typeof obj.callee === "function") // arguments
            return true;
        if (typeof obj.splice === "function") // jQuery etc.
            return true;
        if (Arr._isDOMTokenList(obj))
            return true;
        var str = Object.prototype.toString.call(obj);
        if (str === "[object HTMLCollection]" || str === "[object NodeList]")
            return true;
    }
    catch (exc) {}
    return false;
};

Arr._isDOMTokenList = function(obj)
{
    // When minVersion is 19 or so, we can replace this whole function with
    // (Object.prototype.toString.call(obj) === "[object DOMTokenList]").
    try
    {
        var uwGlobal = XPCNativeWrapper.unwrap(Cu.getGlobalForObject(obj));
        return obj instanceof uwGlobal.DOMTokenList;
    }
    catch (exc) {}
    return false;
};

// At least sometimes the keys will be on user-level window objects
/**
 * @deprecated Use Object.keys instead
 * see https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/keys
 */
Arr.keys = Deprecated.deprecated("Use Object.keys instead or for ... in ", function(map)
{
    var keys = [];
    try
    {
        for (var name in map)  // enumeration is safe
            keys.push(name);   // name is string, safe
    }
    catch (exc)
    {
        // Sometimes we get exceptions trying to iterate properties
    }

    return keys;  // return is safe
});

/**
 * Returns the values of an object
 *
 * @param {*} map The object
 *
 * @return {Array} the values
 */
Arr.values = function(map)
{
    var values = [];
    try
    {
        for (var name in map)
        {
            try
            {
                values.push(map[name]);
            }
            catch (exc)
            {
                // Sometimes we get exceptions trying to access properties
                if (FBTrace.DBG_ERRORS)
                    FBTrace.dumpPropreties("lib.values FAILED ", exc);
            }
        }
    }
    catch (exc)
    {
        // Sometimes we get exceptions trying to iterate properties
        if (FBTrace.DBG_ERRORS)
            FBTrace.dumpPropreties("lib.values FAILED ", exc);
    }

    return values;
};

/**
 * Removes an item from an array or an array-like object
 *
 * @param {Array or Array-Like object} list The array
 * @param {*} item The item to remove from the object
 *
 * @return true if an item as been removed, false otherwise
 */
Arr.remove = function(list, item)
{
    var index = ArrayGen.indexOf(list, item);
    if (index >= 0)
    {
        ArrayGen.splice(list, index, 1);
        return true;
    }
    return false;
};
/**
 * Same as Arr.remove but removes all the occurences of item
 *
 * @param {Array or Array-Like object} list The array
 * @param {*} item The item to remove from the object
 *
 * @return true if an item as been removed, false otherwise
 */
Arr.removeAll = function(list, item)
{
    var iter = 0;

    while (Arr.remove(list, item))
        iter++;

    return (iter > 0);
}

/**
 * Clone an array. If a function is given as second parameter, the function is called for each
 * elements of the passed array and the results are put in the new one.
 *
 * @param {Array or Array-Like object} array The array
 * @param {function} [fn] The function
 *
 * @deprecated Use either Array.slice(array) or Array.map(array, fn) instead. 
 * see https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array
 *
 */
Arr.cloneArray = Deprecated.deprecated("use either Array.slice or Array.map instead",
function(array, fn)
{
    if (fn)
        return ArrayGen.map(array, fn);
    else
        return ArrayGen.slice(array);
});

/**
 * concats two Arrays or Array-like objects
 *
 * @param {Array or Array-Like Object} array
 * @param {Array or Array-Like Object} array2
 *
 * @return {Array} a new array with the elements of the two passed arrays
 */
Arr.extendArray = function(array, array2)
{
    if (Array.isArray(array) && Array.isArray(array2))
        return array.concat(array2);

    var newArray = [];
    newArray.push.apply(newArray, array);
    newArray.push.apply(newArray, array2);
    return newArray;
};

/**
 * insert elements at a specific index
 * NOTE: that method modifies the array passed as the first parameter
 *
 * @param {Array} array The array in which we insert elements
 * @param {Integer} index The index
 * @param {Array or Array-Like object} other The elements to insert
 *
 * @return the updated array
 */
Arr.arrayInsert = function(array, index, other)
{
    if (!Array.isArray(array))
        throw "Arr.arrayInsert; expected Array object";

    var splice = array.splice.bind(array, index, 0);
    splice.apply(null, other);
    return array;
};

/**
 * Filters out unique values of an array, saving only the first occurrence of
 * every value. In case the array is sorted, a faster path is taken.
 *
 * @param {Array or Array-Like object} arr The array
 * @param {Boolean} sorted If set to true, use the faster path
 *
 * @return {Array} the array deprived of duplication
 */
Arr.unique = function(arr, sorted)
{
    var ret = [], len = arr.length;
    var i;
    if (sorted)
    {
        for (i = 0; i < len; ++i)
        {
            // Skip duplicated entries
            if (i && arr[i-1] === arr[i])
                continue;
            ret.push(arr[i]);
        }
    }
    else
    {
        // Keep a map whose ","-prefixed keys represent the values that have
        // occurred so far in the array (this avoids overwriting e.g. __proto__).
        // xxxFlorent: [ES6-SET]
        var map = {};
        for (i = 0; i < len; ++i)
        {
            if (!map.hasOwnProperty("," + arr[i]))
            {
                ret.push(arr[i]);
                map["," + arr[i]] = 1;
            }
        }
    }
    return ret;
};

/**
 * Sorts an array and eliminate duplicates from it.
 *
 * @param {Array or Array-Like object} arr The array
 * @param {function} sortFunc The function used to sort the array (optional)
 *
 * @return {Array} the sorted array
 */
Arr.sortUnique = function(arr, sortFunc)
{
    // make a clone of the array so the original one is preserved
    var arrCopy = ArrayGen.slice(arr);
    return Arr.unique(arrCopy.sort(sortFunc), true);
};

/**
 * Merge together two arrays, sort the result, and eliminate any duplicates.
 *
 * @deprecated use Arr.sortUnique and/or Array.prototype.concat instead
 */
Arr.merge = Deprecated.deprecated("use Arr.sortUnique and/or Array.prototype.concat instead",
function(arr1, arr2, sortFunc)
{
    return Arr.sortUnique(arr1.concat(arr2), sortFunc);
});

// ********************************************************************************************* //

return Arr;

// ********************************************************************************************* //
});
