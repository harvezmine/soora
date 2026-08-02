using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace KomikPlus.Tests;

public class BaseUnitTest
{
    protected KomikPlusClient KomikPlusClient { get; private set; }

    [TestInitialize]
    public void InitializeTest()
    {
        KomikPlusClient = new TestKomikPlusClient("a", new Dictionary<string, string>());
    }
}

public class TestKomikPlusClient : KomikPlusClient
{
    public TestKomikPlusClient(string userAgent, Dictionary<string, string> cookies = null) : base(userAgent, cookies)
    {
    }

    #region Urls

    //protected override string ApiRootUrl => "https://nhent.ai";

    #endregion
}