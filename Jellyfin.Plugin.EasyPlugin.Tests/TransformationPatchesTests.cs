using System;
using Jellyfin.Plugin.EasyPlugin;
using Xunit;

namespace Jellyfin.Plugin.EasyPlugin.Tests;

public class TransformationPatchesTests
{
    private const string Script = "<script src=\"/EasyPlugin/ClientScript\" defer></script>";

    [Fact]
    public void IndexHtml_InjectsScriptBeforeClosingBody()
    {
        const string html = "<html><body><div>x</div></body></html>";

        var result = TransformationPatches.IndexHtml(new PatchRequestPayload { Contents = html });

        Assert.Contains(Script + "</body>", result, StringComparison.Ordinal);
        Assert.EndsWith("</body></html>", result, StringComparison.Ordinal);
    }

    [Fact]
    public void IndexHtml_IsIdempotent()
    {
        const string html = "<html><body></body></html>";

        var once = TransformationPatches.IndexHtml(new PatchRequestPayload { Contents = html });
        var twice = TransformationPatches.IndexHtml(new PatchRequestPayload { Contents = once });

        Assert.Equal(once, twice);
        // Exactly one injection.
        Assert.Equal(
            once.IndexOf(Script, StringComparison.Ordinal),
            once.LastIndexOf(Script, StringComparison.Ordinal));
    }

    [Fact]
    public void IndexHtml_NoBodyTag_ReturnsUnchanged()
    {
        const string html = "<html><head></head></html>";

        var result = TransformationPatches.IndexHtml(new PatchRequestPayload { Contents = html });

        Assert.Equal(html, result);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void IndexHtml_EmptyOrNull_ReturnsEmpty(string? input)
    {
        var result = TransformationPatches.IndexHtml(new PatchRequestPayload { Contents = input });

        Assert.Equal(string.Empty, result);
    }
}
