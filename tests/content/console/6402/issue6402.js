function runTest()
{
    FBTest.sysout("issue6402.START");

    FBTest.openNewTab(basePath + "console/6402/issue6402.html", function(wrappedWin)
    {
        // Note: do NOT reload at this moment.
        FBTest.enableConsolePanel();

        checkConsole(wrappedWin, "false", "window._console should NOT refer to the exposed "+
            "Firebug console");
        FBTest.reload(function(wrappedWin)
        {
            checkConsole(wrappedWin, "true", "window._console should refer to the exposed "+
                "Firebug console");

            checkConsoleXMLPage(function()
            {
                FBTestFirebug.testDone("issue6402.DONE");
            });
        });

    });
}

function checkConsole(win, expectedResult, message)
{
    var $id = win.document.getElementById.bind(win.document);
    $id("check").click();
    FBTest.compare(expectedResult, $id("equals").textContent, message);
}

function checkConsoleXMLPage(callback)
{
    FBTest.openURL(basePath + "console/6402/issue6402.xml", function(win)
    {
        FBTest.executeCommandAndVerify(callback, "window.console.log('ok');", "ok",
            "div", "logRow-log");
    });
}
