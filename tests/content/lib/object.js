function runTest() {
    var Obj = FW.Firebug.require("firebug/lib/object");

    FBTest.progress("Testing firebug/lib/object.js; START");

    // ****************************************************************************************** //
    FBTest.progress("== Testing Obj.bind + Obj.bindFixed ==");
    (function()
    {
        var thisObject = {};
        Obj.bind(function(_1, _2, _3, _4)
        {

            FBTest.compare(thisObject, this, "[Obj.bind] thisObject is bound to the function "+
                "(this === thisObject)");
            var sArgs = Array.slice(arguments).toString();
            FBTest.compare("1,2,3,4", sArgs, "[Obj.bind] the arguments list should be: 1,2,3,4");
        }, thisObject, 3, 4).call({}, 1, 2);

        Obj.bindFixed(function(_1, _2)
        {
            FBTest.compare(thisObject, this, "[Obj.bindFixed] thisObject is bound to the function "+
                "(this === thisObject)");
            var sArgs = Array.slice(arguments).toString();
            FBTest.compare("1,2", sArgs, "[Obj.bindFixed] the arguments list should be: 1,2"+
                " (the other arguments are ignored)");
        }, thisObject, 1, 2).call({}, 3, 4);
    })();

    // ****************************************************************************************** //
    FBTest.progress("== Testing Obj.extend ==");
    (function()
    {
        var value = 0;
        // initialization:
        var parentObj = {prop1: {}, overridenProp: {}};
        var extension = {
            overridenProp: {},
            prop2: {}, 
            overridenProp2: {},
            set setter(_value){ value = _value; }
        };

        var extension2 = {
            prop3: {},
            overridenProp2: function(){},
            get getter(){ return value;}
        };

        // call the function to test:
        var obj2test = Obj.extend(parentObj, extension, extension2);
        Object.defineProperty(extension2, "hidden", { value: 42, enumerable: false});
        // compare:
        FBTest.compare(parentObj.prop1, obj2test.prop1, 
            "[Obj.extend] parentObj.prop1 === obj2test.prop1");

        FBTest.compare(extension.overridenProp, obj2test.overridenProp,
            "[Obj.extend] extension.overridenProp === obj2test.overridenProp");
        FBTest.compare(extension.prop2, obj2test.prop2, 
            "[Obj.extend] extension.prop2 === obj2test.prop2");

        FBTest.compare(extension2.prop3, obj2test.prop3,
            "[Obj.extend] extension2.prop3 === obj2test.prop3");
        FBTest.compare(extension2.overridenProp2, obj2test.overridenProp2,
            "[Obj.extend] extension2.overridenProp2 === obj2test.overridenProp2");

        obj2test.setter = "ok";
        FBTest.compare("ok", obj2test.getter, "[Obj.extend] also preserves the getters/setters");

        FBTest.compare(undefined, obj2test.hidden, 
            "[Obj.extend] extension2.hidden is not passed to obj2test");
    })();

    // ****************************************************************************************** //
    FBTest.progress("== Testing Obj.descend ==");
    (function()
    {
        // initialization:
        var parentClass = Array;
        var childPropertyOne = { slice: function(){}, prop1: {}};
        var childPropertyTwo = { prop1: function(){}}; // should be ignored
        // call the function to test:
        var obj2test = Obj.descend(parentClass.prototype, childPropertyOne, childPropertyTwo);
        //compare: 
        FBTest.compare(parentClass.prototype, Object.getPrototypeOf(obj2test),
            "[Obj.descend] parentClass.prototype === Object.getPrototypeOf(obj2test.pop)");

        FBTest.compare(childPropertyOne.slice, obj2test.slice, 
            "[Obj.descend] childPropertyOne.slice === obj2test.slice");
        FBTest.compare(childPropertyOne.prop1, obj2test.prop1,
            "[Obj.descend] childPropertyOne.prop1 === obj2test.prop1");
    })();

    // ****************************************************************************************** //
    FBTest.testDone("Testing firebug/lib/object.js; DONE");
}

