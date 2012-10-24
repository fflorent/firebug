/* See license.txt for terms of usage */

define([
    "firebug/chrome/reps",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/chrome/window",
    "firebug/lib/css",
    "firebug/lib/string",
    "firebug/lib/options",
    "firebug/chrome/menu",
    "firebug/lib/system",
    "firebug/editor/editor",
],
function(FirebugReps, Domplate, Locale, Dom, Win, Css, Str, Options, Menu, System) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

const Ci = Components.interfaces;
const Cu = Components.utils;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

var ScratchpadManager;

try
{
    let sc = {};
    Cu.import("resource:///modules/devtools/scratchpad-manager.jsm", sc);
    ScratchpadManager = sc.ScratchpadManager;
}
catch(ex)
{
    // Scratchpad does not exists (when using Seamonkey ...)
}

// ********************************************************************************************* //
// Implementation

var CommandLineIncludeRep = FirebugReps.CommandLineInclude = domplate(FirebugReps.Table,
{
    tag: FirebugReps.OBJECTBOX( {"oncontextmenu":"$onContextMenu"}, FirebugReps.Table.tag ),
    tableClassName: "tableCommandLineInclude dataTable",

    getValueTag: function(object)
    {
        if (object.cons === DomplateTag)
            return object;
        else
            return FirebugReps.Table.getValueTag(object);
    },

    getUrlTag: function(href, aliasName, context)
    {
        return SPAN({style:"height:100%"},
            A({"href": href, "target": "_blank", "class":"url"},
                Str.cropString(href, 100)),
            SPAN({"class": "commands"}
                // xxxFlorent: temporarily disabled, see: 
                //    http://code.google.com/p/fbug/issues/detail?id=5878#c27
                /*,
                IMG({
                    "src":"blank.gif",
                    "class":"closeButton ",
                    onclick: this.deleteAlias.bind(this, aliasName),
                })*/
            )
        );
    },

    displayAliases: function(context)
    {
        var aliases = CommandLineInclude.getAliases();
        var arrayToDisplay = [];

        for (var aliasName in aliases)
        {
            arrayToDisplay.push({
                "alias": SPAN({"class":"aliasName"}, aliasName),
                "URL": this.getUrlTag(aliases[aliasName], aliasName, context)
            });
        }

        this.log(arrayToDisplay, ["alias", "URL"], context);
        return Firebug.Console.getDefaultReturnValue(context.window);
    },

    deleteAlias: function(aliasName, ev)
    {
        if (window.confirm(Locale.$STRF("commandline.include.confirmDelete", [aliasName])))
        {
            var row = Dom.getAncestorByClass(ev.target, "dataTableRow");
            if (row)
                row.parentNode.removeChild(row);

            var aliases = CommandLineInclude.getAliases();
            if (aliases[aliasName])
                delete aliases[aliasName];

            CommandLineInclude.setAliases(aliases);
        }
    },

    startEditing: function(target)
    {
        // xxxFlorent: clumsy ?
        var editor = this.getEditor(target.ownerDocument);
        Firebug.Editor.startEditing(target, target.textContent, editor);
    },

    editAliasName: function(tr)
    {
        var target = tr.querySelector(".aliasName");
        this.startEditing(target);
    },

    editAliasURL: function(tr)
    {
        var target = tr.querySelector(".url");
        this.startEditing(target);
    },

    openInScratchpad: function(url)
    {
        var spWin = ScratchpadManager.openScratchpad();
        var scriptContent = null;
        var editor = null;
        spWin.onload = function()
        {
            var spInstance = spWin.Scratchpad;
            //intro = spInstance.strings.GetStringFromName("scratchpadIntro");
            spInstance.addObserver({
                onReady: function()
                {
                    editor = spInstance.editor;
                    // if the content of the script is loaded, we write the content in the editor
                    // otherwise, we write a text that asks the user to wait
                    if (scriptContent)
                        editor.setText(scriptContent);
                    else
                        editor.setText("// loading, please wait ...");
                }
            });
        }

        var xhr = new XMLHttpRequest({mozAnon: true});
        xhr.open("GET", url, true);

        xhr.onload = function()
        {
            if (spWin.closed)
                 return;
            scriptContent = xhr.responseText;
            // if the editor is ready, we put the content on it now
            // otherwise, we wait for the editor
            if (editor)
                editor.setText(scriptContent);
        }

        xhr.onerror = function()
        {
            if (spWin.closed)
                return;
            spInstance.setText("// error while loading the script", startTextIndex);
        }

        xhr.send(null);
    },

    openNewTab: function(url)
    {
        // NOTE: in order to prevent from passing unwanted arguments (like the "commands" object)
        // we call Win.openNewTab in separate function
        Win.openNewTab(url);
    },

    copyToClipboard: function(content)
    {
        System.copyToClipboard(content);
    },

    getContextMenuItems: function(ev, tr)
    {
        var url = tr.querySelector("a.url").href;
        // xxxFlorent: not so pretty ...
        var aliasName = tr.querySelector(".aliasName").textContent;

        var items = [
            {
                label: "commandline.label.CopyAliasName",
                id: "fbCopyAliasName",
                tooltiptext: "commandline.tip.Copy_Alias_Name",
                command: this.copyToClipboard.bind(this, aliasName)
            },
            {
                label: "CopyLocation",
                id: "fbCopyLocation",
                tooltiptext: "clipboard.tip.Copy_Location",
                command: this.copyToClipboard.bind(this, url)
            },
            // xxxFlorent: temporarily disabled, see: 
            //    http://code.google.com/p/fbug/issues/detail?id=5878#c27
            /*"-",
            {
                label: "commandline.label.EditAliasName",
                id: "fbEditAliasName",
                tooltiptext: "commandline.tip.Edit_Alias_Name",
                command: this.editAliasName.bind(this, tr)
            },
            {
                label: "commandline.label.EditAliasURL",
                id: "fbEditAliasUrl",
                tooltiptext: "commandline.tip.Edit_Alias_URL",
                command: this.editAliasURL.bind(this, tr)
            },
            {
                label: "commandline.label.DeleteAlias",
                id: "fbDeleteAlias",
                tooltiptext: "commandline.tip.Delete_Alias",
                command: this.deleteAlias.bind(this, aliasName, ev)
            },*/
            "-",
            {
                label: "OpenInTab",
                id: "fbOpenInTab",
                tooltiptext: "firebug.tip.Open_In_Tab",
                command: this.openNewTab.bind(this, url)
            }
        ];

        if (ScratchpadManager)
        {
            items.push({
                label: "commandline.label.OpenInScratchpad",
                id: "fbOpenInScratchpad",
                tooltiptext: "commandline.tip.Open_In_Scratchpad",
                command: this.openInScratchpad.bind(this, url)
            });
        }

        return items;
    },

    onContextMenu: function(event)
    {
        event.preventDefault();
        var target = Dom.getAncestorByTagName(event.target, "tr");

        if (target === null)
                return;
        // xxxFlorent: we should implement a common function that do that work
        // for example: openMenu(items[, popup]);
        // this would also be called in console/commandEditor.js:159 and in editor/editor.js:968

        // good popup ?
        var popup = document.getElementById("fbIncludePopup");
        Dom.eraseNode(popup);

        var items = this.getContextMenuItems(event, target);
        for (var i=0; i<items.length; i++)
            Menu.createMenuItem(popup, items[i]);

        if (popup.firstChild === null)
            return false;

        popup.openPopupAtScreen(event.screenX, event.screenY, true);
        return false;
    },

    getEditor: function(doc)
    {
        if (!this.editor)
            this.editor = new IncludeEditor(doc);
        return this.editor;
    }
});

// ********************************************************************************************* //

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

    onError: function(context, url)
    {
        this.log("loadFail", [url], [context, "error"]);
    },

    getAliases: function()
    {
        return JSON.parse(Options.get("consoleAliases") || "{}");
    },

    deleteAlias: function(aliases, aliasToDel)
    {
        delete aliases[aliasToDel];
        this.setAliases(aliases);
    },

    setAliases: function(aliases)
    {
        Options.set("consoleAliases", JSON.stringify(aliases));
    },

    animateLoadingMessage: function(row, message, iteration)
    {
        if (!row || row.parentNode === null)
            return;
        var dots = "...".substr(3-iteration%4);
        row.querySelector(".objectBox-text").textContent = message + dots;
        setTimeout(this.animateLoadingMessage, 1000, row, message, iteration+1);
    },

    log: function(localeStr, localeArgs, logArgs)
    {
        var msg = Locale.$STRF("commandline.include."+localeStr, localeArgs);
        logArgs.unshift([msg]);
        return Firebug.Console.logFormatted.apply(Firebug.Console, logArgs);
    },

    // include(context, url[, newAliasi])
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
        //var rowLoading = this.log("loading", [], [context, "info"]);
        //var loadingRow = this.animateLoadingMessage(rowLoading, rowLoading.textContent, 0);
        var onSuccess = this.onSuccess.bind(this, aliases, newAlias, context);
        var onError = this.onError.bind(this, context);
        this.evaluateRemoteScript(url, context, onSuccess, onError);

        return returnValue;
    },

    evaluateRemoteScript: function(url, context, successFunction, errorFunction)
    {
        var xhr = new XMLHttpRequest({ mozAnon: true, timeout:30});
        var acceptedSchemes = ["http", "https"];
        var absoluteURL = context.browser.currentURI.resolve(url);

        xhr.onload = function()
        {
            var contentType = xhr.getResponseHeader("Content-Type").split(";")[0];
            var codeToEval = xhr.responseText;
            var headerMatch;
            Firebug.CommandLine.evaluateInWebPage(codeToEval, context);
            if (successFunction)
                successFunction(xhr);
        }

        if (errorFunction)
        {
            xhr.ontimeout = xhr.onerror = function()
            {
                errorFunction(url);
            }
        }

        xhr.open("GET", absoluteURL, true);

        if (!~acceptedSchemes.indexOf(xhr.channel.URI.scheme))
        {
            this.log("invalidRequestProtocol", [], [context, "error"]);
            return ;
        }

        xhr.send(null);

        // xxxFlorent: TODO show XHR progress
        return xhr;
    }
};

