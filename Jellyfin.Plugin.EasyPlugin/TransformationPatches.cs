using System;

namespace Jellyfin.Plugin.EasyPlugin;

/// <summary>
/// The callback target invoked by the File Transformation plugin. File Transformation loads
/// this class by name and calls <see cref="IndexHtml"/>, passing the current <c>index.html</c>
/// contents and using the returned string as the served file.
/// </summary>
public static class TransformationPatches
{
    /// <summary>The script tag injected before the closing body tag.</summary>
    internal const string Injection = "<script src=\"/EasyPlugin/ClientScript\" defer></script>";

    /// <summary>
    /// Injects the Easy Plugin client script just before the closing <c>&lt;/body&gt;</c> tag.
    /// Must be <c>public static</c> and return <see cref="string"/> — the contract File
    /// Transformation invokes by reflection.
    /// </summary>
    /// <param name="content">The payload carrying the current file contents.</param>
    /// <returns>The transformed (or, if there is nothing to do, unchanged) file contents.</returns>
    public static string IndexHtml(PatchRequestPayload content)
    {
        var html = content.Contents;
        if (string.IsNullOrEmpty(html))
        {
            return html ?? string.Empty;
        }

        // Idempotent: never inject twice (e.g. if more than one provider applies the transform).
        if (html.Contains(Injection, StringComparison.Ordinal))
        {
            return html;
        }

        return html.Contains("</body>", StringComparison.Ordinal)
            ? html.Replace("</body>", Injection + "</body>", StringComparison.Ordinal)
            : html;
    }
}

/// <summary>
/// The argument File Transformation deserializes (via its own Newtonsoft) before invoking the
/// callback. The JSON field is <c>contents</c>; Newtonsoft binds it to this property
/// case-insensitively, so no serializer attribute (and no Newtonsoft reference) is needed.
/// </summary>
public class PatchRequestPayload
{
    /// <summary>Gets or sets the current file contents.</summary>
    public string? Contents { get; set; }
}
