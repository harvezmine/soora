using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace KomikPlus.Tests;

[TestClass]
public class KomikPlusPictureUnitTest : BaseUnitTest
{
    /// <summary>
    ///     Get picture by book's media id and pageNumber
    /// </summary>
    /// <returns></returns>
    [TestMethod]
    public async Task TestGetPictureResult()
    {
        var book = await KomikPlusClient.GetBookAsync(123);

        Assert.AreEqual(635, book.MediaId);

        var imageUrl = KomikPlusClient.GetPictureUrl(book, 1);
        Assert.IsNotNull(imageUrl);

        var result = await KomikPlusClient.GetPictureAsync(book, 1);
        Assert.AreEqual(true, result.Length > 0);
    }

    /// <summary>
    ///     Get GIF picture by book's media id and pageNumber
    /// </summary>
    /// <returns></returns>
    [TestMethod]
    public async Task TestGetGifPictureResult()
    {
        var book = await KomikPlusClient.GetBookAsync(288869);

        Assert.AreEqual(1504878, book.MediaId);

        var imageUrl = KomikPlusClient.GetPictureUrl(book, 22);
        Assert.IsNotNull(imageUrl);

        var result = await KomikPlusClient.GetPictureAsync(book, 22);
        Assert.AreEqual(true, result.Length > 0);
    }

    /// <summary>
    ///     Get thumbnail by book's media id and pageNumber
    /// </summary>
    /// <returns></returns>
    [TestMethod]
    public async Task TestGetThumbPictureResult()
    {
        var book = await KomikPlusClient.GetBookAsync(123);

        Assert.AreEqual(635, book.MediaId);

        var imageUrl = KomikPlusClient.GetThumbPictureUrl(book, 1);
        Assert.IsNotNull(imageUrl);

        var result = await KomikPlusClient.GetThumbPictureAsync(book, 1);
        Assert.AreEqual(true, result.Length > 0);
    }

    /// <summary>
    ///     Get big cover by book's media id
    /// </summary>
    /// <returns></returns>
    [TestMethod]
    public async Task TestGetBigCoverPictureResult()
    {
        var book = await KomikPlusClient.GetBookAsync(123);

        Assert.AreEqual(635, book.MediaId);

        var imageUrl = KomikPlusClient.GetBigCoverUrl(book);
        Assert.IsNotNull(imageUrl);

        var result = await KomikPlusClient.GetBigCoverPictureAsync(book);
        Assert.AreEqual(true, result.Length > 0);
    }

    /// <summary>
    ///     Get origin picture by book's media id and pageNumber
    /// </summary>
    /// <returns></returns>
    [TestMethod]
    public async Task TestGetOriginPictureResult()
    {
        var book = await KomikPlusClient.GetBookAsync(123);

        Assert.AreEqual(635, book.MediaId);

        var imageUrl = KomikPlusClient.GetOriginPictureUrl(book, 1);
        Assert.IsNotNull(imageUrl);

        var result = await KomikPlusClient.GetOriginPictureAsync(book, 1);
        Assert.AreEqual(true, result.Length > 0);
    }

    /// <summary>
    ///     Get thumbnail cover by book's media id
    /// </summary>
    /// <returns></returns>
    [TestMethod]
    public async Task TestBookThumbPictureResult()
    {
        var book = await KomikPlusClient.GetBookAsync(123);

        Assert.AreEqual(635, book.MediaId);

        var imageUrl = KomikPlusClient.GetBookThumbUrl(book);
        Assert.IsNotNull(imageUrl);

        var result = await KomikPlusClient.GetBookThumbPictureAsync(book);
        Assert.AreEqual(true, result.Length > 0);
    }
}