/* See license.txt for terms of usage */
/*jshint esnext:true, curly:false, evil:true*/
/*global FBTrace:true, Components:true, define:true, XPCOMUtils:true */
define([
    "firebug/net/requestObserver"
],
function(HttpRequestObserver) {

// xxxFlorent: TODO
// - make this also work when Browser cache is disabled (+FBTest)
// - ==> see [1]
// - remove the test with ga.js
// - the content of the script is put twice in the script panel

// ********************************************************************************************* //
// Constants
const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

// ********************************************************************************************* //

var AutoResponder =
/** lends AutoResponder */
{
    registered: false,
    // xxxFlorent: different auto-responders per context ? [1]
    autoResponderMap: {},
    autoResponderPatternMap: new Map(),

    registerObserver: function()
    {
        if (!this.registered)
            HttpRequestObserver.addObserver(AutoResponder);
        this.registered = true;
    },

    unregisterObserver: function()
    {
        if (this.registered)
            HttpRequestObserver.removeObserver(AutoResponder);
        this.registered = false;
    },

    addAutoResponder: function(key, autoResponder)
    {
        if (typeof key === "string")
            this.autoResponderMap[key] = autoResponder;
        else if (key instanceof RegExp)
            this.autoResponderPatternMap.set(key, autoResponder);
        else
            throw new Error("AutoResponder.addAutoResponder; invalid argument");
    },

    removeAutoResponder: function(key)
    {
        return (delete this.autoResponderMap[key] || delete this.autoResponderPatternMap[key]);
    },

    getAutoResponse: function(url)
    {
        var autoResponder = this.autoResponderMap[url];
        if (autoResponder)
            return autoResponder;

        var patterns = this.autoResponderPatternMap.keys();
        for (var pattern of patterns)
        {
            if (pattern.test(url))
                return this.autoResponderPatternMap.get(pattern);
        }

        return null;
    },

    observe: function(subject, topic, data)
    {
        if (topic === "http-on-modify-request" && subject instanceof Ci.nsITraceableChannel)
        {
            this.onModifyRequest(subject);
        }
    },

    onModifyRequest: function(channel)
    {
        if (!(channel instanceof Ci.nsITraceableChannel))
            return;

        FBTrace.sysout('modif!', channel);
        var uri = channel.URI.asciiSpec;
        var autoResponse = this.getAutoResponse(uri);
        if (autoResponse)
        {
            if (FBTrace.DBG_NET)
            {
                FBTrace.sysout("AutoResponder.onModifyRequest; autoresponding for  "+uri, 
                    autoResponse);
            }
            var fakeListener = getFakeListener(channel, autoResponse);
            // xxxFlorent: I saw this in this topic: http://stackoverflow.com/a/7226550. What does 
            //             it mean? In what case would this be embarassing?

            // We cannot replace the listener right now, see
            // https://bugzilla.mozilla.org/show_bug.cgi?id=646370.
            // Do it asynchronously instead.
            //var threadManager = Cc["@mozilla.org/thread-manager;1"]
            //                     .getService(Ci.nsIThreadManager);
            // threadManager.currentThread.dispatch(fakeListener, Ci.nsIEventTarget.DISPATCH_NORMAL);

            // xxxFlorent: no problem if I just call run() in the current thread right now...
            fakeListener.run();
        }
    },
};

// Thanks to Wladimir Palant (http://stackoverflow.com/a/7226550)
function getFakeListener(channel, autoResponse)
{
    // Our own listener for the channel
    var fakeListener = {
        QueryInterface: XPCOMUtils.generateQI([Ci.nsIStreamListener,
                        Ci.nsIRequestObserver, Ci.nsIRunnable]),
        oldListener: null,
        run: function()
        {
            // Replace old listener by our fake listener.
            this.oldListener = channel.setNewListener(this);
        },

        onDataAvailable: function(channel, requestContext, stream){},

        onStartRequest: function(){},

        onStopRequest: function(request, requestContext, status)
        {
            // Call old listener with our data and set "response" headers.
            var stream = Cc["@mozilla.org/io/string-input-stream;1"]
                .createInstance(Ci.nsIStringInputStream);
            stream.setData(autoResponse, -1);
            this.oldListener.onStartRequest(channel, requestContext);
            this.oldListener.onDataAvailable(channel, requestContext, stream, 0,
                stream.available());
            this.oldListener.onStopRequest(channel, requestContext, Components.results.NS_OK);
        }
    };

    return fakeListener;
}

// A simple test (TODO: remove it)
AutoResponder.addAutoResponder(/ga\.js/, "alert('trapped');");

return AutoResponder;

});
