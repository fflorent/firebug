function runTest()
{
    FBTest.sysout("issue6013.START");


    FBTest.openNewTab(basePath + "html/6013/issue6013.html", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("dom");
        if (panel)
        {
            try
            {
                var doc = FW.Firebug.currentContext.window.document;
                var iframe = doc.querySelector("iframe");

                FBTest.inspectElement(getIframeDiv(iframe), iframe.contentWindow);
                FBTest.progress("the div inside the iframe is inspectable");

                iframe.contentWindow.location.reload();
                FBTest.progress("reloading the iframe");

                iframe.addEventListener("load", function()
                {
                    try
                    {
                        FBTest.progress("the iframe is reloaded");
                        FBTest.inspectElement(getIframeDiv(iframe));
                        testDone();
                    }
                    catch(ex)
                    {
                        onException(ex);
                    }
                }, false);
            }
            catch(ex)
            {
                onException(ex);
            }
        }
    });
}

function onException(ex)
{
    FBTest.exception(ex.message, ex);
    // on error, don't make the test last...
    testDone();
}

function getIframeDiv(iframe)
{
    return iframe.contentDocument.querySelector("div");
}

function testDone()
{
    FBTest.testDone("issue6013.DONE");
}
