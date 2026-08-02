using System.Linq;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace KomikPlus.Tests;

/// <summary>
///     Book detail and recommendation unit tests
/// </summary>
[TestClass]
public class KomikPlusBookUnitTest : BaseUnitTest
{
    /// <summary>
    ///     Get book detail
    /// </summary>
    /// <returns></returns>
    [TestMethod]
    public async Task TestBookResult()
    {
        var result = await KomikPlusClient.GetBookAsync(161194);

        Assert.AreEqual("[ユイザキカズヤ] つなかん。 (COMIC ポプリクラブ 2013年8月号) [英訳]", result.Title.Japanese);
        Assert.AreEqual("Tsuna-kan. | Tuna Can", result.Title.Pretty);
        Assert.AreEqual("[Yuizaki Kazuya] Tsuna-kan. | Tuna Can (COMIC Potpourri Club 2013-08) [English] [PSYN]",
            result.Title.English);
        Assert.AreEqual("160413", result.UploadDate.ToString("yyMMdd"));
        Assert.AreEqual(true, result.Tags.Any(x => x.Id == 19440));
        Assert.AreEqual(17, result.NumPages);
        Assert.AreEqual(17, result.Images.Pages.Count);
        Assert.AreEqual(161194, result.Id);
    }

    /// <summary>
    ///     Get recommended books
    /// </summary>
    /// <returns></returns>
    [TestMethod]
    public async Task TestBookRecommendResult()
    {
        var result = await KomikPlusClient.GetBookRecommendAsync(161194);

        // At least one recommend
        Assert.AreEqual(true, result.Result.Any());
    }
}