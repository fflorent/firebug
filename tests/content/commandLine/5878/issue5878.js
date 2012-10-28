function runTest()
{
    var basePath5878 = basePath + "console/5878/";
    FBTest.sysout("include.START");
    FBTest.openNewTab(basePath5878 + "issue5878.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");

        FBTest.enableConsolePanel(function(win)
        {
            var tasks = new FBTest.TaskList();

            tasks.push(executeIncludeCommand, 'include("./myScript.js");');
            tasks.push(FBTest.executeCommandAndVerify, 'window.a', "1", "pre", "objectBox-number");
            tasks.push(executeIncludeCommand, 'include("./myScript.js", "myscript");');
            tasks.push(FBTest.executeCommandAndVerify, 'window.a', "2", "pre", "objectBox-number");
            tasks.push(checkTableContent, "myscript", function(table, row, aliasName, url)
            {
                FBTest.ok(aliasName, "There should be an alias whose name is \"myscript\"");
                if (aliasName)
                {
                    var expectedURL = basePath5878 + "myScript.js";
                    FBTest.compare(expectedURL, url,
                        "The alias should redirect to " + basePath5878);
                }
            });
            tasks.push(executeIncludeCommand, 'include("./myOtherScript.js", "myScript");');
            tasks.push(checkTableContent, "myscript", function(table, row, aliasName, url)
            {
                FBTest.ok(aliasName, "There should be an alias whose name is \"myscript\"");
                if (aliasName)
                {
                    var expectedURL = basePath5878 + "myOtherScript.js";
                    FBTest.compare(expectedURL, url, 
                        "The alias should redirect to " + basePath5878);
                    // FBTest.executeContextMenuCommand(row, "fbOpenInScratchpad");
                }
            });
            tasks.push(executeIncludeCommand, 'include(null, "myScript");');
            tasks.push(checkTableContent, "myscript", function(table, row, aliasName, url)
            {
                FBTest.compare(aliasName, undefined,
                    "There should not be any alias whose name is \"myscript\" anymore");
            });
            tasks.run(function()
            {
                FBTest.testDone("include.DONE");
            });
        });
    });
}

function checkTableContent(callback, expectedAliasName, checkFunction)
{
    var config = {tagName: "table", classes: "tableCommandLineInclude"};
    FBTest.waitForDisplayedElement("console", config, function(table)
    {
        var aliasNameCell = table.querySelector("*[data-aliasname='myscript']");
        if (!aliasNameCell)
            checkFunction(table, null, null);
        else
        {
            var row = FW.FBL.getAncestorByTagName(aliasNameCell, "tr");
            var aliasValueCell = row.querySelector(".url");
            checkFunction(table, row, aliasNameCell.textContent, aliasValueCell.textContent);
        }
        callback();
    });
    FBTest.executeCommand("include()");
}

function executeIncludeCommand(callback, includeCommand)
{
    var config = {tagName: "div", classes: "logRow-info"};
    FBTest.waitForDisplayedElement("console", config, function()
    {
        callback();
    });
    FBTest.executeCommand(includeCommand);
}