// ********************************************************************************************* //
// Command Handler

function onCommand(context, args)
{
    if (args.length === 0)
        return CommandLineIncludeRep.displayAliases(context);

    var self = CommandLineInclude;
    Array.unshift(args, context);
    return CommandLineInclude.include.apply(self, args);
}

// ********************************************************************************************* //
// Local Helpers
function IncludeEditor(doc)
{
    Firebug.InlineEditor.call(this, doc);
}

IncludeEditor.prototype = domplate(Firebug.InlineEditor.prototype,
{
    endEditing: function(target, value, cancel)
    {
        if (cancel)
            return;
        var context = Firebug.currentContext;
        if (Css.hasClass(target, "aliasName"))
            this.updateAliasName(target, value, context);
        else if (Css.hasClass(target, "url"))
            this.updateURL(target, value, context);
    },

    updateURL: function(target, value, context)
    {
        var tr = Dom.getAncestorByTagName(target, "tr");
        var aliasName = tr.querySelector(".aliasName").textContent;
        CommandLineInclude.include(context, value, aliasName, {"onlyUpdate":true});
        target.textContent = value;
    },

    updateAliasName: function(target, value, context)
    {
        var oldAliasName = target.textContent;
        var aliases = CommandLineInclude.getAliases();
        var url = aliases[oldAliasName];
        delete aliases[oldAliasName];
        aliases[value] = url;
        CommandLineInclude.setAliases(aliases);
        target.textContent = value;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerCommand("include", {
    handler: onCommand,
    description: Locale.$STR("console.cmd.help.include"),
    helpUrl: "http://getfirebug.com/wiki/index.php/include"
});

return CommandLineIncludeRep;

// ********************************************************************************************* //
}});
