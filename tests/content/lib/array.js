function runTest() {
    var Arr = FW.Firebug.require("firebug/lib/array");

    FBTest.progress("Testing firebug/lib/array.js; START");

    // ****************************************************************************************** //
    FBTest.progress("== Testing Arr.isArrayLike ==");
    (function()
    {
        var jQuerySimulation = {length: 0, splice: function(){}};
        var xhtmlNS = "http://www.w3.org/1999/xhtml";
        var okArray = Arr.isArrayLike([]);
        var okArguments = Arr.isArrayLike(arguments);
        var okHTMLCollection = Arr.isArrayLike(document.getElementsByTagName("*"));
        var okNodeList = Arr.isArrayLike(document.querySelectorAll("p"));
        var okDOMTokenList = Arr.isArrayLike(document.createElementNS(xhtmlNS, "p").classList);
        // OK for jQuery objects (and some other frameworks)
        var okJQuery = Arr.isArrayLike(jQuerySimulation);
        // some KO's
        var koString = !Arr.isArrayLike("");
        var koNull = !Arr.isArrayLike(null);
        var koUnindentifiedArrayLike = !Arr.isArrayLike({length: 1, 0: 0});

        FBTest.ok(okArray, "[Arr.isArrayLike] test with Arrays should succeed");
        FBTest.ok(okArguments, "[Arr.isArrayLike] test with Arguments should succeed");
        FBTest.ok(okHTMLCollection, "[Arr.isArrayLike] test with HTMLCollection's should succeed");
        FBTest.ok(okNodeList, "[Arr.isArrayLike] test with NodeList's should succeed");
        FBTest.ok(okDOMTokenList, "[Arr.isArrayLike] test with DOMTokenList's should succeed");
        FBTest.ok(okJQuery, "[Arr.isArrayLike] test with jQuery objects should succeed");
        FBTest.ok(koString, "[Arr.isArrayLike] test with Strings should fail");
        FBTest.ok(koNull, "[Arr.isArrayLike] test with null should fail");
        FBTest.ok(koUnindentifiedArrayLike, 
            "[Arr.isArrayLike] test with unindetified array-like objects should fail");
    })();

    // ****************************************************************************************** //
    FBTest.progress("== Testing Arr.keys / Arr.values ==");
    (function()
    {
        var list = Arr.keys(document.documentElement);
        // style is not included in the list of keys, when using Object.keys
        // but it is when using Arr.keys:
        var okKeys = list.indexOf("style") >= 0;
        var enum1 = Object.create(null, {a: {value: 0, enumerable: true}});
        var nonEnum1 = Object.create(null, {a: {value: 0}});
        var enum2 = Object.create(Object.create(null, {a: {value: 0, enumerable: true}}));
        var nonEnum2 = Object.create(Object.create(null, {a: {value: 0}}));

        var testEmpty = function(obj, objName)
        {
            // test that the returned is empty for both Arr.keys and Arr.values
            ['keys', 'values'].forEach(function(func)
            {
                FBTest.compare(0, Arr[func](obj).length, '[Arr.'+func+'] Arr.'+func+
                    '('+(objName || obj)+') should return an empty array');
            });
        }

        FBTest.ok(okKeys, "[Arr.keys] Arr.keys(document.documentElement).indexOf('style') >= 0");

        FBTest.compare('a', Arr.keys(enum1)[0], "[Arr.keys] Arr.keys(enum1)[0] === 'a'");
        FBTest.compare(0, Arr.values(enum1)[0], "[Arr.values] Arr.values(enum1)[0] === 0");
        testEmpty(nonEnum1, "nonEnum1");
        FBTest.compare('a', Arr.keys(enum2)[0], "[Arr.keys] Arr.keys(enum2)[0] === 'a'");
        FBTest.compare(0, Arr.values(enum2)[0], "[Arr.values] Arr.values(enum2)[0] === 0");
        testEmpty(nonEnum2, "nonEnum2");
        // test for some primitives
        testEmpty("", '""'); //strings
        testEmpty(false);
        testEmpty(null);
        testEmpty(undefined);
        testEmpty(5);
        testEmpty(function(){});

        var listValues = Arr.values({"a":1, 'b':1, 'c':2});

        FBTest.compare("1,1,2", listValues.toString(),
            "[Arr.values] listValues.toString() === '1,1,2'");

    })();

    // ****************************************************************************************** //
    FBTest.progress("== Testing Arr.remove ==");
    (function()
    {
        var array = [1,0,1,0];
        // remove the first occurrence of 1 in the array
        var ret = Arr.remove(array, 0);
        // now the array should equal to [1,0]:
        FBTest.compare("1,1,0", array.toString(), "[Arr.remove] the function has removed "+
            "the first element matching '0'");

        FBTest.compare(true, ret, "[Arr.remove] the function returns true when an element has "+
            "been removed");

        FBTest.compare(false, Arr.remove(array, -1), "[Arr.remove] the function returns false when"+
            +" no element has been removed");
    })();

    // ****************************************************************************************** //
    FBTest.progress("== Testing Arr.removeAll ==");
    if (!Arr.removeAll)
        FBTest.sysout("Arr.removeAll does not exists in this version");
    else
    {
        (function()
        {
            var array = [0,1,2,1];
            Arr.removeAll(array, 1);
            FBTest.compare("0,2", array.toString(), "[Arr.removeAll] each elements matching 1 "+
                +"should have been removed");
        })();
    }
    // xxxFlorent: not testing Arr.sliceArray

    // ****************************************************************************************** //
    FBTest.progress("== Testing Arr.cloneArray ==");
    (function()
    {
        var orig = [0,1,2,{}];
        var cloned = Arr.cloneArray(orig);
        // NOTE: ({}+3) === 3
        var clonedMapped = Arr.cloneArray(orig, function(e){ return e+1; });

        FBTest.compare(orig, cloned, "[Arr.cloneArray] cloned !== orig", true);
        FBTest.compare(orig, clonedMapped, "[Arr.cloneArray] clonedMapped !== orig", true);
        orig.forEach(function(el, i)
        {
            FBTest.compare(el, cloned[i], "[Arr.cloneArray] orig["+i+"] === cloned["+i+"]");
            FBTest.compare(el+1, clonedMapped[i],
                "[Arr.cloneArray] orig["+i+"] === clonedMapped["+i+"]+1");
        });

        var args = [1,2,3];
        (function()
        {
            var clonedArguments = Arr.cloneArray(arguments);
            FBTest.ok(Array.isArray(clonedArguments), "[Arr.cloneArray] cloneArray should return"+
                " Arrays even when it is passed Array-like objects");
            FBTest.compare(clonedArguments.toString(), args.toString(), "[Arr.cloneArray] "+
                "Arr.cloneArray should return the same content than the Array-Like object");

            var mappedClonedArguments = Arr.cloneArray(arguments, function(e){ return e+1;});
            FBTest.compare(mappedClonedArguments.toString(), "2,3,4",
                "[Arr.cloneArray] should returned a mapped array for Array-like objects");
        }).apply(this, args);
    })();

    // ****************************************************************************************** //
    FBTest.progress("== Testing Arr.extendArray ==");
    (function()
    {
        var ext = [4,5,6];
        var arr = Arr.extendArray(arguments, ext);
        FBTest.compare("1,2,3,4,5,6", arr, "[Arr.extendArray] the two arrays should have been"+
            " concatened (Array-Like version)");
        // An optimized way have been added for Array objects (xxxFlorent: benchmark it!):
        var arr2 = Arr.extendArray(Array.slice(arguments), ext);
        FBTest.compare("1,2,3,4,5,6", arr2,  "[Arr.extendArray] the two arrays should have been"+
            " concatened (Array objects version)");
    })(1,2,3);

    // ****************************************************************************************** //
    FBTest.progress("== Testing Arr.arrayInsert ==");
    (function()
    {
        var result, otherArr = [2,3], indInsert = 2;
        // make a copy of arguments:
        var args = Array.slice(arguments);

        result = Arr.arrayInsert(args, indInsert, otherArr);

        FBTest.compare("0,1,2,3,4,5,6", result, "[Arr.arrayInsert] the insertion of the other "+
            "array content should work with Arrays");

        var failWithArrayLike = false;
        try
        {
            Arr.arrayInsert(arguments, 0, 1);
            // wrong behaviour:
            failWithArrayLike = false;
        }
        catch(ex)
        {
            // correct behaviour:
            failWithArrayLike = true;
        }
        FBTest.ok(failWithArrayLike, "[Arr.arrayInsert] should fail with Array-Like objects");
    })(0,1,4,5,6);

    // ****************************************************************************************** //
    FBTest.progress("== Testing Arr.unique ==");
    (function()
    {
        var arr1 = Arr.unique([null, 15, 10, null, 15, 20]);
        FBTest.compare(",15,10,20", arr1, "[Arr.unique] should return array with unique elements");

        var arr2 = Arr.unique(arguments);
        FBTest.compare("10,11,12", arr2, "[Arr.unique] should also work with Array-like objects");

        var arr3 = Arr.unique(arguments, true);
        FBTest.compare("10,11,12", arr3, "[Arr.unique] should work with sorted arrays");
    })(10, 10, 11, 12);

    // ****************************************************************************************** //
    FBTest.progress("== Testing Arr.sortUnique + Arr.merge ==");
    (function()
    {
        var sortFunc = function(cur, other){ return cur < other; };
        var arrSortUnique, arrMerge;
        var otherArray = [0,6,4,2,7,5];
        var args = Array.slice(arguments);

        try
        {
            // Note: the function does not work with Array-like arguments with the old version
            arrSortUnique = Arr.sortUnique(arguments, sortFunc);
        }
        catch(ex)
        {
            // raise a warning
            FBTest.ok(false, "[Arr.sortUnique] should work with Array-like arguments "+
                "(working since version 1.12)");
            arrSortUnique = Arr.sortUnique(args, sortFunc);
        }
        // Arr.merge works only with Array objects
        arrMerge = Arr.merge(args, otherArray, sortFunc);

        FBTest.compare("4,3,2,1,0", arrSortUnique,
            "[Arr.sortUnique] the result should be reverse-sorted");

        FBTest.compare("7,6,5,4,3,2,1,0", arrMerge, "[Arr.merge] the result should be a "+
            "reverse-sorted array including the elements of the two passed arrays");
    })(1,2,3,4,1,0,4);

    // ****************************************************************************************** //

    // ****************************************************************************************** //
    FBTest.testDone("Testing firebug/lib/array.js; STOP");

}

