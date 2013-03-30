/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/debugger/rdp",
    "firebug/lib/promise",
    "firebug/lib/array",
    "firebug/lib/wrapper",
    "firebug/debugger/debuggerLib",
],
function (FBTrace, RDP, Promise, Arr, Wrapper, DebuggerLib) {

// ********************************************************************************************* //
// Object Grip

function ObjectClient(grip, cache)
{
    this.grip = grip;
    this.cache = cache;
    this.properties = null;
}

ObjectClient.prototype =
{
    getActor: function()
    {
        return this.grip.actor;
    },

    getType: function()
    {
        if (!this.grip)
            return "";

        if (this.grip.prototype)
            return this.grip.prototype["class"];

        return this.grip["class"];
    },

    getValue: function()
    {
        switch (this.grip.type)
        {
            case "null":
                return null;
            case "undefined":
                return;
        }

        // Break RDP and get the remote object directly
        var object = DebuggerLib.getObject(this.cache.context, this.grip.actor);
        if (object)
            return object;

        if (this.properties)
            return createGripProxy(this);

        // Basic grip data packet contains also list of some properties so, it's
        // possible to display some useful info about the object without additional
        // request. Let's use these properties for the value label.
        // See also {@ObjectClient}
        if (this.grip.ownProperties)
            return this.grip.ownProperties;

        return {type: this.grip.type};
    },

    hasProperties: function()
    {
        var result = true;

        // If the value isn't an object, but a primitive there are no children.
        if (this.grip.type != "object")
            result = false;;

        // It could happen that some loaded objects dosn't have any properties
        // (even if at least prototype should be always there). In this case
        // Expanding such object in the UI will just remove the toggle button.
        if (this.properties && !this.properties.length)
            result = false;

        // It looks like the object has children, but we'll see for sure as soon
        // as its children are actualy fetched from the server.
        return result;
    },

    getProperties: function()
    {
        return this.getPrototypeAndProperties(this.getActor());
    },

    //xxxHonza: Duplicated in firebug/dom/domPanel
    getObjectProperties: function(object, enumerableOnly, ownOnly)
    {
        var props = [];

        // Get all enumerable-only or all-properties of the object (but not inherited).
        if (enumerableOnly)
            props = Object.keys(object);
        else
            props = Object.getOwnPropertyNames(object);

        // Not interested in inherited properties, bail out.
        if (ownOnly)
            return props;

        // Climb the prototype chain.
        var inheritedProps = [];
        var parent = Object.getPrototypeOf(object);
        if (parent)
            inheritedProps = this.getObjectProperties(parent, enumerableOnly, ownOnly);

        // Push everything onto the returned array, to avoid O(nm) runtime behavior.
        inheritedProps.push.apply(inheritedProps, props);
        return inheritedProps;
    },

    getPrototypeAndProperties: function(actor)
    {
        if (this.properties)
            return this.properties;

        var packet = {
            to: actor,
            type: RDP.DebugProtocolTypes.prototypeAndProperties
        };

        // 'null' and 'undefined' grips don't have cache reference (see ClientCache and
        // gripNull and gripUndefined constants).
        if (!this.cache)
        {
            var deferred = Promise.defer();
            deferred.resolve([]);
            return deferred.promise;
        }

        var self = this;
        return this.cache.request(packet).then(
            function onSuccess(response)
            {
                if (response.error)
                {
                    FBTrace.sysout("objectGrip.getPrototypeAndProperties; ERROR " +
                        response.error + ": " + response.message, response);
                    return [];
                }

                self.properties = self.parseProperties(response.ownProperties);
                return self.properties;
            },
            function onError(response)
            {
                FBTrace.sysout("objectGrip.getPrototypeAndProperties; ERROR ", response);
            }
        );
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Properties

    createProperty: function(name, packet)
    {
        return new ObjectClient.Property(name, packet, this.cache);
    },

    parseProperties: function(props)
    {
        var result = [];
        for (var name in props)
            result.push(this.createProperty(name, props[name], this.cache));
        return result;
    },
}

// ********************************************************************************************* //
// ProxyGrip

function createGripProxy(grip)
{
    // xxxHonza: this is the place where we can use proxies so, Grips are working
    // in DOM panel automatically
    // xxxHonza: in case the grip represents an array the proxy should also 
    // be an array.
    var obj = {};
    for (var i=0; i<grip.properties.length; i++)
    {
        var prop = grip.properties[i];
        obj[prop.name] = prop.value;
    }

    return obj;
}

// ********************************************************************************************* //
// Property

ObjectClient.Property = function(name, desc, cache)
{
    this.name = name;

    if (desc)
        this.value = cache ? cache.getObject(desc.value) : desc;

    this.desc = desc;
    this.cache = cache;
}

ObjectClient.Property.prototype =
{
    getActor: function()
    {
        if (this.value instanceof ObjectClient)
            return this.value.getActor();
    },

    hasChildren: function()
    {
        var result = false;

        if (this.value instanceof ObjectClient)
        {
            result = this.value.hasProperties();
        }
        else
        {
            var valueType = typeof(this.value);
            result = (valueType === "string" && this.value.length > Firebug.stringCropLength);
        }

        return result;
    },

    getChildren: function()
    {
        if (this.value instanceof ObjectClient)
            return this.value.getProperties();

        return [];
    },

    getValue: function()
    {
        if (this.value instanceof ObjectClient)
            return this.value.getValue();

        return this.value;
    },

    getType: function()
    {
        if (this.value instanceof ObjectClient)
            return this.value.getType();

        return typeof(this.value);
    }
}

// ********************************************************************************************* //
// Registration

return ObjectClient;

// ********************************************************************************************* //
});
