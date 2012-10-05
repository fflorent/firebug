/* See license.txt for terms of usage */

define([
    "firebug/chrome/reps",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/chrome/window",
    "firebug/net/netUtils",
],
function(FirebugReps, Domplate, Locale, Dom, Win, NetUtils) {

    const Ci = Components.interfaces;

    var CommandLineIncludeRep = domplate(FirebugReps.Table,
    {
        getValueTag: function(object)
        {
            if (object.cons === Domplate.DomplateTag)
                return object;
            else
                return FirebugReps.Table.getValueTag(object);
        },

        onDelete: function()
        {
            
        },

        displayAliases: function(context)
        {
            with (Domplate)
            {
                var aliases = JSON.parse(PrefLoader.getPref("consoleAliases") || "{}");
                var arrayToDisplay = [];
                var urlTag = DIV({}, {
                    A({href: "$href", target: "_blank"}, "$href"),
                    IMG({
                        src:"blank.gif",
                        class:"closeButton",
                        "onclick":"$onDelete"
                    })
                );
                for (var key in aliases)
                {
                    arrayToDisplay.push({
                        "alias": key,
                        "URL": aliases[key],
                    });
                }
                CommandLineIncludeRep.log(arrayToDisplay, ["alias", "URL", "delete"], context);
            }
        },


    });

    var CommandLineInclude =
    {
        onSuccess: function(aliases, newAlias, context, xhr)
        {
            var urlComponent = xhr.channel.URI.QueryInterface(Ci.nsIURL);
            var msg, filename = urlComponent.fileName, url = urlComponent.spec;
            if (newAlias)
            {
                aliases[ newAlias ] = url;
                PrefLoader.setPref("consoleAliases", JSON.stringify(aliases));
                msg = Locale.$STRF("commandline.include.aliasCreated", [newAlias]);
                Firebug.Console.logFormatted([msg], context, "info");
            }
            msg = Locale.$STRF("commandline.include.includeSuccess", [filename]);
            Firebug.Console.logFormatted([msg], context, "info");
        },
        onError: function(context, xhr)
        {
            Firebug.Console.log(xhr);
            var msg = Locale.$STRF("commandline.include.loadFail", [xhr.channel.URI.spec]);
            Firebug.Console.logFormatted([msg], context, "error");
        },
        // include(context, url[, newAlias])
        // includes a remote script
        include: function(context, url, newAlias)
        {
            var reUrlNotAlias = /[\.\/]/;
            var urlMayBeAlias = !reUrlNotAlias.test(url);
            var aliases;
            var returnValue = Firebug.Console.getDefaultReturnValue(context.window);
            var acceptedSchemes = ["http", "https"];
            // checking arguments:
            if (newAlias !== undefined && reUrlNotAlias.test(newAlias))
            {
                var msg = Locale.$STRF("commandline.include.invalidAliasName", [newAlias]);
                Firebug.Console.logFormatted([msg], context, "error");
                return returnValue;
            }

            // we get the custom aliases
            if (newAlias !== undefined || urlMayBeAlias)
                aliases = JSON.parse(PrefLoader.getPref("consoleAliases") || "{}");

            if (newAlias === undefined && urlMayBeAlias)
            {
                var aliasName = url.toLowerCase();
                url = aliases[aliasName];
                if (url === undefined)
                {
                    var msg = Locale.$STRF("commandline.include.aliasNotFound", [aliasName]);
                    Firebug.Console.logFormatted([msg], context, "error");
                    return returnValue;
                }
            }

            // if the URL is null, we delete the alias
            if (newAlias !== undefined && url === null)
            {
                delete aliases[newAlias];
                PrefLoader.setPref("consoleAliases", JSON.stringify(aliases));
                var msg = Locale.$STRF("commandline.include.aliasRemoved", [newAlias]);
                Firebug.Console.logFormatted([msg], context, "info");
                return returnValue;
            }

            var onSuccess = this.onSuccess.bind(this, aliases, newAlias, context);
            var onError = this.onError.bind(this, context);
            this.evaluateRemoteScript(url, context, onSuccess, this.onError);
            return returnValue;
        },

        evaluateRemoteScript: function(url, context, successFunction, errorFunction){
            var xhr = new XMLHttpRequest({ mozAnon: true });
            var acceptedSchemes = ["http", "https"];
            var absoluteURL = context.browser.currentURI.resolve(url);
            xhr.onload = function()
            {
                var contentType = xhr.getResponseHeader("Content-Type").split(";")[0];
                if (NetUtils.mimeCategoryMap[contentType] === "js")
                {
                    var codeToEval = xhr.responseText;
                    var headerMatch;
                    Firebug.CommandLine.evaluateInWebPage(codeToEval, context);
                    if (successFunction)
                        successFunction(xhr);
                }
                else
                {
                    var msg = Locale.$STRF("commandline.include.invalidFileMime", [absoluteURL]);
                    Firebug.Console.logFormatted([msg], context, "error");
                }
            };
            if (errorFunction)
            {
                xhr.onError = function()
                {
                    errorFunction(xhr);
                };
            }
            xhr.open("GET", absoluteURL, true);

            if (!~acceptedSchemes.indexOf(xhr.channel.URI.scheme))
            {
                var msg = Locale.$STR("commandline.include.invalidRequestProtocol");
                Firebug.Console.logFormatted([msg], context, "error");
                return ;
            }
            Firebug.Console.log(xhr);
            xhr.send(null);
            // xxxFlorent: TODO show XHR progress
            return xhr;
        }
    };

    function onCommand(context, args)
    {
        var self = CommandLineInclude;
        if (args.length === 0)
            return CommandLineInclude.displayAliases.call(self, context);

        Array.unshift(args, context);
        return CommandLineInclude.include.apply(self, args);
    }

    Firebug.registerCommand("include", {
        handler: onCommand,
        description: Locale.$STR("console.cmd.help.include"),
        helpUrl: "http://getfirebug.com/wiki/index.php/include"
    });

    return CommandLineIncludeRep;
});
