/* See license.txt for terms of usage */

define([
    "firebug/chrome/reps",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/chrome/window",
    "firebug/lib/css",
    "firebug/lib/string",
    "firebug/net/netUtils",
],
function(FirebugReps, Domplate, Locale, Dom, Win, Css, Str, NetUtils) {

    const Ci = Components.interfaces;

    var CommandLineIncludeRep = Domplate.domplate(FirebugReps.Table,
    {
        tableClassName: "tableCommandLineInclude dataTable",
        getValueTag: function(object)
        {
            if (object.cons === Domplate.DomplateTag)
                return object;
            else
                return FirebugReps.Table.getValueTag(object);
        },
        getRowFromEvTarget: function(elem)
        {
            var row = elem;
            while(row && !Css.hasClass(row, "dataTableRow"))
                row = row.parentNode;
            return row;
        },
        onDelete: function(context, aliasName, ev)
        {
            if (window.confirm("do you really want to delete this alias : "+aliasName+" ?"))
            {
                var row = this.getRowFromEvTarget(ev.target);
                if (row)
                    row.parentNode.removeChild(row);
                var aliases = CommandLineInclude.getAliases();
                if (aliases[aliasName])
                    delete aliases[aliasName];
                CommandLineInclude.setAliases(aliases);
            }
        },
        getUrlTag: function(href, aliasName, context)
        {
            with (Domplate)
            {
                return SPAN({style:"height:100%"}, 
                    A({"href": href, "target": "_blank", "class":"url"}, Str.cropString(href, 100)),
                    SPAN({class:"commands"},
                        IMG({
                            "src":"blank.gif",
                            "class":"closeButton ",
                            onclick: this.onDelete.bind(this, context, aliasName),
                        })
                    )
                );
            }
        },

        displayAliases: function(context)
        {
            with (Domplate)
            {
                var aliases = JSON.parse(PrefLoader.getPref("consoleAliases") || "{}");
                var arrayToDisplay = [];
                for (var aliasName in aliases)
                {
                    arrayToDisplay.push({
                        "alias": SPAN(aliasName),
                        "URL": this.getUrlTag(aliases[aliasName], aliasName, context)
                    });
                }
                this.log(arrayToDisplay, ["alias", "URL"], context);
            }
            return Firebug.Console.getDefaultReturnValue(context.window);
        }
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
                this.setAliases(aliases);
                this.log("aliasCreated", [newAlias], [context, "info"]);
            }
            this.log("includeSuccess", [filename], [context, "info"]);
        },
        onError: function(context, xhr)
        {
            Firebug.Console.log(xhr);
            this.log("loadFail", [xhr.channel.URI.spec], [context, "error"]);
        },

        getAliases: function()
        {
            return JSON.parse(PrefLoader.getPref("consoleAliases") || "{}");
        },
        deleteAlias: function(aliases, aliasToDel)
        {
            delete aliases[aliasToDel];
            this.setAliases(aliases);
        },
        setAliases: function(aliases)
        {
            PrefLoader.setPref("consoleAliases", JSON.stringify(aliases));
        },

        log: function(localeStr, localeArgs, logArgs)
        {
            var msg = Locale.$STRF("commandline.include."+localeStr, localeArgs);
            logArgs.unshift([msg]);
            Firebug.Console.logFormatted.apply(Firebug.Console, logArgs);
        },
        // include(context, url[, newAlias])
        // includes a remote script
        include: function(context, url, newAlias)
        {
            var reNotAlias = /[\.\/]/;
            var urlIsAlias = url !== null && !reNotAlias.test(url);
            var aliases;
            var returnValue = Firebug.Console.getDefaultReturnValue(context.window);
            var acceptedSchemes = ["http", "https"];
            var msg;
            // checking arguments:
            if (newAlias !== undefined && typeof newAlias !== "string")
                throw "wrong alias argument; expected string";

            if (url !== null && typeof url !== "string")
                throw "wrong url argument; expected string or null";

            if (newAlias !== undefined)
                newAlias = newAlias.toLowerCase();
            if ((urlIsAlias && url.length > 30) || (newAlias && newAlias.length > 30))
            {
                this.log("tooLongAliasName", [newAlias || url], [context, "error"]);
                return returnValue;
            }
            if (newAlias !== undefined && reNotAlias.test(newAlias))
            {
                this.log("invalidAliasName", [newAlias], [context, "error"]);
                return returnValue;
            }

            // we get the custom aliases
            if (newAlias !== undefined || urlIsAlias)
                aliases = this.getAliases();

            if (urlIsAlias)
            {
                var aliasName = url.toLowerCase();
                url = aliases[aliasName];
                if (url === undefined)
                {
                    this.log("aliasNotFound", [aliasName], [context, "error"]);
                    return returnValue;
                }
            }
            // if the URL is null, we delete the alias
            if (newAlias !== undefined && url === null)
            {
                if (aliases[newAlias] === undefined)
                {
                    this.log("aliasNotFound", [newAlias], [context, "error"]);
                    return returnValue;
                }
                delete aliases[newAlias];
                this.setAliases(aliases);
                this.log("aliasRemoved", [newAlias], [context, "info"]);
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
                    this.log("invalidFileMime", [absoluteURL], [context, "error"]);
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
                this.log("invalidRequestProtocol", [], [context, "error"]);
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
        if (args.length === 0)
            return CommandLineIncludeRep.displayAliases(context);

        var self = CommandLineInclude;
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
