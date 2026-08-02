using System.Linq;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using KomikPlus.Models.Books;
using KomikPlus.Models.Searches;

namespace KomikPlus.Tests;

/// <summary>
///     Search unit tests for KomikPlus
/// </summary>
[TestClass]
public class KomikPlusSearchUnitTest : BaseUnitTest
{
    /// <summary>
    ///     Target number of record in single page
    /// </summary>
    protected virtual int ResultNumber => 25;

    /// <summary>
    ///     Get home page search result
    /// </summary>
    /// <returns></returns>
    [TestMethod]
    public async Task TestSearchHomePageResult()
    {
        var result = await KomikPlusClient.GetHomePageListAsync(1);

        Assert.AreEqual(ResultNumber, result.PerPage);
        Assert.AreEqual(ResultNumber, result.Result.Count);
    }

    /// <summary>
    ///     Get search result by keyword
    /// </summary>
    /// <returns></returns>
    [TestMethod]
    public async Task TestSearchResult()
    {
        var result = await KomikPlusClient.GetSearchPageListAsync("school", 1);

        Assert.AreEqual(ResultNumber, result.PerPage);
        Assert.AreEqual(ResultNumber, result.Result.Count);
    }

    /// <summary>
    ///     Get search result by tag, can be sort by popular
    /// </summary>
    /// <returns></returns>
    [TestMethod]
    public async Task TestTagResult()
    {
        var tag = new Tag
        {
            Id = 1
        };
        var result = await KomikPlusClient.GetTagPageListAsync(tag, SortBy.Popular, 1);

        Assert.AreEqual(ResultNumber, result.PerPage);
        Assert.AreEqual(true, result.Result.Any());
    }
}